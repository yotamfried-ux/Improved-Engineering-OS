/**
 * Ports -- the only way domain code reaches I/O (guide section 3, R-05).
 *
 * These are interfaces and nothing else. `packages/core` never implements one;
 * `store-sqlite`, `store-supabase` and the adapters will. That direction is what
 * keeps Assurance and evidence derivation independent of whether the Evidence
 * Plane is reachable, which was the whole point of R-05.
 *
 * Two of them, `Clock` and `RandomSource`, exist so that identifier minting and
 * anything time-dependent are deterministic under test. Nothing in `core` reads
 * the wall clock or the system CSPRNG directly.
 */

import type { EvidenceRecord } from '../contracts/evidence.ts';
import type { TelemetryEvent } from '../contracts/telemetry.ts';
import type { InspectSnapshotResponse, Observation } from '../contracts/agent-contract.ts';
import type { AssetRecord } from '../contracts/asset.ts';
import type { SolutionSetRecord } from '../contracts/solution-set.ts';
import type { ScoreSnapshot } from '../contracts/score-view.ts';
import type { RunRecord } from '../contracts/runs.ts';

// ---------------------------------------------------------------------------
// Determinism ports
// ---------------------------------------------------------------------------

export interface Clock {
  /** Milliseconds since the Unix epoch. */
  nowMs(): number;
  /** The same instant as an ISO-8601 string; contracts carry ISO strings, never `Date`. */
  nowIso(): string;
}

export interface RandomSource {
  /** Exactly `length` cryptographically random bytes. */
  bytes(length: number): Uint8Array;
}

export interface IdMinter {
  /** Mint an opaque prefixed ULID identity (D19). */
  mint(prefix: string): string;
}

// ---------------------------------------------------------------------------
// Knowledge
// ---------------------------------------------------------------------------

/**
 * Read-only access to the compiled release index.
 *
 * Read-only is structural, not a convention: there is no write method, so F3
 * ("runtime code never mutates canonical knowledge") cannot be violated through
 * this port at all.
 */
export interface KnowledgeIndex {
  getAsset(id: string): Promise<AssetRecord | undefined>;
  getSolutionSet(id: string): Promise<SolutionSetRecord | undefined>;
  /**
   * The score snapshot shipped with the release (D24).
   *
   * Champion identity is deliberately absent from the snapshot: it comes from
   * the release index (D34, C-01), so no code path can substitute a
   * highest-scoring asset for a null champion (F11).
   */
  getScoreSnapshot(): Promise<ScoreSnapshot>;
  /**
   * Full-text search over the compiled index (D20.2: FTS5 over title, summary,
   * tags and body).
   *
   * Returns matches in a deterministic order with their raw relevance rank. It
   * deliberately does NOT rank in the D20.3 sense: capability/problem matching,
   * Project Fit filtering, Champion selection and score tie-breaks belong to
   * `packages/resolver` at Stage 2. Keeping retrieval and ranking apart is what
   * lets the resolver be tested without a database and the index be tested
   * without a ranking policy.
   */
  searchAssets(query: string, limit: number): Promise<readonly AssetSearchHit[]>;

  /**
   * The asset's body text (D20.1: `inspect` returns metadata + body, `resolve`
   * returns metadata + `summary` only).
   *
   * Separate from `getAsset` rather than a field on the record, because the two
   * have different costs and different callers: `resolve` must never pay for a
   * body it is contractually forbidden to return.
   */
  getAssetBody(id: string): Promise<string | undefined>;

  /** Every solution set in the index, ordered by id. */
  listSolutionSets(): Promise<readonly SolutionSetRecord[]>;

  /** Digest of the compiled index, part of `context_snapshot_id`. */
  indexDigest(): Promise<string>;
}

/**
 * One full-text match.
 *
 * `rank` is the index's own relevance number, carried through unchanged and
 * explicitly not a score: D24 scores come from the Effective Score View, and
 * conflating the two is how a retrieval detail would quietly become evidence.
 */
export interface AssetSearchHit {
  readonly asset: AssetRecord;
  readonly rank: number;
}

// ---------------------------------------------------------------------------
// Telemetry and local evidence
// ---------------------------------------------------------------------------

/**
 * Durable local queue for telemetry (D23, D26).
 *
 * Events are deleted from the delivery queue only after durable acknowledgement.
 * Implementations may retain a separate immutable local history for investigation.
 * `append` is idempotent on `event_id`.
 */
export interface Outbox {
  append(event: TelemetryEvent): Promise<{ readonly appended: boolean }>;
  pending(limit: number): Promise<readonly TelemetryEvent[]>;
  /** How many events are still undelivered, without materializing them. */
  pendingCount(): Promise<number>;
  acknowledge(eventIds: readonly string[]): Promise<void>;
}

/**
 * The content-addressed snapshot document persisted beside telemetry.
 *
 * `run_id` records the first run that caused this content document to be staged.
 * Reuse by later runs is represented by their `resolve.response` telemetry event,
 * which carries `context_snapshot.id`; the snapshot id itself is a hash of the
 * decision inputs and therefore intentionally does not change per run.
 */
export type ContextSnapshotDocument = InspectSnapshotResponse & {
  readonly context_snapshot_id: string;
  readonly run_id: string;
};

/** Durable read/write access needed by the MCP adapter. */
export interface ContextSnapshotStore {
  recordContextSnapshot(
    snapshot: ContextSnapshotDocument,
  ): Promise<{ readonly status: 'recorded' | 'duplicate' }>;
  getContextSnapshot(contextSnapshotId: string): Promise<ContextSnapshotDocument | undefined>;
}

/**
 * The local Evidence Plane staging queue.
 *
 * Rows survive acknowledgement. Pending methods expose only rows not yet proven
 * durable remotely, while the read methods retain the local copy for restart-safe
 * `inspect` and investigation. This is local evidence plumbing, never canonical Git.
 */
export interface EvidenceQueue extends Staging, ContextSnapshotStore {
  pendingObservations(limit: number): Promise<readonly Observation[]>;
  pendingContextSnapshots(limit: number): Promise<readonly ContextSnapshotDocument[]>;
  acknowledgeObservations(observationIds: readonly string[]): Promise<void>;
  acknowledgeContextSnapshots(contextSnapshotIds: readonly string[]): Promise<void>;
  pendingEvidenceCount(): Promise<number>;
}

export type IngestOutcome =
  | { readonly status: 'accepted'; readonly acceptedEventIds: readonly string[] }
  | { readonly status: 'rejected'; readonly reason: string }
  | { readonly status: 'unreachable'; readonly reason: string };

/**
 * The client side of the `ingest` Edge Function (D22).
 *
 * Note what is absent: no `origin_class` parameter anywhere. D36 gives run
 * classification to a service principal, and the server stamps it from the Run
 * record. A client cannot express a classification through this port, so a
 * compromised installation cannot pose as `qualification` or `holdout` evidence.
 *
 * `acceptedEventIds` is the historical outcome field name. For observations and
 * context snapshots it carries the accepted document ids; callers must still
 * acknowledge only ids the server named explicitly.
 */
export interface Ingest {
  sendEvents(events: readonly TelemetryEvent[]): Promise<IngestOutcome>;
  sendObservations(observations: readonly Observation[]): Promise<IngestOutcome>;
  /** Optional for old adapters; a queue with snapshots must fail closed when absent. */
  sendContextSnapshots?(snapshots: readonly ContextSnapshotDocument[]): Promise<IngestOutcome>;
  /** Health, score overlay, own-run status. Never a general query. */
  readMinimal(kind: string): Promise<unknown>;
  /** Checked at SessionStart so run eligibility is declared up front (D23). */
  isReachable(): Promise<boolean>;
}

/**
 * The local encoding of `Ingest`, for when the implementation is out of process.
 *
 * Declared here rather than in an agent's adapter because it is agent-neutral:
 * any adapter running inside an isolated trial needs it, and the reason it exists
 * belongs to the port, not to one agent. A trial may not hold the plane's
 * credential (ADR-0005) and its network policy does not reach the plane, so the
 * only way its hooks can deliver in band -- and therefore the only way a run can
 * honestly end COMPLETE -- is to ask a privileged process on the other side of a
 * socket and relay the plane's own answer.
 *
 * A closed operation list, deliberately. Nothing here can name a credential, an
 * endpoint or a run class, so widening it is the only way to lose the property
 * that makes the arrangement safe.
 */
export type ProxyRequest =
  | { readonly op: 'sendEvents'; readonly events: readonly TelemetryEvent[] }
  | { readonly op: 'sendObservations'; readonly observations: readonly Observation[] }
  | { readonly op: 'sendContextSnapshots'; readonly snapshots: readonly ContextSnapshotDocument[] }
  | { readonly op: 'readMinimal'; readonly kind: string }
  | { readonly op: 'isReachable' };

export type ProxyResponse =
  | { readonly ok: true; readonly outcome: IngestOutcome }
  | { readonly ok: true; readonly value: unknown }
  | { readonly ok: true; readonly reachable: boolean }
  | { readonly ok: false; readonly reason: string };

// ---------------------------------------------------------------------------
// Evidence Plane (server-side only)
// ---------------------------------------------------------------------------

/**
 * Server-side evidence access. Implemented only by `store-supabase` and used
 * only by the Deriver and Curator. Nothing on an agent machine holds this.
 */
export interface EvidenceRepository {
  getEvidence(evidenceId: string): Promise<EvidenceRecord | undefined>;
  listEvidenceForSubject(
    subjectType: string,
    subjectId: string,
  ): Promise<readonly EvidenceRecord[]>;
  /** Supersession, never overwrite (D32). */
  writeDerivation(evidence: EvidenceRecord): Promise<void>;
  getRun(runId: string): Promise<RunRecord | undefined>;
}

/** Staging: observations, candidates, promotion proposals. Never in Git (F3). */
export interface Staging {
  recordObservation(
    observation: Observation,
  ): Promise<{ readonly status: 'recorded' | 'duplicate' }>;
  listOpenProposals(): Promise<readonly unknown[]>;
}
