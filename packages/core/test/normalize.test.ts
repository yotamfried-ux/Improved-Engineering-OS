/**
 * ADR-0003 layer 1: project normalization.
 *
 * The cases here are the ones the Stage 0 brief names explicitly: composed and
 * decomposed Unicode, non-BMP characters, collisions after normalization, and
 * the two file-ordering rules.
 *
 * Non-ASCII characters are written as escape sequences throughout, because the
 * whole point of several of these tests is that two visually identical strings
 * are different values.
 */

import { describe, expect, it } from 'vitest';
import {
  compareUtf16CodeUnits,
  compareUtf8Bytes,
  isNormalizedIdentifierText,
  normalizeIdentifierSet,
  normalizeIdentifierText,
  normalizeRelativePosixPath,
  normalizeTextForHashing,
} from '../src/normalize.ts';
import { NormalizationCollisionError, InvalidManifestError } from '../src/errors.ts';

/** LATIN SMALL LETTER E + COMBINING ACUTE ACCENT (NFD). */
const E_ACUTE_DECOMPOSED = '\u0065\u0301';
/** LATIN SMALL LETTER E WITH ACUTE (NFC). */
const E_ACUTE_COMPOSED = '\u00e9';

describe('normalizeIdentifierText', () => {
  it('composes decomposed input to NFC', () => {
    expect(E_ACUTE_DECOMPOSED).not.toBe(E_ACUTE_COMPOSED);
    expect(normalizeIdentifierText(E_ACUTE_DECOMPOSED)).toBe(E_ACUTE_COMPOSED);
  });

  it('is idempotent', () => {
    const once = normalizeIdentifierText(E_ACUTE_DECOMPOSED);
    expect(normalizeIdentifierText(once)).toBe(once);
  });

  it('leaves already-composed input untouched', () => {
    expect(normalizeIdentifierText(E_ACUTE_COMPOSED)).toBe(E_ACUTE_COMPOSED);
    expect(isNormalizedIdentifierText(E_ACUTE_COMPOSED)).toBe(true);
    expect(isNormalizedIdentifierText(E_ACUTE_DECOMPOSED)).toBe(false);
  });

  it('does not case-fold, trim or collapse whitespace', () => {
    // Each of those would discard information a canonical identifier may carry.
    expect(normalizeIdentifierText('OAuth  PKCE ')).toBe('OAuth  PKCE ');
  });

  it('preserves non-BMP characters', () => {
    const nonBmp = '\u{1f602}\u{10000}';
    expect(normalizeIdentifierText(nonBmp)).toBe(nonBmp);
    expect([...nonBmp]).toHaveLength(2);
  });
});

describe('normalizeIdentifierSet -- collisions are rejected, never merged', () => {
  it('rejects two distinct inputs that normalize to the same value', () => {
    expect(() => normalizeIdentifierSet([E_ACUTE_DECOMPOSED, E_ACUTE_COMPOSED])).toThrow(
      NormalizationCollisionError,
    );
  });

  it('names both originals on the error so the caller can report them', () => {
    try {
      normalizeIdentifierSet([E_ACUTE_DECOMPOSED, E_ACUTE_COMPOSED]);
      expect.unreachable('collision should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(NormalizationCollisionError);
      const collision = error as NormalizationCollisionError;
      expect(collision.code).toBe('NORMALIZATION_COLLISION');
      expect(collision.normalized).toBe(E_ACUTE_COMPOSED);
      expect(collision.originals).toEqual([E_ACUTE_DECOMPOSED, E_ACUTE_COMPOSED]);
    }
  });

  it('tolerates an exact duplicate, which is not a collision', () => {
    const result = normalizeIdentifierSet(['auth-pkce', 'auth-pkce']);
    expect([...result.keys()]).toEqual(['auth-pkce']);
  });

  it('returns a deterministic, insertion-ordered map', () => {
    const forward = [...normalizeIdentifierSet(['b', 'a', 'c']).keys()];
    expect(forward).toEqual(['b', 'a', 'c']);
  });
});

describe('normalizeTextForHashing', () => {
  it('normalizes CRLF and lone CR to LF', () => {
    expect(normalizeTextForHashing('a\r\nb\rc\nd')).toBe('a\nb\nc\nd');
  });

  it('does not touch trailing whitespace (D35 is explicit about this)', () => {
    expect(normalizeTextForHashing('a   \nb\t')).toBe('a   \nb\t');
  });

  it('strips a leading BOM, which is an encoding artefact rather than content', () => {
    expect(normalizeTextForHashing('\ufeffhello')).toBe('hello');
    // A BOM anywhere else is content and stays.
    expect(normalizeTextForHashing('a\ufeffb')).toBe('a\ufeffb');
  });

  it('is idempotent', () => {
    const once = normalizeTextForHashing('a\r\nb');
    expect(normalizeTextForHashing(once)).toBe(once);
  });
});

describe('normalizeRelativePosixPath -- rejects rather than repairs', () => {
  it('accepts a relative POSIX path and NFC-normalizes it', () => {
    expect(normalizeRelativePosixPath(`files/caf${E_ACUTE_DECOMPOSED}.md`)).toBe(
      `files/caf${E_ACUTE_COMPOSED}.md`,
    );
  });

  it('converts Windows separators, so the same tree hashes the same on both platforms', () => {
    expect(normalizeRelativePosixPath('files\\nested\\a.md')).toBe('files/nested/a.md');
  });

  it.each([
    ['empty', ''],
    ['absolute', '/etc/passwd'],
    ['drive letter', 'C:/tmp/a.md'],
    ['parent traversal', 'files/../../secret.md'],
    ['current directory segment', 'files/./a.md'],
    ['double separator', 'files//a.md'],
  ])('rejects %s', (_label, value) => {
    expect(() => normalizeRelativePosixPath(value)).toThrow(InvalidManifestError);
  });
});

describe('the two ordering rules are genuinely separate', () => {
  // U+FFFF   -> UTF-16 [FFFF],      UTF-8 [EF BF BF]
  // U+10000  -> UTF-16 [D800 DC00], UTF-8 [F0 90 80 80]
  //
  // UTF-16: D800 < FFFF, so U+10000 sorts FIRST.
  // UTF-8:  EF   < F0,   so U+10000 sorts LAST.
  //
  // A single shared comparator cannot satisfy both assertions, so this fixture
  // proves the separation rather than asserting it (ADR-0003).
  const BMP_MAX = '\uffff';
  const ASTRAL_MIN = '\u{10000}';

  it('UTF-16 code-unit order puts the astral character first', () => {
    expect(compareUtf16CodeUnits(ASTRAL_MIN, BMP_MAX)).toBeLessThan(0);
  });

  it('UTF-8 byte order puts the astral character last', () => {
    expect(compareUtf8Bytes(ASTRAL_MIN, BMP_MAX)).toBeGreaterThan(0);
  });

  it('the two comparators disagree on this pair', () => {
    expect(Math.sign(compareUtf16CodeUnits(ASTRAL_MIN, BMP_MAX))).not.toBe(
      Math.sign(compareUtf8Bytes(ASTRAL_MIN, BMP_MAX)),
    );
  });

  it('both comparators are total orders on the pair', () => {
    expect(compareUtf16CodeUnits(BMP_MAX, BMP_MAX)).toBe(0);
    expect(compareUtf8Bytes(BMP_MAX, BMP_MAX)).toBe(0);
    expect(Math.sign(compareUtf8Bytes(BMP_MAX, ASTRAL_MIN))).toBe(
      -Math.sign(compareUtf8Bytes(ASTRAL_MIN, BMP_MAX)),
    );
  });

  it('UTF-16 order matches JavaScript default string comparison', () => {
    // Stated so that a future refactor to `.sort()` without a comparator is a
    // visible equivalence rather than an accident.
    const values = ['\u{1f602}', '\ufb33', '\u20ac'];
    expect([...values].sort(compareUtf16CodeUnits)).toEqual([...values].sort());
  });
});
