/** Flush strategy and run state (D23). */

import { runTelemetryStateSchema } from '@ieos/core';
import type {
  ContextSnapshotDocument,
  EvidenceQueue,
  Ingest,
  IngestOutcome,
  Observation,
  Outbox,
  RunTelemetryState,
  SessionKind,
  TelemetryEvent,
} from '@ieos/core';

export type FlushBoundary = 'stop' | 'session_end' | 'interval' | 'manual';

export interface FlushPolicy {
  readonly batchSize: number;
  readonly maxAttempts: number;
  readonly retryDelayMs: number;
}

export const DEFAULT_FLUSH_POLICY: FlushPolicy = {
  batchSize: 100,
  maxAttempts: 3,
  retryDelayMs: 1000,
};

export interface FlushResult {
  readonly boundary: FlushBoundary;
  readonly attempted: number;
  readonly acknowledged: number;
  /** Events + evidence documents still pending after this boundary. */
  readonly remaining: number;
  readonly outcome: 'drained' | 'partial' | 'unreachable' | 'rejected';
  readonly lastReason?: string;
}

export function mandatoryBoundaries(kind: SessionKind): readonly FlushBoundary[] {
  switch (kind) {
    case 'remote_ephemeral':
      return ['stop', 'session_end', 'interval'];
    case 'ci':
      return ['stop', 'session_end'];
    case 'local_persistent':
      return ['session_end'];
  }
}

export interface FlusherOptions {
  readonly outbox: Outbox;
  /** Optional for old callers; MCP/hook production wiring supplies it. */
  readonly evidence?: EvidenceQueue;
  readonly ingest: Ingest;
  readonly sessionKind: SessionKind;
  readonly policy?: FlushPolicy;
  readonly sleep?: (ms: number) => Promise<void>;
}

type PendingDocument = TelemetryEvent | Observation | ContextSnapshotDocument;

type QueueAdapter<T extends PendingDocument> = {
  pending(limit: number): Promise<readonly T[]>;
  acknowledge(ids: readonly string[]): Promise<void>;
  id(item: T): string;
  send(items: readonly T[]): Promise<IngestOutcome>;
};

interface DrainResult {
  attempted: number;
  acknowledged: number;
  failed?: { outcome: 'partial' | 'unreachable' | 'rejected'; reason?: string };
}

/**
 * Drains telemetry, observations and context snapshots into the Evidence Plane.
 *
 * A boundary is `drained` only when every queue is empty. A single partial ACK
 * is sticky failure for the run even if a later process eventually delivers the
 * rest; this process did not observe a lossless measurement.
 */
export class Flusher {
  readonly #outbox: Outbox;
  readonly #evidence: EvidenceQueue | undefined;
  readonly #ingest: Ingest;
  readonly #sessionKind: SessionKind;
  readonly #policy: FlushPolicy;
  readonly #sleep: (ms: number) => Promise<void>;
  #everFailed = false;

  constructor(options: FlusherOptions) {
    this.#outbox = options.outbox;
    this.#evidence = options.evidence;
    this.#ingest = options.ingest;
    this.#sessionKind = options.sessionKind;
    this.#policy = options.policy ?? DEFAULT_FLUSH_POLICY;
    this.#sleep =
      options.sleep ??
      ((ms) =>
        new Promise((resolve) => {
          setTimeout(resolve, ms);
        }));
  }

  get everFailed(): boolean {
    return this.#everFailed;
  }

  async flush(boundary: FlushBoundary): Promise<FlushResult> {
    let attempted = 0;
    let acknowledged = 0;

    const eventResult = await this.#drain<TelemetryEvent>({
      pending: (limit) => this.#outbox.pending(limit),
      acknowledge: (ids) => this.#outbox.acknowledge(ids),
      id: (event) => event.event_id,
      send: (events) => this.#safeSend(() => this.#ingest.sendEvents(events)),
    });
    attempted += eventResult.attempted;
    acknowledged += eventResult.acknowledged;
    if (eventResult.failed !== undefined) {
      return this.#failedResult(boundary, attempted, acknowledged, eventResult.failed);
    }

    if (this.#evidence !== undefined) {
      const observationResult = await this.#drain<Observation>({
        pending: (limit) => this.#evidence?.pendingObservations(limit) ?? Promise.resolve([]),
        acknowledge: (ids) => this.#evidence?.acknowledgeObservations(ids) ?? Promise.resolve(),
        id: (observation) => observation.observation_id,
        send: (observations) => this.#safeSend(() => this.#ingest.sendObservations(observations)),
      });
      attempted += observationResult.attempted;
      acknowledged += observationResult.acknowledged;
      if (observationResult.failed !== undefined) {
        return this.#failedResult(boundary, attempted, acknowledged, observationResult.failed);
      }

      const snapshotResult = await this.#drain<ContextSnapshotDocument>({
        pending: (limit) => this.#evidence?.pendingContextSnapshots(limit) ?? Promise.resolve([]),
        acknowledge: (ids) => this.#evidence?.acknowledgeContextSnapshots(ids) ?? Promise.resolve(),
        id: (snapshot) => snapshot.context_snapshot_id,
        send: (snapshots) =>
          this.#safeSend(() => {
            if (this.#ingest.sendContextSnapshots === undefined) {
              return Promise.resolve({
                status: 'unreachable',
                reason: 'the configured ingest does not support context snapshots',
              } as const);
            }
            return this.#ingest.sendContextSnapshots(snapshots);
          }),
      });
      attempted += snapshotResult.attempted;
      acknowledged += snapshotResult.acknowledged;
      if (snapshotResult.failed !== undefined) {
        return this.#failedResult(boundary, attempted, acknowledged, snapshotResult.failed);
      }
    }

    const remaining = await this.#remaining();
    if (remaining !== 0) {
      this.#everFailed = true;
      return { boundary, attempted, acknowledged, remaining, outcome: 'partial' };
    }
    return { boundary, attempted, acknowledged, remaining: 0, outcome: 'drained' };
  }

  async #drain<T extends PendingDocument>(adapter: QueueAdapter<T>): Promise<DrainResult> {
    let attempted = 0;
    let acknowledged = 0;
    while (true) {
      const pending = await adapter.pending(this.#policy.batchSize);
      if (pending.length === 0) return { attempted, acknowledged };
      attempted += pending.length;

      let outcome: IngestOutcome | undefined;
      for (let attempt = 1; attempt <= this.#policy.maxAttempts; attempt += 1) {
        outcome = await adapter.send(pending);
        if (outcome.status === 'accepted' || outcome.status === 'rejected') break;
        if (attempt < this.#policy.maxAttempts) await this.#sleep(this.#policy.retryDelayMs);
      }

      if (outcome?.status !== 'accepted') {
        const failed = outcome?.status === 'rejected' ? 'rejected' : 'unreachable';
        return {
          attempted,
          acknowledged,
          failed: {
            outcome: failed,
            ...(outcome === undefined ? {} : { reason: outcome.reason }),
          },
        };
      }

      const requested = new Set(pending.map((item) => adapter.id(item)));
      const accepted = [...new Set(outcome.acceptedEventIds)];
      if (accepted.some((id) => !requested.has(id))) {
        return {
          attempted,
          acknowledged,
          failed: {
            outcome: 'unreachable',
            reason: 'ingest acknowledged an id that was not in the request',
          },
        };
      }
      await adapter.acknowledge(accepted);
      acknowledged += accepted.length;
      if (accepted.length !== requested.size) {
        return { attempted, acknowledged, failed: { outcome: 'partial' } };
      }
      // A fully accepted batch may still leave more than batchSize in the queue.
      // Keep draining instead of calling that state COMPLETE or partial.
    }
  }

  async #safeSend(send: () => Promise<IngestOutcome>): Promise<IngestOutcome> {
    try {
      return await send();
    } catch (error) {
      return {
        status: 'unreachable',
        reason: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async #remaining(): Promise<number> {
    const events = (await this.#outbox.pending(Number.MAX_SAFE_INTEGER)).length;
    const evidence = this.#evidence === undefined ? 0 : await this.#evidence.pendingEvidenceCount();
    return events + evidence;
  }

  async #failedResult(
    boundary: FlushBoundary,
    attempted: number,
    acknowledged: number,
    failed: NonNullable<DrainResult['failed']>,
  ): Promise<FlushResult> {
    this.#everFailed = true;
    const remaining = await this.#remaining();
    return {
      boundary,
      attempted,
      acknowledged,
      remaining,
      outcome: failed.outcome,
      ...(failed.reason === undefined ? {} : { lastReason: failed.reason }),
    };
  }

  get mandatoryBoundaries(): readonly FlushBoundary[] {
    return mandatoryBoundaries(this.#sessionKind);
  }
}

export interface RunStateInputs {
  readonly runId: string;
  readonly ingestReachableAtStart: boolean;
  /** Telemetry events plus evidence documents still pending. */
  readonly remaining: number;
  readonly everFailed: boolean;
}

export function runTelemetryState(inputs: RunStateInputs): RunTelemetryState {
  const complete = inputs.remaining === 0 && !inputs.everFailed;
  return runTelemetryStateSchema.parse({
    run_id: inputs.runId,
    telemetry_state: complete ? 'COMPLETE' : 'INCOMPLETE',
    qualification_eligible: complete && inputs.ingestReachableAtStart,
    ingest_reachable_at_start: inputs.ingestReachableAtStart,
  });
}
