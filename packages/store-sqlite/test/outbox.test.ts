/**
 * The telemetry outbox (D23, D26, R-11).
 *
 * D23 states the property the rest of this file exists to protect: telemetry
 * loss must never look like a measured run. Everything below is a way of asking
 * whether a specific loss is possible -- a crash between queue and flush, a
 * second emitter overwriting the first, a duplicate rewriting history under an
 * idempotency key that says it did not.
 *
 * The pragmas are asserted rather than assumed. D26 gives them as requirements,
 * not preferences, and a `pragma` that silently failed to apply would leave the
 * store working exactly well enough to pass every other test here.
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';
import type { TelemetryEvent } from '@ieos/core';
import { openOutbox, OUTBOX_BUSY_TIMEOUT_MS, SqliteOutbox } from '../src/outbox.ts';

const scratch: string[] = [];
afterEach(() => {
  for (const dir of scratch.splice(0)) {
    rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
});

function outboxPath(): string {
  const dir = mkdtempSync(join(tmpdir(), 'ieos-outbox-'));
  scratch.push(dir);
  return join(dir, 'outbox.sqlite');
}

const anEvent = (over: Partial<TelemetryEvent> = {}): TelemetryEvent =>
  ({
    schema_version: '1',
    stability: 'development',
    introduced_in: '0.1.0',
    deprecated_in: null,
    replacement: null,
    migration_path: null,
    event_id: 'evt_0001',
    event_type: 'tool.call',
    project_id: 'proj_a',
    work_id: 'work_a',
    run_id: 'run_a',
    installation_id: 'inst_a',
    emitter_id: 'emt_a',
    session_kind: 'ci',
    trace: { trace_id: 't1', span_id: 's1', parent_span_id: null, links: [] },
    time: {
      occurred_at: '2026-09-06T00:00:00.000Z',
      observed_at: '2026-09-06T00:00:00.000Z',
      ingested_at: null,
    },
    source: { type: 'agent', sequence: 0 },
    revision: { repo_sha: 'a'.repeat(40), eos_release: '0.1.0' },
    harness: {
      agent: 'claude-code',
      model: 'test',
      adapter_version: '0.1.0',
      available_capabilities_hash: 'sha256:0',
    },
    attributes: {},
    ...over,
  }) as TelemetryEvent;

describe('the outbox is configured the way D26 requires, not the way SQLite defaults', () => {
  it('runs in WAL mode', async () => {
    const path = outboxPath();
    const db = await openOutbox(path);
    try {
      const mode = db.prepare('pragma journal_mode').get();
      expect(String(mode?.['journal_mode']).toLowerCase()).toBe('wal');
    } finally {
      db.close();
    }
  });

  it('waits at least five seconds for a contending writer rather than failing', async () => {
    const path = outboxPath();
    const db = await openOutbox(path);
    try {
      const timeout = db.prepare('pragma busy_timeout').get();
      expect(Number(timeout?.['timeout'])).toBeGreaterThanOrEqual(5000);
      expect(OUTBOX_BUSY_TIMEOUT_MS).toBeGreaterThanOrEqual(5000);
    } finally {
      db.close();
    }
  });
});

describe('queueing an event', () => {
  it('accepts it once and reports a repeat as a repeat', async () => {
    const db = await openOutbox(outboxPath());
    const outbox = new SqliteOutbox(db);
    try {
      expect(await outbox.append(anEvent())).toEqual({ appended: true });
      expect(await outbox.append(anEvent())).toEqual({ appended: false });
      expect(outbox.depth()).toBe(1);
    } finally {
      outbox.close();
    }
  });

  it('does NOT let a repeat rewrite the envelope already queued', async () => {
    // `event_id` is an idempotency key. If a retry could replace the row, the
    // key would be saying "this is the same event" while the stored content
    // changed underneath it -- a rewrite of history that nothing downstream
    // could detect, because the id it would compare is the one that matched.
    const db = await openOutbox(outboxPath());
    const outbox = new SqliteOutbox(db);
    try {
      await outbox.append(anEvent({ attributes: { 'tool.name': 'resolve' } }));
      await outbox.append(anEvent({ attributes: { 'tool.name': 'observe' } }));
      const [queued] = await outbox.pending(10);
      expect(queued?.attributes).toEqual({ 'tool.name': 'resolve' });
    } finally {
      outbox.close();
    }
  });

  it('refuses a malformed envelope at the door', async () => {
    // Otherwise the outbox becomes where a bad event waits until it poisons the
    // batch it ships in, taking every well-formed event with it.
    const db = await openOutbox(outboxPath());
    const outbox = new SqliteOutbox(db);
    try {
      await expect(
        outbox.append({ ...anEvent(), event_id: '' } as TelemetryEvent),
      ).rejects.toThrow();
      expect(outbox.depth()).toBe(0);
    } finally {
      outbox.close();
    }
  });

  it('refuses an envelope that tries to carry a classification (D36)', async () => {
    // The envelope schema is `.strict()`, so `origin_class` cannot be expressed.
    // Asserted here as well as in core because this is the layer that would
    // persist it, and a store that accepted the field would make the boundary a
    // convention rather than a mechanism.
    const db = await openOutbox(outboxPath());
    const outbox = new SqliteOutbox(db);
    try {
      const smuggled = { ...anEvent(), origin_class: 'qualification' } as unknown as TelemetryEvent;
      await expect(outbox.append(smuggled)).rejects.toThrow();
      expect(outbox.depth()).toBe(0);
    } finally {
      outbox.close();
    }
  });
});

describe('draining the outbox', () => {
  it('returns events in the D26 ordering key, not in insertion order', async () => {
    // (installation_id, emitter_id, sequence). Wall-clock time is not an
    // ordering under concurrency, which is exactly why D26 names this key.
    const db = await openOutbox(outboxPath());
    const outbox = new SqliteOutbox(db);
    try {
      await outbox.append(anEvent({ event_id: 'evt_c', source: { type: 'agent', sequence: 2 } }));
      await outbox.append(anEvent({ event_id: 'evt_a', source: { type: 'agent', sequence: 0 } }));
      await outbox.append(anEvent({ event_id: 'evt_b', source: { type: 'agent', sequence: 1 } }));
      const drained = await outbox.pending(10);
      expect(drained.map((event) => event.event_id)).toEqual(['evt_a', 'evt_b', 'evt_c']);
    } finally {
      outbox.close();
    }
  });

  it('separates two emitters rather than interleaving them by time', async () => {
    const db = await openOutbox(outboxPath());
    const outbox = new SqliteOutbox(db);
    try {
      await outbox.append(
        anEvent({ event_id: 'b0', emitter_id: 'emt_b', source: { type: 'agent', sequence: 0 } }),
      );
      await outbox.append(
        anEvent({ event_id: 'a1', emitter_id: 'emt_a', source: { type: 'agent', sequence: 1 } }),
      );
      await outbox.append(
        anEvent({ event_id: 'a0', emitter_id: 'emt_a', source: { type: 'agent', sequence: 0 } }),
      );
      const drained = await outbox.pending(10);
      expect(drained.map((event) => event.event_id)).toEqual(['a0', 'a1', 'b0']);
    } finally {
      outbox.close();
    }
  });

  it('returns nothing for a non-positive limit rather than everything', async () => {
    const db = await openOutbox(outboxPath());
    const outbox = new SqliteOutbox(db);
    try {
      await outbox.append(anEvent());
      expect(await outbox.pending(0)).toEqual([]);
      expect(await outbox.pending(-1)).toEqual([]);
    } finally {
      outbox.close();
    }
  });
});

describe('acknowledgement is the only thing that deletes', () => {
  it('removes exactly the acknowledged ids, and leaves a partial batch behind', async () => {
    // The Ingest port reports which ids the plane actually took. A batch that
    // was half accepted must leave the other half queued; deleting the whole
    // batch would turn a partial success into silent loss.
    const db = await openOutbox(outboxPath());
    const outbox = new SqliteOutbox(db);
    try {
      await outbox.append(anEvent({ event_id: 'evt_1', source: { type: 'agent', sequence: 1 } }));
      await outbox.append(anEvent({ event_id: 'evt_2', source: { type: 'agent', sequence: 2 } }));
      await outbox.acknowledge(['evt_1']);
      const remaining = await outbox.pending(10);
      expect(remaining.map((event) => event.event_id)).toEqual(['evt_2']);
    } finally {
      outbox.close();
    }
  });

  it('does nothing on an empty acknowledgement', async () => {
    const db = await openOutbox(outboxPath());
    const outbox = new SqliteOutbox(db);
    try {
      await outbox.append(anEvent());
      await outbox.acknowledge([]);
      expect(outbox.depth()).toBe(1);
    } finally {
      outbox.close();
    }
  });

  it('survives a process that dies between queueing and flushing', async () => {
    // The Stage 2 crash simulation, at the layer that has to answer for it. An
    // event that was queued and never acknowledged is still here afterwards --
    // otherwise the run would come back looking quieter than it was.
    const path = outboxPath();
    const first = new SqliteOutbox(await openOutbox(path));
    await first.append(anEvent({ event_id: 'evt_survivor' }));
    // No acknowledgement, no graceful drain: the process simply ends.
    first.close();

    const second = new SqliteOutbox(await openOutbox(path));
    try {
      const recovered = await second.pending(10);
      expect(recovered.map((event) => event.event_id)).toEqual(['evt_survivor']);
    } finally {
      second.close();
    }
  });

  it('lets two emitters share one file instead of overwriting each other', async () => {
    // The reason this is a table and not a JSON file replaced atomically: two
    // emitters each writing a whole file means the second one erases the first
    // one's events, and the file operation that did it was itself atomic.
    const path = outboxPath();
    const a = new SqliteOutbox(await openOutbox(path));
    const b = new SqliteOutbox(await openOutbox(path));
    try {
      await a.append(anEvent({ event_id: 'from_a', emitter_id: 'emt_a' }));
      await b.append(anEvent({ event_id: 'from_b', emitter_id: 'emt_b' }));
      const seen = await b.pending(10);
      expect(seen.map((event) => event.event_id).sort()).toEqual(['from_a', 'from_b']);
    } finally {
      a.close();
      b.close();
    }
  });
});

describe('a hand-edited row', () => {
  it('fails on the way out rather than reaching the plane', async () => {
    // The file sits on a developer's disk. Validating only on the way in would
    // make "it was valid when we wrote it" the guarantee, which is not one.
    const path = outboxPath();
    const outbox = new SqliteOutbox(await openOutbox(path));
    await outbox.append(anEvent());
    outbox.close();

    const raw = new DatabaseSync(path);
    raw.prepare('update outbox set envelope_json = ?').run('{"event_id":"evt_0001"}');
    raw.close();

    const reopened = new SqliteOutbox(await openOutbox(path));
    try {
      await expect(reopened.pending(10)).rejects.toThrow();
    } finally {
      reopened.close();
    }
  });
});
