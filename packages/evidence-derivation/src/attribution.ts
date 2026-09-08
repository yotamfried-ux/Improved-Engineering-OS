/**
 * The `attribution` deriver, v0 (T-03, D32, P-02, D36).
 *
 * It answers one question: for each asset this run touched, how far did it get?
 * `exposed` (it appeared in a `resolve` result), `inspected` (its body was
 * read), `applied` (an observation was recorded against it). The report's
 * attribution ladder exists because "the asset was returned" and "the asset
 * helped" are different claims, and a system that conflates them scores itself.
 *
 * Three properties are structural rather than conventional:
 *
 *   D36  `origin_class` comes from the Run record, never from an event. The
 *        deriver takes a `RunRecord` and reads it there. A compromised
 *        installation can emit any event it likes and still only ever produce
 *        `operational` evidence, because nothing here consults the events for a
 *        classification.
 *
 *   P-02 `integrity` is stamped from the event's `source.type` and the Run
 *        record, never from event content. An agent saying "the tests passed"
 *        is `agent_runtime`/`reported`; the EOS runtime observing an exit code
 *        is `deterministic_test`/`observed`. No event can claim the higher
 *        grade for itself.
 *
 *   D32  the same deriver over the same events produces the same
 *        `evidence_id` and the same payload apart from `derived_at`. Every
 *        input is an event id, an enum or a digest; nothing here reads a clock
 *        except the caller-supplied `derivedAt`.
 *
 * What v0 deliberately does NOT do: score. `strength.weight` and
 * `strength.confidence` are zero, because a non-zero number invented here would
 * be a scoring decision taken by a deriver rather than by `scoring-policy.yaml`,
 * which the guide places at Stage 10 with the C-05 ladder governing it. The
 * guide's own §5.4 example carries the same zeros.
 */

import {
  evidenceId,
  evidenceSchema,
  sha256Canonical,
  type EvidenceRecord,
  type RunRecord,
  type SourceAuthority,
  type TelemetryEvent,
  type Verification,
} from '@ieos/core';

export const ATTRIBUTION_DERIVER_ID = 'attribution';
/**
 * Bumped whenever the derivation's OUTPUT would change for unchanged input.
 *
 * It is part of `evidence_id` (D32), so a bump makes every row a new row that
 * supersedes rather than silently replaces the old one -- which is the point:
 * changing how evidence is derived must not rewrite what was already derived.
 */
export const ATTRIBUTION_DERIVER_VERSION = '1';

export class DerivationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DerivationError';
  }
}

/** The three rungs this deriver can reach, weakest first. */
export const ATTRIBUTION_LADDER = ['exposed', 'inspected', 'applied'] as const;
export type AttributionExposure = (typeof ATTRIBUTION_LADDER)[number];

/**
 * Which event types advance an asset along the ladder.
 *
 * Read from the event TYPE, not from an attribute, so an agent cannot report
 * that its own event means "applied". The attributes say which asset; the
 * envelope says what happened.
 */
const EXPOSURE_BY_EVENT_TYPE: Readonly<Record<string, AttributionExposure>> = {
  'resolve.response': 'exposed',
  'inspect.request': 'inspected',
  'observe.request': 'applied',
};

/**
 * Integrity grade by event source (P-02).
 *
 * `agent` is what a coding agent reports about itself; `eos` is what this
 * runtime observed with its own process handles. The distance between those two
 * is the entire reason P-02 exists, so it is a table and not a default.
 */
const INTEGRITY_BY_SOURCE: Readonly<
  Record<string, { authority: SourceAuthority; verification: Verification }>
> = {
  agent: { authority: 'agent_runtime', verification: 'reported' },
  tool: { authority: 'agent_runtime', verification: 'reported' },
  eos: { authority: 'deterministic_test', verification: 'observed' },
  ci: { authority: 'ci', verification: 'corroborated' },
};

export interface DeriveAttributionInput {
  /** Every event of one run. Order is not assumed; the deriver imposes D26's. */
  readonly events: readonly TelemetryEvent[];
  /** The trusted classification record (D36). */
  readonly run: RunRecord;
  /** Stamped onto every row and excluded from replay comparison (D32). */
  readonly derivedAt: string;
  /** The derivation each new row supersedes, when this is a re-derivation. */
  readonly supersedesDerivationId?: string | null;
}

/** One asset's evidence, plus the events that produced it. */
export interface AttributionRow {
  readonly evidence: EvidenceRecord;
  readonly assetId: string;
  readonly exposure: AttributionExposure;
  readonly sourceEventIds: readonly string[];
}

/** Rank on the ladder; higher wins. */
function rankOf(exposure: AttributionExposure): number {
  return ATTRIBUTION_LADDER.indexOf(exposure);
}

/**
 * D26's ordering key: (installation_id, emitter_id, sequence).
 *
 * Sorting by time would be wrong and would also be non-deterministic: two
 * emitters produce interleaved and sometimes identical timestamps, so a
 * time-ordered input snapshot would hash differently on two replays of the same
 * events. Ordering is part of the input, so it has to be total.
 */
function inD26Order(events: readonly TelemetryEvent[]): TelemetryEvent[] {
  return [...events].sort((a, b) => {
    if (a.installation_id !== b.installation_id) {
      return a.installation_id < b.installation_id ? -1 : 1;
    }
    if (a.emitter_id !== b.emitter_id) return a.emitter_id < b.emitter_id ? -1 : 1;
    if (a.source.sequence !== b.source.sequence) return a.source.sequence - b.source.sequence;
    // Two events with the same ordering key is a defect upstream; ties break on
    // the id so the result is still total and still reproducible.
    return a.event_id < b.event_id ? -1 : a.event_id > b.event_id ? 1 : 0;
  });
}

/**
 * The hash D32 calls `input_snapshot_hash`.
 *
 * Over the ordered set of source event ids plus any external inputs (CI
 * conclusions, review states) the derivation consumed. v0 consumes no external
 * inputs and says so explicitly rather than omitting the field: an absent key
 * and an empty list would hash differently once Stage 7 adds them, and a
 * derivation whose id silently changed with the code would break replay.
 */
export function inputSnapshotHash(inputs: {
  readonly eventIds: readonly string[];
  readonly external?: readonly string[];
}): string {
  return sha256Canonical({
    event_ids: [...inputs.eventIds],
    external_inputs: [...(inputs.external ?? [])],
  });
}

/**
 * D32's `input_watermark`: the latest `ingested_at` consumed.
 *
 * Always null here, and null is the honest answer rather than a missing
 * feature. This deriver runs locally over the outbox (the Stage 2 deliverable
 * says exactly that), and `ingested_at` is `z.null()` in the envelope by
 * construction -- only the Evidence Plane may stamp it. So no event this deriver
 * can see has ever been ingested, and a watermark is a claim about ingestion.
 *
 * Stage 7's server-side Deriver reads rows that HAVE been ingested and will
 * compute a real one. Written as a named function rather than a literal so that
 * change has an obvious place to happen, and so the reason is here rather than
 * inferred from a `null`.
 */
function watermarkOf(_events: readonly TelemetryEvent[]): string | null {
  return null;
}

/**
 * Derive attribution evidence for one run.
 *
 * One row per asset, not one per event: the question is how far each asset got,
 * and a row per event would make a chatty session look like more evidence than
 * a quiet one.
 */
export function deriveAttribution(input: DeriveAttributionInput): readonly AttributionRow[] {
  const ordered = inD26Order(input.events);
  const foreign = ordered.find((event) => event.run_id !== input.run.run_id);
  if (foreign !== undefined) {
    // Deriving across runs would let one run's events be classified by another
    // run's record, which is exactly the authority D36 protects.
    throw new DerivationError(
      `event ${foreign.event_id} belongs to run ${foreign.run_id}, not ${input.run.run_id}`,
    );
  }

  interface Accumulator {
    exposure: AttributionExposure;
    eventIds: string[];
    events: TelemetryEvent[];
  }
  const bySubject = new Map<string, Accumulator>();

  for (const event of ordered) {
    const exposure = EXPOSURE_BY_EVENT_TYPE[event.event_type];
    if (exposure === undefined) continue;
    const assetId = event.attributes['asset.id'];
    // An event that names no asset carries no attribution. Silently skipped
    // rather than treated as an error: a run emits plenty of events that are
    // not about an asset, and this deriver is not the one that judges them.
    if (typeof assetId !== 'string' || assetId.length === 0) continue;

    const existing = bySubject.get(assetId);
    if (existing === undefined) {
      bySubject.set(assetId, { exposure, eventIds: [event.event_id], events: [event] });
      continue;
    }
    existing.eventIds.push(event.event_id);
    existing.events.push(event);
    // The ladder only goes up. An `inspect` after an `observe` does not demote
    // the asset back to "inspected"; the run still applied it.
    if (rankOf(exposure) > rankOf(existing.exposure)) existing.exposure = exposure;
  }

  const rows: AttributionRow[] = [];
  const seenIds = new Set<string>();
  // Sorted by asset id so the output order is a property of the data rather
  // than of Map insertion, which follows event order.
  for (const assetId of [...bySubject.keys()].sort()) {
    const accumulated = bySubject.get(assetId) as Accumulator;
    const snapshotHash = inputSnapshotHash({ eventIds: accumulated.eventIds });
    const id = evidenceId({
      run_id: input.run.run_id,
      deriver_id: ATTRIBUTION_DERIVER_ID,
      deriver_version: ATTRIBUTION_DERIVER_VERSION,
      input_snapshot_hash: snapshotHash,
    });
    if (seenIds.has(id)) {
      // Two subjects hashing to one id would mean two rows sharing an identity,
      // and the later one would look like a supersession of the earlier. It
      // cannot happen while event ids are unique per event -- which is exactly
      // why it is checked rather than assumed.
      throw new DerivationError(
        `two subjects derived the same evidence_id ${id}; the input snapshots collided`,
      );
    }
    seenIds.add(id);

    // The strongest source among the events that produced this row. An asset
    // the runtime observed being applied is not downgraded by also having
    // appeared in a resolve the agent reported.
    const integrity = strongestIntegrity(accumulated.events);

    const evidence = evidenceSchema.parse({
      schema_version: '1',
      stability: 'development',
      introduced_in: '0.1.0',
      deprecated_in: null,
      replacement: null,
      migration_path: null,

      evidence_id: id,
      subject: { type: 'asset', id: assetId },
      // Not `success` and not `failure`: exposure is not an outcome, and
      // claiming one from events that do not carry it is the failure mode this
      // whole ladder exists to prevent.
      kind: 'partial',
      origin_class: input.run.origin_class,
      holdout_state: input.run.holdout_state,
      // Everything from one run shares a group: two rows produced by the same
      // agent session are not two independent observations.
      independence_group: `ig:run:${input.run.run_id}`,
      strength: { polarity: 'neutral', weight: 0, confidence: 0 },
      attribution: {
        exposure: accumulated.exposure,
        source_event_ids: accumulated.eventIds,
        trace_id: accumulated.events[0]?.trace.trace_id ?? input.run.run_id,
      },
      integrity,
      derivation: {
        deriver_id: ATTRIBUTION_DERIVER_ID,
        deriver_version: ATTRIBUTION_DERIVER_VERSION,
        input_snapshot_hash: snapshotHash,
        input_watermark: watermarkOf(accumulated.events),
        derived_at: input.derivedAt,
        supersedes_derivation_id: input.supersedesDerivationId ?? null,
      },
      revision: { repo_sha: accumulated.events[0]?.revision.repo_sha ?? '' },
      // D27 scoping is Stage 7's. An empty scope claims nothing about what
      // would invalidate this row, which is the truthful v0 answer; inventing
      // path globs here would assert a staleness rule nobody decided.
      scope: { paths: [], depends_on: [], max_age_days: null },
    }) as EvidenceRecord;

    rows.push({
      evidence,
      assetId,
      exposure: accumulated.exposure,
      sourceEventIds: accumulated.eventIds,
    });
  }
  return rows;
}

/** The highest integrity grade among a row's source events (P-02). */
function strongestIntegrity(events: readonly TelemetryEvent[]): {
  source_authority: SourceAuthority;
  verification: Verification;
} {
  const order: readonly Verification[] = [
    'reported',
    'observed',
    'corroborated',
    'externally_verified',
  ];
  let best = INTEGRITY_BY_SOURCE['agent'] as {
    authority: SourceAuthority;
    verification: Verification;
  };
  let bestRank = -1;
  for (const event of events) {
    const graded = INTEGRITY_BY_SOURCE[event.source.type];
    if (graded === undefined) continue;
    const rank = order.indexOf(graded.verification);
    if (rank > bestRank) {
      bestRank = rank;
      best = graded;
    }
  }
  return { source_authority: best.authority, verification: best.verification };
}
