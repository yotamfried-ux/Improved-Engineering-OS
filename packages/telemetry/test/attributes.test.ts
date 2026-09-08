/**
 * The allowlist sanitizer (D26, TD-06).
 *
 * TD-06 is the reason this is reconstruction rather than filtering: a denylist
 * removes what someone thought of, and the interesting attribute is always the
 * one nobody thought of. So the tests below are mostly about what does NOT come
 * out -- an unknown key, a nested object, a value of the wrong type, a
 * credential sitting on a perfectly legitimate key.
 *
 * The committed registry is parsed here too. A sanitizer that works against a
 * fixture while the real `contracts/telemetry-attributes.yaml` fails to load
 * would drop every attribute in production and look, from the outside, exactly
 * like an agent that reported nothing.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  AttributeRegistryError,
  dropCounts,
  isForbidden,
  parseAttributeRegistry,
  sanitizeAttributes,
  type AttributeRegistry,
} from '../src/attributes.ts';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

const registry: AttributeRegistry = {
  allowed: [
    { key: 'tool.name', type: 'string', sensitivity: 'public', maxLength: 64 },
    { key: 'tool.duration_ms', type: 'number', sensitivity: 'public', maxLength: 16 },
    { key: 'tool.ok', type: 'boolean', sensitivity: 'public', maxLength: 8 },
  ],
  forbidden: ['prompt.text', 'env.*'],
};

describe('the committed registry', () => {
  const text = readFileSync(join(repoRoot, 'contracts', 'telemetry-attributes.yaml'), 'utf8');

  it('parses, and declares attributes', () => {
    const parsed = parseAttributeRegistry(text);
    expect(parsed.allowed.length).toBeGreaterThan(0);
    expect(parsed.allowed.map((rule) => rule.key)).toContain('tool.name');
  });

  it('names the forbidden keys rather than merely omitting them', () => {
    // A key absent from an allowlist is indistinguishable from a key nobody
    // considered. Naming it leaves a decision where a future contributor looks.
    const parsed = parseAttributeRegistry(text);
    expect(parsed.forbidden).toContain('prompt.text');
    expect(parsed.forbidden).toContain('env.*');
  });
});

describe('loading a registry', () => {
  it('refuses an empty allowlist rather than silently dropping everything', () => {
    // An empty allowlist is a working sanitizer that emits nothing, and a run
    // that emitted nothing is not distinguishable from a run nobody observed.
    expect(() => parseAttributeRegistry('attributes: []')).toThrow(AttributeRegistryError);
  });

  it('refuses a duplicate key', () => {
    const yaml = `attributes:
  - key: tool.name
    type: string
    sensitivity: public
    max_length: 64
  - key: tool.name
    type: number
    sensitivity: public
    max_length: 8
`;
    expect(() => parseAttributeRegistry(yaml)).toThrow(/duplicate/u);
  });

  it('refuses an allowed key declared `never`', () => {
    // Both allowed and never-collected is a contradiction in the contract. It
    // stops the load rather than resolving one way and hiding the conflict.
    const yaml = `attributes:
  - key: prompt.text
    type: string
    sensitivity: never
    max_length: 64
`;
    expect(() => parseAttributeRegistry(yaml)).toThrow(/sensitivity/u);
  });

  it('refuses a non-scalar declared type', () => {
    const yaml = `attributes:
  - key: tool.args
    type: object
    sensitivity: public
    max_length: 64
`;
    expect(() => parseAttributeRegistry(yaml)).toThrow(/scalar/u);
  });
});

describe('sanitizing attributes', () => {
  it('keeps what the registry declares', () => {
    const result = sanitizeAttributes(
      { 'tool.name': 'resolve', 'tool.duration_ms': 12, 'tool.ok': true },
      registry,
    );
    expect(result.attributes).toEqual({
      'tool.name': 'resolve',
      'tool.duration_ms': 12,
      'tool.ok': true,
    });
    expect(result.dropped).toEqual([]);
  });

  it('drops an unknown key and counts it', () => {
    const result = sanitizeAttributes({ 'tool.name': 'resolve', 'user.email': 'a@b.c' }, registry);
    expect(result.attributes).toEqual({ 'tool.name': 'resolve' });
    expect(result.dropped).toEqual([{ key: 'user.email', reason: 'not_in_allowlist' }]);
  });

  it('distinguishes a forbidden key from a merely unknown one', () => {
    // The same count, a completely different finding: one is instrumentation
    // that has drifted from the contract, the other is an attempt to send a
    // prompt or an environment variable.
    const result = sanitizeAttributes({ 'prompt.text': 'hi', 'env.AWS_KEY': 'x' }, registry);
    expect(dropCounts(result.dropped).forbidden).toBe(2);
    expect(dropCounts(result.dropped).not_in_allowlist).toBe(0);
  });

  it('drops a nested value, which is where a prompt or a credential would hide', () => {
    const result = sanitizeAttributes({ 'tool.name': { text: 'secret prompt' } }, registry);
    expect(result.attributes).toEqual({});
    expect(result.dropped).toEqual([{ key: 'tool.name', reason: 'not_scalar' }]);
  });

  it('drops an array for the same reason', () => {
    const result = sanitizeAttributes({ 'tool.name': ['a', 'b'] }, registry);
    expect(result.dropped).toEqual([{ key: 'tool.name', reason: 'not_scalar' }]);
  });

  it('drops a value whose type is not the declared one', () => {
    const result = sanitizeAttributes({ 'tool.duration_ms': '12' }, registry);
    expect(result.dropped).toEqual([{ key: 'tool.duration_ms', reason: 'wrong_type' }]);
  });

  it('drops NaN and Infinity, which are not facts and do not survive JSON', () => {
    expect(sanitizeAttributes({ 'tool.duration_ms': Number.NaN }, registry).dropped).toEqual([
      { key: 'tool.duration_ms', reason: 'wrong_type' },
    ]);
    expect(
      sanitizeAttributes({ 'tool.duration_ms': Number.POSITIVE_INFINITY }, registry).dropped,
    ).toEqual([{ key: 'tool.duration_ms', reason: 'wrong_type' }]);
  });

  it('drops an over-long value rather than storing a prefix of it', () => {
    // Truncation would keep the first 64 characters of whatever it was, which
    // for the values this bound exists to catch is the worst possible half.
    const result = sanitizeAttributes({ 'tool.name': 'x'.repeat(65) }, registry);
    expect(result.dropped).toEqual([{ key: 'tool.name', reason: 'too_long' }]);
  });

  it('measures length in characters, not UTF-16 code units', () => {
    // Two emoji are two characters and four code units. A bound that counted
    // code units would reject legitimate text for being non-English.
    const short: AttributeRegistry = {
      allowed: [{ key: 'tool.name', type: 'string', sensitivity: 'public', maxLength: 3 }],
      forbidden: [],
    };
    expect(sanitizeAttributes({ 'tool.name': '👍👍' }, short).attributes).toEqual({
      'tool.name': '👍👍',
    });
  });

  it('refuses a credential-shaped value on a perfectly legitimate key', () => {
    // The Stage 2 simulation: a secret-like value is rejected client-side. An
    // allowlisted key is permission to send a kind of fact, never permission to
    // send a secret that ended up in it.
    const result = sanitizeAttributes(
      { 'tool.name': 'sb_secret_abcdefghijklmnopqrstuvwxyz' },
      registry,
    );
    expect(result.attributes).toEqual({});
    expect(result.dropped).toEqual([{ key: 'tool.name', reason: 'secret_shaped' }]);
  });

  it('refuses text that is not well-formed Unicode', () => {
    // D26 requires strict decoding before any scanning. A lone surrogate does
    // not survive a UTF-8 round trip, so it would be scanned in one form and
    // stored in another.
    const result = sanitizeAttributes({ 'tool.name': 'a\uD800b' }, registry);
    expect(result.dropped).toEqual([{ key: 'tool.name', reason: 'invalid_text' }]);
  });

  it('drops null, so "absent" and "reported as nothing" stay different', () => {
    const result = sanitizeAttributes({ 'tool.name': null }, registry);
    expect(result.attributes).toEqual({});
    expect(result.dropped).toEqual([{ key: 'tool.name', reason: 'not_scalar' }]);
  });

  it('produces the same result whatever order the keys arrived in', () => {
    const a = sanitizeAttributes({ 'tool.name': 'x', 'tool.ok': true }, registry);
    const b = sanitizeAttributes({ 'tool.ok': true, 'tool.name': 'x' }, registry);
    expect(JSON.stringify(a.attributes)).toBe(JSON.stringify(b.attributes));
  });

  it('returns nothing for input that is not an object at all', () => {
    expect(sanitizeAttributes('everything', registry).attributes).toEqual({});
    expect(sanitizeAttributes(null, registry).attributes).toEqual({});
    expect(sanitizeAttributes([1, 2, 3], registry).attributes).toEqual({});
  });
});

describe('forbidden matching', () => {
  it('matches a wildcard by prefix and an exact key exactly', () => {
    expect(isForbidden('env.PATH', ['env.*'])).toBe(true);
    expect(isForbidden('environment', ['env.*'])).toBe(false);
    expect(isForbidden('prompt.text', ['prompt.text'])).toBe(true);
    expect(isForbidden('prompt.texture', ['prompt.text'])).toBe(false);
  });
});
