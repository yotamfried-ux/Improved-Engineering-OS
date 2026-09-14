/**
 * D36 owner binding, executed against real PostgreSQL.
 *
 * A run id is an identifier, not an authority. An installation must not gain the
 * classification of a run pre-registered for another owner merely by naming its
 * id. This is especially important for qualification runs, whose ids are visible
 * in harness evidence and therefore must be safe to know.
 */

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { applyMigration, exec, expectError, json, rows, unavailable } from './harness.ts';

const MIGRATION = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'migrations',
  '0001_evidence_plane.sql',
);
const blocked = unavailable();
const suite = blocked === null ? describe : describe.skip;
const SUITE =
  blocked === null
    ? 'run owner binding (D36)'
    : `run owner binding (D36) [SKIPPED: ${blocked.reason}]`;

const OWNER_A = '11111111-1111-1111-1111-111111111111';
const OWNER_B = '22222222-2222-2222-2222-222222222222';
const INSTALLATION_A = "sha256('token-owner-a-installation'::bytea)";
const INSTALLATION_B = "sha256('token-owner-b-installation'::bytea)";
const SERVICE_A = "sha256('token-owner-a-service'::bytea)";

function event(runId: string): string {
  return `'${JSON.stringify([
    {
      event_id: 'evt_owner_boundary',
      run_id: runId,
      emitter_id: 'emt_owner_boundary',
      event_type: 'tool.call',
      source: { sequence: 0 },
      time: {
        occurred_at: '2026-09-15T00:00:00Z',
        observed_at: '2026-09-15T00:00:00Z',
      },
    },
  ])}'::jsonb`;
}

function seed(): void {
  exec(`
    insert into principals (id, kind, owner_id, token_hash, scopes, expires_at) values
      ('inst_owner_a', 'installation', '${OWNER_A}', ${INSTALLATION_A},
       array['telemetry.insert','observation.insert','read.minimal'], now() + interval '90 days'),
      ('inst_owner_b', 'installation', '${OWNER_B}', ${INSTALLATION_B},
       array['telemetry.insert','observation.insert','read.minimal'], now() + interval '90 days'),
      ('svc_owner_a', 'service', '${OWNER_A}', ${SERVICE_A},
       array['run.register','read.minimal'], now() + interval '90 days');
  `);
}

suite(SUITE, () => {
  beforeAll(() => {
    applyMigration(MIGRATION);
    seed();
  });

  it('still accepts evidence from the same owner as the pre-registered run', () => {
    json(`select register_run(${SERVICE_A}, 'run_same_owner', 'qualification')`);
    json(`select ingest_events(${INSTALLATION_A}, ${event('run_same_owner')})`);
    expect(rows('select owner_id, origin_class from raw_events')).toEqual([
      { owner_id: OWNER_A, origin_class: 'qualification' },
    ]);
  });

  it('refuses another owner from borrowing that qualification classification', () => {
    exec('truncate raw_events, observations, context_snapshots, runs cascade;');
    json(`select register_run(${SERVICE_A}, 'run_visible_qualification', 'qualification')`);

    const error = expectError(
      `select ingest_events(${INSTALLATION_B}, ${event('run_visible_qualification')})`,
    );
    expect(error).toMatch(/raw_events_run_owner_fkey/u);
    expect(rows('select count(*)::int as n from raw_events')).toEqual([{ n: 0 }]);
    // The failed insert rolls the RPC transaction back completely; even the
    // run's first-event marker must remain untouched.
    expect(
      rows(`
        select first_event_at is null as untouched
          from runs where run_id = 'run_visible_qualification'
      `),
    ).toEqual([{ untouched: true }]);
  });
});
