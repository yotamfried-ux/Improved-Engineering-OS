/**
 * The event emitter: envelope construction and the sequence that orders it
 * (guide §5.3, D23, D26, R-11).
 *
 * One emitter is one process working on one run. That is not a coding
 * convenience; it is what makes `(installation_id, emitter_id, sequence)` an
 * ordering at all (D26). Wall-clock time is not one -- two processes on one
 * machine produce interleaved, sometimes identical timestamps, and R-11 records
 * `emitter_id` precisely because ordering broke without it.
 *
 * What the emitter cannot do is as important as what it does. There is no way
 * to set `origin_class` (D36 gives classification to a service principal and the
 * ingest function stamps it from the Run record), and no way to set
 * `ingested_at` (only the plane may stamp it). Neither is enforced by review:
 * the envelope schema is `.strict()` and this file never offers the parameter.
 */

import {
  looksLikeSecret,
  mintId,
  telemetryEnvelopeSchema,
  type Clock,
  type EventType,
  type RandomSource,
  type SessionKind,
  type TelemetryEvent,
} from '@ieos/core';
import {
  dropCounts,
  sanitizeAttributes,
  type AttributeRegistry,
  type DroppedAttribute,
} from './attributes.ts';

export class EmitterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EmitterError';
  }
}

/** The facts that are fixed for the whole run, established once at SessionStart. */
export interface EmitterIdentity {
  readonly project_id: string;
  readonly work_id: string;
  readonly run_id: string;
  readonly installation_id: string;
  readonly session_kind: SessionKind;
  readonly repo_sha: string;
  readonly eos_release: string;
  readonly harness: {
    readonly agent: string;
    readonly model: string;
    readonly adapter_version: string;
    readonly available_capabilities_hash: string;
  };
}

export interface EmitOptions {
  readonly eventType: EventType;
  readonly sourceType: 'agent' | 'tool' | 'ci' | 'eos';
  readonly attributes?: unknown;
  /**
   * When the thing being reported actually happened, if that is not now.
   *
   * `observed_at` is always the emitter's own clock: the difference between the
   * two is the whole reason the envelope carries both, and letting a caller set
   * `observed_at` would make the pair meaningless.
   */
  readonly occurredAt?: string;
  readonly traceId?: string;
  readonly spanId?: string;
  readonly parentSpanId?: string | null;
}

export interface EmitResult {
  readonly event: TelemetryEvent;
  /** Attributes the sanitizer refused, so instrumentation bugs are visible. */
  readonly dropped: readonly DroppedAttribute[];
}

/**
 * Builds envelopes for one run, in one process.
 *
 * Construction is separate from queueing on purpose: this class produces a
 * validated envelope and nothing else, so the flush strategy can decide what
 * happens to it without the envelope's correctness depending on that decision.
 */
export class Emitter {
  readonly #identity: EmitterIdentity;
  readonly #registry: AttributeRegistry;
  readonly #clock: Clock;
  readonly #random: RandomSource;
  readonly #emitterId: string;
  readonly #traceId: string;
  #sequence = 0;

  constructor(options: {
    readonly identity: EmitterIdentity;
    readonly registry: AttributeRegistry;
    readonly clock: Clock;
    readonly random: RandomSource;
    /** Supplied only where the emitter id comes from elsewhere, as in a test. */
    readonly emitterId?: string;
    readonly traceId?: string;
  }) {
    this.#identity = options.identity;
    this.#registry = options.registry;
    this.#clock = options.clock;
    this.#random = options.random;
    this.#emitterId = options.emitterId ?? mintId('emt', options.clock, options.random);
    this.#traceId = options.traceId ?? mintId('run', options.clock, options.random);
    for (const [field, value] of Object.entries(options.identity)) {
      // A credential that reached the identity would be stamped onto every
      // event of the run, which is the widest possible blast radius for the
      // smallest possible mistake. Checked once, here, rather than per event.
      if (looksLikeSecret(value)) {
        throw new EmitterError(`run identity field ${field} holds a credential-shaped value`);
      }
    }
  }

  get emitterId(): string {
    return this.#emitterId;
  }

  /** The next sequence number this emitter will use. Read by tests and doctor. */
  get nextSequence(): number {
    return this.#sequence;
  }

  emit(options: EmitOptions): EmitResult {
    const { attributes, dropped } = sanitizeAttributes(options.attributes, this.#registry);
    const observedAt = this.#clock.nowIso();
    const event = telemetryEnvelopeSchema.parse({
      schema_version: '1',
      stability: 'development',
      introduced_in: '0.1.0',
      deprecated_in: null,
      replacement: null,
      migration_path: null,

      event_id: mintId('evt', this.#clock, this.#random),
      event_type: options.eventType,

      project_id: this.#identity.project_id,
      work_id: this.#identity.work_id,
      run_id: this.#identity.run_id,
      installation_id: this.#identity.installation_id,
      emitter_id: this.#emitterId,
      session_kind: this.#identity.session_kind,

      trace: {
        trace_id: options.traceId ?? this.#traceId,
        span_id: options.spanId ?? mintId('evt', this.#clock, this.#random),
        parent_span_id: options.parentSpanId ?? null,
        links: [],
      },
      time: {
        occurred_at: options.occurredAt ?? observedAt,
        observed_at: observedAt,
        // Only the Evidence Plane may stamp this. A client-supplied ingest time
        // would make the investigation timeline a claim rather than a record.
        ingested_at: null,
      },
      source: { type: options.sourceType, sequence: this.#sequence },
      revision: {
        repo_sha: this.#identity.repo_sha,
        eos_release: this.#identity.eos_release,
      },
      harness: this.#identity.harness,
      attributes,
    });
    // Incremented only after the envelope validated. A rejected envelope must
    // not consume a sequence number, or the plane sees a gap and cannot tell it
    // from a lost event.
    this.#sequence += 1;
    return { event, dropped };
  }

  /** Drop counts across a set of results, for the D26 counter. */
  static droppedSummary(results: readonly EmitResult[]): Record<string, number> {
    return dropCounts(results.flatMap((result) => result.dropped));
  }
}
