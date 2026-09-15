/**
 * Principal credentials (D22.1, D22.5, D36).
 *
 * The installation path is used by `ieos auth enroll|rotate|revoke`. Stage 3
 * also needs a host-only service principal for the qualification harness. Both
 * identities intentionally share the same token, expiry, hashing and file-mode
 * primitives so there is one credential implementation rather than a second
 * Stage-3-only secret format.
 *
 * These helpers do NOT reach the Evidence Plane. They mint an opaque token,
 * store only the token on the trusted host, and emit SQL containing the hash.
 * The owner applies that SQL. A raw token therefore never needs to cross a
 * terminal log, Git, or the database boundary.
 */

import { sha256Raw } from '@ieos/core';
import type { RandomSource } from '@ieos/core';

/** D22.5: at least 256 bits from a CSPRNG. */
export const TOKEN_BYTES = 32;

/** 90 days, renewable (D22.1). */
export const TOKEN_LIFETIME_DAYS = 90;

/** The credential file is readable by its owner and nobody else -- where that is expressible. */
export const CREDENTIALS_MODE = 0o600;

export interface CredentialProtection {
  /** True when the file really is owner-only. */
  readonly enforced: boolean;
  /** The permission bits actually observed. */
  readonly mode: number;
  /** Why the credential is not protected, when it is not. */
  readonly reason: string | null;
}

/**
 * Whether the credential file's permissions actually protect it.
 *
 * D22.1 names the OS keychain first and a `0600` file as the fallback. On
 * Windows that fallback does not exist: `fs.chmod` only toggles the read-only
 * attribute, so a file written `0600` reports `0666` and the mode carries no
 * access control at all. The mode is checked rather than assumed.
 */
export function protectionOf(mode: number, platform: string): CredentialProtection {
  const bits = mode & 0o777;
  if (bits === CREDENTIALS_MODE) return { enforced: true, mode: bits, reason: null };
  if (platform === 'win32') {
    return {
      enforced: false,
      mode: bits,
      reason:
        'Windows does not implement POSIX file modes -- chmod there toggles the read-only ' +
        'attribute and nothing else -- so this file is protected only by the ACLs of the ' +
        'directory holding it. Prefer an environment secret over this file on Windows until ' +
        'the OS keychain path D22.1 names is implemented.',
    };
  }
  return {
    enforced: false,
    mode: bits,
    reason: `the credential file is mode 0${bits.toString(8)} rather than 0600`,
  };
}

export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthError';
  }
}

/** base64url of 32 random bytes: 43 characters, no padding. */
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

export function expiryFrom(nowIso: string, days = TOKEN_LIFETIME_DAYS): string {
  const now = Date.parse(nowIso);
  if (Number.isNaN(now)) throw new AuthError(`not a timestamp: ${nowIso}`);
  return new Date(now + days * 24 * 60 * 60 * 1000).toISOString();
}

export interface Credentials {
  readonly schema_version: '1';
  readonly installation_id: string;
  readonly token: string;
  readonly created_at: string;
  readonly expires_at: string;
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
 * The statement the owner applies for an installation.
 * It carries the HASH, never the token.
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

/** Revocation preserves the principal row so existing evidence remains attributable. */
export function revocationStatement(installationId: string): string {
  return [
    'update principals',
    '   set revoked_at = now()',
    ` where id = ${quote(installationId)} and revoked_at is null;`,
  ].join('\n');
}

/**
 * Stage 3's harness identity has exactly one authority: classify a Run before
 * its first event. Keeping this list separate from the database's broader
 * service-principal allowlist makes least privilege explicit at provisioning.
 */
export const HARNESS_SERVICE_SCOPES = ['run.register'] as const;

export interface ServiceCredentials {
  readonly schema_version: '1';
  readonly service_id: string;
  readonly scopes: readonly ['run.register'];
  readonly token: string;
  readonly created_at: string;
  readonly expires_at: string;
}

export function serviceCredentialsFor(options: {
  readonly serviceId: string;
  readonly token: string;
  readonly nowIso: string;
}): ServiceCredentials {
  if (!options.serviceId.startsWith('svc_')) {
    throw new AuthError(
      `service id must start with svc_, received ${JSON.stringify(options.serviceId)}`,
    );
  }
  return {
    schema_version: '1',
    service_id: options.serviceId,
    scopes: HARNESS_SERVICE_SCOPES,
    token: options.token,
    created_at: options.nowIso,
    expires_at: expiryFrom(options.nowIso),
  };
}

/** Hash-only owner statement for the Stage 3 harness service principal (D36). */
export function serviceEnrolmentStatement(options: {
  readonly serviceId: string;
  readonly ownerId: string;
  readonly tokenHash: string;
  readonly expiresAt: string;
  readonly label: string | null;
}): string {
  const label = options.label === null ? 'null' : quote(options.label);
  return [
    'insert into principals (id, kind, owner_id, token_hash, scopes, label, expires_at)',
    `values (${quote(options.serviceId)}, 'service', ${quote(options.ownerId)}::uuid,`,
    `        ${quote(options.tokenHash)}::bytea,`,
    `        array[${HARNESS_SERVICE_SCOPES.map(quote).join(', ')}],`,
    `        ${label}, ${quote(options.expiresAt)}::timestamptz);`,
  ].join('\n');
}

/** Rotate the host-only token without changing the service principal identity. */
export function serviceRotationStatement(options: {
  readonly serviceId: string;
  readonly tokenHash: string;
  readonly expiresAt: string;
}): string {
  return [
    'update principals',
    `   set token_hash = ${quote(options.tokenHash)}::bytea,`,
    `       expires_at = ${quote(options.expiresAt)}::timestamptz,`,
    '       revoked_at = null',
    ` where id = ${quote(options.serviceId)} and kind = 'service';`,
  ].join('\n');
}

/** Revoke without deleting the identity that registered historical Runs. */
export function serviceRevocationStatement(serviceId: string): string {
  return [
    'update principals',
    '   set revoked_at = now()',
    ` where id = ${quote(serviceId)} and kind = 'service' and revoked_at is null;`,
  ].join('\n');
}

/** SQL-literal quoting for statements printed for the owner to apply. */
function quote(value: string): string {
  return `'${value.replace(/'/gu, "''")}'`;
}
