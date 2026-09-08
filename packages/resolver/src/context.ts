/**
 * The situation a `resolve` happened in (D25, T-05, P-03).
 *
 * Moved here from `adapters/mcp` at Stage 2. It sat in the adapter only while
 * no resolver existed; a context snapshot records *why a decision came out the
 * way it did*, which is knowledge semantics, and F2 says adapters own none.
 *
 * `context_snapshot_id` is a hash of eight inputs. Some of them -- the Project
 * Profile digest, the capability snapshot -- belong to stages that have not
 * arrived, and the temptation is to hash a zero or an empty string in their
 * place. That would produce an id that looks like every other id while standing
 * for less, which is exactly the failure D23 forbids in telemetry and the same
 * failure here: a measurement that cannot be told apart from a real one.
 *
 * So an input this stage cannot observe carries a declared `unobserved:` value
 * naming why. The id stays deterministic and reproducible; what it is an id
 * *of* stays legible; and `inspect` of the snapshot handle hands the inputs
 * back, so the declaration is visible to the caller rather than buried here.
 */

import { contextSnapshotId, type RankingMode } from '@ieos/core';

/**
 * Marks an input this stage cannot observe.
 *
 * `unobserved('project-profile', 'the Project Profile arrives at Stage 6')` ->
 * `'unobserved:project-profile:the Project Profile arrives at Stage 6'`.
 */
export function unobserved(subject: string, why: string): string {
  return `unobserved:${subject}:${why}`;
}

/** True for a value produced by {@link unobserved}. */
export function isUnobserved(value: string): boolean {
  return value.startsWith('unobserved:');
}

/**
 * The inputs of `context_snapshot_id` that do not come from the index or the
 * request. Supplied by the composition root, never guessed here.
 */
export interface RuntimeFacts {
  readonly repo_sha: string;
  readonly profile_status_digest: string;
  readonly change_scope: readonly string[];
  readonly capability_snapshot_hash: string;
  readonly eos_release: string;
}

/** Everything hashed into one snapshot, kept so `inspect` can hand it back. */
export interface ContextSnapshot {
  readonly id: string;
  readonly repo_sha: string;
  readonly profile_status_digest: string;
  readonly change_scope: readonly string[];
  readonly capability_snapshot_hash: string;
  readonly index_digest: string;
  readonly ranking_mode: RankingMode;
  readonly effective_score_view_id: string;
  readonly score_source: 'overlay' | 'snapshot';
  readonly eos_release: string;
}

export function buildContextSnapshot(input: {
  readonly facts: RuntimeFacts;
  readonly indexDigest: string;
  readonly rankingMode: RankingMode;
  readonly effectiveScoreViewId: string;
  readonly scoreSource: 'overlay' | 'snapshot';
}): ContextSnapshot {
  const id = contextSnapshotId({
    repo_sha: input.facts.repo_sha,
    profile_status_digest: input.facts.profile_status_digest,
    change_scope: input.facts.change_scope,
    capability_snapshot_hash: input.facts.capability_snapshot_hash,
    index_digest: input.indexDigest,
    ranking_mode: input.rankingMode,
    effective_score_view_id: input.effectiveScoreViewId,
    eos_release: input.facts.eos_release,
  });
  return {
    id,
    repo_sha: input.facts.repo_sha,
    profile_status_digest: input.facts.profile_status_digest,
    change_scope: [...input.facts.change_scope],
    capability_snapshot_hash: input.facts.capability_snapshot_hash,
    index_digest: input.indexDigest,
    ranking_mode: input.rankingMode,
    effective_score_view_id: input.effectiveScoreViewId,
    score_source: input.scoreSource,
    eos_release: input.facts.eos_release,
  };
}
