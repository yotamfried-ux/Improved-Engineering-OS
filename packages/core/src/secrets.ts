/**
 * Secret-shaped values (F9, D22, D26).
 *
 * One list, three consumers: the F9 source scan that keeps keys out of the
 * repository, the client-side telemetry sanitizer that keeps them out of the
 * outbox, and the ingest function that refuses them at the boundary. They must
 * agree, because a shape one of them knows and another does not is precisely
 * the gap a credential travels through -- and three separately maintained
 * regex lists drift by default rather than by accident.
 *
 * These match *values*, not identifier words. "supabase" in a comment is not a
 * finding; `sb_secret_…` is. That distinction is why F9 can be enforced at all:
 * a scan that fired on the word would have been turned off within a week.
 *
 * Pure data and pure predicates, so this belongs in core and reaches everything
 * without anyone importing a runtime package to get it.
 */

/**
 * Shapes with a fixed, published prefix and enough entropy after it that a
 * match is a key rather than prose.
 *
 * Deliberately not a general "long random-looking string" heuristic: that
 * fires on hashes, ULIDs and base64 fixtures, all of which this system emits
 * legitimately, and a check with false positives becomes a check that gets
 * disabled.
 */
export const SECRET_SHAPES: readonly RegExp[] = [
  /sb_secret_[A-Za-z0-9]{20,}/u,
  /sb_publishable_[A-Za-z0-9]{20,}/u,
  /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\./u, // JWT
  /-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----/u,
  /gh[pousr]_[A-Za-z0-9]{30,}/u,
  /AKIA[0-9A-Z]{16}/u,
];

/**
 * Whether a value looks like a credential.
 *
 * Applied to attribute values regardless of which key carries them: an
 * allowlisted key is permission to send a *kind* of fact, never permission to
 * send a secret that happens to have been put there.
 */
export function looksLikeSecret(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  return SECRET_SHAPES.some((shape) => shape.test(value));
}
