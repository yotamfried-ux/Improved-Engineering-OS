/**
 * Telemetry envelope -- guide section 5.3, D11, D23, D26, R-11, TD-05, TD-06.
 *
 * The single most important property of this contract is what it does NOT
 * contain: `origin_class`. D36 gives run classification to a service principal;
 * the ingest function stamps it from the Run record. Combined with `.strict()`,
 * a client literally cannot express a classification, so a compromised
 * installation cannot pose as `qualification` or `holdout` evidence. That is a
 * security boundary held by a schema rather than by a code review.
 *
 * `attributes` is likewise constrained: values are scalars only, so a prompt
 * fragment or a nested credential object cannot ride along inside a structured
 * value. TD-06 records that this repository already learned only an allowlist
 * reconstruction is safe; `contracts/telemetry-attributes.yaml` carries the
 * allowlist and the exporter reconstructs from it.
 */

import { z } from 'zod';
import { isoInstantSchema, lifecycleFields, openEnum } from './lifecycle.ts';

export const sessionKindSchema = z.enum(['local_persistent', 'remote_ephemeral', 'ci']);
export type SessionKind = z.infer<typeof sessionKindSchema>;

export const telemetrySourceTypeSchema = z.enum(['agent', 'tool', 'ci', 'eos']);

/**
 * Event types are an open vocabulary: an older runtime must tolerate an event
 * type a newer one emits rather than dropping the run.
 */
export const eventTypeSchema = openEnum([
  'session.start',
  'session.end',
  'tool.call',
  'tool.result',
  'resolve.request',
  'resolve.response',
  'inspect.request',
  'expand.request',
  'observe.request',
  'test.run',
  'error',
]);

export const traceSchema = z.object({
  trace_id: z.string().min(1),
  span_id: z.string().min(1),
  parent_span_id: z.string().min(1).nullable(),
  links: z.array(z.string().min(1)),
});

/**
 * Three lifecycle times (report: "occurred, observed, ingested").
 *
 * `ingested_at` is null on the client by construction: only the Evidence Plane
 * may stamp it. A client-supplied ingest time would make the investigation
 * timeline a claim rather than a record.
 */
export const telemetryTimeSchema = z.object({
  occurred_at: isoInstantSchema,
  observed_at: isoInstantSchema,
  ingested_at: z.null(),
});

/**
 * Scalars only. No nested objects, no arrays.
 *
 * A nested value is where an unsanitized prompt or a credential blob would hide
 * from an allowlist that only inspects top-level keys.
 */
export const attributeValueSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);

export const telemetryEnvelopeSchema = z
  .object({
    ...lifecycleFields,

    /** Idempotency key; UNIQUE in the outbox and in the plane (D26). */
    event_id: z.string().min(1),
    event_type: eventTypeSchema,

    project_id: z.string().min(1),
    work_id: z.string().min(1),
    run_id: z.string().min(1),

    installation_id: z.string().min(1),
    /** Unique per process/run emitter; without it, ordering breaks under concurrency (R-11). */
    emitter_id: z.string().min(1),
    session_kind: sessionKindSchema,

    trace: traceSchema,
    time: telemetryTimeSchema,

    /** Ordering key is (installation_id, emitter_id, sequence). */
    source: z.object({
      type: telemetrySourceTypeSchema,
      sequence: z.int().nonnegative(),
    }),

    revision: z.object({
      repo_sha: z.string().min(1),
      eos_release: z.string().min(1),
    }),

    harness: z.object({
      agent: z.string().min(1),
      model: z.string().min(1),
      adapter_version: z.string().min(1),
      available_capabilities_hash: z.string().min(1),
    }),

    attributes: z.record(z.string().min(1), attributeValueSchema),
  })
  .strict();

export type TelemetryEvent = z.infer<typeof telemetryEnvelopeSchema>;

/**
 * Run-level state written by the runtime, not carried on events (guide 5.3).
 *
 * D23: telemetry loss must never look like a measured run. The invariant below
 * makes that structural -- `telemetry_state: INCOMPLETE` forces
 * `qualification_eligible: false`, so no code path can mark an incomplete run
 * eligible.
 */
export const runTelemetryStateSchema = z
  .object({
    run_id: z.string().min(1),
    telemetry_state: z.enum(['COMPLETE', 'INCOMPLETE']),
    qualification_eligible: z.boolean(),
    /** Declared up front at SessionStart, not inferred afterwards (D23). */
    ingest_reachable_at_start: z.boolean(),
  })
  .strict()
  .superRefine((state, ctx) => {
    if (state.telemetry_state === 'INCOMPLETE' && state.qualification_eligible) {
      ctx.addIssue({
        code: 'custom',
        path: ['qualification_eligible'],
        message:
          'an INCOMPLETE run is never qualification-eligible; ' +
          'telemetry loss must not look like a measured run (D23)',
      });
    }
  });

export type RunTelemetryState = z.infer<typeof runTelemetryStateSchema>;
