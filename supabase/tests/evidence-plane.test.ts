/**
 * The Evidence Plane, executed (D22, D33, D36, guide §5.9).
 *
 * The claims under test are security claims, so nearly every case here is an
 * attempt to do the forbidden thing and a check that the database refused. In
 * particular D36's guarantee -- "a compromised agent or installation can
 * therefore only ever produce `operational` evidence" -- is worth exactly as
 * much as the absence of a path that would let it produce anything else, and
 * the only way to establish an absence is to go looking for one.
 */

import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  enrolmentStatement,
  mintToken,
  revocationStatement,
  rotationStatement,
  tokenHashLiteral,
} from '../../packages/adapters/cli/src/auth.ts';
import {
  applyMigration,
  exec,
  expectError,
  json,
  rows,
  serverVersion,
  unavailable,
} from './harness.ts';

/** The repository root: this file is `supabase/tests/`, two levels down. */
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

const MIGRATION = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'migrations',
  '0001_evidence_plane.sql',
);

const blocked = unavailable();
// `describe.skip` rather than a silent early return: a skipped suite shows as
// skipped in the runner and in the platform record, and the qualification gate
// counts skipped as unproven. A suite that returned early would show as passed.
const suite = blocked === null ? describe : describe.skip;

// The reason travels in the suite NAME, not in a console line. Vitest does not
// print console output from a suite it skipped, so a warning there would be
// swallowed and the reader would see 34 skipped tests with no explanation --
// the same unattributable-evidence problem this project has already been
// bitten by once, one level down.
const SUITE =
  blocked === null ? 'the Evidence Plane' : `the Evidence Plane [SKIPPED: ${blocked.reason}]`;

const INSTALLATION = "sha256('token-installation'::bytea)";
const SERVICE = "sha256('token-service'::bytea)";
const OTHER = "sha256('token-other-installation'::bytea)";

/** A SQL string literal, for a value this test puts into a statement. */
function quoteLiteral(value: string): string {
  return `'${value.replace(/'/gu, "''")}'`;
}

/** One event, with whatever a caller might try to smuggle into it. */
function event(over: Record<string, unknown> = {}): string {
  const value = {
    event_id: 'evt_1',
    run_id: 'run_a',
    emitter_id: 'emt_a',
    event_type: 'tool.call',
    source: { sequence: 0 },
    time: { occurred_at: '2026-09-08T00:00:00Z', observed_at: '2026-09-08T00:00:00Z' },
    ...over,
  };
  return `'${JSON.stringify([value]).replace(/'/gu, "''")}'::jsonb`;
}

function seedPrincipals(): void {
  exec(`
    insert into principals (id, kind, owner_id, token_hash, scopes, expires_at) values
      ('inst_a', 'installation', '11111111-1111-1111-1111-111111111111', ${INSTALLATION},
       array['telemetry.insert','observation.insert','read.minimal'], now() + interval '90 days'),
      ('inst_b', 'installation', '22222222-2222-2222-2222-222222222222', ${OTHER},
       array['telemetry.insert','observation.insert','read.minimal'], now() + interval '90 days'),
      ('svc_harness', 'service', '11111111-1111-1111-1111-111111111111', ${SERVICE},
       array['run.register','read.minimal'], now() + interval '90 days');
  `);
}

/** Wipe the data between tests without re-running the migration each time. */
function truncate(): void {
  exec('truncate raw_events, observations, context_snapshots, runs, principals cascade;');
  seedPrincipals();
}

suite(SUITE, () => {
  beforeAll(() => {
    applyMigration(MIGRATION);
    seedPrincipals();
    // Recorded so the report says which engine the evidence came from, rather
    // than "a database".
    process.stdout.write(`Evidence Plane tests running against PostgreSQL ${serverVersion()}\n`);
  });

  describe('run classification authority (D36)', () => {
    it('creates an unregistered run as operational, never as anything stronger', () => {
      truncate();
      json(`select ingest_events(${INSTALLATION}, ${event()})`);
      expect(rows('select run_id, origin_class, registered_by from runs')).toEqual([
        { run_id: 'run_a', origin_class: 'operational', registered_by: null },
      ]);
    });

    it('ignores an origin_class an event tries to carry, and does not store it', () => {
      // The telemetry envelope has no such field, so this is what smuggling
      // would look like. The stamped column holds the plane's answer, and the
      // stored envelope does not keep the client's beside it where a later
      // reader could mistake one for the other.
      truncate();
      json(`select ingest_events(${INSTALLATION}, ${event({ origin_class: 'qualification' })})`);
      expect(
        rows(`select origin_class, envelope ? 'origin_class' as kept from raw_events`),
      ).toEqual([{ origin_class: 'operational', kept: false }]);
    });

    it('refuses register_run to an installation, whatever it asks for', () => {
      truncate();
      const error = expectError(`select register_run(${INSTALLATION}, 'run_z', 'qualification')`);
      expect(error).toMatch(/ieos_missing_scope_run\.register/u);
    });

    it('cannot even be granted run.register on an installation', () => {
      // The scope restriction is a table constraint, so the refusal above does
      // not depend on anyone remembering how to enrol correctly.
      truncate();
      const error = expectError(`
        update principals set scopes = array['telemetry.insert','run.register'] where id = 'inst_a'
      `);
      expect(error).toMatch(/principals_installation_scopes/u);
    });

    it('lets a service principal pre-register a run, and stamps its events', () => {
      truncate();
      json(`select register_run(${SERVICE}, 'run_a', 'qualification')`);
      json(`select ingest_events(${INSTALLATION}, ${event()})`);
      expect(rows('select origin_class from raw_events')).toEqual([
        { origin_class: 'qualification' },
      ]);
    });

    it('rejects late registration, so a run cannot be measured then labelled', () => {
      truncate();
      json(`select ingest_events(${INSTALLATION}, ${event()})`);
      const error = expectError(`select register_run(${SERVICE}, 'run_a', 'qualification')`);
      expect(error).toMatch(/ieos_late_registration/u);
      expect(rows('select origin_class from runs')).toEqual([{ origin_class: 'operational' }]);
    });

    it('refuses a second registration of the same run', () => {
      truncate();
      json(`select register_run(${SERVICE}, 'run_a', 'qualification')`);
      expect(expectError(`select register_run(${SERVICE}, 'run_a', 'development')`)).toMatch(
        /ieos_already_registered/u,
      );
    });

    it('cannot be written around: an unregistered run rejects a stronger class', () => {
      // The constraint is the floor under every rule above. Without it, a bug
      // or a future writer could produce the state the RPCs refuse to.
      truncate();
      const error = expectError(`
        insert into runs (run_id, owner_id, origin_class)
        values ('run_forged', '11111111-1111-1111-1111-111111111111', 'qualification')
      `);
      expect(error).toMatch(/runs_unregistered_is_operational/u);
    });
  });

  describe('holdout runs (D33)', () => {
    it('requires an eval set version and a holdout state', () => {
      truncate();
      expect(expectError(`select register_run(${SERVICE}, 'run_h', 'holdout')`)).toMatch(
        /runs_holdout/u,
      );
    });

    it('refuses holdout_state on a run that is not a holdout', () => {
      truncate();
      expect(
        expectError(`select register_run(${SERVICE}, 'run_h', 'qualification', 'v1', 'active')`),
      ).toMatch(/runs_holdout_state/u);
    });

    it('accepts a properly declared holdout run', () => {
      truncate();
      json(`select register_run(${SERVICE}, 'run_h', 'holdout', 'v1', 'active')`);
      expect(rows('select origin_class, holdout_state, eval_set_version from runs')).toEqual([
        { origin_class: 'holdout', holdout_state: 'active', eval_set_version: 'v1' },
      ]);
    });
  });

  describe('the credential boundary (D22)', () => {
    it('refuses an unknown token', () => {
      truncate();
      expect(expectError(`select ingest_events(sha256('nope'::bytea), ${event()})`)).toMatch(
        /ieos_unknown_token/u,
      );
    });

    it('refuses a revoked token with its own distinct error', () => {
      // D22.5: revoked and expired fail closed "with a distinct error the
      // runtime surfaces in doctor". One generic rejection would leave the
      // owner unable to tell a rotated token from a misconfigured one.
      truncate();
      exec("update principals set revoked_at = now() where id = 'inst_a'");
      expect(expectError(`select ingest_events(${INSTALLATION}, ${event()})`)).toMatch(
        /ieos_revoked_token/u,
      );
    });

    it('refuses an expired token with a different error again', () => {
      truncate();
      exec("update principals set expires_at = now() - interval '1 day' where id = 'inst_a'");
      expect(expectError(`select ingest_events(${INSTALLATION}, ${event()})`)).toMatch(
        /ieos_expired_token/u,
      );
    });

    it('stores no token, only its hash, and the hash is a sha256', () => {
      truncate();
      expect(rows('select octet_length(token_hash) as len from principals order by id')).toEqual([
        { len: 32 },
        { len: 32 },
        { len: 32 },
      ]);
      const error = expectError(`
        insert into principals (id, kind, owner_id, token_hash, scopes, expires_at)
        values ('inst_short', 'installation', gen_random_uuid(), '\\x00'::bytea,
                array['read.minimal'], now() + interval '1 day')
      `);
      expect(error).toMatch(/principals_token_hash_is_sha256/u);
    });

    it('gives each RPC only the scope it needs', () => {
      truncate();
      // The service principal holds run.register and read.minimal, not
      // telemetry.insert. It is a legitimate principal and still cannot insert.
      expect(expectError(`select ingest_events(${SERVICE}, ${event()})`)).toMatch(
        /ieos_missing_scope_telemetry\.insert/u,
      );
    });

    it('stamps installation_id from the token, so one cannot insert as another', () => {
      truncate();
      json(`select ingest_events(${OTHER}, ${event()})`);
      expect(rows('select installation_id from raw_events')).toEqual([
        { installation_id: 'inst_b' },
      ]);
    });

    it('does not expose the resolver as a callable oracle', () => {
      // `ieos_principal` answers "is this token good?". Granting it would turn
      // the RPC surface into a way to test tokens without touching any data.
      truncate();
      expect(
        rows(`
          select has_function_privilege('service_role', p.oid, 'execute') as granted
            from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname = 'ieos_principal'
        `),
      ).toEqual([{ granted: false }]);
    });

    it('grants the RPCs to service_role and to nobody else', () => {
      truncate();
      const grants = rows<{
        proname: string;
        anon: boolean;
        authenticated: boolean;
        service: boolean;
      }>(`
        select p.proname,
               has_function_privilege('anon', p.oid, 'execute') as anon,
               has_function_privilege('authenticated', p.oid, 'execute') as authenticated,
               has_function_privilege('service_role', p.oid, 'execute') as service
          from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public'
           and p.proname in ('ingest_events','ingest_observations','ingest_context_snapshots',
                             'read_minimal','register_run')
      `);
      expect(grants).toHaveLength(5);
      for (const grant of grants) {
        expect(grant.anon, `${grant.proname} is reachable by anon`).toBe(false);
        expect(grant.authenticated, `${grant.proname} is reachable by authenticated`).toBe(false);
        // Both directions. Asserting only the refusals would pass just as well
        // over a surface nothing can reach, which is not the same as a secure
        // one -- it is a broken one.
        expect(grant.service, `${grant.proname} is not reachable by service_role`).toBe(true);
      }
    });
  });

  describe('row level security', () => {
    it('is enabled on every table, with no write policy anywhere', () => {
      // Enabled plus no permissive policy denies by default: a leaked
      // publishable key reaches nothing. Writes arrive only through the
      // SECURITY DEFINER functions.
      truncate();
      const tables = rows<{ relname: string; rls: boolean }>(`
        select c.relname, c.relrowsecurity as rls
          from pg_class c join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'public' and c.relkind = 'r'
      `);
      expect(tables.length).toBeGreaterThan(0);
      for (const table of tables) {
        expect(table.rls, `${table.relname} has RLS disabled`).toBe(true);
      }
      expect(rows(`select polname from pg_policy where polcmd <> 'r'::"char"`)).toEqual([]);
    });
  });

  describe('what the plane stamps and what it will not take', () => {
    it('stamps ingested_at itself and drops a client-supplied one', () => {
      truncate();
      json(
        `select ingest_events(${INSTALLATION}, ${event({ ingested_at: '1999-01-01T00:00:00Z' })})`,
      );
      expect(
        rows(`select ingested_at > '2020-01-01'::timestamptz as server_stamped,
                     envelope ? 'ingested_at' as kept from raw_events`),
      ).toEqual([{ server_stamped: true, kept: false }]);
    });

    it('is idempotent on event_id, so a retried batch is not a duplicated history', () => {
      truncate();
      const first = json<{ count: number }>(`select ingest_events(${INSTALLATION}, ${event()})`);
      const second = json<{ count: number }>(`select ingest_events(${INSTALLATION}, ${event()})`);
      expect(first.count).toBe(1);
      // The second call reports the same id as accepted -- it is durable -- but
      // the table still holds one row. Reporting zero would make the client
      // re-queue an event the plane already has.
      expect(second.count).toBe(1);
      expect(rows('select count(*)::int as n from raw_events')).toEqual([{ n: 1 }]);
    });

    it('refuses two events sharing the D26 ordering key', () => {
      truncate();
      json(`select ingest_events(${INSTALLATION}, ${event()})`);
      expect(
        expectError(`select ingest_events(${INSTALLATION}, ${event({ event_id: 'evt_2' })})`),
      ).toMatch(/raw_events_ordering/u);
    });

    it('refuses an oversized batch rather than holding one huge transaction', () => {
      truncate();
      const many = `(
        select jsonb_agg(jsonb_build_object(
          'event_id', 'evt_' || i, 'run_id', 'run_a', 'emitter_id', 'emt_a',
          'event_type', 'tool.call',
          'source', jsonb_build_object('sequence', i),
          'time', jsonb_build_object('occurred_at', '2026-09-08T00:00:00Z',
                                     'observed_at', '2026-09-08T00:00:00Z')))
        from generate_series(1, 501) as i)`;
      expect(expectError(`select ingest_events(${INSTALLATION}, ${many})`)).toMatch(
        /ieos_batch_too_large/u,
      );
    });

    it('accepts an empty batch as a no-op rather than an error', () => {
      truncate();
      expect(json<{ count: number }>(`select ingest_events(${INSTALLATION}, '[]'::jsonb)`)).toEqual(
        {
          accepted: [],
          count: 0,
        },
      );
    });

    it('keeps observations unique on observation_id', () => {
      truncate();
      const observation = `'${JSON.stringify([
        {
          observation_id: 'obs_1',
          run_id: 'run_a',
          subject: { kind: 'asset', id: 'asset_alpha' },
          claim: 'it helped',
        },
      ])}'::jsonb`;
      json(`select ingest_observations(${INSTALLATION}, ${observation})`);
      json(`select ingest_observations(${INSTALLATION}, ${observation})`);
      expect(rows('select count(*)::int as n from observations')).toEqual([{ n: 1 }]);
    });

    it('reads the subject as the Agent Contract types it: {kind, id}', () => {
      // 0001 read `subject->>'type'`, a key no producer emits, so `subject_type`
      // came out NULL and the NOT NULL column rejected every real observation.
      // The fixture above had the same invented shape, which is why a suite that
      // executes the migration against a real database still missed it. The
      // contract is the authority here, so it is read rather than restated.
      truncate();
      const schema = JSON.parse(
        readFileSync(
          join(REPO_ROOT, 'contracts', 'schemas', 'agent-contract-observation.schema.json'),
          'utf8',
        ),
      ) as { properties: { subject: { required: readonly string[] } } };
      expect(schema.properties.subject.required).toEqual(['kind', 'id']);

      const observation = `'${JSON.stringify([
        {
          observation_id: 'obs_contract',
          run_id: 'run_a',
          kind: 'outcome',
          subject: { kind: 'asset', id: 'asset_alpha' },
        },
      ])}'::jsonb`;
      expect(
        json<{ accepted: readonly string[] }>(
          `select ingest_observations(${INSTALLATION}, ${observation})`,
        ).accepted,
      ).toEqual(['obs_contract']);
      expect(rows('select subject_type, subject_id from observations')).toEqual([
        { subject_type: 'asset', subject_id: 'asset_alpha' },
      ]);
    });
  });

  describe('the credential the CLI mints is the credential the plane accepts', () => {
    it('enrols end to end: `ieos auth enroll` → statement → a working token', () => {
      // The two halves are written and tested separately, so this is the seam
      // where a mistake would hide: a token encoded one way and hashed another
      // would pass both suites and fail only in production, as an
      // authentication error nobody could reproduce.
      truncate();
      const token = mintToken({ bytes: (n) => randomBytes(n) });
      const statement = enrolmentStatement({
        installationId: 'inst_minted',
        ownerId: '33333333-3333-3333-3333-333333333333',
        tokenHash: tokenHashLiteral(token),
        expiresAt: '2099-01-01T00:00:00.000Z',
        label: "a laptop with an apostrophe' in its name",
      });
      exec(statement);

      // The plane resolves the principal from sha256 of the token, computed by
      // the database from the token text. If the CLI's encoding and the plane's
      // hashing disagreed by a byte, this would find nothing.
      const accepted = json<{ count: number }>(
        `select ingest_events(sha256(${quoteLiteral(token)}::bytea), ${event()})`,
      );
      expect(accepted.count).toBe(1);
      expect(rows('select installation_id from raw_events')).toEqual([
        { installation_id: 'inst_minted' },
      ]);
    });

    it('the rotation statement replaces the token without changing the identity', () => {
      truncate();
      const first = mintToken({ bytes: (n) => randomBytes(n) });
      exec(
        enrolmentStatement({
          installationId: 'inst_minted',
          ownerId: '33333333-3333-3333-3333-333333333333',
          tokenHash: tokenHashLiteral(first),
          expiresAt: '2099-01-01T00:00:00.000Z',
          label: null,
        }),
      );
      const second = mintToken({ bytes: (n) => randomBytes(n) });
      exec(
        rotationStatement({
          installationId: 'inst_minted',
          tokenHash: tokenHashLiteral(second),
          expiresAt: '2099-01-01T00:00:00.000Z',
        }),
      );

      // The old token stops working and the new one starts, under one identity.
      expect(
        expectError(`select read_minimal(sha256(${quoteLiteral(first)}::bytea), 'health')`),
      ).toMatch(/ieos_unknown_token/u);
      expect(
        json<{ ok: boolean }>(
          `select read_minimal(sha256(${quoteLiteral(second)}::bytea), 'health')`,
        ).ok,
      ).toBe(true);
    });

    it('the revocation statement stops the token and keeps its evidence attributable', () => {
      truncate();
      const token = mintToken({ bytes: (n) => randomBytes(n) });
      exec(
        enrolmentStatement({
          installationId: 'inst_minted',
          ownerId: '33333333-3333-3333-3333-333333333333',
          tokenHash: tokenHashLiteral(token),
          expiresAt: '2099-01-01T00:00:00.000Z',
          label: null,
        }),
      );
      json(`select ingest_events(sha256(${quoteLiteral(token)}::bytea), ${event()})`);
      exec(revocationStatement('inst_minted'));

      expect(
        expectError(
          `select ingest_events(sha256(${quoteLiteral(token)}::bytea), ${event({ event_id: 'evt_2' })})`,
        ),
      ).toMatch(/ieos_revoked_token/u);
      // The row it already wrote is still there and still names it. Revocation
      // ends a credential's future, not its record.
      expect(rows('select installation_id from raw_events')).toEqual([
        { installation_id: 'inst_minted' },
      ]);
    });
  });

  describe('read_minimal is minimal (D22.3)', () => {
    it('answers health without touching any run', () => {
      truncate();
      expect(json<{ ok: boolean }>(`select read_minimal(${INSTALLATION}, 'health')`).ok).toBe(true);
    });

    it('returns a run status for the caller’s own run', () => {
      truncate();
      json(`select ingest_events(${INSTALLATION}, ${event()})`);
      const status = json<{ run_id: string; event_count: number }>(
        `select read_minimal(${INSTALLATION}, 'run_status', 'run_a')`,
      );
      expect(status.run_id).toBe('run_a');
      expect(status.event_count).toBe(1);
    });

    it('will not show one installation another’s run', () => {
      // Without the installation predicate this function would be the general
      // query D22.3 says must not exist.
      truncate();
      json(`select ingest_events(${INSTALLATION}, ${event()})`);
      expect(json(`select read_minimal(${OTHER}, 'run_status', 'run_a')`)).toEqual({
        run_id: 'run_a',
        known: false,
      });
    });

    it('raises on an unknown kind instead of returning nothing', () => {
      // "No such read" and "that read found nothing" are different answers, and
      // a caller that cannot tell them apart will treat a typo as a fact.
      truncate();
      expect(expectError(`select read_minimal(${INSTALLATION}, 'everything')`)).toMatch(
        /ieos_unknown_read_kind/u,
      );
    });

    it('reports the score overlay as UNPROVEN rather than inventing one', () => {
      // Scoring is Stage 10. An overlay invented by a read endpoint would be a
      // scoring policy nobody decided.
      truncate();
      expect(json(`select read_minimal(${INSTALLATION}, 'score_overlay')`)).toEqual({
        state: 'UNPROVEN',
        scores: [],
        computed_at: null,
        scoring_policy_version: '0',
      });
    });
  });
});
