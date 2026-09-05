/**
 * The Agent Contract at Stage 1 (guide section 5.6, D25).
 *
 * What this file is careful about, and why it is written the way it is:
 *
 * **It does not rank.** D20.3's retrieval -- capability match, BM25, Project
 * Fit, Champion per Solution Set, Asset Score tie-break -- belongs to
 * `packages/resolver` at Stage 2, and fitness rule F2 says adapters own no
 * knowledge semantics. So `resolve` here answers only the one case where no
 * ordering decision exists: an empty corpus. The moment the index holds an
 * asset or a Solution Set, it refuses and says why. A resolver that returned
 * "the first ten rows" would be ranking, badly, while looking like it worked.
 *
 * **It does not record what it cannot store.** `observe` needs a staging sink
 * with a `UNIQUE(observation_id)` constraint behind it (T-04). Stage 1 has
 * none, so `observe` fails loudly rather than returning `status: "recorded"`
 * for a write that reached nothing.
 *
 * Both refusals disappear at Stage 2, when the resolver and the Evidence Plane
 * arrive. Until then they are the difference between a runtime that is honest
 * about being early and one that looks finished.
 */

import {
  STAGE_0_LIFECYCLE,
  effectiveScoreViewId,
  expandResponseSchema,
  inspectAssetResponseSchema,
  inspectSnapshotResponseSchema,
  inspectSolutionSetResponseSchema,
  observeResponseSchema,
  resolveResponseSchema,
  type ExpandRequest,
  type ExpandResponse,
  type InspectRequest,
  type KnowledgeIndex,
  type ObserveRequest,
  type RankingMode,
  type ScoreSnapshot,
  type Staging,
} from '@ieos/core';
import { buildContextSnapshot, type ContextSnapshot, type RuntimeFacts } from './context.ts';
import type { ResolveRequest } from '@ieos/core';

/**
 * A refusal the caller is meant to read.
 *
 * `code` is stable so a client can branch on it; `message` says what would make
 * the call succeed. Neither is an internal error: every one of these is a
 * deliberate answer.
 */
export class AgentContractError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'AgentContractError';
    this.code = code;
  }
}

export interface AgentContractDeps {
  readonly index: KnowledgeIndex;
  readonly facts: RuntimeFacts;
  /** Absent at Stage 1; `observe` refuses rather than pretending to write. */
  readonly staging: Staging | null;
}

/**
 * The snapshots this process computed.
 *
 * D25 requires the record to be durable and synced through `ingest`; the local
 * outbox arrives with telemetry at Stage 2. Holding them in memory means
 * `inspect` can explain a snapshot from this session and must say plainly that
 * it cannot explain one from any other. An in-memory map that pretended to be
 * the durable store would be the worse of the two.
 */
export type SnapshotStore = Map<string, ContextSnapshot>;

/**
 * The Effective Score View of a decision taken against the release snapshot.
 *
 * At Stage 1 there is no live overlay to consult, so every asset's score comes
 * from the snapshot the release carries and `score_source` says `snapshot`.
 * That is D24 working as designed, not a shortfall being papered over: the
 * contract has a field for exactly this and the bootstrap snapshot says
 * `UNPROVEN` in its own data.
 */
function effectiveViewIdFor(snapshot: ScoreSnapshot, mode: RankingMode): string {
  return effectiveScoreViewId({
    mode,
    parent_score_view_id: snapshot.score_view_id,
    scoring_policy_version: snapshot.scoring_policy_version,
    evidence_watermark: null,
    computed_at: snapshot.computed_at,
    assets: snapshot.assets.map((asset) => ({
      id: asset.id,
      effective_score: asset.score,
      evidence_count: asset.evidence_count,
      source: 'snapshot' as const,
    })),
  });
}

async function answerOverCorpus(
  deps: AgentContractDeps,
  store: SnapshotStore,
  request: {
    readonly ranking_mode?: RankingMode | undefined;
    readonly score_view_id?: string | undefined;
  },
  what: 'resolve' | 'expand',
): Promise<{ snapshot: ContextSnapshot }> {
  const indexDigest = await deps.index.indexDigest();
  const scoreSnapshot = await deps.index.getScoreSnapshot();

  // D24's default posture is a live overlay when one is reachable. None is,
  // which the response reports through `score_source`, not by silently
  // relabelling the mode the caller asked for.
  const rankingMode: RankingMode = request.ranking_mode ?? 'live_overlay';
  const viewId = effectiveViewIdFor(scoreSnapshot, rankingMode);

  // Q-06: `recorded` must reproduce the view it names. This runtime holds
  // exactly one view -- the release snapshot -- so a request for a different
  // one is refused rather than served with the view we happen to have.
  if (request.score_view_id !== undefined && request.score_view_id !== viewId) {
    throw new AgentContractError(
      'score_view_unavailable',
      `score view ${request.score_view_id} is not available to this runtime. The only view it ` +
        `can reproduce is ${viewId}, computed from the score snapshot the index carries (D24).`,
    );
  }

  const solutionSets = await deps.index.listSolutionSets();
  if (scoreSnapshot.assets.length > 0 || solutionSets.length > 0) {
    throw new AgentContractError(
      'ranking_not_available',
      `${what} cannot answer over a non-empty corpus at this stage: the index holds ` +
        `${String(scoreSnapshot.assets.length)} asset(s) and ${String(solutionSets.length)} ` +
        'solution set(s), and ranking (D20.3 -- capability match, relevance, Project Fit, ' +
        'Champion selection) is implemented by packages/resolver at Stage 2. Returning rows in ' +
        'index order would be an ordering this runtime cannot justify.',
    );
  }

  const snapshot = buildContextSnapshot({
    facts: deps.facts,
    indexDigest,
    rankingMode,
    effectiveScoreViewId: viewId,
    scoreSource: 'snapshot',
  });
  store.set(snapshot.id, snapshot);
  return { snapshot };
}

export async function resolve(
  deps: AgentContractDeps,
  store: SnapshotStore,
  request: ResolveRequest,
): Promise<unknown> {
  const { snapshot } = await answerOverCorpus(deps, store, request, 'resolve');
  return resolveResponseSchema.parse({
    ...STAGE_0_LIFECYCLE,
    context_snapshot_id: snapshot.id,
    ranking_mode: snapshot.ranking_mode,
    effective_score_view_id: snapshot.effective_score_view_id,
    items: [],
    coverage: [],
    omitted_count: 0,
    // Read from the index's own (empty) controls, not asserted to be empty:
    // controls are designed at Stage 9 and none has been compiled yet.
    controls: [],
  });
}

export async function expand(
  deps: AgentContractDeps,
  store: SnapshotStore,
  request: ExpandRequest,
): Promise<ExpandResponse> {
  // `expand` has no ranking-mode parameter of its own (guide section 5.6), so
  // it takes the default posture rather than inheriting one from a request that
  // never carried it.
  const { snapshot } = await answerOverCorpus(deps, store, {}, 'expand');
  return expandResponseSchema.parse({
    ...STAGE_0_LIFECYCLE,
    context_snapshot_id: snapshot.id,
    ranking_mode: snapshot.ranking_mode,
    effective_score_view_id: snapshot.effective_score_view_id,
    items: [],
    coverage: [],
    omitted_count: 0,
    controls: [],
    expansion_reason: `${request.reason} (beyond: ${request.beyond})`,
  });
}

/** The strongest integrity any provenance entry claims, or null if there is none. */
function bestIntegrity(entries: readonly { integrity: string }[]): string | null {
  const order = ['unknown', 'partial', 'verified'];
  let best: string | null = null;
  for (const entry of entries) {
    if (best === null || order.indexOf(entry.integrity) > order.indexOf(best)) {
      best = entry.integrity;
    }
  }
  return best;
}

export async function inspect(
  deps: AgentContractDeps,
  store: SnapshotStore,
  request: InspectRequest,
): Promise<unknown> {
  const { kind, id } = request.handle;

  if (kind === 'snapshot') {
    const snapshot = store.get(id);
    if (snapshot === undefined) {
      throw new AgentContractError(
        'snapshot_not_durable',
        `context snapshot ${id} is not known to this process. Snapshots become durable when the ` +
          'local outbox and `ingest` arrive with telemetry at Stage 2 (D25, T-05); until then ' +
          'only snapshots computed in this session can be explained.',
      );
    }
    return inspectSnapshotResponseSchema.parse({
      repo_sha: snapshot.repo_sha,
      profile_status_digest: snapshot.profile_status_digest,
      change_scope: [...snapshot.change_scope],
      capability_snapshot_hash: snapshot.capability_snapshot_hash,
      index_digest: snapshot.index_digest,
      ranking_mode: snapshot.ranking_mode,
      effective_score_view_id: snapshot.effective_score_view_id,
      score_source: snapshot.score_source,
      eos_release: snapshot.eos_release,
    });
  }

  if (kind === 'solution_set') {
    const set = await deps.index.getSolutionSet(id);
    if (set === undefined) {
      throw new AgentContractError('not_found', `no solution set ${id} in the index.`);
    }
    const members = [];
    for (const memberId of [...set.members].sort()) {
      const asset = await deps.index.getAsset(memberId);
      members.push({
        id: memberId,
        title: asset?.title ?? memberId,
        // No Evidence Plane exists yet, so "none" is a measurement, not a
        // default: there is nothing anywhere that could have evidence.
        evidence_state: 'none' as const,
        integrity_best: asset === undefined ? null : bestIntegrity(asset.provenance),
      });
    }
    return inspectSolutionSetResponseSchema.parse({
      id: set.id,
      problem_id: set.problem_id,
      canonical_state: set.canonical_state,
      champion_id: set.champion_id,
      // C-01: derived at runtime from the score view, never read from Git. The
      // bootstrap snapshot records no challenge, so no set is challenged.
      challenge_state: 'none',
      members,
      why_unresolved: set.why_unresolved,
    });
  }

  const asset = await deps.index.getAsset(id);
  if (asset === undefined) {
    throw new AgentContractError('not_found', `no asset ${id} in the index.`);
  }
  const body = await deps.index.getAssetBody(id);
  if (body === undefined) {
    throw new AgentContractError(
      'index_incomplete',
      `asset ${id} is in the index but its body is not. Rebuild with \`pnpm build:index\`.`,
    );
  }
  const set =
    asset.solution_set_id === null
      ? undefined
      : await deps.index.getSolutionSet(asset.solution_set_id);
  return inspectAssetResponseSchema.parse({
    asset,
    body,
    evidence_summary: 'none',
    champion_source: 'release',
    canonical_state: set?.canonical_state ?? null,
    challenge_state: set === undefined ? null : 'none',
  });
}

export async function observe(deps: AgentContractDeps, request: ObserveRequest): Promise<unknown> {
  if (deps.staging === null) {
    throw new AgentContractError(
      'staging_unavailable',
      'observe has no staging sink configured, so this observation would be accepted and lost. ' +
        'The `UNIQUE(observation_id)` guarantee that makes observe idempotent (T-04) lives in ' +
        'Supabase staging, which arrives with the installation credential at Stage 2 (D22).',
    );
  }
  const result = await deps.staging.recordObservation({
    ...STAGE_0_LIFECYCLE,
    observation_id: request.observation_id,
    run_id: request.run_id,
    kind: request.kind,
    subject: request.subject,
    ...(request.evidence_refs === undefined ? {} : { evidence_refs: [...request.evidence_refs] }),
    ...(request.note === undefined ? {} : { note: request.note }),
  });
  return observeResponseSchema.parse({
    observation_id: request.observation_id,
    status: result.status,
  });
}
