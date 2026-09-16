import type {
  ContextSnapshotDocument,
  EvidenceQueue,
  Ingest,
  Observation,
  Outbox,
  TelemetryEvent,
} from '@ieos/core';
import { describe, expect, it } from 'vitest';
import { Flusher } from '../src/flush.ts';

class MemoryOutbox implements Outbox {
  readonly events: TelemetryEvent[];

  constructor(count: number) {
    this.events = Array.from({ length: count }, (_, index) => ({
      event_id: `evt_${String(index)}`,
    })) as TelemetryEvent[];
  }

  async append(): Promise<{ readonly appended: boolean }> {
    return { appended: true };
  }

  async pending(limit: number): Promise<readonly TelemetryEvent[]> {
    return this.events.slice(0, limit);
  }

  async pendingCount(): Promise<number> {
    return this.events.length;
  }

  async acknowledge(ids: readonly string[]): Promise<void> {
    const accepted = new Set(ids);
    for (let index = this.events.length - 1; index >= 0; index -= 1) {
      if (accepted.has(this.events[index]?.event_id ?? '')) this.events.splice(index, 1);
    }
  }
}

class MemoryEvidence implements EvidenceQueue {
  readonly observations: Observation[] = [];
  readonly snapshots: ContextSnapshotDocument[] = [];

  async recordObservation(observation: Observation): Promise<{ readonly status: 'recorded' }> {
    this.observations.push(observation);
    return { status: 'recorded' };
  }

  async listOpenProposals(): Promise<readonly unknown[]> {
    return [];
  }

  async recordContextSnapshot(
    snapshot: ContextSnapshotDocument,
  ): Promise<{ readonly status: 'recorded' }> {
    this.snapshots.push(snapshot);
    return { status: 'recorded' };
  }

  async getContextSnapshot(id: string): Promise<ContextSnapshotDocument | undefined> {
    return this.snapshots.find((snapshot) => snapshot.context_snapshot_id === id);
  }

  async pendingObservations(limit: number): Promise<readonly Observation[]> {
    return this.observations.slice(0, limit);
  }

  async pendingContextSnapshots(limit: number): Promise<readonly ContextSnapshotDocument[]> {
    return this.snapshots.slice(0, limit);
  }

  async acknowledgeObservations(ids: readonly string[]): Promise<void> {
    const accepted = new Set(ids);
    for (let index = this.observations.length - 1; index >= 0; index -= 1) {
      if (accepted.has(this.observations[index]?.observation_id ?? '')) {
        this.observations.splice(index, 1);
      }
    }
  }

  async acknowledgeContextSnapshots(ids: readonly string[]): Promise<void> {
    const accepted = new Set(ids);
    for (let index = this.snapshots.length - 1; index >= 0; index -= 1) {
      if (accepted.has(this.snapshots[index]?.context_snapshot_id ?? '')) {
        this.snapshots.splice(index, 1);
      }
    }
  }

  async pendingEvidenceCount(): Promise<number> {
    return this.observations.length + this.snapshots.length;
  }
}

function acceptingIngest(calls: string[]): Ingest {
  return {
    sendEvents: async (events) => {
      calls.push(`events:${String(events.length)}`);
      return { status: 'accepted', acceptedEventIds: events.map((event) => event.event_id) };
    },
    sendObservations: async (observations) => {
      calls.push(`observations:${String(observations.length)}`);
      return {
        status: 'accepted',
        acceptedEventIds: observations.map((observation) => observation.observation_id),
      };
    },
    sendContextSnapshots: async (snapshots) => {
      calls.push(`snapshots:${String(snapshots.length)}`);
      return {
        status: 'accepted',
        acceptedEventIds: snapshots.map((snapshot) => snapshot.context_snapshot_id),
      };
    },
    readMinimal: async () => null,
    isReachable: async () => true,
  };
}

describe('evidence-aware terminal flushing', () => {
  it('drains every event batch instead of treating the first 100 as COMPLETE', async () => {
    const outbox = new MemoryOutbox(205);
    const calls: string[] = [];
    const flusher = new Flusher({
      outbox,
      ingest: acceptingIngest(calls),
      sessionKind: 'ci',
      policy: { batchSize: 100, maxAttempts: 1, retryDelayMs: 0 },
    });

    const result = await flusher.flush('session_end');
    expect(result).toMatchObject({ outcome: 'drained', remaining: 0, acknowledged: 205 });
    expect(calls).toEqual(['events:100', 'events:100', 'events:5']);
  });

  it('does not acknowledge ids the plane did not explicitly accept', async () => {
    const outbox = new MemoryOutbox(2);
    const ingest = acceptingIngest([]);
    ingest.sendEvents = async (events) => ({
      status: 'accepted',
      acceptedEventIds: [events[0]?.event_id ?? ''],
    });
    const flusher = new Flusher({
      outbox,
      ingest,
      sessionKind: 'ci',
      policy: { batchSize: 100, maxAttempts: 1, retryDelayMs: 0 },
    });

    const result = await flusher.flush('session_end');
    expect(result.outcome).toBe('partial');
    expect(result.remaining).toBe(1);
    expect(outbox.events.map((event) => event.event_id)).toEqual(['evt_1']);
    expect(flusher.everFailed).toBe(true);
  });

  it('requires observations and snapshots to drain before reporting drained', async () => {
    const outbox = new MemoryOutbox(0);
    const evidence = new MemoryEvidence();
    evidence.observations.push({ observation_id: 'obs_1' } as Observation);
    evidence.snapshots.push({ context_snapshot_id: 'ctx_1' } as ContextSnapshotDocument);
    const calls: string[] = [];
    const flusher = new Flusher({
      outbox,
      evidence,
      ingest: acceptingIngest(calls),
      sessionKind: 'ci',
      policy: { batchSize: 100, maxAttempts: 1, retryDelayMs: 0 },
    });

    const result = await flusher.flush('session_end');
    expect(result).toMatchObject({ outcome: 'drained', remaining: 0, acknowledged: 2 });
    expect(calls).toEqual(['observations:1', 'snapshots:1']);
  });

  it('fails closed when snapshots are pending but the ingest cannot send them', async () => {
    const outbox = new MemoryOutbox(0);
    const evidence = new MemoryEvidence();
    evidence.snapshots.push({ context_snapshot_id: 'ctx_1' } as ContextSnapshotDocument);
    const ingest = acceptingIngest([]);
    delete ingest.sendContextSnapshots;
    const flusher = new Flusher({
      outbox,
      evidence,
      ingest,
      sessionKind: 'ci',
      policy: { batchSize: 100, maxAttempts: 1, retryDelayMs: 0 },
    });

    const result = await flusher.flush('session_end');
    expect(result.outcome).toBe('unreachable');
    expect(result.remaining).toBe(1);
    expect(flusher.everFailed).toBe(true);
  });

  it('records a local queue failure as sticky before the exception escapes', async () => {
    const outbox = new MemoryOutbox(1);
    outbox.acknowledge = async () => {
      throw new Error('database is locked');
    };
    const flusher = new Flusher({
      outbox,
      ingest: acceptingIngest([]),
      sessionKind: 'ci',
      policy: { batchSize: 100, maxAttempts: 1, retryDelayMs: 0 },
    });

    await expect(flusher.flush('session_end')).rejects.toThrow('database is locked');
    expect(flusher.everFailed).toBe(true);
  });

  it('counts remaining telemetry without materializing the queue', async () => {
    const outbox = new MemoryOutbox(3);
    const limits: number[] = [];
    const pending = outbox.pending.bind(outbox);
    outbox.pending = async (limit) => {
      limits.push(limit);
      return pending(limit);
    };
    const ingest = acceptingIngest([]);
    ingest.sendEvents = async () => ({ status: 'unreachable', reason: 'offline' });
    const flusher = new Flusher({
      outbox,
      ingest,
      sessionKind: 'ci',
      policy: { batchSize: 2, maxAttempts: 1, retryDelayMs: 0 },
    });

    const result = await flusher.flush('session_end');
    expect(result).toMatchObject({ outcome: 'unreachable', remaining: 3 });
    expect(limits).toEqual([2]);
  });
});
