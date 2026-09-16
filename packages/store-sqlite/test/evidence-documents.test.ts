import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  STAGE_0_LIFECYCLE,
  contextSnapshotId,
  type ContextSnapshotDocument,
  type Observation,
} from '@ieos/core';
import { afterEach, describe, expect, it } from 'vitest';
import { openOutbox, SqliteEvidenceDocuments } from '../src/index.ts';

const scratch: string[] = [];

afterEach(() => {
  for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function databasePath(): string {
  const dir = mkdtempSync(join(tmpdir(), 'ieos-evidence-documents-'));
  scratch.push(dir);
  return join(dir, 'outbox.sqlite');
}

function snapshot(runId = 'run_a'): ContextSnapshotDocument {
  const inputs = {
    repo_sha: 'a'.repeat(40),
    profile_status_digest: 'sha256:' + 'b'.repeat(64),
    change_scope: ['packages/a.ts'],
    capability_snapshot_hash: 'sha256:' + 'c'.repeat(64),
    index_digest: 'sha256:' + 'd'.repeat(64),
    ranking_mode: 'recorded' as const,
    effective_score_view_id: 'score_view_1',
    eos_release: 'source:0.1.0',
  };
  return {
    ...inputs,
    context_snapshot_id: contextSnapshotId(inputs),
    run_id: runId,
    score_source: 'snapshot',
  };
}

function observation(note = 'worked'): Observation {
  return {
    ...STAGE_0_LIFECYCLE,
    observation_id: 'obs_stage3_regression',
    run_id: 'run_a',
    kind: 'outcome',
    subject: { kind: 'asset', id: 'asset_a' },
    note,
  };
}

describe('SqliteEvidenceDocuments', () => {
  it('reloads a context snapshot after a process-style reopen', async () => {
    const path = databasePath();
    const firstDb = await openOutbox(path);
    const expected = snapshot();
    try {
      const first = new SqliteEvidenceDocuments(firstDb);
      expect(await first.recordContextSnapshot(expected)).toEqual({ status: 'recorded' });
    } finally {
      firstDb.close();
    }

    const secondDb = await openOutbox(path);
    try {
      const second = new SqliteEvidenceDocuments(secondDb);
      expect(await second.getContextSnapshot(expected.context_snapshot_id)).toEqual(expected);
    } finally {
      secondDb.close();
    }
  });

  it('retains acknowledged evidence locally while removing it from pending delivery', async () => {
    const db = await openOutbox(databasePath());
    try {
      const store = new SqliteEvidenceDocuments(db);
      const expected = snapshot();
      const obs = observation();
      await store.recordContextSnapshot(expected);
      await store.recordObservation(obs);

      await store.acknowledgeContextSnapshots([expected.context_snapshot_id]);
      await store.acknowledgeObservations([obs.observation_id]);

      expect(await store.pendingContextSnapshots(10)).toEqual([]);
      expect(await store.pendingObservations(10)).toEqual([]);
      expect(await store.pendingEvidenceCount()).toBe(0);
      expect(await store.getContextSnapshot(expected.context_snapshot_id)).toEqual(expected);
    } finally {
      db.close();
    }
  });

  it('is first-write-wins for duplicate observation ids', async () => {
    const db = await openOutbox(databasePath());
    try {
      const store = new SqliteEvidenceDocuments(db);
      expect(await store.recordObservation(observation('first'))).toEqual({ status: 'recorded' });
      expect(await store.recordObservation(observation('changed'))).toEqual({ status: 'duplicate' });
      expect(await store.pendingObservations(10)).toEqual([observation('first')]);
    } finally {
      db.close();
    }
  });

  it('rejects snapshot id reuse with different content without changing history', async () => {
    const db = await openOutbox(databasePath());
    try {
      const store = new SqliteEvidenceDocuments(db);
      const original = snapshot();
      await store.recordContextSnapshot(original);
      const conflicting = { ...original, repo_sha: 'f'.repeat(40) };

      await expect(store.recordContextSnapshot(conflicting)).rejects.toThrow(/does not match/u);
      expect(await store.getContextSnapshot(original.context_snapshot_id)).toEqual(original);
    } finally {
      db.close();
    }
  });
});
