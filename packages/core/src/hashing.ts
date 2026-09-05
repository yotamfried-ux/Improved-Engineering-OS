/**
 * D35 Hashing Contract -- the single canonical structured hashing implementation.
 *
 * F12: no subsystem defines its own canonical serialization or domain-identity
 * hashing outside this file. The two permitted exceptions named in C-02 -- raw
 * artifact integrity in `packages/launcher`, and credential hashing in the auth
 * path -- hash opaque bytes, never a structured domain object, and neither
 * exists yet.
 *
 * Layers, kept separate on purpose (ADR-0003):
 *
 *   Layer 0  assertCanonicalizableJson  -- IEOS input validation
 *   Layer 1  normalize.ts               -- project normalization, opt-in, elsewhere
 *   Layer 2  canonicalizeJson           -- RFC 8785, pure, never normalizes
 *   Layer 3  sha256Hex / digestId       -- SHA-256 over the UTF-8 bytes
 *
 * Layer 2 contains no call into Layer 1. That is the property test
 * `hashing.test.ts` "canonicalization preserves strings that normalization
 * would change" exists to defend.
 */

import { createHash } from 'node:crypto';
import { NonCanonicalizableValueError } from './errors.ts';
import {
  compareUtf16CodeUnits,
  compareUtf8Bytes,
  normalizeRelativePosixPath,
} from './normalize.ts';

/** A value RFC 8785 can canonicalize. Deliberately excludes `undefined`. */
export type JsonValue =
  null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

/** Textual digest form required by D35: `sha256:<lowercase hex>`. */
export type Sha256Digest = `sha256:${string}`;

/** One entry of a file-set manifest. */
export interface ManifestEntry {
  /** Relative POSIX path, NFC-normalized. */
  readonly path: string;
  /** `sha256:<hex>` over the normalized bytes of that file. */
  readonly sha256: Sha256Digest;
}

// ---------------------------------------------------------------------------
// Layer 0 -- input validation
// ---------------------------------------------------------------------------

/**
 * Reject anything canonical hashing must not silently accept.
 *
 * RFC 8785 has no representation for `NaN`, `Infinity` or `undefined`, and
 * JavaScript's `JSON.stringify` quietly turns several of these into `null` or
 * drops them. Quiet coercion inside an identity function is exactly the "silent
 * semantic repair" the Stage 0 manifest forbids, so each case throws instead.
 *
 * Lone surrogates are rejected too. `JSON.stringify` would escape them into
 * well-formed output, so RFC 8785 conformance does not require rejection -- but
 * a lone surrogate inside a canonical domain object means the value was
 * corrupted upstream, and turning corruption into a stable identity is worse
 * than failing. This is an IEOS validation rule, applied here at Layer 0 so that
 * Layer 2 stays faithful to the RFC.
 */
export function assertCanonicalizableJson(
  value: unknown,
  at: readonly (string | number)[] = [],
  seen: Set<object> = new Set(),
): asserts value is JsonValue {
  if (value === null || typeof value === 'boolean') return;

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new NonCanonicalizableValueError(
        `RFC 8785 cannot represent the number ${String(value)}`,
        at,
      );
    }
    return;
  }

  if (typeof value === 'string') {
    assertWellFormedString(value, at);
    return;
  }

  if (typeof value === 'undefined') {
    throw new NonCanonicalizableValueError(
      'undefined is not a JSON value; omit the key or use null explicitly',
      at,
    );
  }

  if (typeof value === 'bigint') {
    throw new NonCanonicalizableValueError(
      'BigInt has no RFC 8785 number serialization; encode it as a string',
      at,
    );
  }

  if (typeof value === 'function' || typeof value === 'symbol') {
    throw new NonCanonicalizableValueError(`${typeof value} is not a JSON value`, at);
  }

  if (typeof value === 'object') {
    if (seen.has(value)) {
      throw new NonCanonicalizableValueError('cyclic structure cannot be canonicalized', at);
    }

    // D18.5 / guide section 5: contracts use ISO strings and plain objects because
    // Date, Map and Set are unrepresentable in JSON Schema. Rejecting them here
    // keeps that rule enforceable at the hashing boundary too.
    if (value instanceof Date) {
      throw new NonCanonicalizableValueError(
        'Date is not a contract type; use an ISO-8601 string',
        at,
      );
    }
    if (value instanceof Map || value instanceof Set) {
      throw new NonCanonicalizableValueError(
        `${value.constructor.name} is not a contract type; use a plain object or array`,
        at,
      );
    }

    seen.add(value);
    try {
      if (Array.isArray(value)) {
        for (let i = 0; i < value.length; i += 1) {
          assertCanonicalizableJson(value[i], [...at, i], seen);
        }
        return;
      }

      const prototype = Object.getPrototypeOf(value) as unknown;
      if (prototype !== Object.prototype && prototype !== null) {
        throw new NonCanonicalizableValueError(
          'class instances are not JSON values; convert to a plain object first',
          at,
        );
      }

      for (const key of Object.keys(value as Record<string, unknown>)) {
        assertWellFormedString(key, at);
        assertCanonicalizableJson((value as Record<string, unknown>)[key], [...at, key], seen);
      }
      return;
    } finally {
      seen.delete(value);
    }
  }

  throw new NonCanonicalizableValueError(`unsupported value of type ${typeof value}`, at);
}

function assertWellFormedString(value: string, at: readonly (string | number)[]): void {
  if (value.isWellFormed()) return;
  throw new NonCanonicalizableValueError(
    'string contains a lone surrogate and is not well-formed Unicode',
    at,
  );
}

// ---------------------------------------------------------------------------
// Layer 2 -- RFC 8785 canonicalization
// ---------------------------------------------------------------------------

/**
 * RFC 8785 JSON Canonicalization Scheme.
 *
 * - Object members sorted by key, UTF-16 code unit order (section 3.2.3).
 * - Strings preserved verbatim; escaping per section 3.2.2.2, which is exactly
 *   what `JSON.stringify` produces for a well-formed string.
 * - Numbers per ECMAScript `Number::toString` (section 3.2.2.3), which is again
 *   what `JSON.stringify` produces; `-0` serializes as `0`.
 * - No whitespace.
 *
 * This function performs NO normalization. Its output for a decomposed string
 * differs from its output for the composed equivalent, which is the RFC's
 * required behaviour and is pinned by the vendored `unicode.json` conformance
 * vector.
 */
export function canonicalizeJson(value: unknown): string {
  assertCanonicalizableJson(value);
  return serialize(value);
}

function serialize(value: JsonValue): string {
  if (value === null) return 'null';

  switch (typeof value) {
    case 'boolean':
      return value ? 'true' : 'false';
    case 'number':
      // JSON.stringify(-0) is "0", and JSON.stringify follows Number::toString
      // for every finite double, which is what section 3.2.2.3 requires.
      return JSON.stringify(value) as string;
    case 'string':
      return JSON.stringify(value) as string;
    default:
      break;
  }

  if (Array.isArray(value)) {
    return `[${value.map(serialize).join(',')}]`;
  }

  const record = value as { [key: string]: JsonValue };
  const keys = Object.keys(record).sort(compareUtf16CodeUnits);
  const members = keys.map(
    (key) => `${JSON.stringify(key)}:${serialize(record[key] as JsonValue)}`,
  );
  return `{${members.join(',')}}`;
}

/** The UTF-8 bytes of the canonical form -- the input to every digest. */
export function canonicalBytes(value: unknown): Uint8Array {
  return new TextEncoder().encode(canonicalizeJson(value));
}

// ---------------------------------------------------------------------------
// Layer 3 -- digests and identifiers
// ---------------------------------------------------------------------------

/** SHA-256 of arbitrary bytes, in D35's textual form. */
export function sha256Bytes(bytes: Uint8Array): Sha256Digest {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

/**
 * SHA-256 of text, in D35's textual form.
 *
 * The text is LF-normalized first: this is the "Text assets" row of D35, and it
 * is why the same asset hashes identically whether it was checked out on Windows
 * or Linux.
 */
export function sha256Text(value: string): Sha256Digest {
  const normalized = value.replace(/\r\n?/gu, '\n');
  return sha256Bytes(new TextEncoder().encode(normalized));
}

/** SHA-256 over the canonical bytes of a JSON record. */
export function sha256Canonical(value: unknown): Sha256Digest {
  return sha256Bytes(canonicalBytes(value));
}

/** Raw digest bytes, for identifier minting. */
export function sha256Raw(bytes: Uint8Array): Uint8Array {
  return new Uint8Array(createHash('sha256').update(bytes).digest());
}

// ---------------------------------------------------------------------------
// File sets (P-04)
// ---------------------------------------------------------------------------

/**
 * Build a file-set manifest: per-file SHA-256, entries sorted by relative POSIX
 * path in UTF-8 byte order.
 *
 * Paths are never concatenated with bytes. P-04 rejected that form precisely
 * because `a/b` + bytes and `a` + `/b` + bytes are indistinguishable.
 *
 * Note the ordering: UTF-8 bytes here, but UTF-16 code units for JSON keys in
 * `serialize`. Two different comparators, on purpose (ADR-0003).
 */
export function buildFileManifest(
  files: Iterable<{ readonly path: string; readonly bytes: Uint8Array }>,
): { readonly files: ManifestEntry[] } {
  const entries: ManifestEntry[] = [];
  const seenPaths = new Set<string>();

  for (const file of files) {
    const path = normalizeRelativePosixPath(file.path);
    if (seenPaths.has(path)) {
      throw new NonCanonicalizableValueError(
        `duplicate manifest path after normalization: ${JSON.stringify(path)}`,
        ['files', path],
      );
    }
    seenPaths.add(path);
    entries.push({ path, sha256: sha256Bytes(file.bytes) });
  }

  entries.sort((a, b) => compareUtf8Bytes(a.path, b.path));
  return { files: entries };
}

/**
 * D35 file-set digest: per-file SHA-256 -> sorted manifest -> JCS -> one SHA-256.
 */
export function hashFileSet(
  files: Iterable<{ readonly path: string; readonly bytes: Uint8Array }>,
): Sha256Digest {
  return sha256Canonical(buildFileManifest(files) as unknown as JsonValue);
}

// ---------------------------------------------------------------------------
// Base32 (RFC 4648, no padding) -- the identifier alphabet of D35
// ---------------------------------------------------------------------------

const RFC4648_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/**
 * RFC 4648 base32 without padding.
 *
 * Distinct from the Crockford base32 used by ULIDs in `ids.ts`. D35 specifies
 * this alphabet for deterministic ids; D19 specifies Crockford for ULIDs. They
 * are different alphabets and are implemented separately so neither can drift
 * into the other.
 */
export function base32Encode(bytes: Uint8Array): string {
  let out = '';
  let buffer = 0;
  let bits = 0;

  for (const byte of bytes) {
    buffer = (buffer << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      out += RFC4648_ALPHABET[(buffer >>> bits) & 31];
    }
  }
  if (bits > 0) {
    out += RFC4648_ALPHABET[(buffer << (5 - bits)) & 31];
  }
  return out;
}

/**
 * Mint a deterministic identifier: `<prefix>_<base32(sha256(JCS(value)))>`.
 *
 * C-03 requires every deterministic id in the project to be formed this way --
 * no pipe or path concatenation anywhere.
 */
export function deterministicId(prefix: string, value: unknown): string {
  return `${prefix}_${base32Encode(sha256Raw(canonicalBytes(value)))}`;
}
