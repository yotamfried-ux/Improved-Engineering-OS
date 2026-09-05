/**
 * Typed errors for the domain core.
 *
 * Every rejection in `core` carries a machine-readable `code` and a `reason`
 * that locates the problem. The Stage 0 simulation manifest requires that
 * invalid input is "rejected with reason" and that there is "no silent semantic
 * repair", so nothing in this package coerces a bad value into a good one.
 */

export type IeosErrorCode =
  | 'NON_CANONICALIZABLE_VALUE'
  | 'NORMALIZATION_COLLISION'
  | 'INVALID_IDENTIFIER'
  | 'INVALID_MANIFEST'
  | 'INVALID_CONTRACT';

export class IeosError extends Error {
  readonly code: IeosErrorCode;
  /** JSON pointer-ish path to the offending value, when one applies. */
  readonly at: readonly (string | number)[];

  constructor(code: IeosErrorCode, message: string, at: readonly (string | number)[] = []) {
    super(at.length > 0 ? `${message} (at ${formatPath(at)})` : message);
    this.name = 'IeosError';
    this.code = code;
    this.at = at;
  }
}

/**
 * A value was handed to canonical hashing that RFC 8785 cannot represent, or
 * that IEOS refuses to represent (see `assertCanonicalizableJson`).
 */
export class NonCanonicalizableValueError extends IeosError {
  constructor(message: string, at: readonly (string | number)[] = []) {
    super('NON_CANONICALIZABLE_VALUE', message, at);
    this.name = 'NonCanonicalizableValueError';
  }
}

/**
 * Two distinct inputs normalized to the same value.
 *
 * This is never resolved by merging. Merging would let two different assets
 * acquire one identity, which is the "duplicate identity" failure mode D6 names.
 * Both originals are carried on the error so the caller can report them.
 */
export class NormalizationCollisionError extends IeosError {
  readonly normalized: string;
  readonly originals: readonly [string, string];

  constructor(normalized: string, originals: readonly [string, string]) {
    super(
      'NORMALIZATION_COLLISION',
      `distinct inputs ${JSON.stringify(originals[0])} and ${JSON.stringify(originals[1])} ` +
        `both normalize to ${JSON.stringify(normalized)}`,
    );
    this.name = 'NormalizationCollisionError';
    this.normalized = normalized;
    this.originals = originals;
  }
}

export class InvalidIdentifierError extends IeosError {
  constructor(message: string) {
    super('INVALID_IDENTIFIER', message);
    this.name = 'InvalidIdentifierError';
  }
}

export class InvalidManifestError extends IeosError {
  constructor(message: string, at: readonly (string | number)[] = []) {
    super('INVALID_MANIFEST', message, at);
    this.name = 'InvalidManifestError';
  }
}

function formatPath(at: readonly (string | number)[]): string {
  if (at.length === 0) return '$';
  return at.reduce<string>(
    (acc, segment) =>
      typeof segment === 'number' ? `${acc}[${segment}]` : `${acc}.${String(segment)}`,
    '$',
  );
}
