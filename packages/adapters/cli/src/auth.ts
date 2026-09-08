/**
 * The installation credential (D22.1, D22.5).
 *
 * `ieos auth enroll|rotate|revoke`, split into the pure part that lives here
 * and the I/O the composition root performs. What is pure is worth stating: the
 * token's shape, where the credential file goes, its mode, and the exact
 * enrolment record the owner applies. Those are the parts a test can hold, and
 * they are also the parts a mistake would be in.
 *
 * The command does NOT reach the Evidence Plane. Enrolment writes a row in
 * `principals`, which is an owner-authenticated action against a project this
 * repository has no credential for -- and inventing one would put a privileged
 * key on a developer's machine, which is the whole thing D22 exists to avoid.
 * So the tool mints the token, stores it locally, and emits the record for the
 * owner to apply. That is the same shape as the C-04 bootstrap path: the tool
 * prepares, the owner commits.
 *
 * The token is shown once (D22.5). Nothing here logs it, returns it twice, or
 * writes it anywhere but the credential file.
 */

import { sha256Raw } from '@ieos/core';
import type { RandomSource } from '@ieos/core';

/** D22.5: at least 256 bits from a CSPRNG. */
export const TOKEN_BYTES = 32;

/** 90 days, renewable (D22.1). */
export const TOKEN_LIFETIME_DAYS = 90;

/** The credential file is readable by its owner and nobody else. */
export const CREDENTIALS_MODE = 0o600;

export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthError';
  }
}

/**
 * base64url of 32 random bytes: 43 characters, no padding.
 *
 * base64url rather than hex because the token travels in an HTTP header and
 * hex would need 64 characters for the same entropy; and rather than plain
 * base64 because `+` and `/` are not safe everywhere a token gets copied.
 */
export function mintToken(random: RandomSource): string {
  const bytes = random.bytes(TOKEN_BYTES);
  if (bytes.length !== TOKEN_BYTES) {
    throw new AuthError(
      `the random source returned ${String(bytes.length)} bytes, not ${String(TOKEN_BYTES)}; ` +
        'a short token is a weak token and this must not be papered over',
    );
  }
  return Buffer.from(bytes).toString('base64url');
}

/** `\x…` hex, the literal the Evidence Plane's `bytea` column takes. */
export function tokenHashLiteral(token: string): string {
  const digest = sha256Raw(new TextEncoder().encode(token));
  let hex = '';
  for (const byte of digest) hex += byte.toString(16).padStart(2, '0');
  return `\\x${hex}`;
}

export interface Credentials {
  readonly schema_version: '1';
  readonly installation_id: string;
  readonly token: string;
  readonly created_at: string;
  readonly expires_at: string;
}

export function expiryFrom(nowIso: string, days = TOKEN_LIFETIME_DAYS): string {
  const now = Date.parse(nowIso);
  if (Number.isNaN(now)) throw new AuthError(`not a timestamp: ${nowIso}`);
  return new Date(now + days * 24 * 60 * 60 * 1000).toISOString();
}

export function credentialsFor(options: {
  readonly installationId: string;
  readonly token: string;
  readonly nowIso: string;
}): Credentials {
  return {
    schema_version: '1',
    installation_id: options.installationId,
    token: options.token,
    created_at: options.nowIso,
    expires_at: expiryFrom(options.nowIso),
  };
}

/** The scopes an installation may hold, and no others (D22.1). */
export const INSTALLATION_SCOPES = [
  'telemetry.insert',
  'observation.insert',
  'read.minimal',
] as const;

/**
 * The statement the owner applies against their own project.
 *
 * It carries the HASH, never the token. That is the point of handing the owner
 * a statement rather than a token to paste: the value that travels through a
 * terminal, a clipboard and a shell history is the one that proves nothing on
 * its own.
 */
export function enrolmentStatement(options: {
  readonly installationId: string;
  readonly ownerId: string;
  readonly tokenHash: string;
  readonly expiresAt: string;
  readonly label: string | null;
}): string {
  const label = options.label === null ? 'null' : quote(options.label);
  return [
    'insert into principals (id, kind, owner_id, token_hash, scopes, label, expires_at)',
    `values (${quote(options.installationId)}, 'installation', ${quote(options.ownerId)}::uuid,`,
    `        ${quote(options.tokenHash)}::bytea,`,
    `        array[${INSTALLATION_SCOPES.map(quote).join(', ')}],`,
    `        ${label}, ${quote(options.expiresAt)}::timestamptz);`,
  ].join('\n');
}

/** Replace the hash in place, keeping the installation's identity (D22.1). */
export function rotationStatement(options: {
  readonly installationId: string;
  readonly tokenHash: string;
  readonly expiresAt: string;
}): string {
  return [
    'update principals',
    `   set token_hash = ${quote(options.tokenHash)}::bytea,`,
    `       expires_at = ${quote(options.expiresAt)}::timestamptz,`,
    '       revoked_at = null',
    ` where id = ${quote(options.installationId)} and kind = 'installation';`,
  ].join('\n');
}

/**
 * Revocation sets a timestamp; it does not delete the row.
 *
 * The events this installation inserted remain attributable to it, which is
 * D22.6's accepted residual risk made auditable. Deleting the principal would
 * orphan its evidence and quietly turn "we know who wrote this" into "we do
 * not".
 */
export function revocationStatement(installationId: string): string {
  return [
    'update principals',
    '   set revoked_at = now()',
    ` where id = ${quote(installationId)} and revoked_at is null;`,
  ].join('\n');
}

/**
 * Single-quote a SQL literal.
 *
 * These statements are printed for a person to run, not executed here, so this
 * is not the injection boundary the Evidence Plane relies on -- that is the
 * parameterised RPC surface. It still escapes properly, because a label with an
 * apostrophe producing a statement that will not parse is a bad afternoon.
 */
function quote(value: string): string {
  return `'${value.replace(/'/gu, "''")}'`;
}
