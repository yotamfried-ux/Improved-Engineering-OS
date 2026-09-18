/** Durable local staging for observations and context snapshots. */

import { contextSnapshotId, observationSchema } from '@ieos/core';
import type { ContextSnapshotDocument, EvidenceQueue, Observation } from '@ieos/core';

interface WritableDatabase {
  exec(sql: string): void;
  prepare(sql: string): {
    run(...params: unknown[]): { changes: number | bigint };
    get(...params: unknown[]): Record<string, unknown> | undefined;
    all(...params: unknown[]): Record<string, unknown>[];
  };
}

const CREATE_EVIDENCE_SQL: readonly string[] = [
  `create table if not exists evidence_observations (
     observation_id text primary key,
     run_id text not null,
     queued_at text not null,
     payload_json text not null,
     acknowledged integer not null default 0 check (acknowledged in (0, 1))
   ) strict`,
  `create index if not exists evidence_observations_pending
     on evidence_observations (acknowledged, queued_at, observation_id)`,
  `create table if not exists evidence_context_snapshots (
     context_snapshot_id text primary key,
     first_run_id text not null,
     payload_json text not null,
     acknowledged integer not null default 0 check (acknowledged in (0, 1))
   ) strict`,
  `create index if not exists evidence_context_snapshots_pending
     on evidence_context_snapshots (acknowledged, context_snapshot_id)`,
];

function validateSnapshot(snapshot: ContextSnapshotDocument): ContextSnapshotDocument {
  const expected = contextSnapshotId({
    repo_sha: snapshot.repo_sha,
    profile_status_digest: snapshot.profile_status_digest,
    change_scope: snapshot.change_scope,
    capability_snapshot_hash: snapshot.capability_snapshot_hash,
    index_digest: snapshot.index_digest,
    ranking_mode: snapshot.ranking_mode,
    effective_score_view_id: snapshot.effective_score_view_id,
    eos_release: snapshot.eos_release,
  });
  if (expected !== snapshot.context_snapshot_id) {
    throw new Error(
      `context snapshot ${snapshot.context_snapshot_id} does not match its content hash ${expected}`,
    );
  }
  if (snapshot.run_id === '') throw new Error('context snapshot run_id must not be empty');
  return snapshot;
}

/**
 * One SQLite-backed implementation of both MCP staging and the terminal flush queue.
 *
 * Acknowledgement flips a bit instead of deleting the row. That leaves a local copy
 * available for restart-safe snapshot inspection and for debugging while keeping
 * "pending" exactly equal to evidence not yet proven durable in the plane.
 */
export class SqliteEvidenceDocuments implements EvidenceQueue {
  readonly #db: WritableDatabase;

  constructor(db: WritableDatabase) {
    this.#db = db;
    for (const statement of CREATE_EVIDENCE_SQL) this.#db.exec(statement);
  }

  async recordObservation(
    observation: Observation,
  ): Promise<{ readonly status: 'recorded' | 'duplicate' }> {
    const parsed = observationSchema.parse(observation);
    const result = this.#db
      .prepare(
        `insert or ignore into evidence_observations
           (observation_id, run_id, queued_at, payload_json, acknowledged)
         values (?, ?, ?, ?, 0)`,
      )
      .run(parsed.observation_id, parsed.run_id, new Date().toISOString(), JSON.stringify(parsed));
    return { status: Number(result.changes) > 0 ? 'recorded' : 'duplicate' };
  }

  async listOpenProposals(): Promise<readonly unknown[]> {
    return [];
  }

  async recordContextSnapshot(
    snapshot: ContextSnapshotDocument,
  ): Promise<{ readonly status: 'recorded' | 'duplicate' }> {
    const parsed = validateSnapshot(snapshot);
    const result = this.#db
      .prepare(
        `insert or ignore into evidence_context_snapshots
           (context_snapshot_id, first_run_id, payload_json, acknowledged)
         values (?, ?, ?, 0)`,
      )
      .run(parsed.context_snapshot_id, parsed.run_id, JSON.stringify(parsed));
    return { status: Number(result.changes) > 0 ? 'recorded' : 'duplicate' };
  }

  async getContextSnapshot(
    contextSnapshotIdValue: string,
  ): Promise<ContextSnapshotDocument | undefined> {
    const row = this.#db
      .prepare(
        `select payload_json from evidence_context_snapshots
          where context_snapshot_id = ?`,
      )
      .get(contextSnapshotIdValue);
    if (row === undefined) return undefined;
    return validateSnapshot(JSON.parse(String(row['payload_json'])) as ContextSnapshotDocument);
  }

  async pendingObservations(limit: number): Promise<readonly Observation[]> {
    if (limit <= 0) return [];
    return this.#db
      .prepare(
        `select payload_json from evidence_observations
          where acknowledged = 0
          order by queued_at asc, observation_id asc
          limit ?`,
      )
      .all(limit)
      .map((row) => observationSchema.parse(JSON.parse(String(row['payload_json']))));
  }

  async pendingContextSnapshots(limit: number): Promise<readonly ContextSnapshotDocument[]> {
    if (limit <= 0) return [];
    return this.#db
      .prepare(
        `select payload_json from evidence_context_snapshots
          where acknowledged = 0
          order by context_snapshot_id asc
          limit ?`,
      )
      .all(limit)
      .map((row) =>
        validateSnapshot(JSON.parse(String(row['payload_json'])) as ContextSnapshotDocument),
      );
  }

  async acknowledgeObservations(observationIds: readonly string[]): Promise<void> {
    this.#acknowledge('evidence_observations', 'observation_id', observationIds);
  }

  async acknowledgeContextSnapshots(contextSnapshotIds: readonly string[]): Promise<void> {
    this.#acknowledge('evidence_context_snapshots', 'context_snapshot_id', contextSnapshotIds);
  }

  async pendingEvidenceCount(): Promise<number> {
    const observations = this.#db
      .prepare('select count(*) as n from evidence_observations where acknowledged = 0')
      .get();
    const snapshots = this.#db
      .prepare('select count(*) as n from evidence_context_snapshots where acknowledged = 0')
      .get();
    return Number(observations?.['n'] ?? 0) + Number(snapshots?.['n'] ?? 0);
  }

  #acknowledge(table: string, idColumn: string, ids: readonly string[]): void {
    if (ids.length === 0) return;
    // Table and column come only from the two fixed calls above; values stay bound.
    const statement = this.#db.prepare(
      `update ${table} set acknowledged = 1 where ${idColumn} = ?`,
    );
    this.#db.exec('begin immediate');
    try {
      for (const id of ids) statement.run(id);
      this.#db.exec('commit');
    } catch (error) {
      this.#db.exec('rollback');
      throw error;
    }
  }
}
