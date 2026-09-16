/**
 * Locally known run state (D23, D36, guide Stage 2 exit gate).
 *
 * Two commands need to know how a run ended without asking the Evidence Plane:
 * `ieos doctor --last-run`, which the Stage 2 exit gate requires to show
 * INCOMPLETE runs, and `ieos investigate`, which must say whether the timeline
 * it is printing can be trusted to be whole.
 *
 * What this store deliberately does NOT hold is `origin_class`. D36 gives run
 * classification to a service principal writing a record in the plane, and the
 * client is not one. Storing a classification here would create a local claim
 * about a fact the client has no authority over.
 *
 * Lives in the same database file as the outbox and local evidence queue.
 */

import type { RunTelemetryState } from '@ieos/core';

interface WritableDatabase {
  exec(sql: string): void;
  prepare(sql: string): {
    run(...params: unknown[]): { changes: number | bigint };
    get(...params: unknown[]): Record<string, unknown> | undefined;
    all(...params: unknown[]): Record<string, unknown>[];
  };
}

export const CREATE_RUN_STATE_SQL = `create table if not exists run_state (
   run_id text primary key,
   session_key text unique,
   telemetry_state text not null,
   qualification_eligible integer not null,
   ingest_reachable_at_start integer not null,
   flush_ever_failed integer not null default 0,
   started_at text not null,
   ended_at text
 ) strict`;

export interface LocalRunState {
  readonly runId: string;
  readonly sessionKey: string | null;
  readonly telemetryState: 'COMPLETE' | 'INCOMPLETE';
  readonly qualificationEligible: boolean;
  readonly ingestReachableAtStart: boolean;
  readonly flushEverFailed: boolean;
  readonly startedAt: string;
  readonly endedAt: string | null;
}

export class SqliteRunStateStore {
  readonly #db: WritableDatabase;

  constructor(db: WritableDatabase) {
    this.#db = db;
    this.#db.exec(CREATE_RUN_STATE_SQL);
    this.#migrateFlushEverFailed();
  }

  #migrateFlushEverFailed(): void {
    const existing = this.#db
      .prepare(`select count(*) as n from pragma_table_info('run_state') where name = ?`)
      .get('flush_ever_failed');
    if (Number(existing?.['n'] ?? 0) > 0) return;
    this.#db.exec('alter table run_state add column flush_ever_failed integer not null default 0');
  }

  begin(
    runId: string,
    ingestReachableAtStart: boolean,
    startedAt: string,
    sessionKey: string | null = null,
  ): void {
    this.#db
      .prepare(
        `insert or ignore into run_state
           (run_id, session_key, telemetry_state, qualification_eligible,
            ingest_reachable_at_start, started_at, ended_at)
         values (?, ?, 'INCOMPLETE', 0, ?, ?, null)`,
      )
      .run(runId, sessionKey, ingestReachableAtStart ? 1 : 0, startedAt);
  }

  forSession(sessionKey: string): LocalRunState | undefined {
    const row = this.#db.prepare('select * from run_state where session_key = ?').get(sessionKey);
    return row === undefined ? undefined : toState(row);
  }

  /**
   * Persist a failed boundary immediately, before another hook process starts.
   *
   * Stop and SessionEnd are separate processes in the real adapter. An in-memory
   * Flusher cannot carry failure across that boundary, so the database must.
   */
  markFlushFailed(runId: string): void {
    this.#db
      .prepare(
        `update run_state
            set flush_ever_failed = 1,
                telemetry_state = 'INCOMPLETE',
                qualification_eligible = 0
          where run_id = ?`,
      )
      .run(runId);
  }

  /**
   * Write terminal state without ever clearing or outranking an earlier failure.
   *
   * The invariant is enforced in SQL, not only in the hook caller: even a stale
   * optimistic caller that submits COMPLETE cannot promote a row after a prior
   * boundary persisted `flush_ever_failed = 1`.
   */
  finish(state: RunTelemetryState, endedAt: string, flushEverFailed = false): void {
    const failedNow = flushEverFailed ? 1 : 0;
    this.#db
      .prepare(
        `update run_state
            set telemetry_state = case
                  when flush_ever_failed = 1 or ? = 1 then 'INCOMPLETE'
                  else ?
                end,
                qualification_eligible = case
                  when flush_ever_failed = 1 or ? = 1 then 0
                  else ?
                end,
                ended_at = ?,
                flush_ever_failed = case
                  when flush_ever_failed = 1 or ? = 1 then 1 else 0 end
          where run_id = ?`,
      )
      .run(
        failedNow,
        state.telemetry_state,
        failedNow,
        state.qualification_eligible ? 1 : 0,
        endedAt,
        failedNow,
        state.run_id,
      );
  }

  get(runId: string): LocalRunState | undefined {
    const row = this.#db.prepare('select * from run_state where run_id = ?').get(runId);
    return row === undefined ? undefined : toState(row);
  }

  recent(limit: number): readonly LocalRunState[] {
    if (limit <= 0) return [];
    return this.#db
      .prepare('select * from run_state order by started_at desc, run_id desc limit ?')
      .all(limit)
      .map(toState);
  }
}

function readRequiredFlag(row: Record<string, unknown>, column: string): boolean {
  const value = row[column];
  if (value === undefined || value === null) {
    throw new Error(
      `run_state.${column} is missing from this database, so the run's telemetry cannot be read`,
    );
  }
  return Number(value) === 1;
}

function toState(row: Record<string, unknown>): LocalRunState {
  const telemetryState = String(row['telemetry_state']);
  const flushEverFailed = readRequiredFlag(row, 'flush_ever_failed');
  const complete = telemetryState === 'COMPLETE' && !flushEverFailed;
  return {
    runId: String(row['run_id']),
    sessionKey: row['session_key'] === null ? null : String(row['session_key']),
    telemetryState: complete ? 'COMPLETE' : 'INCOMPLETE',
    qualificationEligible: complete && Number(row['qualification_eligible']) === 1,
    ingestReachableAtStart: Number(row['ingest_reachable_at_start']) === 1,
    flushEverFailed,
    startedAt: String(row['started_at']),
    endedAt: row['ended_at'] === null ? null : String(row['ended_at']),
  };
}
