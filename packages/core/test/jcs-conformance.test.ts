/**
 * RFC 8785 conformance against an external oracle.
 *
 * The vectors under `fixtures/jcs/` were produced independently of this
 * codebase (see that directory's NOTICE). Testing against them is the difference
 * between "our canonicalizer agrees with itself" and "our canonicalizer agrees
 * with the specification".
 *
 * Every non-ASCII character in this file is written as an escape sequence. Two
 * Unicode forms that must NOT be treated as equal look identical in a source
 * file, so writing them literally would make the most important assertions here
 * unreadable and unreviewable.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { canonicalizeJson } from '../src/hashing.ts';

const here = dirname(fileURLToPath(import.meta.url));
const inputDir = join(here, 'fixtures', 'jcs', 'input');
const outputDir = join(here, 'fixtures', 'jcs', 'output');

const vectors = readdirSync(inputDir)
  .filter((name) => name.endsWith('.json'))
  .sort();

describe('RFC 8785 conformance vectors', () => {
  it('has the vectors on disk', () => {
    // A silently empty fixture directory would make every test below vacuous.
    expect(vectors.length).toBeGreaterThan(0);
  });

  for (const name of vectors) {
    it(`canonicalizes ${name} exactly as the reference does`, () => {
      const input: unknown = JSON.parse(readFileSync(join(inputDir, name), 'utf8'));
      const expected = readFileSync(join(outputDir, name), 'utf8');
      expect(canonicalizeJson(input)).toBe(expected);
    });
  }
});

describe('what the vectors specifically prove', () => {
  /** LATIN CAPITAL LETTER A + COMBINING RING ABOVE (NFD). */
  const A_RING_DECOMPOSED = '\u0041\u030a';
  /** LATIN CAPITAL LETTER A WITH RING ABOVE (NFC). */
  const A_RING_COMPOSED = '\u00c5';

  it('preserves decomposed Unicode instead of composing it (RFC 8785 section 3.1)', () => {
    // fixtures/jcs/{input,output}/unicode.json is exactly this case.
    const canonical = canonicalizeJson({ 'Unnormalized Unicode': A_RING_DECOMPOSED });

    expect(canonical).toBe(`{"Unnormalized Unicode":"${A_RING_DECOMPOSED}"}`);
    expect(canonical).not.toContain(A_RING_COMPOSED);

    // The composed form is a different document with different canonical bytes.
    expect(canonicalizeJson({ 'Unnormalized Unicode': A_RING_COMPOSED })).not.toBe(canonical);
  });

  it('sorts keys by UTF-16 code units, not by code point', () => {
    // U+1F602 is the surrogate pair D83D DE02. In code-point order it would sort
    // after U+FB33; in UTF-16 code-unit order D83D sorts before FB33. The
    // weird.json vector pins the same behaviour.
    const canonical = canonicalizeJson({ '\u{1f602}': 1, דּ: 2, '€': 3 });
    expect(canonical).toBe('{"€":3,"\u{1f602}":1,"דּ":2}');
  });

  it('serializes numbers per ECMAScript Number::toString', () => {
    expect(canonicalizeJson([333333333.33333329, 1e30, 4.5, 2e-3, 1e-27])).toBe(
      '[333333333.3333333,1e+30,4.5,0.002,1e-27]',
    );
  });

  it('emits negative zero as 0', () => {
    expect(canonicalizeJson(-0)).toBe('0');
    expect(canonicalizeJson({ a: -0 })).toBe(canonicalizeJson({ a: 0 }));
  });

  it('escapes only what section 3.2.2.2 requires', () => {
    // DEL (U+007F) and U+0080 stay literal; C0 controls become lowercase \u00xx.
    expect(canonicalizeJson('\u007f')).toBe('"\u007f"');
    expect(canonicalizeJson('\u0080')).toBe('"\u0080"');
    expect(canonicalizeJson('\u000f')).toBe('"\\u000f"');
    expect(canonicalizeJson('/')).toBe('"/"');
    expect(canonicalizeJson('\t')).toBe('"\\t"');
    expect(canonicalizeJson('\\')).toBe('"\\\\"');
  });
});
