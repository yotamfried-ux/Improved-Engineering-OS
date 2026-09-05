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
import type { Observation } from '../contracts/agent-contract.ts';
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
// Telemetry
// ---------------------------------------------------------------------------

/**
 * Durable local queue for telemetry (D23, D26).
 *
 * Events are deleted only after durable acknowledgement, per the constitution's
 * data lifecycle. `append` is idempotent on `event_id`.
 */
export interface Outbox {
  append(event: TelemetryEvent): Promise<{ readonly appended: boolean }>;
  pending(limit: number): Promise<readonly TelemetryEvent[]>;
  acknowledge(eventIds: readonly string[]): Promise<void>;
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
 */
export interface Ingest {
  sendEvents(events: readonly TelemetryEvent[]): Promise<IngestOutcome>;
  sendObservations(observations: readonly Observation[]): Promise<IngestOutcome>;
  /** Health, score overlay, own-run status. Never a general query. */
  readMinimal(kind: string): Promise<unknown>;
  /** Checked at SessionStart so run eligibility is declared up front (D23). */
  isReachable(): Promise<boolean>;
}

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
