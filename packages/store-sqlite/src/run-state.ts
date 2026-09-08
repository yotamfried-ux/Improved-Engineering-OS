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
 * client is not one. Storing a classification here -- even `operational`, even
 * as a default -- would create a local claim about a fact the client has no
 * authority over, and the next reader would take it for the answer. The
 * absence is the mechanism: a caller that wants a classification has to go
 * where the authority is.
 *
 * Lives in the same database file as the outbox. One file, one WAL, one busy
 * timeout: a run's events and its terminal state are written by the same
 * process at the same moments, and splitting them across two files would add a
 * way for them to disagree.
 */

import type { RunTelemetryState } from '@ieos/core';

/** The narrow slice of `node:sqlite` this store uses. */
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
   -- The agent's own session identifier, so every hook of one coding session
   -- lands on one run. Unique: two runs claiming one session would split that
   -- session's events across runs that each look half-empty, and an
   -- investigation would read one session as several.
   session_key text unique,
   telemetry_state text not null,
   qualification_eligible integer not null,
   ingest_reachable_at_start integer not null,
   started_at text not null,
   ended_at text
 ) strict`;

export interface LocalRunState {
  readonly runId: string;
  readonly sessionKey: string | null;
  readonly telemetryState: 'COMPLETE' | 'INCOMPLETE';
  readonly qualificationEligible: boolean;
  readonly ingestReachableAtStart: boolean;
  readonly startedAt: string;
  readonly endedAt: string | null;
}

export class SqliteRunStateStore {
  readonly #db: WritableDatabase;

  constructor(db: WritableDatabase) {
    this.#db = db;
    this.#db.exec(CREATE_RUN_STATE_SQL);
  }

  /**
   * Record how a run started: reachability declared up front (D23).
   *
   * A run begins INCOMPLETE. That is the fail-safe direction and it is why the
   * default is written at the start rather than left absent: a process killed
   * before it could write a terminal state leaves a row that says the run did
   * not finish, which is true, instead of no row at all, which reads as a run
   * that never existed.
   */
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

  /**
   * The run this agent session belongs to, if one has begun.
   *
   * Hooks after SessionStart have only the agent's session id, and minting a
   * second run for the same session would be worse than dropping the event:
   * two half-runs, neither of them what happened.
   */
  forSession(sessionKey: string): LocalRunState | undefined {
    const row = this.#db.prepare('select * from run_state where session_key = ?').get(sessionKey);
    return row === undefined ? undefined : toState(row);
  }

  /** Write the terminal state the runtime computed (guide §5.3). */
  finish(state: RunTelemetryState, endedAt: string): void {
    this.#db
      .prepare(
        `update run_state
            set telemetry_state = ?, qualification_eligible = ?, ended_at = ?
          where run_id = ?`,
      )
      .run(state.telemetry_state, state.qualification_eligible ? 1 : 0, endedAt, state.run_id);
  }

  get(runId: string): LocalRunState | undefined {
    const row = this.#db.prepare('select * from run_state where run_id = ?').get(runId);
    return row === undefined ? undefined : toState(row);
  }

  /** The most recently started runs, newest first. Read by `doctor --last-run`. */
  recent(limit: number): readonly LocalRunState[] {
    if (limit <= 0) return [];
    return this.#db
      .prepare('select * from run_state order by started_at desc, run_id desc limit ?')
      .all(limit)
      .map(toState);
  }
}

function toState(row: Record<string, unknown>): LocalRunState {
  const telemetryState = String(row['telemetry_state']);
  return {
    runId: String(row['run_id']),
    sessionKey: row['session_key'] === null ? null : String(row['session_key']),
    // Anything that is not literally COMPLETE reads as INCOMPLETE. A corrupt or
    // hand-edited value must not be able to promote a run to "measured".
    telemetryState: telemetryState === 'COMPLETE' ? 'COMPLETE' : 'INCOMPLETE',
    qualificationEligible:
      telemetryState === 'COMPLETE' && Number(row['qualification_eligible']) === 1,
    ingestReachableAtStart: Number(row['ingest_reachable_at_start']) === 1,
    startedAt: String(row['started_at']),
    endedAt: row['ended_at'] === null ? null : String(row['ended_at']),
  };
}
