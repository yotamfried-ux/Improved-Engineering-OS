/**
 * The Agent Contract at Stage 1 (guide section 5.6, D25).
 *
 * What this file is careful about, and why it is written the way it is:
 *
 * **It does not rank.** D20.3's retrieval -- capability match, BM25, Project
 * Fit, Champion per Solution Set, Asset Score tie-break -- lives in
 * `packages/resolver`, and fitness rule F2 says adapters own no knowledge
 * semantics. At Stage 1 this file refused any non-empty corpus rather than
 * invent an ordering; at Stage 2 it delegates to the resolver, which is what
 * that refusal was placed here to wait for.
 *
 * **It does not record what it cannot store.** `observe` needs a staging sink
 * with a `UNIQUE(observation_id)` constraint behind it (T-04). Stage 1 has
 * none, so `observe` fails loudly rather than returning `status: "recorded"`
 * for a write that reached nothing.
 *
 * The observe refusal disappears when the Evidence Plane arrives. Until then it
 * is the difference between a runtime that is honest about being early and one
 * that looks finished.
 */

import {
  STAGE_0_LIFECYCLE,
  inspectAssetResponseSchema,
  inspectSnapshotResponseSchema,
  inspectSolutionSetResponseSchema,
  observeResponseSchema,
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

/**
 * A refusal the caller is meant to read.
 *
 * `code` is stable so a client can branch on it; `message` says what would make
 * the call succeed. Neither is an internal error: every one of these is a
 * deliberate answer.
 */
/**
 * True for a deliberate, caller-facing refusal from anywhere in the stack.
 *
 * Structural rather than `instanceof`: the resolver raises its own
 * `ResolverError` from another package, and both are the same thing to a
 * client -- an answer, not a crash. Matching on shape keeps the adapter from
 * having to know every package's error class, and keeps a genuine internal
 * failure (which carries no `code`) from being dressed up as a refusal.
 */
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
  /** Absent until the Evidence Plane exists; `observe` refuses rather than pretending to write. */
  readonly staging: Staging | null;
  /** Passed straight through to the resolver; see `ResolveDeps`. */
  readonly projectFacts?: Readonly<Record<string, string>>;
  readonly capabilities?: readonly string[];
}

/** The adapter carries no ranking policy of its own -- it forwards one (F2). */
function resolverDeps(deps: AgentContractDeps): ResolveDeps {
  return {
    index: deps.index,
    facts: deps.facts,
    ...(deps.projectFacts === undefined ? {} : { projectFacts: deps.projectFacts }),
    ...(deps.capabilities === undefined ? {} : { capabilities: deps.capabilities }),
  };
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

export async function resolve(
  deps: AgentContractDeps,
  store: SnapshotStore,
  request: ResolveRequest,
): Promise<unknown> {
  return resolverResolve(resolverDeps(deps), store, request);
}

export async function expand(
  deps: AgentContractDeps,
  store: SnapshotStore,
  request: ExpandRequest,
): Promise<unknown> {
  return resolverExpand(resolverDeps(deps), store, request);
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
