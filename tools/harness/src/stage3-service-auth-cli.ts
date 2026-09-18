/**
 * Trusted-host lifecycle for the Stage 3 harness service principal (D36).
 *
 * The harness may pre-register a Run classification and nothing else. The raw
 * token stays in a 0600 local file; stdout contains only the token hash inside
 * an owner-applied SQL statement. This command never calls the Evidence Plane.
 *
 * Usage:
 *   node tools/harness/src/stage3-service-auth-cli.ts enroll --owner <uuid>
 *   node tools/harness/src/stage3-service-auth-cli.ts rotate
 *   node tools/harness/src/stage3-service-auth-cli.ts revoke
 */

import { randomBytes } from 'node:crypto';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { mintId, type Clock, type RandomSource } from '@ieos/core';
import {
  AuthError,
  CREDENTIALS_MODE,
  mintToken,
  protectionOf,
  serviceCredentialsFor,
  serviceEnrolmentStatement,
  serviceRevocationStatement,
  serviceRotationStatement,
  tokenHashLiteral,
  type ServiceCredentials,
} from '../../../packages/adapters/cli/src/auth.ts';

const args = process.argv.slice(2);
const subcommand = args[0] ?? '';
const flag = (name: string): string | undefined => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};

const systemClock: Clock = {
  nowMs: () => Date.now(),
  nowIso: () => new Date().toISOString(),
};
const systemRandom: RandomSource = { bytes: (length) => new Uint8Array(randomBytes(length)) };

const eosRoot = resolve(flag('--eos-root') ?? process.cwd());
const credentialsPath = resolve(
  flag('--credentials') ?? join(eosRoot, '.ieos', 'harness-service.json'),
);

function readServiceId(path: string): string | undefined {
  if (!existsSync(path)) return undefined;
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as Partial<ServiceCredentials>;
    return typeof parsed.service_id === 'string' && parsed.service_id.startsWith('svc_')
      ? parsed.service_id
      : undefined;
  } catch {
    return undefined;
  }
}

function writeCredential(credentials: ServiceCredentials): void {
  mkdirSync(dirname(credentialsPath), { recursive: true });
  writeFileSync(credentialsPath, `${JSON.stringify(credentials, null, 2)}\n`, {
    encoding: 'utf8',
    mode: CREDENTIALS_MODE,
  });
  chmodSync(credentialsPath, CREDENTIALS_MODE);
}

function reportProtection(): void {
  const protection = protectionOf(statSync(credentialsPath).mode, process.platform);
  process.stdout.write(
    `credential: ${credentialsPath}` +
      (protection.enforced ? ' (mode 0600)' : ' (permissions NOT enforced)') +
      '\n',
  );
  if (!protection.enforced) process.stderr.write(`\nWARNING: ${protection.reason ?? ''}\n`);
}

function usage(): number {
  process.stderr.write(
    'usage: stage3-service-auth <enroll|rotate|revoke> ' +
      '[--owner <supabase auth user uuid>] [--service <svc_id>] ' +
      '[--credentials <file>] [--label <name>] [--eos-root <path>]\n',
  );
  return 2;
}

function run(): number {
  try {
    if (subcommand === 'enroll') {
      const ownerId = flag('--owner');
      if (ownerId === undefined) return usage();
      if (existsSync(credentialsPath)) {
        process.stderr.write(
          `${credentialsPath} already exists. Use rotate to preserve the harness service identity.\n`,
        );
        return 4;
      }

      const serviceId = flag('--service') ?? mintId('svc', systemClock, systemRandom);
      if (!serviceId.startsWith('svc_')) {
        process.stderr.write('--service must be a svc_ identity\n');
        return 2;
      }
      const token = mintToken(systemRandom);
      const credentials = serviceCredentialsFor({
        serviceId,
        token,
        nowIso: systemClock.nowIso(),
      });
      writeCredential(credentials);

      const statement = serviceEnrolmentStatement({
        serviceId,
        ownerId,
        tokenHash: tokenHashLiteral(token),
        expiresAt: credentials.expires_at,
        label: flag('--label') ?? 'Stage 3 qualification harness',
      });

      process.stdout.write(`service:    ${serviceId}\n`);
      reportProtection();
      process.stdout.write(`expires:    ${credentials.expires_at}\n\n`);
      process.stdout.write('Apply this against your Evidence Plane, as the owner:\n\n');
      process.stdout.write(`${statement}\n\n`);
      process.stdout.write(
        'The SQL carries only the token HASH. The raw token exists only in the credential ' +
          'file above; do not paste it into SQL, Git, chat, or logs.\n',
      );
      return 0;
    }

    if (subcommand === 'rotate') {
      const serviceId = flag('--service') ?? readServiceId(credentialsPath);
      if (serviceId === undefined) {
        process.stderr.write(
          'cannot rotate without an existing harness service identity; restore the credential ' +
            'file or pass --service <svc_id> explicitly\n',
        );
        return 4;
      }
      const token = mintToken(systemRandom);
      const credentials = serviceCredentialsFor({
        serviceId,
        token,
        nowIso: systemClock.nowIso(),
      });
      writeCredential(credentials);

      process.stdout.write(`service:    ${serviceId}\n`);
      reportProtection();
      process.stdout.write(`expires:    ${credentials.expires_at}\n\n`);
      process.stdout.write('Apply this against your Evidence Plane, as the owner:\n\n');
      process.stdout.write(
        `${serviceRotationStatement({
          serviceId,
          tokenHash: tokenHashLiteral(token),
          expiresAt: credentials.expires_at,
        })}\n\n`,
      );
      process.stdout.write(
        'The SQL carries only the new token HASH. The raw token remains in the credential file.\n',
      );
      return 0;
    }

    if (subcommand === 'revoke') {
      const serviceId = flag('--service') ?? readServiceId(credentialsPath);
      if (serviceId === undefined) {
        process.stderr.write(
          'cannot revoke an unknown harness service identity; pass --service <svc_id> explicitly\n',
        );
        return 4;
      }
      process.stdout.write('Apply this against your Evidence Plane, as the owner:\n\n');
      process.stdout.write(`${serviceRevocationStatement(serviceId)}\n\n`);
      if (existsSync(credentialsPath)) {
        rmSync(credentialsPath, { force: true });
        process.stdout.write(`removed ${credentialsPath}\n`);
      }
      process.stdout.write(
        'The local credential is gone. The service principal is NOT revoked until the statement ' +
          'above has run against the Evidence Plane.\n',
      );
      return 0;
    }

    return usage();
  } catch (error) {
    if (error instanceof AuthError) {
      process.stderr.write(`${error.message}\n`);
      return 4;
    }
    throw error;
  }
}

// The enrol and rotate paths print the owner-applied SQL last. process.exit
// does not flush a piped stdout, which would leave a local token the Evidence
// Plane never learns about.
process.exitCode = run();
