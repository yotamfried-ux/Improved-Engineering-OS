/**
 * Deterministic fixtures for the ranker.
 *
 * Fixed values throughout: no clock, no randomness. A ranking test whose input
 * varies between runs cannot distinguish a policy change from noise.
 */

import type { AssetRecord, ScoreSnapshot, SolutionSetRecord } from '@ieos/core';

const LIFECYCLE = {
  schema_version: '1',
  stability: 'development',
  introduced_in: '0.1.0',
  deprecated_in: null,
  replacement: null,
  migration_path: null,
} as const;

const AT = '2026-09-06T00:00:00.000Z';
const SHA0 = 'sha256:44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a';

export function anAsset(over: Partial<AssetRecord> = {}): AssetRecord {
  return {
    ...LIFECYCLE,
    id: 'asset_a',
    type: 'pattern',
    slug: 'a',
    title: 'Asset A',
    summary: 'Summary of A.',
    status: 'active',
    content_hash: SHA0,
    legacy_ids: [],
    problem: { id: 'problem.auth', capabilities: ['auth.oauth.pkce'] },
    solution_set_id: null,
    applicability: { conditions: [] },
    compatibility: { platforms: [], providers: [], constraints: [] },
    provenance: [
      {
        source_type: 'existing_eos',
        source_identity: 'yotamfried-ux/Engineering-OS',
        source_revision: 'b'.repeat(40),
        observed_at: AT,
        integrity: 'verified',
      },
    ],
    freshness: { class: 'normal', last_verified_at: AT },
    risk: { execution_authority: 'data_only', blast_radius: 'read_only' },
    relationships: { supersedes: [], superseded_by: [], related_to: [] },
    evidence_policy: { eligible_origins: ['qualification', 'operational'] },
    body: 'body.md',
    files: [],
    ...over,
  } as AssetRecord;
}

export function aPinnedSet(over: Partial<SolutionSetRecord> = {}): SolutionSetRecord {
  return {
    ...LIFECYCLE,
    id: 'solset_pinned',
    problem_id: 'problem.auth',
    compatibility_key: 'web',
    members: ['asset_a', 'asset_b'],
    champion_id: 'asset_a',
    canonical_state: 'pinned',
    champion_since_release: '1.0.0',
    why_unresolved: null,
    ...over,
  } as SolutionSetRecord;
}

export function anUnresolvedSet(over: Partial<SolutionSetRecord> = {}): SolutionSetRecord {
  return {
    ...LIFECYCLE,
    id: 'solset_unresolved',
    problem_id: 'problem.auth',
    compatibility_key: 'web',
    members: ['asset_c', 'asset_d'],
    champion_id: null,
    canonical_state: 'unresolved',
    champion_since_release: null,
    why_unresolved: 'all members unproven at import',
    ...over,
  } as SolutionSetRecord;
}

/** A snapshot that gives each named asset a distinct score, for tie-break tests. */
export function scoresFor(entries: Readonly<Record<string, number>>): ScoreSnapshot {
  return {
    ...LIFECYCLE,
    state: 'DERIVED',
    score_view_id: 'sv_test',
    scoring_policy_version: '1',
    computed_at: AT,
    assets: Object.entries(entries)
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([id, score]) => ({ id, score, evidence_count: 1 })),
  } as ScoreSnapshot;
}
