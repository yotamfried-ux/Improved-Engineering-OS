/**
 * The Effective Score View of one decision (D24, P-03).
 *
 * P-03's point: in `live_overlay` mode, keeping only an overlay digest proves
 * an overlay existed but cannot reconstruct it. This records the assets that
 * actually affected one decision, so an investigation a month later can answer
 * "why was asset X proposed" without storing the whole catalogue per call.
 *
 * Note what is absent, and stays absent: `champion_id` and `canonical_state`.
 * Champion identity comes from the release index (D34, C-01), and a resolver
 * reading this module cannot find a Champion in it. That is the half of F11 a
 * module boundary can enforce on its own.
 */

import { effectiveScoreViewId } from '@ieos/core';
import type { RankingMode, ScoreSnapshot } from '@ieos/core';

/**
 * The view id for a decision taken against the release's score snapshot.
 *
 * At Stage 2 there is no live overlay to consult, so every asset's score comes
 * from the snapshot the release carries and `score_source` says `snapshot`.
 * That is D24 working as designed rather than a shortfall: the contract has a
 * field for exactly this, and the bootstrap snapshot says `UNPROVEN` in its own
 * data.
 */
export function effectiveViewIdFor(snapshot: ScoreSnapshot, mode: RankingMode): string {
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
