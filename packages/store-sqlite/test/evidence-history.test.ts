import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { TelemetryEvent } from '@ieos/core';
import { afterEach, describe, expect, it } from 'vitest';
import { openOutbox, SqliteOutbox, SqliteRunStateStore } from '../src/index.ts';

const scratch: string[] = [];

afterEach(() => {
  for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function databasePath(): string {
  const dir = mkdtempSync(join(tmpdir(), 'ieos-evidence-history-'));
  scratch.push(dir);
  return join(dir, 'outbox.sqlite');
}

function event(): TelemetryEvent {
  return {
    schema_version: '1',
    stability: 'development',
    introduced_in: '0.1.0',
    deprecated_in: null,
    replacement: null,
    migration_path: null,
    event_id: 'evt_history_1',
    project_id: 'proj_a',
    work_id: 'work_a',
    run_id: 'run_a',
    installation_id: 'inst_a',
    emitter_id: 'emit_a',
    source: { type: 'agent', sequence: 1 },
    session_kind: 'local_persistent',
    event_type: 'session.start',
    trace: {
      trace_id: 'trace_a',
      span_id: 'span_a',
      parent_span_id: null,
      links: [],
    },
    time: {
      occurred_at: '2026-09-16T00:00:00.000Z',
      observed_at: '2026-09-16T00:00:00.000Z',
      ingested_at: null,
    },
    revision: {
      repo_sha: 'a'.repeat(40),
      eos_release: '0.1.0',
    },
    harness: {
      agent: 'claude-code',
      model: 'test',
      adapter_version: '0.1.0',
      available_capabilities_hash: 'sha256:' + 'b'.repeat(64),
    },
    attributes: { 'session.startup_reason': 'startup' },
  };
}

describe('local evidence history', () => {
  it('keeps an acknowledged event available for investigation', async () => {
    const db = await openOutbox(databasePath());
    try {
      const outbox = new SqliteOutbox(db);
      const emitted = event();
      await outbox.append(emitted);
      await outbox.acknowledge([emitted.event_id]);

      expect(await outbox.pending(10)).toEqual([]);
      expect(await outbox.historyForRun('run_a')).toEqual([emitted]);
    } finally {
      db.close();
    }
  });

  it('never clears an earlier flush failure during a later successful finish', async () => {
    const db = await openOutbox(databasePath());
    try {
      const runs = new SqliteRunStateStore(db);
      runs.begin('run_a', true, '2026-09-16T00:00:00.000Z', 'session_a');
      runs.markFlushFailed('run_a');
      runs.finish(
        {
          run_id: 'run_a',
          telemetry_state: 'COMPLETE',
          qualification_eligible: true,
          ingest_reachable_at_start: true,
        },
        '2026-09-16T00:01:00.000Z',
        false,
      );

      const state = runs.get('run_a');
      expect(state?.flushEverFailed).toBe(true);
      expect(state?.telemetryState).toBe('INCOMPLETE');
      expect(state?.qualificationEligible).toBe(false);
    } finally {
      db.close();
    }
  });
});
