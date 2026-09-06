/**
 * Flush strategy and run state (D23).
 *
 * D23 gives one rule that everything here serves: **telemetry loss must never
 * look like a measured run.** Not "should be avoided" -- must never look like.
 * That makes the interesting path the failing one. When every retry has failed,
 * the correct outcome is not an error the caller can swallow; it is a run marked
 * `telemetry_state: INCOMPLETE` with `qualification_eligible: false`, and coding
 * that continues regardless.
 *
 * The two failure directions are deliberately asymmetric:
 *
 *   ingest is down     the run is INCOMPLETE. Work continues, nothing is
 *                      written to Git, and no measurement claims the run.
 *   flush blocks       never. A terminal hook that hung would make the agent's
 *                      session hang, so timeouts are short and retries bounded.
 *
 * `local_persistent` and `remote_ephemeral` differ only in when a flush is
 * mandatory, not in what a failed flush means. A laptop can retry later because
 * its outbox file will still be there; a container that is about to be
 * destroyed cannot, so a boundary flush is its last chance and its failure is
 * final. The container case is the Stage 2 mandatory scenario: killed right
 * after the last tool call, either the events arrive or the run is INCOMPLETE --
 * never silently "complete".
 */

import { runTelemetryStateSchema } from '@ieos/core';
import type { Ingest, IngestOutcome, Outbox, RunTelemetryState, SessionKind } from '@ieos/core';

/** Terminal boundaries, where an ephemeral session must flush synchronously. */
export type FlushBoundary = 'stop' | 'session_end' | 'interval' | 'manual';

export interface FlushPolicy {
  /** Events per request. Bounded so one oversized batch cannot fail them all. */
  readonly batchSize: number;
  /** Attempts per boundary, including the first. Bounded, per D23. */
  readonly maxAttempts: number;
  /** Milliseconds between attempts. */
  readonly retryDelayMs: number;
}

/**
 * Defaults sized for a terminal hook, not for a background sync.
 *
 * Three attempts a second apart is at most a couple of seconds added to session
 * teardown. Generous retries here would trade a bounded delay for an unbounded
 * one at the exact moment the container is being torn down anyway.
 */
export const DEFAULT_FLUSH_POLICY: FlushPolicy = {
  batchSize: 100,
  maxAttempts: 3,
  retryDelayMs: 1000,
};

export interface FlushResult {
  readonly boundary: FlushBoundary;
  readonly attempted: number;
  readonly acknowledged: number;
  /** Still queued after this flush: zero means the outbox drained. */
  readonly remaining: number;
  readonly outcome: 'drained' | 'partial' | 'unreachable' | 'rejected';
  readonly lastReason?: string;
}

/** Which boundaries force a synchronous flush, by session kind (D23). */
export function mandatoryBoundaries(kind: SessionKind): readonly FlushBoundary[] {
  switch (kind) {
    // A discardable container has no "later": Stop and SessionEnd are the last
    // moments its outbox exists at all.
    case 'remote_ephemeral':
      return ['stop', 'session_end', 'interval'];
    // CI is ephemeral too, and its run ends when the job does.
    case 'ci':
      return ['stop', 'session_end'];
    // A laptop keeps its outbox file. Background sync may pick it up later, so
    // only the end of the session is a hard boundary.
    case 'local_persistent':
      return ['session_end'];
  }
}

export interface FlusherOptions {
  readonly outbox: Outbox;
  readonly ingest: Ingest;
  readonly sessionKind: SessionKind;
  readonly policy?: FlushPolicy;
  /** Injected so a test never waits a real second. */
  readonly sleep?: (ms: number) => Promise<void>;
}

/**
 * Drains the outbox into the Evidence Plane.
 *
 * Never throws for an ingest failure. A telemetry exception escaping into an
 * agent hook would turn an observability problem into a coding outage, and D23
 * is explicit that coding continues.
 */
export class Flusher {
  readonly #outbox: Outbox;
  readonly #ingest: Ingest;
  readonly #sessionKind: SessionKind;
  readonly #policy: FlushPolicy;
  readonly #sleep: (ms: number) => Promise<void>;
  #everFailed = false;

  constructor(options: FlusherOptions) {
    this.#outbox = options.outbox;
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

  /** True once any flush has failed to drain, which no later success erases. */
  get everFailed(): boolean {
    return this.#everFailed;
  }

  async flush(boundary: FlushBoundary): Promise<FlushResult> {
    const pending = await this.#outbox.pending(this.#policy.batchSize);
    if (pending.length === 0) {
      return { boundary, attempted: 0, acknowledged: 0, remaining: 0, outcome: 'drained' };
    }

    let outcome: IngestOutcome | undefined;
    for (let attempt = 1; attempt <= this.#policy.maxAttempts; attempt += 1) {
      outcome = await this.#send(pending);
      if (outcome.status === 'accepted') break;
      // A rejection is the plane saying no, not the network saying nothing.
      // Retrying it would send the same rejected batch again for no reason.
      if (outcome.status === 'rejected') break;
      if (attempt < this.#policy.maxAttempts) await this.#sleep(this.#policy.retryDelayMs);
    }

    if (outcome?.status === 'accepted') {
      await this.#outbox.acknowledge(outcome.acceptedEventIds);
      const remaining = (await this.#outbox.pending(1)).length;
      // A partial acceptance leaves the rest queued rather than dropping it:
      // the ids the plane named are the only ones proven durable.
      const drained = outcome.acceptedEventIds.length === pending.length && remaining === 0;
      if (!drained) this.#everFailed = true;
      return {
        boundary,
        attempted: pending.length,
        acknowledged: outcome.acceptedEventIds.length,
        remaining,
        outcome: drained ? 'drained' : 'partial',
      };
    }

    this.#everFailed = true;
    const remaining = (await this.#outbox.pending(this.#policy.batchSize)).length;
    // `outcome` is set unless maxAttempts was non-positive, which the policy
    // forbids; treated as unreachable rather than asserted, because the safe
    // reading of "we do not know what happened" is "it did not arrive".
    const failed = outcome?.status === 'rejected' ? 'rejected' : 'unreachable';
    return {
      boundary,
      attempted: pending.length,
      acknowledged: 0,
      remaining,
      outcome: failed,
      ...(outcome === undefined ? {} : { lastReason: outcome.reason }),
    };
  }

  /**
   * One send attempt, with an ingest failure turned into an outcome.
   *
   * A thrown transport error and an `unreachable` outcome are the same event as
   * far as the run is concerned, and only one of them is in the port's type.
   */
  async #send(events: Parameters<Ingest['sendEvents']>[0]): Promise<IngestOutcome> {
    try {
      return await this.#ingest.sendEvents(events);
    } catch (error) {
      return {
        status: 'unreachable',
        reason: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /** The boundaries this session kind must flush at synchronously. */
  get mandatoryBoundaries(): readonly FlushBoundary[] {
    return mandatoryBoundaries(this.#sessionKind);
  }
}

export interface RunStateInputs {
  readonly runId: string;
  /** Declared up front at SessionStart, not inferred afterwards (D23). */
  readonly ingestReachableAtStart: boolean;
  /** Events still queued when the run ended. */
  readonly remaining: number;
  /** Whether any flush during the run failed to drain. */
  readonly everFailed: boolean;
}

/**
 * The run-level state the runtime writes (guide §5.3).
 *
 * Note what makes a run INCOMPLETE. Not only "events are still queued at the
 * end" but also "a flush failed at any point", because a batch that failed and
 * was later re-sent by a different process is not something this run observed.
 * And a run that could not reach ingest at SessionStart was never eligible in
 * the first place -- D23 requires eligibility declared before work starts,
 * precisely so it cannot be decided afterwards by how the run happened to go.
 *
 * `qualification_eligible` is derived, never passed in. The contract's own
 * invariant forbids an INCOMPLETE run from being eligible, and computing it
 * here means no caller can be the one that gets it wrong.
 */
export function runTelemetryState(inputs: RunStateInputs): RunTelemetryState {
  const complete = inputs.remaining === 0 && !inputs.everFailed;
  return runTelemetryStateSchema.parse({
    run_id: inputs.runId,
    telemetry_state: complete ? 'COMPLETE' : 'INCOMPLETE',
    qualification_eligible: complete && inputs.ingestReachableAtStart,
    ingest_reachable_at_start: inputs.ingestReachableAtStart,
  });
}
