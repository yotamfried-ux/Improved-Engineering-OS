/**
 * Locally known run state (D23, D36).
 *
 * The Stage 2 exit gate says INCOMPLETE runs must be visible in
 * `ieos doctor --last-run`. That only works if a run that died cannot come back
 * looking finished, so most of what follows is about the fail-safe direction:
 * a run begins INCOMPLETE, an unreadable value reads as INCOMPLETE, and nothing
 * here can be persuaded to call a run measured.
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';
import { runTelemetryStateSchema } from '@ieos/core';
import { SqliteRunStateStore } from '../src/run-state.ts';

const scratch: string[] = [];
afterEach(() => {
  for (const dir of scratch.splice(0)) {
    rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
});

function aStore(): { store: SqliteRunStateStore; db: DatabaseSync; path: string } {
  const dir = mkdtempSync(join(tmpdir(), 'ieos-runstate-'));
  scratch.push(dir);
  const path = join(dir, 'outbox.sqlite');
  const db = new DatabaseSync(path, { timeout: 5000 });
  return { store: new SqliteRunStateStore(db), db, path };
}

const complete = (runId: string) =>
  runTelemetryStateSchema.parse({
    run_id: runId,
    telemetry_state: 'COMPLETE',
    qualification_eligible: true,
    ingest_reachable_at_start: true,
  });

const incomplete = (runId: string) =>
  runTelemetryStateSchema.parse({
    run_id: runId,
    telemetry_state: 'INCOMPLETE',
    qualification_eligible: false,
    ingest_reachable_at_start: true,
  });

describe('a run that is still running', () => {
  it('starts INCOMPLETE, so a process that dies leaves the truth behind', () => {
    const { store, db } = aStore();
    try {
      store.begin('run_a', true, '2026-09-06T00:00:00.000Z');
      expect(store.get('run_a')?.telemetryState).toBe('INCOMPLETE');
      expect(store.get('run_a')?.qualificationEligible).toBe(false);
      expect(store.get('run_a')?.endedAt).toBeNull();
    } finally {
      db.close();
    }
  });

  it('does not restart a run that already began', () => {
    // A second SessionStart for one run id must not reset a state the first one
    // already reached.
    const { store, db } = aStore();
    try {
      store.begin('run_a', true, '2026-09-06T00:00:00.000Z');
      store.finish(complete('run_a'), '2026-09-06T00:10:00.000Z');
      store.begin('run_a', false, '2026-09-06T00:20:00.000Z');
      expect(store.get('run_a')?.telemetryState).toBe('COMPLETE');
    } finally {
      db.close();
    }
  });
});

describe('a run that ended', () => {
  it('records COMPLETE and eligibility exactly as the runtime computed them', () => {
    const { store, db } = aStore();
    try {
      store.begin('run_a', true, '2026-09-06T00:00:00.000Z');
      store.finish(complete('run_a'), '2026-09-06T00:10:00.000Z');
      const state = store.get('run_a');
      expect(state?.telemetryState).toBe('COMPLETE');
      expect(state?.qualificationEligible).toBe(true);
      expect(state?.endedAt).toBe('2026-09-06T00:10:00.000Z');
    } finally {
      db.close();
    }
  });

  it('records INCOMPLETE and refuses eligibility with it', () => {
    const { store, db } = aStore();
    try {
      store.begin('run_a', true, '2026-09-06T00:00:00.000Z');
      store.finish(incomplete('run_a'), '2026-09-06T00:10:00.000Z');
      const state = store.get('run_a');
      expect(state?.telemetryState).toBe('INCOMPLETE');
      expect(state?.qualificationEligible).toBe(false);
    } finally {
      db.close();
    }
  });

  it('reads a corrupted state as INCOMPLETE rather than as measured', () => {
    // The file is on a developer's disk. The safe direction for an unreadable
    // value is the one that claims less.
    const { store, db } = aStore();
    try {
      store.begin('run_a', true, '2026-09-06T00:00:00.000Z');
      store.finish(complete('run_a'), '2026-09-06T00:10:00.000Z');
      db.prepare("update run_state set telemetry_state = 'DEFINITELY_FINE'").run();
      const state = store.get('run_a');
      expect(state?.telemetryState).toBe('INCOMPLETE');
      expect(state?.qualificationEligible).toBe(false);
    } finally {
      db.close();
    }
  });
});

describe('what the local store refuses to know', () => {
  it('holds no origin_class column at all (D36)', () => {
    // Classification belongs to a service principal writing a record in the
    // plane. A local column -- even defaulting to operational -- would be a
    // client-side claim about a fact the client has no authority over, and the
    // next reader would take it for the answer.
    const { store, db } = aStore();
    try {
      store.begin('run_a', true, '2026-09-06T00:00:00.000Z');
      const columns = db
        .prepare('select name from pragma_table_info(?)')
        .all('run_state')
        .map((row) => String(row['name']));
      expect(columns).not.toContain('origin_class');
      expect(columns).not.toContain('holdout_state');
    } finally {
      db.close();
    }
  });
});

describe('the recent runs doctor --last-run reads', () => {
  it('lists newest first', () => {
    const { store, db } = aStore();
    try {
      store.begin('run_old', true, '2026-09-05T00:00:00.000Z');
      store.begin('run_new', true, '2026-09-06T00:00:00.000Z');
      expect(store.recent(5).map((state) => state.runId)).toEqual(['run_new', 'run_old']);
    } finally {
      db.close();
    }
  });

  it('returns nothing for a non-positive limit rather than everything', () => {
    const { store, db } = aStore();
    try {
      store.begin('run_a', true, '2026-09-06T00:00:00.000Z');
      expect(store.recent(0)).toEqual([]);
    } finally {
      db.close();
    }
  });
});
