/**
 * D35 hashing contract: rejection behaviour, file-set manifests, and the
 * layer separation ADR-0003 depends on.
 *
 * Digests are pinned as literals. A change to any of them then shows up as a
 * reviewable diff instead of silently re-deriving every identity in the project.
 *
 * Every pinned digest below was computed by an independent implementation (a
 * short Python script over hashlib and base64.b32encode) before being written
 * here, so the pin records what the specification produces rather than what this
 * implementation happened to produce on the day it was written.
 */

import { describe, expect, it } from 'vitest';
import {
  assertCanonicalizableJson,
  base32Encode,
  buildFileManifest,
  canonicalBytes,
  canonicalizeJson,
  deterministicId,
  hashFileSet,
  sha256Canonical,
  sha256Text,
} from '../src/hashing.ts';
import { normalizeIdentifierText, normalizeTextForHashing } from '../src/normalize.ts';
import { NonCanonicalizableValueError } from '../src/errors.ts';

const utf8 = (value: string): Uint8Array => new TextEncoder().encode(value);

describe('layer separation: canonicalization never normalizes (ADR-0003)', () => {
  const DECOMPOSED = '\u0065\u0301';
  const COMPOSED = '\u00e9';

  it('canonicalizes the two Unicode forms to different bytes', () => {
    // This is the property that would break if NFC were folded into JCS. Two
    // distinct JSON documents would then hash identically, silently changing
    // JSON semantics -- which the user brief explicitly forbids.
    expect(canonicalizeJson({ k: DECOMPOSED })).not.toBe(canonicalizeJson({ k: COMPOSED }));
    expect(sha256Canonical({ k: DECOMPOSED })).not.toBe(sha256Canonical({ k: COMPOSED }));
  });

  it('agrees only once normalization has been applied deliberately, at layer 1', () => {
    const normalized = normalizeIdentifierText(DECOMPOSED);
    expect(sha256Canonical({ k: normalized })).toBe(sha256Canonical({ k: COMPOSED }));
  });

  it('canonicalization does not import normalization behaviour for keys either', () => {
    expect(canonicalizeJson({ [DECOMPOSED]: 1 })).not.toBe(canonicalizeJson({ [COMPOSED]: 1 }));
  });
});

describe('assertCanonicalizableJson rejects rather than coerces', () => {
  it.each([
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['-Infinity', Number.NEGATIVE_INFINITY],
    ['undefined', undefined],
    ['a function', () => undefined],
    ['a symbol', Symbol('s')],
    ['a BigInt', 10n],
    ['a Date', new Date(0)],
    ['a Map', new Map()],
    ['a Set', new Set()],
  ])('rejects %s', (_label, value) => {
    expect(() => canonicalizeJson(value)).toThrow(NonCanonicalizableValueError);
  });

  it('rejects a nested invalid value and says where it is', () => {
    try {
      canonicalizeJson({ outer: { list: [1, Number.NaN] } });
      expect.unreachable('NaN should have been rejected');
    } catch (error) {
      expect(error).toBeInstanceOf(NonCanonicalizableValueError);
      const failure = error as NonCanonicalizableValueError;
      expect(failure.at).toEqual(['outer', 'list', 1]);
      expect(failure.message).toContain('$.outer.list[1]');
    }
  });

  it('rejects a cyclic structure instead of hanging', () => {
    const cyclic: Record<string, unknown> = {};
    cyclic['self'] = cyclic;
    expect(() => canonicalizeJson(cyclic)).toThrow(/cyclic/u);
  });

  it('rejects a class instance rather than serializing its enumerable half', () => {
    class Asset {
      readonly id = 'asset_x';
    }
    expect(() => canonicalizeJson(new Asset())).toThrow(NonCanonicalizableValueError);
  });

  it('rejects a lone surrogate rather than escaping corruption into a stable identity', () => {
    expect(() => canonicalizeJson({ k: '\ud800' })).toThrow(/lone surrogate/u);
    expect(() => canonicalizeJson({ '\udfff': 1 })).toThrow(/lone surrogate/u);
  });

  it('accepts a well-formed surrogate pair', () => {
    expect(canonicalizeJson({ k: '\u{1f602}' })).toBe('{"k":"\u{1f602}"}');
  });

  it('accepts a null-prototype plain object', () => {
    const record = Object.assign(Object.create(null) as Record<string, unknown>, { a: 1 });
    expect(canonicalizeJson(record)).toBe('{"a":1}');
  });

  it('narrows the type on success', () => {
    const value: unknown = { a: 1 };
    assertCanonicalizableJson(value);
    // If this compiles, the assertion signature is doing its job.
    expect(canonicalizeJson(value)).toBe('{"a":1}');
  });
});

describe('digests', () => {
  it('produces D35 textual form', () => {
    expect(sha256Canonical({})).toMatch(/^sha256:[0-9a-f]{64}$/u);
  });

  it('pins the digest of the empty object', () => {
    // sha256 of the two bytes "{}"
    expect(sha256Canonical({})).toBe(
      'sha256:44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a',
    );
  });

  it('hashes text with LF normalization, so platform checkout does not matter', () => {
    expect(sha256Text('a\r\nb')).toBe(sha256Text('a\nb'));
    expect(sha256Text('a\rb')).toBe(sha256Text('a\nb'));
  });

  it('is insensitive to key insertion order', () => {
    expect(sha256Canonical({ b: 1, a: 2 })).toBe(sha256Canonical({ a: 2, b: 1 }));
  });

  it('is sensitive to value changes', () => {
    expect(sha256Canonical({ a: 1 })).not.toBe(sha256Canonical({ a: '1' }));
    expect(sha256Canonical({ a: 1 })).not.toBe(sha256Canonical({ a: 1.0000000000000002 }));
  });

  it('canonicalBytes are valid UTF-8 of the canonical string', () => {
    const value = { k: '\u{1f602}' };
    expect(new TextDecoder('utf-8', { fatal: true }).decode(canonicalBytes(value))).toBe(
      canonicalizeJson(value),
    );
  });
});

describe('base32 (RFC 4648, no padding)', () => {
  it.each([
    ['', ''],
    ['f', 'MY'],
    ['fo', 'MZXQ'],
    ['foo', 'MZXW6'],
    ['foob', 'MZXW6YQ'],
    ['fooba', 'MZXW6YTB'],
    ['foobar', 'MZXW6YTBOI'],
  ])('encodes %o per the RFC 4648 test vectors', (input, expected) => {
    expect(base32Encode(utf8(input))).toBe(expected);
  });

  it('encodes a SHA-256 digest as 52 characters', () => {
    expect(deterministicId('evd', { a: 1 }).split('_')[1]).toHaveLength(52);
  });
});

describe('file-set manifests (P-04)', () => {
  const files = [
    { path: 'files/nested/b.md', bytes: utf8('b') },
    { path: 'body.md', bytes: utf8('body') },
    { path: 'files/a.md', bytes: utf8('a') },
  ];

  it('sorts entries by relative POSIX path in UTF-8 byte order', () => {
    expect(buildFileManifest(files).files.map((entry) => entry.path)).toEqual([
      'body.md',
      'files/a.md',
      'files/nested/b.md',
    ]);
  });

  it('produces the same digest regardless of input order', () => {
    expect(hashFileSet(files)).toBe(hashFileSet([...files].reverse()));
  });

  it('pins the digest of a known tree', () => {
    expect(hashFileSet(files)).toBe(
      'sha256:ebdf184a168bb29f24220191df9696edc2ed5dc2875158b3f03c4ea8e96a55de',
    );
  });

  it('distinguishes trees that ambiguous concatenation would confuse', () => {
    // The failure mode P-04 named: `a/b` + bytes vs `a` + `/b` + bytes.
    const left = hashFileSet([{ path: 'a/b', bytes: utf8('x') }]);
    const right = hashFileSet([{ path: 'a', bytes: utf8('/bx') }]);
    expect(left).not.toBe(right);
  });

  it('distinguishes a moved file from an edited one', () => {
    const moved = hashFileSet([{ path: 'files/a.md', bytes: utf8('a') }]);
    const edited = hashFileSet([{ path: 'body.md', bytes: utf8('a') }]);
    expect(moved).not.toBe(edited);
  });

  it('rejects two paths that collide after normalization', () => {
    expect(() =>
      buildFileManifest([
        { path: 'caf\u0065\u0301.md', bytes: utf8('x') },
        { path: 'caf\u00e9.md', bytes: utf8('y') },
      ]),
    ).toThrow(/duplicate manifest path after normalization/u);
  });

  it('normalizes Windows separators so the same tree hashes identically', () => {
    expect(hashFileSet([{ path: 'files\\a.md', bytes: utf8('a') }])).toBe(
      hashFileSet([{ path: 'files/a.md', bytes: utf8('a') }]),
    );
  });

  it('hashes an empty file set to a stable digest', () => {
    expect(hashFileSet([])).toBe(sha256Canonical({ files: [] }));
  });
});

describe('deterministicId', () => {
  it('is stable for equal inputs regardless of key order', () => {
    expect(deterministicId('evd', { a: 1, b: 2 })).toBe(deterministicId('evd', { b: 2, a: 1 }));
  });

  it('separates namespaces by prefix', () => {
    expect(deterministicId('evd', { a: 1 })).not.toBe(deterministicId('ctx', { a: 1 }));
  });

  it('pins a known value', () => {
    expect(deterministicId('evd', { a: 1 })).toBe(
      'evd_AFNL2724YV5C3WKLOWIPASWYBBBHHEC64M7MLTV6VZRCO2UX7BRA',
    );
  });
});

describe('text normalization feeding a digest', () => {
  it('the LF rule and the NFC rule are independent', () => {
    // Normalizing line endings must not compose characters, and vice versa.
    const text = 'caf\u0065\u0301\r\n';
    expect(normalizeTextForHashing(text)).toBe('caf\u0065\u0301\n');
    expect(normalizeIdentifierText(text)).toBe('caf\u00e9\r\n');
  });
});
