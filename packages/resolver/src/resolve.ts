/**
 * `resolve` and `expand` over the `KnowledgeIndex` port (D20.3, D25).
 *
 * This is the impure half: it reads through the port and hands what it read to
 * the pure ranker. The split is deliberate and is what the port documentation
 * asks for -- ranking is tested exhaustively without a database, and the index
 * is tested without a ranking policy.
 *
 * At Stage 1 the MCP adapter answered `resolve` itself and refused the moment
 * the corpus was non-empty, because ranking an index it had no policy for
 * would have been an ordering it could not justify. That refusal exists to be
 * removed by exactly this file.
 */

import {
  expandResponseSchema,
  resolveResponseSchema,
  STAGE_0_LIFECYCLE,
  type ExpandRequest,
  type ExpandResponse,
  type KnowledgeIndex,
  type RankingMode,
  type ResolveRequest,
  type ResolveResponse,
} from '@ieos/core';
import { buildContextSnapshot, type ContextSnapshot, type RuntimeFacts } from './context.ts';
import { rank, type RankCandidate } from './rank.ts';
import { effectiveViewIdFor } from './score-view.ts';

/** The default when a request names no limit. Small on purpose: D9 wants one answer in front. */
export const DEFAULT_LIMIT = 5;

/** Hard ceiling, matching the request contract's own bound. */
export const MAX_LIMIT = 50;

export class ResolverError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'ResolverError';
    this.code = code;
  }
}

export interface ResolveDeps {
  readonly index: KnowledgeIndex;
  readonly facts: RuntimeFacts;
  /**
   * What is known about the target project, for the Project Fit stage.
   *
   * Supplied by the composition root rather than read here: the Project Profile
   * contract is designed at Stage 6, and an empty map is the honest state until
   * then -- every condition is `unknown`, nothing is contradicted, and no asset
   * is hidden on the strength of a fact nobody observed.
   */
  readonly projectFacts?: Readonly<Record<string, string>>;
  /**
   * Capabilities the request is about.
   *
   * The Agent Contract's `resolve` request (guide section 5.6) has no
   * capability field, so nothing derives these from `task_hint` today. The
   * filter is implemented and exercised; supplying it from a free-text hint is
   * a capability-matching design in its own right and is not pretended here.
   */
  readonly capabilities?: readonly string[];
}

/** Everything both verbs need, computed once. */
async function prepare(
  deps: ResolveDeps,
  store: Map<string, ContextSnapshot>,
  request: {
    readonly ranking_mode?: RankingMode | undefined;
    readonly score_view_id?: string | undefined;
  },
  hint: string,
  limit: number,
): Promise<{ snapshot: ContextSnapshot; ranked: ReturnType<typeof rank> }> {
  const indexDigest = await deps.index.indexDigest();
  const scores = await deps.index.getScoreSnapshot();

  // D24's default posture is a live overlay when one is reachable. None is at
  // Stage 2, which the response reports through `score_source` rather than by
  // relabelling the mode the caller asked for.
  const rankingMode: RankingMode = request.ranking_mode ?? 'live_overlay';
  const viewId = effectiveViewIdFor(scores, rankingMode);

  // Q-06: `recorded` must reproduce the view it names.
  if (request.score_view_id !== undefined && request.score_view_id !== viewId) {
    throw new ResolverError(
      'score_view_unavailable',
      `score view ${request.score_view_id} is not available to this runtime. The only view it ` +
        `can reproduce is ${viewId}, computed from the score snapshot the index carries (D24).`,
    );
  }

  const candidates: RankCandidate[] = [
    ...(await deps.index.searchAssets(hint, Math.min(MAX_LIMIT, limit * 4))),
  ].map((hit) => ({ asset: hit.asset, rank: hit.rank }));

  const ranked = rank({
    candidates,
    solutionSets: await deps.index.listSolutionSets(),
    scores,
    projectFacts: deps.projectFacts ?? {},
    capabilities: deps.capabilities ?? [],
    limit,
  });

  const snapshot = buildContextSnapshot({
    facts: deps.facts,
    indexDigest,
    rankingMode,
    effectiveScoreViewId: viewId,
    scoreSource: 'snapshot',
  });
  store.set(snapshot.id, snapshot);
  return { snapshot, ranked };
}

export async function resolve(
  deps: ResolveDeps,
  store: Map<string, ContextSnapshot>,
  request: ResolveRequest,
): Promise<ResolveResponse> {
  const limit = Math.min(request.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
  const { snapshot, ranked } = await prepare(deps, store, request, request.task_hint, limit);

  return resolveResponseSchema.parse({
    ...STAGE_0_LIFECYCLE,
    context_snapshot_id: snapshot.id,
    ranking_mode: snapshot.ranking_mode,
    effective_score_view_id: snapshot.effective_score_view_id,
    items: ranked.items,
    coverage: ranked.coverage,
    omitted_count: ranked.omitted_count,
    // Controls are designed at Stage 9; the index's controls table is empty, so
    // this reports what is there rather than asserting that none apply.
    controls: [],
  });
}

export async function expand(
  deps: ResolveDeps,
  store: Map<string, ContextSnapshot>,
  request: ExpandRequest,
): Promise<ExpandResponse> {
  // `expand` deliberately widens the limit rather than the query: "beyond" says
  // which boundary the caller wants crossed, and at Stage 2 the only boundary
  // the index can actually cross is how much of the ranked list is returned.
  const limit = request.beyond === 'corpus' ? MAX_LIMIT : DEFAULT_LIMIT * 2;
  const { snapshot, ranked } = await prepare(deps, store, {}, request.task_hint, limit);

  return expandResponseSchema.parse({
    ...STAGE_0_LIFECYCLE,
    context_snapshot_id: snapshot.id,
    ranking_mode: snapshot.ranking_mode,
    effective_score_view_id: snapshot.effective_score_view_id,
    items: ranked.items,
    coverage: ranked.coverage,
    omitted_count: ranked.omitted_count,
    controls: [],
    expansion_reason: `${request.reason} (beyond: ${request.beyond})`,
  });
}
