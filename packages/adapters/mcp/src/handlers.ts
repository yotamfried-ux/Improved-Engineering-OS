/**
 * The Agent Contract over the resolver and local Evidence Plane staging.
 *
 * Knowledge semantics remain in `packages/resolver`; this adapter only bridges
 * transport requests to ports. Runtime writes go to local staging, never to the
 * canonical knowledge checkout.
 */

import {
  STAGE_0_LIFECYCLE,
  inspectAssetResponseSchema,
  inspectSnapshotResponseSchema,
  inspectSolutionSetResponseSchema,
  observeResponseSchema,
  type ContextSnapshotStore,
  type InspectRequest,
  type KnowledgeIndex,
  type ObserveRequest,
  type Staging,
} from '@ieos/core';
import type { ExpandRequest, ResolveRequest } from '@ieos/core';
import {
  expand as resolverExpand,
  resolve as resolverResolve,
  type ContextSnapshot,
  type ResolveDeps,
  type RuntimeFacts,
} from '@ieos/resolver';

export function isRefusal(error: unknown): error is { code: string; message: string } {
  return (
    typeof error === 'object' &&
    error !== null &&
    typeof (error as { code?: unknown }).code === 'string' &&
    typeof (error as { message?: unknown }).message === 'string'
  );
}

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
  /** Local staging for `observe`; null means refusing is safer than losing a write. */
  readonly staging: Staging | null;
  /** Durable local snapshot store. Optional for Stage 1 fixture adapters. */
  readonly snapshots?: ContextSnapshotStore | null;
  readonly projectFacts?: Readonly<Record<string, string>>;
  readonly capabilities?: readonly string[];
  readonly pinnedRankingMode?: 'live_overlay' | 'recorded';
}

function resolverDeps(deps: AgentContractDeps): ResolveDeps {
  return {
    index: deps.index,
    facts: deps.facts,
    ...(deps.projectFacts === undefined ? {} : { projectFacts: deps.projectFacts }),
    ...(deps.capabilities === undefined ? {} : { capabilities: deps.capabilities }),
    ...(deps.pinnedRankingMode === undefined ? {} : { pinnedRankingMode: deps.pinnedRankingMode }),
  };
}

/** In-process cache; durability is supplied separately through `deps.snapshots`. */
export type SnapshotStore = Map<string, ContextSnapshot>;

async function persistSnapshot(
  deps: AgentContractDeps,
  store: SnapshotStore,
  contextSnapshotId: string,
  runId: string,
): Promise<void> {
  if (deps.snapshots === undefined || deps.snapshots === null) return;
  const snapshot = store.get(contextSnapshotId);
  if (snapshot === undefined) {
    throw new Error(`resolver returned context snapshot ${contextSnapshotId} without storing it`);
  }
  await deps.snapshots.recordContextSnapshot({
    context_snapshot_id: snapshot.id,
    run_id: runId,
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

export async function resolve(
  deps: AgentContractDeps,
  store: SnapshotStore,
  request: ResolveRequest,
): Promise<unknown> {
  const response = await resolverResolve(resolverDeps(deps), store, request);
  await persistSnapshot(deps, store, response.context_snapshot_id, request.run_id);
  return response;
}

export async function expand(
  deps: AgentContractDeps,
  store: SnapshotStore,
  request: ExpandRequest,
): Promise<unknown> {
  const response = await resolverExpand(resolverDeps(deps), store, request);
  await persistSnapshot(deps, store, response.context_snapshot_id, request.run_id);
  return response;
}

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
    const cached = store.get(id);
    const durable =
      cached === undefined && deps.snapshots !== undefined && deps.snapshots !== null
        ? await deps.snapshots.getContextSnapshot(id)
        : undefined;
    const snapshot = cached ?? durable;
    if (snapshot === undefined) {
      throw new AgentContractError(
        'snapshot_not_durable',
        `context snapshot ${id} is not present in the local durable snapshot store.`,
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
        evidence_state: 'none' as const,
        integrity_best: asset === undefined ? null : bestIntegrity(asset.provenance),
      });
    }
    return inspectSolutionSetResponseSchema.parse({
      id: set.id,
      problem_id: set.problem_id,
      canonical_state: set.canonical_state,
      champion_id: set.champion_id,
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
      'observe has no staging sink configured, so this observation would be accepted and lost.',
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
