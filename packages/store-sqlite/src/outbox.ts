/**
 * The `Outbox` port, over a local SQLite file (D23, D26, R-11).
 *
 * The outbox exists so that losing the network never loses a run's history and,
 * more importantly, never makes a lossy run look like a measured one (D23). Its
 * requirements are given literally by D26/R-11 and are not negotiable defaults:
 *
 *   journal_mode = WAL          a reader and the flusher must not block each other
 *   timeout >= 5000 ms          a second writer waits rather than surfacing SQLITE_BUSY
 *   every write in a transaction
 *   UNIQUE(event_id)            the envelope's idempotency key, enforced by the store
 *   no file-level atomic replacement
 *
 * The last one is the subtle one, and it is why this is a table rather than a
 * JSON file rewritten under a temp name. Replacing the whole file is atomic for
 * the file and catastrophic for concurrency: two emitters in one project each
 * write a complete file, and the second silently discards the first one's
 * events. Row-level durability is the property the outbox actually needs.
 *
 * Rows are deleted only on acknowledgement, per the constitution's data
 * lifecycle: an event that was queued and never confirmed must still be here
 * after a crash, because the alternative is a gap nothing can distinguish from
 * a quiet run.
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
  // The ordering key is (installation_id, emitter_id, sequence) -- D26 says so
  // because wall-clock time is not an ordering under concurrency. The index
  // exists so draining in that order is not a table scan per flush.
  `create index if not exists outbox_order
     on outbox (installation_id, emitter_id, sequence)`,
];

/**
 * Open the outbox database, creating it if it does not exist.
 *
 * `node:sqlite` is loaded through a dynamic import so the two failure modes stay
 * distinguishable: a runtime started with `--no-experimental-sqlite` is a
 * different problem from a corrupt or unwritable file, and `ieos doctor` should
 * not send the reader looking in the wrong place.
 */
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
  } catch (cause) {
    db.close();
    throw new OutboxUnavailableError(`cannot initialize the telemetry outbox at ${path}`, cause);
  }
  return db;
}

/**
 * The durable local queue.
 *
 * Every method is async because the port is, not because the work is: SQLite is
 * synchronous here, and pretending otherwise would add a scheduling boundary
 * inside a transaction for nothing.
 */
export class SqliteOutbox implements Outbox {
  readonly #db: WritableDatabase;

  constructor(db: WritableDatabase) {
    this.#db = db;
  }

  /**
   * Queue one event.
   *
   * Idempotent on `event_id`, and idempotent in the direction that matters: a
   * repeat is reported as `appended: false` rather than replacing the row. The
   * queued envelope is the one that was actually emitted, and a retry that
   * rewrote it could quietly change history under a key that says it did not.
   */
  // `async` deliberately, even though nothing here awaits. The port returns a
  // Promise, so a caller's error handling is `.catch` or `try`/`await`; a
  // validation error thrown synchronously would escape it entirely, and a
  // telemetry failure that bypasses the emitter's handling surfaces as a crash
  // instead of as an INCOMPLETE run (D23). The same applies to the two methods
  // below.
  async append(event: TelemetryEvent): Promise<{ readonly appended: boolean }> {
    // Validated on the way in, so the outbox cannot become the place a
    // malformed envelope waits until the ingest function rejects the batch it
    // is in and takes every well-formed event with it.
    const parsed = telemetryEnvelopeSchema.parse(event);
    const statement = this.#db.prepare(
      `insert or ignore into outbox
         (event_id, installation_id, emitter_id, sequence, queued_at, envelope_json)
       values (?, ?, ?, ?, ?, ?)`,
    );
    let appended = false;
    this.#transaction(() => {
      const result = statement.run(
        parsed.event_id,
        parsed.installation_id,
        parsed.emitter_id,
        parsed.source.sequence,
        parsed.time.observed_at,
        JSON.stringify(parsed),
      );
      appended = Number(result.changes) > 0;
    });
    return { appended };
  }

  /** The oldest `limit` events in the D26 ordering key, not in insertion order. */
  async pending(limit: number): Promise<readonly TelemetryEvent[]> {
    if (limit <= 0) return [];
    const rows = this.#db
      .prepare(
        `select envelope_json from outbox
           order by installation_id asc, emitter_id asc, sequence asc
           limit ?`,
      )
      .all(limit);
    const events = rows.map(
      (row) => telemetryEnvelopeSchema.parse(JSON.parse(String(row['envelope_json']))),
      // Parsed on the way out as well as in. The file is on a developer's disk
      // and a hand-edited row must fail here rather than reach the plane.
    );
    return events;
  }

  /**
   * Delete acknowledged events.
   *
   * Only after durable acknowledgement -- the caller decides what that means,
   * and the Ingest port's `accepted` outcome names the ids the plane actually
   * took, so a partially accepted batch removes exactly those.
   */
  async acknowledge(eventIds: readonly string[]): Promise<void> {
    if (eventIds.length === 0) return;
    const statement = this.#db.prepare('delete from outbox where event_id = ?');
    this.#transaction(() => {
      for (const id of eventIds) statement.run(id);
    });
  }

  /** How many events are still waiting. Reported by `ieos doctor`. */
  depth(): number {
    const row = this.#db.prepare('select count(*) as n from outbox').get();
    return Number(row?.['n'] ?? 0);
  }

  close(): void {
    this.#db.close();
  }

  /**
   * Run a unit of work inside one transaction (D26).
   *
   * Hand-rolled rather than borrowed from a helper because `node:sqlite` has no
   * `.transaction()` wrapper. Rollback on throw is the whole point: a partial
   * write here is an event that exists for ordering and not for sending.
   */
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
