/**
 * Score snapshot and Effective Score View -- D24, Q-02, Q-06, P-03, C-01.
 *
 * The point of P-03: in `live_overlay` mode, keeping only an overlay digest
 * proves an overlay existed but cannot reconstruct it. An Effective Score View
 * records the assets that actually affected one decision, so an investigation a
 * month later can answer "why did EOS propose asset X" without storing a copy of
 * the whole catalogue per call.
 *
 * The point of C-01, held structurally: neither shape here carries `champion_id`
 * or `canonical_state`. Champion identity comes from the release index. A
 * resolver reading this module cannot find a Champion in it, which is the half of
 * F11 that a contract can enforce before a resolver exists.
 */

import { z } from 'zod';
import { isoInstantSchema, lifecycleFields } from './lifecycle.ts';
import { challengeStateSchema } from './solution-set.ts';
import { rankingModeSchema } from './agent-contract.ts';

export const scoreViewAssetSchema = z
  .object({
    id: z.string().min(1),
    effective_score: z.number().min(0).max(1),
    evidence_count: z.int().nonnegative(),
    source: z.enum(['overlay', 'snapshot']),
  })
  .strict();

export const effectiveScoreViewSchema = z
  .object({
    ...lifecycleFields,
    effective_score_view_id: z.string().min(1),
    mode: rankingModeSchema,
    /** The global view this was derived from, when recorded. */
    parent_score_view_id: z.string().min(1).nullable(),
    scoring_policy_version: z.string().min(1),
    /** Latest `ingested_at` reflected in these scores. */
    evidence_watermark: isoInstantSchema.nullable(),
    computed_at: isoInstantSchema.nullable(),
    /** Only the assets considered for this decision. */
    assets: z.array(scoreViewAssetSchema),
    /** Derived per Solution Set; never written to Git (C-01). */
    challenge_states: z.array(
      z
        .object({
          solution_set_id: z.string().min(1),
          challenge_state: challengeStateSchema,
          challenger_asset_id: z.string().min(1).nullable(),
          margin: z.number().nullable(),
        })
        .strict()
        .superRefine((entry, ctx) => {
          if (entry.challenge_state === 'challenged' && entry.challenger_asset_id === null) {
            ctx.addIssue({
              code: 'custom',
              path: ['challenger_asset_id'],
              message: 'a challenged set must name the challenger',
            });
          }
          if (entry.challenge_state === 'none' && entry.challenger_asset_id !== null) {
            ctx.addIssue({
              code: 'custom',
              path: ['challenger_asset_id'],
              message: 'an unchallenged set has no challenger',
            });
          }
        }),
    ),
  })
  .strict()
  .superRefine((view, ctx) => {
    if (view.mode === 'recorded' && view.parent_score_view_id === null) {
      ctx.addIssue({
        code: 'custom',
        path: ['parent_score_view_id'],
        message: 'a recorded view must name the immutable global view it came from (Q-06)',
      });
    }
    const seen = new Set<string>();
    for (const asset of view.assets) {
      if (seen.has(asset.id)) {
        ctx.addIssue({
          code: 'custom',
          path: ['assets'],
          message: `asset ${asset.id} appears twice in one score view`,
        });
      }
      seen.add(asset.id);
    }
  });
export type EffectiveScoreView = z.infer<typeof effectiveScoreViewSchema>;

/**
 * The release-carried score snapshot (D24).
 *
 * `state: UNPROVEN` is the Stage 0-1 bootstrap (Q-02): there is no Evidence
 * Plane yet, so every asset sits at the uniform prior with zero evidence and a
 * null `computed_at`. Making that an explicit state rather than an empty
 * snapshot means `resolve` can report honestly that nothing has been proven,
 * instead of reporting scores that look measured.
 */
export const scoreSnapshotSchema = z
  .object({
    ...lifecycleFields,
    state: z.enum(['UNPROVEN', 'DERIVED']),
    score_view_id: z.string().min(1).nullable(),
    scoring_policy_version: z.string().min(1),
    computed_at: isoInstantSchema.nullable(),
    assets: z.array(
      z
        .object({
          id: z.string().min(1),
          score: z.number().min(0).max(1),
          evidence_count: z.int().nonnegative(),
        })
        .strict(),
    ),
  })
  .strict()
  .superRefine((snapshot, ctx) => {
    if (snapshot.state !== 'UNPROVEN') {
      if (snapshot.computed_at === null) {
        ctx.addIssue({
          code: 'custom',
          path: ['computed_at'],
          message: 'a derived snapshot must record when it was computed',
        });
      }
      if (snapshot.score_view_id === null) {
        ctx.addIssue({
          code: 'custom',
          path: ['score_view_id'],
          message: 'a derived snapshot must identify its immutable score view (Q-06)',
        });
      }
      return;
    }

    // UNPROVEN: nothing may look measured.
    if (snapshot.computed_at !== null) {
      ctx.addIssue({
        code: 'custom',
        path: ['computed_at'],
        message: 'an UNPROVEN snapshot has not been computed from evidence (Q-02)',
      });
    }
    if (snapshot.score_view_id !== null) {
      ctx.addIssue({
        code: 'custom',
        path: ['score_view_id'],
        message: 'an UNPROVEN snapshot has no score view; there is no Evidence Plane yet (Q-02)',
      });
    }
    if (snapshot.scoring_policy_version !== '0') {
      ctx.addIssue({
        code: 'custom',
        path: ['scoring_policy_version'],
        message: 'the bootstrap snapshot carries scoring_policy_version "0" (Q-02)',
      });
    }
    for (const [index, asset] of snapshot.assets.entries()) {
      if (asset.evidence_count !== 0) {
        ctx.addIssue({
          code: 'custom',
          path: ['assets', index, 'evidence_count'],
          message: 'an UNPROVEN snapshot records no evidence (Q-02)',
        });
      }
      if (asset.score !== UNIFORM_PRIOR) {
        ctx.addIssue({
          code: 'custom',
          path: ['assets', index, 'score'],
          message: `an UNPROVEN snapshot places every asset at the uniform prior ${String(UNIFORM_PRIOR)} (Q-02)`,
        });
      }
    }
  });
export type ScoreSnapshot = z.infer<typeof scoreSnapshotSchema>;

/**
 * The uniform prior of open parameter 3 ("uniform prior, no decay").
 *
 * A named constant rather than a literal so that when Stage 10 calibrates it
 * from real evidence distribution, there is exactly one place to change and one
 * place whose change is visible in a diff.
 */
export const UNIFORM_PRIOR = 0.5;

/**
 * Build the deterministic Stage 0-1 bootstrap snapshot (D24, Q-02).
 *
 * Deterministic for a given asset list: the assets are sorted by id, so two
 * builds of the same knowledge tree produce byte-identical output and therefore
 * an identical digest. That is what makes fitness rule F8 already meaningful at
 * Stage 0.
 */
export function buildUnprovenSnapshot(assetIds: readonly string[]): ScoreSnapshot {
  return {
    schema_version: '1',
    stability: 'development',
    introduced_in: '0.1.0',
    deprecated_in: null,
    replacement: null,
    migration_path: null,
    state: 'UNPROVEN',
    score_view_id: null,
    scoring_policy_version: '0',
    computed_at: null,
    assets: [...assetIds]
      .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
      .map((id) => ({ id, score: UNIFORM_PRIOR, evidence_count: 0 })),
  };
}
