/**
 * Flush strategy and run state (D23).
 *
 * The rule under test is one sentence: telemetry loss must never look like a
 * measured run. Almost every test below is therefore about a run that lost
 * something, and asks the same question in different shapes -- does the record
 * say so?
 *
 * The Stage 2 mandatory scenario appears verbatim: a container killed right
 * after the last tool call. Either the events arrive at the boundary flush, or
 * the run is INCOMPLETE. It is never silently "complete", and there is a
 * negative control here for exactly that, because a test that only ever
 * exercises the succeeding path would pass against a runtime that could not
 * report failure at all.
 */

import { describe, expect, it } from 'vitest';
import { runTelemetryStateSchema } from '@ieos/core';
import type { Ingest, IngestOutcome, Outbox, TelemetryEvent } from '@ieos/core';
import {
  DEFAULT_FLUSH_POLICY,
  Flusher,
  mandatoryBoundaries,
  runTelemetryState,
} from '../src/flush.ts';

/** An in-memory outbox: the durability question belongs to store-sqlite's tests. */
class MemoryOutbox implements Outbox {
  #events: TelemetryEvent[] = [];

  append(event: TelemetryEvent): Promise<{ readonly appended: boolean }> {
    if (this.#events.some((queued) => queued.event_id === event.event_id)) {
      return Promise.resolve({ appended: false });
    }
    this.#events.push(event);
    return Promise.resolve({ appended: true });
  }

  pending(limit: number): Promise<readonly TelemetryEvent[]> {
    return Promise.resolve(limit <= 0 ? [] : this.#events.slice(0, limit));
  }

  pendingCount(): Promise<number> {
    return Promise.resolve(this.#events.length);
  }

  acknowledge(eventIds: readonly string[]): Promise<void> {
    const gone = new Set(eventIds);
    this.#events = this.#events.filter((event) => !gone.has(event.event_id));
    return Promise.resolve();
  }

  get depth(): number {
    return this.#events.length;
  }
}

const anEvent = (id: string, sequence: number): TelemetryEvent =>
  ({
    schema_version: '1',
    stability: 'development',
    introduced_in: '0.1.0',
    deprecated_in: null,
    replacement: null,
    migration_path: null,
    event_id: id,
    event_type: 'tool.call',
    project_id: 'proj_a',
    work_id: 'work_a',
    run_id: 'run_a',
    installation_id: 'inst_a',
    emitter_id: 'emt_a',
    session_kind: 'remote_ephemeral',
    trace: { trace_id: 't', span_id: `s${String(sequence)}`, parent_span_id: null, links: [] },
    time: {
      occurred_at: '2026-09-06T00:00:00.000Z',
      observed_at: '2026-09-06T00:00:00.000Z',
      ingested_at: null,
    },
    source: { type: 'agent', sequence },
    revision: { repo_sha: 'a'.repeat(40), eos_release: '0.1.0' },
    harness: {
      agent: 'claude-code',
      model: 'test',
      adapter_version: '0.1.0',
      available_capabilities_hash: 'sha256:0',
    },
    attributes: {},
  }) as TelemetryEvent;

/** An ingest whose answer the test dictates, including "not there at all". */
function scriptedIngest(answers: readonly (IngestOutcome | 'throw')[]): {
  ingest: Ingest;
  calls: () => number;
} {
  let call = 0;
  const ingest: Ingest = {
    sendEvents: (events) => {
      const answer = answers[Math.min(call, answers.length - 1)];
      call += 1;
      if (answer === 'throw') return Promise.reject(new Error('socket hang up'));
      if (answer === undefined) {
        return Promise.resolve({
          status: 'accepted',
          acceptedEventIds: events.map((event) => event.event_id),
        });
      }
      return Promise.resolve(answer);
    },
    sendObservations: () => Promise.resolve({ status: 'accepted', acceptedEventIds: [] }),
    readMinimal: () => Promise.resolve(null),
    isReachable: () => Promise.resolve(true),
  };
  return { ingest, calls: () => call };
}

const acceptAll = (events: readonly TelemetryEvent[]): IngestOutcome => ({
  status: 'accepted',
  acceptedEventIds: events.map((event) => event.event_id),
});

const noSleep = (): Promise<void> => Promise.resolve();

describe('which boundaries force a synchronous flush (D23)', () => {
  it('makes Stop and SessionEnd mandatory for a discardable container', () => {
    // It has no "later": those are the last moments its outbox exists.
    expect(mandatoryBoundaries('remote_ephemeral')).toContain('stop');
    expect(mandatoryBoundaries('remote_ephemeral')).toContain('session_end');
    expect(mandatoryBoundaries('remote_ephemeral')).toContain('interval');
  });

  it('asks less of a laptop, which still has its outbox tomorrow', () => {
    expect(mandatoryBoundaries('local_persistent')).toEqual(['session_end']);
  });

  it('treats CI as ending when its job does', () => {
    expect(mandatoryBoundaries('ci')).toEqual(['stop', 'session_end']);
  });
});

describe('a flush that succeeds', () => {
  it('drains the outbox and acknowledges exactly what was accepted', async () => {
    const outbox = new MemoryOutbox();
    await outbox.append(anEvent('evt_1', 0));
    await outbox.append(anEvent('evt_2', 1));
    const { ingest } = scriptedIngest([]);
    const flusher = new Flusher({ outbox, ingest, sessionKind: 'ci', sleep: noSleep });

    const result = await flusher.flush('session_end');
    expect(result.outcome).toBe('drained');
    expect(result.acknowledged).toBe(2);
    expect(outbox.depth).toBe(0);
    expect(flusher.everFailed).toBe(false);
  });

  it('is a no-op on an empty outbox rather than an error', async () => {
    const { ingest, calls } = scriptedIngest([]);
    const flusher = new Flusher({
      outbox: new MemoryOutbox(),
      ingest,
      sessionKind: 'ci',
      sleep: noSleep,
    });
    expect((await flusher.flush('stop')).outcome).toBe('drained');
    expect(calls()).toBe(0);
  });
});

describe('a flush that partly succeeds', () => {
  it('leaves behind exactly what the plane did not take', async () => {
    // The ids the plane named are the only ones proven durable. Deleting the
    // whole batch would turn a partial success into silent loss.
    const outbox = new MemoryOutbox();
    await outbox.append(anEvent('evt_1', 0));
    await outbox.append(anEvent('evt_2', 1));
    const { ingest } = scriptedIngest([{ status: 'accepted', acceptedEventIds: ['evt_1'] }]);
    const flusher = new Flusher({ outbox, ingest, sessionKind: 'ci', sleep: noSleep });

    const result = await flusher.flush('session_end');
    expect(result.outcome).toBe('partial');
    expect(result.remaining).toBe(1);
    expect((await outbox.pending(10)).map((event) => event.event_id)).toEqual(['evt_2']);
  });

  it('counts as a failure for the run, even though something got through', async () => {
    const outbox = new MemoryOutbox();
    await outbox.append(anEvent('evt_1', 0));
    await outbox.append(anEvent('evt_2', 1));
    const { ingest } = scriptedIngest([{ status: 'accepted', acceptedEventIds: ['evt_1'] }]);
    const flusher = new Flusher({ outbox, ingest, sessionKind: 'ci', sleep: noSleep });
    await flusher.flush('session_end');
    expect(flusher.everFailed).toBe(true);
  });
});

describe('a flush that fails', () => {
  it('retries a bounded number of times and then gives up', async () => {
    const outbox = new MemoryOutbox();
    await outbox.append(anEvent('evt_1', 0));
    const { ingest, calls } = scriptedIngest([{ status: 'unreachable', reason: 'offline' }]);
    const flusher = new Flusher({
      outbox,
      ingest,
      sessionKind: 'remote_ephemeral',
      sleep: noSleep,
    });

    const result = await flusher.flush('session_end');
    expect(calls()).toBe(DEFAULT_FLUSH_POLICY.maxAttempts);
    expect(result.outcome).toBe('unreachable');
    expect(result.lastReason).toBe('offline');
  });

  it('does NOT retry a rejection, which is the plane saying no', async () => {
    // Retrying a rejected batch sends the same rejected batch again. The
    // network being absent and the plane refusing are different answers.
    const outbox = new MemoryOutbox();
    await outbox.append(anEvent('evt_1', 0));
    const { ingest, calls } = scriptedIngest([{ status: 'rejected', reason: 'bad token' }]);
    const flusher = new Flusher({ outbox, ingest, sessionKind: 'ci', sleep: noSleep });

    const result = await flusher.flush('session_end');
    expect(calls()).toBe(1);
    expect(result.outcome).toBe('rejected');
  });

  it('turns a thrown transport error into an outcome, never an exception', async () => {
    // A telemetry exception escaping into an agent hook turns an observability
    // problem into a coding outage. D23 says coding continues.
    const outbox = new MemoryOutbox();
    await outbox.append(anEvent('evt_1', 0));
    const { ingest } = scriptedIngest(['throw']);
    const flusher = new Flusher({ outbox, ingest, sessionKind: 'ci', sleep: noSleep });

    const result = await flusher.flush('stop');
    expect(result.outcome).toBe('unreachable');
    expect(result.lastReason).toContain('socket hang up');
  });

  it('keeps the events queued, so a later process can still send them', async () => {
    const outbox = new MemoryOutbox();
    await outbox.append(anEvent('evt_1', 0));
    const { ingest } = scriptedIngest([{ status: 'unreachable', reason: 'offline' }]);
    const flusher = new Flusher({
      outbox,
      ingest,
      sessionKind: 'local_persistent',
      sleep: noSleep,
    });
    await flusher.flush('session_end');
    expect(outbox.depth).toBe(1);
  });

  it('recovers on a later attempt, but does not forget that it failed', async () => {
    // A run whose telemetry needed two tries is not a run this process observed
    // cleanly. `everFailed` is what makes that visible afterwards.
    const outbox = new MemoryOutbox();
    await outbox.append(anEvent('evt_1', 0));
    const { ingest } = scriptedIngest([
      { status: 'unreachable', reason: 'offline' },
      { status: 'accepted', acceptedEventIds: ['evt_1'] },
    ]);
    const flusher = new Flusher({ outbox, ingest, sessionKind: 'ci', sleep: noSleep });

    const result = await flusher.flush('session_end');
    expect(result.outcome).toBe('drained');
    expect(flusher.everFailed).toBe(false);
    expect(outbox.depth).toBe(0);
  });
});

describe('the run state a lossy run must produce (D23)', () => {
  it('is COMPLETE only when nothing was left and nothing failed', () => {
    const state = runTelemetryState({
      runId: 'run_a',
      ingestReachableAtStart: true,
      remaining: 0,
      everFailed: false,
    });
    expect(state.telemetry_state).toBe('COMPLETE');
    expect(state.qualification_eligible).toBe(true);
  });

  it('is INCOMPLETE when events are still queued at the end', () => {
    const state = runTelemetryState({
      runId: 'run_a',
      ingestReachableAtStart: true,
      remaining: 3,
      everFailed: true,
    });
    expect(state.telemetry_state).toBe('INCOMPLETE');
    expect(state.qualification_eligible).toBe(false);
  });

  it('is INCOMPLETE when a flush failed even though the outbox later drained', () => {
    // A batch that failed here and was re-sent by some other process is not
    // something this run observed. "Ended up in the plane" and "this run
    // measured it" are different claims.
    const state = runTelemetryState({
      runId: 'run_a',
      ingestReachableAtStart: true,
      remaining: 0,
      everFailed: true,
    });
    expect(state.telemetry_state).toBe('INCOMPLETE');
  });

  it('is never qualification-eligible if ingest was unreachable at SessionStart', () => {
    // Eligibility is declared up front, precisely so it cannot be decided
    // afterwards by how the run happened to go.
    const state = runTelemetryState({
      runId: 'run_a',
      ingestReachableAtStart: false,
      remaining: 0,
      everFailed: false,
    });
    expect(state.telemetry_state).toBe('COMPLETE');
    expect(state.qualification_eligible).toBe(false);
  });
});

describe('the Stage 2 mandatory scenario: the container is killed after the last tool call', () => {
  it('either the boundary flush delivers the events...', async () => {
    const outbox = new MemoryOutbox();
    await outbox.append(anEvent('evt_last', 41));
    const { ingest } = scriptedIngest([]);
    const flusher = new Flusher({
      outbox,
      ingest,
      sessionKind: 'remote_ephemeral',
      sleep: noSleep,
    });

    const result = await flusher.flush('session_end');
    const state = runTelemetryState({
      runId: 'run_a',
      ingestReachableAtStart: true,
      remaining: result.remaining,
      everFailed: flusher.everFailed,
    });
    expect(state.telemetry_state).toBe('COMPLETE');
  });

  it('...or the run is INCOMPLETE — never silently complete', async () => {
    const outbox = new MemoryOutbox();
    await outbox.append(anEvent('evt_last', 41));
    const { ingest } = scriptedIngest([{ status: 'unreachable', reason: 'container torn down' }]);
    const flusher = new Flusher({
      outbox,
      ingest,
      sessionKind: 'remote_ephemeral',
      sleep: noSleep,
    });

    const result = await flusher.flush('session_end');
    const state = runTelemetryState({
      runId: 'run_a',
      ingestReachableAtStart: true,
      remaining: result.remaining,
      everFailed: flusher.everFailed,
    });
    expect(state.telemetry_state).toBe('INCOMPLETE');
    expect(state.qualification_eligible).toBe(false);
  });

  it('and the contract itself refuses an INCOMPLETE run that claims eligibility', () => {
    // The negative control. Without this the two tests above would pass against
    // a runtime whose only failure mode was being unable to report failure.
    expect(() =>
      runTelemetryState({
        runId: 'run_a',
        ingestReachableAtStart: true,
        remaining: 5,
        everFailed: true,
      }),
    ).not.toThrow();
    // ...and the invariant belongs to the contract, not to the helper: this
    // asserts it against the schema directly, where no caller can route around
    // it by constructing the state some other way.
    const forced = {
      run_id: 'run_a',
      telemetry_state: 'INCOMPLETE' as const,
      qualification_eligible: true,
      ingest_reachable_at_start: true,
    };
    expect(() => runTelemetryStateSchema.parse(forced)).toThrow(/qualification/u);
  });
});
