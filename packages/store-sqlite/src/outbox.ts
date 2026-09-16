/**
 * The `Outbox` port, over a local SQLite file (D23, D26, R-11).
 *
 * The delivery queue exists so losing the network never loses an undelivered event.
 * A second immutable table retains the local event copy after acknowledgement so
 * `ieos investigate` does not become less useful when delivery succeeds.
 */

import { telemetryEnvelopeSchema } from '@ieos/core';
import type { Outbox, TelemetryEvent } from '@ieos/core';

export class OutboxUnavailableError extends Error {
  override readonly cause: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'OutboxUnavailableError';
    this.cause = cause;
  }
}

/** D26/R-11: at least five seconds, so a contending writer waits it out. */
export const OUTBOX_BUSY_TIMEOUT_MS = 5000;

/** The narrow slice of `node:sqlite` this store uses. */
interface WritableDatabase {
  exec(sql: string): void;
  prepare(sql: string): {
    run(...params: unknown[]): { changes: number | bigint };
    get(...params: unknown[]): Record<string, unknown> | undefined;
    all(...params: unknown[]): Record<string, unknown>[];
  };
  close(): void;
}

const CREATE_OUTBOX_SQL: readonly string[] = [
  `create table if not exists outbox (
     event_id text primary key,
     installation_id text not null,
     emitter_id text not null,
     sequence integer not null,
     queued_at text not null,
     envelope_json text not null
   ) strict`,
  `create index if not exists outbox_order
     on outbox (installation_id, emitter_id, sequence)`,
  `create table if not exists event_history (
     event_id text primary key,
     installation_id text not null,
     emitter_id text not null,
     sequence integer not null,
     envelope_json text not null,
     acknowledged integer not null default 0 check (acknowledged in (0, 1))
   ) strict`,
  `create index if not exists event_history_order
     on event_history (installation_id, emitter_id, sequence)`,
];

/** Open the shared runtime database, creating its telemetry tables if needed. */
export async function openOutbox(path: string): Promise<WritableDatabase> {
  let sqlite: { DatabaseSync: new (p: string, o?: Record<string, unknown>) => WritableDatabase };
  try {
    sqlite = (await import('node:sqlite')) as unknown as typeof sqlite;
  } catch (cause) {
    throw new OutboxUnavailableError(
      'node:sqlite is not available in this runtime. It is experimental in Node 24 and is ' +
        'disabled by --no-experimental-sqlite. Run `ieos doctor` for the full picture.',
      cause,
    );
  }
  let db: WritableDatabase;
  try {
    db = new sqlite.DatabaseSync(path, { timeout: OUTBOX_BUSY_TIMEOUT_MS });
  } catch (cause) {
    throw new OutboxUnavailableError(`cannot open the telemetry outbox at ${path}`, cause);
  }
  try {
    db.exec('pragma journal_mode=wal');
    db.exec(`pragma busy_timeout=${String(OUTBOX_BUSY_TIMEOUT_MS)}`);
    for (const statement of CREATE_OUTBOX_SQL) db.exec(statement);
    // Upgrade an existing pre-history database without rewriting its queue. Any
    // event that is still pending at first open becomes part of local history.
    db.exec(
      `insert or ignore into event_history
         (event_id, installation_id, emitter_id, sequence, envelope_json, acknowledged)
       select event_id, installation_id, emitter_id, sequence, envelope_json, 0 from outbox`,
    );
  } catch (cause) {
    db.close();
    throw new OutboxUnavailableError(`cannot initialize the telemetry outbox at ${path}`, cause);
  }
  return db;
}

/** The durable delivery queue plus its immutable local history. */
export class SqliteOutbox implements Outbox {
  readonly #db: WritableDatabase;

  constructor(db: WritableDatabase) {
    this.#db = db;
  }

  async append(event: TelemetryEvent): Promise<{ readonly appended: boolean }> {
    const parsed = telemetryEnvelopeSchema.parse(event);
    const history = this.#db.prepare(
      `insert or ignore into event_history
         (event_id, installation_id, emitter_id, sequence, envelope_json, acknowledged)
       values (?, ?, ?, ?, ?, 0)`,
    );
    const queue = this.#db.prepare(
      `insert into outbox
         (event_id, installation_id, emitter_id, sequence, queued_at, envelope_json)
       values (?, ?, ?, ?, ?, ?)`,
    );
    let appended = false;
    this.#transaction(() => {
      const stored = history.run(
        parsed.event_id,
        parsed.installation_id,
        parsed.emitter_id,
        parsed.source.sequence,
        JSON.stringify(parsed),
      );
      appended = Number(stored.changes) > 0;
      if (!appended) return;
      queue.run(
        parsed.event_id,
        parsed.installation_id,
        parsed.emitter_id,
        parsed.source.sequence,
        parsed.time.observed_at,
        JSON.stringify(parsed),
      );
    });
    return { appended };
  }

  /** The oldest `limit` undelivered events in the D26 ordering key. */
  async pending(limit: number): Promise<readonly TelemetryEvent[]> {
    if (limit <= 0) return [];
    return this.#db
      .prepare(
        `select envelope_json from outbox
           order by installation_id asc, emitter_id asc, sequence asc
           limit ?`,
      )
      .all(limit)
      .map((row) => telemetryEnvelopeSchema.parse(JSON.parse(String(row['envelope_json']))));
  }

  /**
   * Mark and remove exactly the ids proven durable remotely.
   *
   * The history update and queue deletion share one transaction. A crash cannot
   * produce the contradictory state "gone from the queue but not retained locally".
   */
  async acknowledge(eventIds: readonly string[]): Promise<void> {
    if (eventIds.length === 0) return;
    const mark = this.#db.prepare('update event_history set acknowledged = 1 where event_id = ?');
    const remove = this.#db.prepare('delete from outbox where event_id = ?');
    this.#transaction(() => {
      for (const id of eventIds) {
        mark.run(id);
        remove.run(id);
      }
    });
  }

  /** Every local event for a run, including events already acknowledged. */
  async historyForRun(runId: string): Promise<readonly TelemetryEvent[]> {
    const events = this.#db
      .prepare(
        `select envelope_json from event_history
           order by installation_id asc, emitter_id asc, sequence asc`,
      )
      .all()
      .map((row) => telemetryEnvelopeSchema.parse(JSON.parse(String(row['envelope_json']))));
    return events.filter((event) => event.run_id === runId);
  }

  /** How many events are still waiting. Reported by `ieos doctor`. */
  depth(): number {
    const row = this.#db.prepare('select count(*) as n from outbox').get();
    return Number(row?.['n'] ?? 0);
  }

  close(): void {
    this.#db.close();
  }

  #transaction(work: () => void): void {
    this.#db.exec('begin immediate');
    try {
      work();
      this.#db.exec('commit');
    } catch (error) {
      this.#db.exec('rollback');
      throw error;
    }
  }
}
