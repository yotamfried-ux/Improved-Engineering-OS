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
   -- Whether any flush during the run failed to drain. Folded into
   -- \`telemetry_state\` already, but kept in its own column because the fold is
   -- lossy: INCOMPLETE cannot say whether events were left queued or a batch
   -- failed and was re-sent by another process, and a qualification report that
   -- has to guess which is doing exactly the inference this column removes.
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
  /** Whether any flush during the run failed to drain. */
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

  /**
   * Add `flush_ever_failed` to a table created before it existed.
   *
   * `create table if not exists` leaves an older table untouched, so a
   * developer's existing outbox needs this or it is a schema this code cannot
   * query.
   *
   * The shape here is the point. An earlier version wrapped the `alter` in a bare
   * `catch {}` on the assumption that any error meant "already present" -- so a
   * migration that failed for any other reason was swallowed, the column stayed
   * absent, and the reader turned the absence into `false`: a flush failure we
   * could not know about becoming a run that reported none. That is the inversion
   * every other part of this change exists to remove.
   *
   * So: ask the schema, act on the answer, and let a real failure be a real
   * failure. Nothing is caught here at all.
   */
  #migrateFlushEverFailed(): void {
    if (this.#hasFlushEverFailed()) return;
    try {
      this.#db.exec(
        'alter table run_state add column flush_ever_failed integer not null default 0',
      );
    } catch (error) {
      // Two processes can open the same legacy outbox at once and both read the
      // column as absent. Losing that race is not a failure; the column exists
      // either way. Ask the schema again rather than catching blindly, so a
      // migration that failed for any other reason still propagates.
      if (!this.#hasFlushEverFailed()) throw error;
    }
  }

  #hasFlushEverFailed(): boolean {
    const existing = this.#db
      .prepare(`select count(*) as n from pragma_table_info('run_state') where name = ?`)
      .get('flush_ever_failed');
    return Number(existing?.['n'] ?? 0) > 0;
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
  finish(state: RunTelemetryState, endedAt: string, flushEverFailed = false): void {
    this.#db
      .prepare(
        `update run_state
            set telemetry_state = ?, qualification_eligible = ?, ended_at = ?,
                flush_ever_failed = ?
          where run_id = ?`,
      )
      .run(
        state.telemetry_state,
        state.qualification_eligible ? 1 : 0,
        endedAt,
        flushEverFailed ? 1 : 0,
        state.run_id,
      );
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

/**
 * A flag that must be present, so an absent one is an error rather than a false.
 *
 * Thrown, not defaulted. The one caller that reads these for qualification turns
 * a throw into "unreadable, therefore ineligible", which is the honest answer;
 * a default would have produced a confident wrong one.
 */
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
  return {
    runId: String(row['run_id']),
    sessionKey: row['session_key'] === null ? null : String(row['session_key']),
    // Anything that is not literally COMPLETE reads as INCOMPLETE. A corrupt or
    // hand-edited value must not be able to promote a run to "measured".
    telemetryState: telemetryState === 'COMPLETE' ? 'COMPLETE' : 'INCOMPLETE',
    qualificationEligible:
      telemetryState === 'COMPLETE' && Number(row['qualification_eligible']) === 1,
    ingestReachableAtStart: Number(row['ingest_reachable_at_start']) === 1,
    // Not `?? 0`. A missing column is something we do not know, and defaulting
    // it to `false` would report "no flush failed" about a run whose flushes we
    // cannot see. The constructor guarantees the column or throws, so reaching
    // here without it means the schema changed underneath us -- which a caller
    // must handle as unreadable, not read as clean.
    flushEverFailed: readRequiredFlag(row, 'flush_ever_failed'),
    startedAt: String(row['started_at']),
    endedAt: row['ended_at'] === null ? null : String(row['ended_at']),
  };
}
