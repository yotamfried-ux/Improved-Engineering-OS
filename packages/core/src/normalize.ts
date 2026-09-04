/**
 * Layer 1 of ADR-0003: project normalization.
 *
 * This layer runs BEFORE canonicalization and only on values a caller has
 * explicitly declared normalizable. It is deliberately *not* part of
 * `hashing.ts`'s canonicalization path.
 *
 * RFC 8785 section 3.1 requires Unicode strings to be preserved during
 * canonicalization. D35 also lists "Strings -> UTF-8, NFC normalization". Fusing
 * the two would mean two distinct JSON documents hash identically and a value
 * read back out differs from the value put in -- a silent change to JSON
 * semantics. So the two are kept as separate, ordered layers:
 *
 *   1. normalize (here)  -- opt-in, per field, at admission time
 *   2. canonicalize      -- pure RFC 8785, never normalizes
 *   3. digest
 *
 * The normalized value becomes *the* value: it is what is stored, compared and
 * later canonicalized. Normalization is an admission-time decision, not a
 * hashing-time trick.
 */

import { InvalidManifestError, NormalizationCollisionError } from './errors.ts';

/**
 * Normalize identifier-like text: slugs, capability and problem ids, titles used
 * as identity, and relative POSIX paths.
 *
 * NFC only. No case folding, no whitespace collapsing, no punctuation
 * rewriting -- each of those would discard information a canonical identifier is
 * allowed to carry.
 */
export function normalizeIdentifierText(value: string): string {
  return value.normalize('NFC');
}

/**
 * Normalize the text of a text asset for hashing: line endings to LF, nothing
 * else.
 *
 * D35 is explicit that trailing whitespace is not touched. CRLF and lone CR both
 * become LF, so the same asset checked out on Windows and on Linux hashes
 * identically -- which is what the Stage 0 cross-platform gate is about.
 *
 * A leading BOM is removed: a BOM is an encoding artefact of how the file was
 * written, not content, and leaving it in would make the same asset hash
 * differently depending on the editor that saved it.
 */
export function normalizeTextForHashing(value: string): string {
  const withoutBom = value.charCodeAt(0) === 0xfeff ? value.slice(1) : value;
  return withoutBom.replace(/\r\n?/gu, '\n');
}

/**
 * Normalize a relative path to the canonical form used in file manifests:
 * POSIX separators, NFC.
 *
 * Absolute paths, Windows drive letters, `.`/`..` segments and empty segments
 * are rejected rather than cleaned up: a manifest entry that needed cleaning is
 * a bug in whatever produced it, and quietly repairing it would let two
 * different trees produce the same manifest.
 */
export function normalizeRelativePosixPath(value: string): string {
  const unified = normalizeIdentifierText(value).replace(/\\/gu, '/');
  if (unified.length === 0) {
    throw new InvalidManifestError('relative path must not be empty');
  }
  if (unified.startsWith('/')) {
    throw new InvalidManifestError(`relative path must not be absolute: ${JSON.stringify(value)}`);
  }
  if (/^[A-Za-z]:/u.test(unified)) {
    throw new InvalidManifestError(
      `relative path must not carry a drive letter: ${JSON.stringify(value)}`,
    );
  }
  const segments = unified.split('/');
  for (const segment of segments) {
    if (segment === '' || segment === '.' || segment === '..') {
      throw new InvalidManifestError(
        `relative path must not contain empty, "." or ".." segments: ${JSON.stringify(value)}`,
      );
    }
  }
  return unified;
}

/**
 * True when normalizing `value` would change it.
 *
 * Used by contract refinements that want to insist a stored identifier is
 * already normalized, rather than normalizing it again at read time.
 */
export function isNormalizedIdentifierText(value: string): boolean {
  return value.normalize('NFC') === value;
}

/**
 * Normalize a set of identifier-like strings, rejecting collisions.
 *
 * Two distinct inputs that normalize to the same value are an error, never a
 * merge. The returned map is insertion-ordered by first appearance of each
 * normalized value, so callers get a deterministic result.
 *
 * @throws NormalizationCollisionError naming both originals.
 */
export function normalizeIdentifierSet(values: Iterable<string>): Map<string, string> {
  const byNormalized = new Map<string, string>();
  for (const original of values) {
    const normalized = normalizeIdentifierText(original);
    const seen = byNormalized.get(normalized);
    if (seen === undefined) {
      byNormalized.set(normalized, original);
      continue;
    }
    if (seen !== original) {
      throw new NormalizationCollisionError(normalized, [seen, original]);
    }
  }
  return byNormalized;
}

/**
 * Comparator for file-manifest entries: relative POSIX path, UTF-8 byte order.
 *
 * This is deliberately a DIFFERENT comparator from the one canonical JSON uses
 * for object keys (UTF-16 code units, in `hashing.ts`). The two orderings
 * disagree for characters above U+FFFF -- see `compareUtf16CodeUnits` -- and the
 * test suite pins a fixture where they disagree, so a single shared comparator
 * cannot pass both.
 */
export function compareUtf8Bytes(a: string, b: string): number {
  const encoder = new TextEncoder();
  const left = encoder.encode(a);
  const right = encoder.encode(b);
  const shared = Math.min(left.length, right.length);
  for (let i = 0; i < shared; i += 1) {
    const l = left[i] as number;
    const r = right[i] as number;
    if (l !== r) return l < r ? -1 : 1;
  }
  return left.length === right.length ? 0 : left.length < right.length ? -1 : 1;
}

/**
 * Comparator for JSON object keys: UTF-16 code units, per RFC 8785 section 3.2.3.
 *
 * JavaScript's `<` on strings already compares UTF-16 code units, but this is
 * written out so the intent is explicit at the call site and so the contrast
 * with `compareUtf8Bytes` is visible rather than incidental.
 */
export function compareUtf16CodeUnits(a: string, b: string): number {
  const shared = Math.min(a.length, b.length);
  for (let i = 0; i < shared; i += 1) {
    const l = a.charCodeAt(i);
    const r = b.charCodeAt(i);
    if (l !== r) return l < r ? -1 : 1;
  }
  return a.length === b.length ? 0 : a.length < b.length ? -1 : 1;
}
