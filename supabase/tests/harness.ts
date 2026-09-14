/**
 * A real PostgreSQL, or an honest skip.
 *
 * The Evidence Plane's security properties are enforced by constraints, RLS and
 * SECURITY DEFINER functions -- that is, by the database. Asserting them by
 * reading the migration's text would prove that the file says the right thing,
 * which is not the claim anyone cares about. So these tests execute the
 * migrations and drive the RPCs.
 *
 * When no database is reachable the suite reports itself as SKIPPED rather than
 * passing. A skipped test is unproven, the qualification report counts it as
 * such, and that is the truthful outcome for a machine with no PostgreSQL --
 * far better than a text-matching stand-in that would go green anywhere and
 * mean nothing.
 *
 * `psql` is the client rather than a driver package: it is present on every
 * ubuntu runner and in the Supabase toolchain, and adding an npm dependency to
 * reach a database that CI already provides would be the "large dependency
 * without a written rationale" D29 warns about.
 */

import { execFileSync, spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

/** Set by CI's postgres service, or by a developer pointing at their own. */
export const DATABASE_URL = process.env['IEOS_TEST_DATABASE_URL'] ?? '';

export interface Unavailable {
  readonly reason: string;
}

/** Why the suite cannot run here, or `null` when it can. */
export function unavailable(): Unavailable | null {
  if (DATABASE_URL === '') {
    return {
      reason:
        'IEOS_TEST_DATABASE_URL is not set, so no Evidence Plane was reachable. ' +
        'These tests are UNPROVEN on this machine, not passing.',
    };
  }
  const probe = spawnSync('psql', [DATABASE_URL, '-tAqc', 'select 1'], { encoding: 'utf8' });
  if (probe.status !== 0) {
    return {
      reason: `psql could not reach ${redact(DATABASE_URL)}: ${probe.stderr.trim() || 'no output'}`,
    };
  }
  return null;
}

/** A connection string is a credential. It never reaches a test name or a log. */
function redact(url: string): string {
  return url.replace(/\/\/[^@/]*@/u, '//<redacted>@');
}

export class SqlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SqlError';
  }
}

/** Run SQL, failing loudly. `ON_ERROR_STOP` so a mid-script error is not a pass. */
export function exec(sql: string): string {
  const result = spawnSync('psql', [DATABASE_URL, '-v', 'ON_ERROR_STOP=1', '-tAq', '-c', sql], {
    encoding: 'utf8',
  });
  if (result.status !== 0) throw new SqlError(result.stderr.trim() || 'psql failed');
  return result.stdout.trim();
}

/** Run SQL expected to fail, and return the error text. */
export function expectError(sql: string): string {
  const result = spawnSync('psql', [DATABASE_URL, '-v', 'ON_ERROR_STOP=1', '-tAq', '-c', sql], {
    encoding: 'utf8',
  });
  if (result.status === 0) {
    throw new SqlError(`expected an error, but the statement succeeded: ${sql}`);
  }
  return result.stderr.trim();
}

/** Run a query and parse each row as JSON. */
export function rows<T>(sql: string): T[] {
  const text = exec(`select coalesce(json_agg(t), '[]') from (${sql}) t`);
  return JSON.parse(text === '' ? '[]' : text) as T[];
}

/** Run a scalar-returning query whose value is jsonb. */
export function json<T>(sql: string): T {
  return JSON.parse(exec(sql)) as T;
}

/**
 * Apply the current migration chain into a fresh schema, plus the objects
 * Supabase provides.
 *
 * The caller names the first migration only so the directory remains explicit.
 * Every numbered SQL migration in that directory is then applied in lexical
 * order. Testing only `0001` after a `0002` exists is worse than no test for the
 * latter: the suite would stay green while the deployed schema changed outside
 * the thing it actually exercised.
 */
export function applyMigration(firstMigrationPath: string): void {
  // Roles and `auth.uid()` exist on a Supabase project and not on a bare
  // PostgreSQL. Created here rather than in the migration: a migration that
  // created `service_role` would be inventing part of the platform, and would
  // fail on the platform it is meant for.
  exec(`
    drop schema if exists public cascade;
    create schema public;
    create schema if not exists auth;
    create or replace function auth.uid() returns uuid language sql stable as $fn$ select null::uuid $fn$;
    do $do$ begin
      if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
      if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
      if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
    end $do$;
    -- The platform default privilege a bare \`create role\` does not reproduce
    -- (S-5). Every real Supabase project grants EXECUTE on every new function
    -- in \`public\` directly to anon, authenticated AND service_role -- not to
    -- PUBLIC -- as a standing default privilege set before any migration ever
    -- runs. A migration's own \`revoke ... from public\` does not touch a grant
    -- made directly to a named role, so without this line here a migration
    -- that revoked only from \`public\` would pass locally and still leave every
    -- RPC callable by \`anon\` on the real platform -- invisibly, since nothing
    -- in a bare PostgreSQL would ever have granted it in the first place.
    alter default privileges in schema public
      grant execute on functions to anon, authenticated, service_role;
  `);

  const migrationDir = dirname(firstMigrationPath);
  const migrationPaths = readdirSync(migrationDir)
    .filter((name) => /^\d+_.*\.sql$/u.test(name))
    .sort()
    .map((name) => join(migrationDir, name));

  if (!migrationPaths.includes(firstMigrationPath)) {
    throw new SqlError(`the first migration is not in the migration directory: ${firstMigrationPath}`);
  }

  for (const migrationPath of migrationPaths.slice(migrationPaths.indexOf(firstMigrationPath))) {
    const result = spawnSync(
      'psql',
      [DATABASE_URL, '-v', 'ON_ERROR_STOP=1', '-q', '-f', migrationPath],
      {
        encoding: 'utf8',
      },
    );
    if (result.status !== 0) {
      throw new SqlError(
        `the migration ${migrationPath} did not apply: ${result.stderr.trim() || 'psql failed'}`,
      );
    }
  }
}

/** The PostgreSQL the suite actually ran against, for the record. */
export function serverVersion(): string {
  return execFileSync('psql', [DATABASE_URL, '-tAqc', 'show server_version'], {
    encoding: 'utf8',
  }).trim();
}
