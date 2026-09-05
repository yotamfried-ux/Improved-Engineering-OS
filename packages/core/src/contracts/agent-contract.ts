/**
 * Agent Contract -- guide section 5.6, D9, D25, Q-05, P-01.
 *
 * The narrow interface: `resolve`, `inspect`, `expand`, `observe`. Identical
 * over MCP and CLI; nothing here knows which transport carries it, and nothing
 * here names an agent.
 *
 * Q-05 is enforced structurally: `resolve` returns Champions only. A
 * `ResolveItem` has no field in which a challenger could be listed, so "one
 * solution in front" cannot be violated by a resolver that means well. Challenger
 * detail exists only on `inspect`.
 *
 * P-01 is enforced by the `coverage` array: a relevant Solution Set with no
 * canonical answer is reported as coverage, so the agent learns EOS has relevant
 * knowledge without being handed a temporary winner.
 */

import { z } from 'zod';
import { isoInstantSchema, lifecycleFields } from './lifecycle.ts';
import { assetSchema } from './asset.ts';
import { canonicalStateSchema, challengeStateSchema } from './solution-set.ts';

export const rankingModeSchema = z.enum(['live_overlay', 'recorded']);
export type RankingMode = z.infer<typeof rankingModeSchema>;

export const scoreSourceSchema = z.enum(['overlay', 'snapshot']);

/**
 * Presentation status only (C-01).
 *
 * Derived from two separately owned fields -- `canonical_state` from the release,
 * `challenge_state` from the score view -- and flattened into one value so the
 * agent sees a simple status. The flattening happens at the boundary; the two
 * owners stay apart behind it.
 */
export const championStatusSchema = z.enum(['pinned', 'pinned_challenged']);

/** `inspect` takes a typed handle, not a bare id (T-05). */
export const handleSchema = z
  .object({
    kind: z.enum(['asset', 'snapshot', 'solution_set']),
    id: z.string().min(1),
  })
  .strict();
export type Handle = z.infer<typeof handleSchema>;

// ---------------------------------------------------------------------------
// resolve
// ---------------------------------------------------------------------------

export const resolveRequestSchema = z
  .object({
    task_hint: z.string().min(1),
    project_id: z.string().min(1),
    run_id: z.string().min(1),
    limit: z.int().positive().max(50).optional(),
    include_controls: z.boolean().optional(),
    ranking_mode: rankingModeSchema.optional(),
    score_view_id: z.string().min(1).optional(),
  })
  .strict()
  .superRefine((request, ctx) => {
    // Q-06: `recorded` mode is only reproducible if it names the view it recorded.
    if (request.ranking_mode === 'recorded' && request.score_view_id === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['score_view_id'],
        message:
          'ranking_mode "recorded" requires score_view_id; qualification and replay ' +
          'must pin an immutable score view (Q-06)',
      });
    }
  });
export type ResolveRequest = z.infer<typeof resolveRequestSchema>;

export const resolveItemSchema = z
  .object({
    id: z.string().min(1),
    type: z.string().min(1),
    title: z.string().min(1),
    summary: z.string().min(1).max(400),
    project_fit: z.number().min(0).max(1),
    /** Present exactly when this item is the Champion of a resolved set. */
    champion_of: z.string().min(1).optional(),
    champion_status: championStatusSchema.optional(),
    score: z.number().min(0).max(1),
    score_source: scoreSourceSchema,
    evidence_count: z.int().nonnegative(),
  })
  .strict()
  .superRefine((item, ctx) => {
    if ((item.champion_of === undefined) !== (item.champion_status === undefined)) {
      ctx.addIssue({
        code: 'custom',
        path: ['champion_status'],
        message: 'champion_of and champion_status are present together or not at all',
      });
    }
  });
export type ResolveItem = z.infer<typeof resolveItemSchema>;

/** P-01: a relevant set with no canonical answer, reported instead of guessed. */
export const coverageEntrySchema = z
  .object({
    solution_set_id: z.string().min(1),
    unresolved_solution_set: z.literal(true),
    member_count: z.int().nonnegative(),
    problem_id: z.string().min(1),
  })
  .strict();

/**
 * The fields `resolve` returns, named once so `expand` cannot drift from them.
 *
 * The guide says `expand` returns "the same shape as resolve, plus
 * `expansion_reason`". Sharing the field bag is how "the same shape" stays true
 * as the shape changes.
 */
const resolveResponseFields = {
  ...lifecycleFields,
  context_snapshot_id: z.string().min(1),
  ranking_mode: rankingModeSchema,
  effective_score_view_id: z.string().min(1),
  items: z.array(resolveItemSchema),
  coverage: z.array(coverageEntrySchema),
  omitted_count: z.int().nonnegative(),
  controls: z.array(z.string().min(1)),
} as const;

/** D34/P-01 checks, shared by `resolve` and `expand` for the same reason. */
function checkOneChampionPerSet(
  response: { items: ResolveItem[]; coverage: { solution_set_id: string }[] },
  ctx: z.RefinementCtx,
): void {
  // D34/F11: one Champion per Solution Set, never two.
  const championed = response.items
    .map((item) => item.champion_of)
    .filter((value): value is string => value !== undefined);
  const seen = new Set<string>();
  for (const setId of championed) {
    if (seen.has(setId)) {
      ctx.addIssue({
        code: 'custom',
        path: ['items'],
        message: `solution set ${setId} appears with two Champions; exactly one is allowed (D34)`,
      });
    }
    seen.add(setId);
  }
  // P-01: an unresolved set must not also be represented by a Champion.
  for (const entry of response.coverage) {
    if (seen.has(entry.solution_set_id)) {
      ctx.addIssue({
        code: 'custom',
        path: ['coverage'],
        message:
          `solution set ${entry.solution_set_id} is reported unresolved yet also has a ` +
          'Champion item; a set is one or the other',
      });
    }
  }
}

export const resolveResponseSchema = z
  .object(resolveResponseFields)
  .strict()
  .superRefine(checkOneChampionPerSet);
export type ResolveResponse = z.infer<typeof resolveResponseSchema>;

// ---------------------------------------------------------------------------
// inspect
// ---------------------------------------------------------------------------

export const inspectRequestSchema = z
  .object({
    handle: handleSchema,
    run_id: z.string().min(1),
  })
  .strict();
export type InspectRequest = z.infer<typeof inspectRequestSchema>;

/** Challenger detail lives here and only here (Q-05). */
export const challengerSchema = z
  .object({
    id: z.string().min(1),
    title: z.string().min(1),
    live_score: z.number().min(0).max(1),
    margin: z.number(),
    evidence_difference: z.string().min(1),
    why_not_champion: z.string().min(1),
  })
  .strict();

/**
 * Evidence, as `inspect` reports it.
 *
 * `"none"` is a value, not a missing field (R-04). An `active` asset with no
 * Evidence is "admitted, unproven", and the difference between "we have no
 * evidence" and "we did not look" is exactly what a rebuilt-on-evidence system
 * may not blur.
 */
export const evidenceSummarySchema = z.union([
  z.literal('none'),
  z
    .object({
      count: z.int().nonnegative(),
      best_verification: z.enum(['reported', 'observed', 'corroborated', 'externally_verified']),
      latest_observed_at: isoInstantSchema.nullable(),
    })
    .strict(),
]);

export const inspectAssetResponseSchema = z
  .object({
    asset: assetSchema,
    /** The body text itself (D20.1), not the path the record names. */
    body: z.string(),
    evidence_summary: evidenceSummarySchema,
    /**
     * Always `"release"` (D34, C-01): Champion identity has exactly one source,
     * and a literal is how that stops being a convention.
     */
    champion_source: z.literal('release'),
    /**
     * Null when the asset belongs to no Solution Set: Champion state is a
     * property of a set, and reporting `unresolved` for an asset that is not in
     * one would answer a question nobody asked.
     */
    canonical_state: canonicalStateSchema.nullable(),
    challenge_state: challengeStateSchema.nullable(),
    challenger: challengerSchema.optional(),
  })
  .strict()
  .superRefine((response, ctx) => {
    // C-01 again, from the other side: a challenger may only appear where the
    // score view actually recorded a challenge.
    if (response.challenge_state === 'none' && response.challenger !== undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['challenger'],
        message: 'an unchallenged asset has no challenger to report',
      });
    }
  });
export type InspectAssetResponse = z.infer<typeof inspectAssetResponseSchema>;

/**
 * What `inspect` returns for a snapshot handle: the inputs of the decision,
 * not a copy of the catalogue (T-05, P-03).
 *
 * These are exactly the fields `contextSnapshotId` hashes, plus the score source
 * that was in force. Returning the inputs is what makes the id explainable a
 * month later rather than merely unique.
 */
export const inspectSnapshotResponseSchema = z
  .object({
    repo_sha: z.string().min(1),
    profile_status_digest: z.string().min(1),
    change_scope: z.array(z.string().min(1)),
    capability_snapshot_hash: z.string().min(1),
    index_digest: z.string().min(1),
    ranking_mode: rankingModeSchema,
    effective_score_view_id: z.string().min(1),
    score_source: scoreSourceSchema,
    eos_release: z.string().min(1),
  })
  .strict();
export type InspectSnapshotResponse = z.infer<typeof inspectSnapshotResponseSchema>;

export const inspectSolutionSetResponseSchema = z
  .object({
    id: z.string().min(1),
    problem_id: z.string().min(1),
    canonical_state: canonicalStateSchema,
    champion_id: z.string().min(1).nullable(),
    challenge_state: challengeStateSchema,
    members: z.array(
      z
        .object({
          id: z.string().min(1),
          title: z.string().min(1),
          evidence_state: z.enum(['none', 'reported', 'observed', 'corroborated', 'verified']),
          integrity_best: z.string().min(1).nullable(),
        })
        .strict(),
    ),
    why_unresolved: z.string().min(1).nullable(),
  })
  .strict();

// ---------------------------------------------------------------------------
// expand
// ---------------------------------------------------------------------------

export const expandRequestSchema = z
  .object({
    task_hint: z.string().min(1),
    project_id: z.string().min(1),
    run_id: z.string().min(1),
    reason: z.string().min(1),
    beyond: z.enum(['solution_set', 'type', 'corpus']),
  })
  .strict();
export type ExpandRequest = z.infer<typeof expandRequestSchema>;

/**
 * `expand` returns what `resolve` returns, plus the reason the search widened.
 *
 * The reason is required, not optional: an expansion whose justification is
 * absent is indistinguishable from a `resolve` that quietly ignored its bounds.
 */
export const expandResponseSchema = z
  .object({ ...resolveResponseFields, expansion_reason: z.string().min(1) })
  .strict()
  .superRefine(checkOneChampionPerSet);
export type ExpandResponse = z.infer<typeof expandResponseSchema>;

// ---------------------------------------------------------------------------
// observe
// ---------------------------------------------------------------------------

/**
 * `observe` writes to staging only (F3), and is idempotent through a
 * caller-minted `observation_id` (T-04) that the server enforces as UNIQUE.
 *
 * The idempotency key is required, not optional: `idempotentHint: true` without
 * a key -- the T-04 finding -- is a promise the transport cannot keep.
 */
export const observationSchema = z
  .object({
    ...lifecycleFields,
    observation_id: z.string().min(1),
    run_id: z.string().min(1),
    kind: z.enum(['outcome', 'correction', 'discovery', 'friction']),
    subject: handleSchema,
    evidence_refs: z.array(z.string().min(1)).optional(),
    note: z.string().max(4000).optional(),
  })
  .strict();
export type Observation = z.infer<typeof observationSchema>;

/**
 * What a caller sends to `observe` (guide section 5.6).
 *
 * Deliberately not `observationSchema`: that is the stored record, and it
 * carries a lifecycle block the runtime stamps. A caller who had to supply
 * `schema_version` and `stability` would be filling in the server's own
 * bookkeeping, and a caller who could supply them could misstate them.
 */
export const observeRequestSchema = z
  .object({
    observation_id: z.string().min(1),
    run_id: z.string().min(1),
    kind: z.enum(['outcome', 'correction', 'discovery', 'friction']),
    subject: handleSchema,
    evidence_refs: z.array(z.string().min(1)).optional(),
    note: z.string().max(4000).optional(),
  })
  .strict();
export type ObserveRequest = z.infer<typeof observeRequestSchema>;

export const observeResponseSchema = z
  .object({
    observation_id: z.string().min(1),
    status: z.enum(['recorded', 'duplicate']),
  })
  .strict();
