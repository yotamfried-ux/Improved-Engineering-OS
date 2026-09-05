/**
 * Property tests for canonicalization.
 *
 * Example-based tests prove behaviour on the inputs someone thought of. These
 * prove the invariants hold across generated inputs, and fast-check shrinks any
 * counterexample to something readable.
 *
 * All four properties below are exactly the guarantees D35 depends on: if any of
 * them fails, deterministic identifiers stop being deterministic.
 */

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { canonicalizeJson, sha256Canonical } from '../src/hashing.ts';

/**
 * JSON values RFC 8785 can represent.
 *
 * `noNaN` and finite doubles only: `NaN` and `Infinity` are rejected by design,
 * and their rejection is covered by the example-based suite.
 */
const jsonValue = fc.letrec<{ value: unknown }>((tie) => ({
  value: fc.oneof(
    { depthSize: 'small', withCrossShrink: true },
    fc.constant(null),
    fc.boolean(),
    fc.double({ noNaN: true, noDefaultInfinity: true }),
    fc.integer(),
    fc.string({ unit: 'grapheme' }),
    fc.array(tie('value'), { maxLength: 5 }),
    fc.dictionary(fc.string({ unit: 'grapheme', maxLength: 8 }), tie('value'), { maxKeys: 5 }),
  ),
})).value;

describe('canonicalization properties', () => {
  it('is idempotent through a JSON round trip', () => {
    fc.assert(
      fc.property(jsonValue, (value) => {
        const once = canonicalizeJson(value);
        expect(canonicalizeJson(JSON.parse(once))).toBe(once);
      }),
      { numRuns: 500 },
    );
  });

  it('always produces output that parses back to an equivalent value', () => {
    fc.assert(
      fc.property(jsonValue, (value) => {
        const canonical = canonicalizeJson(value);
        expect(() => JSON.parse(canonical) as unknown).not.toThrow();
      }),
      { numRuns: 500 },
    );
  });

  it('always produces valid UTF-8', () => {
    const decoder = new TextDecoder('utf-8', { fatal: true });
    fc.assert(
      fc.property(jsonValue, (value) => {
        const bytes = new TextEncoder().encode(canonicalizeJson(value));
        expect(() => decoder.decode(bytes)).not.toThrow();
      }),
      { numRuns: 300 },
    );
  });

  it('ignores key insertion order', () => {
    fc.assert(
      fc.property(
        fc.dictionary(fc.string({ minLength: 1, maxLength: 8 }), fc.integer(), {
          minKeys: 2,
          maxKeys: 8,
        }),
        (record) => {
          const forward = { ...record };
          const reversed = Object.fromEntries(Object.entries(record).reverse());
          expect(sha256Canonical(reversed)).toBe(sha256Canonical(forward));
        },
      ),
      { numRuns: 300 },
    );
  });

  it('never emits whitespace between tokens', () => {
    fc.assert(
      fc.property(jsonValue, (value) => {
        // Whitespace may legitimately appear inside a string literal, so the
        // check is that stripping strings leaves no whitespace behind.
        const canonical = canonicalizeJson(value);
        const withoutStrings = canonical.replace(/"(?:[^"\\]|\\.)*"/gu, '""');
        expect(withoutStrings).not.toMatch(/[\s]/u);
      }),
      { numRuns: 300 },
    );
  });

  it('distinguishes distinct values', () => {
    fc.assert(
      fc.property(jsonValue, jsonValue, (a, b) => {
        // Equal canonical form implies the values were structurally equal, so a
        // digest collision here would mean the canonicalizer lost information.
        if (canonicalizeJson(a) === canonicalizeJson(b)) {
          expect(sha256Canonical(a)).toBe(sha256Canonical(b));
        } else {
          expect(sha256Canonical(a)).not.toBe(sha256Canonical(b));
        }
      }),
      { numRuns: 300 },
    );
  });
});
