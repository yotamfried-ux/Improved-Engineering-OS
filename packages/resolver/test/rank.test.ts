/**
 * D20.3 ranking, and the two rules it exists to keep.
 *
 * Q-05: one solution in front. A `resolve` result carries the Champion of a
 * resolved Solution Set and no challengers.
 *
 * F11 / P-01: Champion identity comes from the release index only, and a set
 * with `champion_id: null` never yields one -- no path substitutes the
 * highest-scoring member, which is precisely the substitution a scorer would
 * find natural and the constitution forbids.
 *
 * The pure ranker is tested here without any database, which is the point of
 * splitting it from the port reads.
 */

import { describe, expect, it } from 'vitest';
import { championsOf, projectFitOf, rank } from '../src/index.ts';
import { anAsset, aPinnedSet, anUnresolvedSet, scoresFor } from './fixtures.ts';

const base = {
  solutionSets: [],
  scores: scoresFor({}),
  projectFacts: {},
  capabilities: [],
  limit: 10,
} as const;

describe('Champion selection reads the release index and nothing else (F11)', () => {
  it('returns the Champion of a pinned set', () => {
    expect(championsOf([aPinnedSet()]).get('solset_pinned')).toBe('asset_a');
  });

  it('returns no Champion for an unresolved set, whatever its members score', () => {
    // The signature is the enforcement: `championsOf` cannot see a score, so
    // there is no code path in which a high scorer could stand in for null.
    expect(championsOf([anUnresolvedSet()]).size).toBe(0);
  });

  it('refuses a champion_id that is not a member of its own set', () => {
    const set = aPinnedSet({ champion_id: 'asset_stranger' } as never);
    expect(championsOf([set]).size).toBe(0);
  });

  it('reports an unresolved set as coverage rather than promoting a member', () => {
    const result = rank({
      ...base,
      candidates: [
        { asset: anAsset({ id: 'asset_c', solution_set_id: 'solset_unresolved' }), rank: -10 },
        { asset: anAsset({ id: 'asset_d', solution_set_id: 'solset_unresolved' }), rank: -9 },
      ],
      solutionSets: [anUnresolvedSet()],
      // asset_c scores far higher. It still must not be returned.
      scores: scoresFor({ asset_c: 0.99, asset_d: 0.1 }),
    });

    expect(result.items).toEqual([]);
    expect(result.coverage).toEqual([
      {
        solution_set_id: 'solset_unresolved',
        unresolved_solution_set: true,
        member_count: 2,
        problem_id: 'problem.auth',
      },
    ]);
  });

  it('returns the Champion only, never the challenger (Q-05)', () => {
    const result = rank({
      ...base,
      candidates: [
        // The challenger is the better text match AND the higher scorer.
        { asset: anAsset({ id: 'asset_b', solution_set_id: 'solset_pinned' }), rank: -20 },
        { asset: anAsset({ id: 'asset_a', solution_set_id: 'solset_pinned' }), rank: -1 },
      ],
      solutionSets: [aPinnedSet()],
      scores: scoresFor({ asset_a: 0.2, asset_b: 0.95 }),
    });

    expect(result.items.map((item) => item.id)).toEqual(['asset_a']);
    expect(result.items[0]?.champion_of).toBe('solset_pinned');
    expect(result.items[0]?.champion_status).toBe('pinned');
    expect(result.omitted_count).toBe(1);
  });
});

describe('ordering is deterministic and total', () => {
  it('orders by relevance first', () => {
    const result = rank({
      ...base,
      candidates: [
        { asset: anAsset({ id: 'asset_far' }), rank: -1 },
        { asset: anAsset({ id: 'asset_near' }), rank: -30 },
      ],
    });
    expect(result.items.map((item) => item.id)).toEqual(['asset_near', 'asset_far']);
  });

  it('breaks a relevance tie on Asset Score', () => {
    const result = rank({
      ...base,
      candidates: [
        { asset: anAsset({ id: 'asset_low' }), rank: -5 },
        { asset: anAsset({ id: 'asset_high' }), rank: -5 },
      ],
      scores: scoresFor({ asset_low: 0.1, asset_high: 0.9 }),
    });
    expect(result.items.map((item) => item.id)).toEqual(['asset_high', 'asset_low']);
  });

  it('breaks a total tie on id, so two machines agree', () => {
    // Without this the order would depend on input order, and
    // `context_snapshot_id` would stop being reproducible.
    const forward = rank({
      ...base,
      candidates: [
        { asset: anAsset({ id: 'asset_b' }), rank: -5 },
        { asset: anAsset({ id: 'asset_a' }), rank: -5 },
      ],
    });
    const reversed = rank({
      ...base,
      candidates: [
        { asset: anAsset({ id: 'asset_a' }), rank: -5 },
        { asset: anAsset({ id: 'asset_b' }), rank: -5 },
      ],
    });
    expect(forward.items.map((i) => i.id)).toEqual(['asset_a', 'asset_b']);
    expect(reversed.items.map((i) => i.id)).toEqual(forward.items.map((i) => i.id));
  });

  it('counts what the limit cut rather than losing it', () => {
    const result = rank({
      ...base,
      candidates: [
        { asset: anAsset({ id: 'asset_a' }), rank: -3 },
        { asset: anAsset({ id: 'asset_b' }), rank: -2 },
        { asset: anAsset({ id: 'asset_c' }), rank: -1 },
      ],
      limit: 1,
    });
    expect(result.items).toHaveLength(1);
    expect(result.omitted_count).toBe(2);
  });
});

describe('Project Fit', () => {
  const conditional = anAsset({
    applicability: { conditions: [{ fact: 'platform', in: ['web'] }] },
  });

  it('fits an asset that declares no conditions', () => {
    expect(projectFitOf(anAsset(), {})).toEqual({ verdict: 'fits', confirmed: 1 });
  });

  it('fits when every declared condition is confirmed', () => {
    expect(projectFitOf(conditional, { platform: 'web' }).verdict).toBe('fits');
  });

  it('contradicts when a known fact rules the asset out', () => {
    expect(projectFitOf(conditional, { platform: 'ios' }).verdict).toBe('contradicted');
  });

  it('is unknown -- not a fit, and not a rejection -- when the fact is unobserved', () => {
    // The Project Profile contract is designed at Stage 6. Treating "not
    // observed" as "does not apply" would hide most of the corpus; treating it
    // as "applies" would claim a fit nobody established.
    const fit = projectFitOf(conditional, {});
    expect(fit.verdict).toBe('unknown');
    expect(fit.confirmed).toBe(0);
  });

  it('drops a contradicted asset from the results and counts it as omitted', () => {
    const result = rank({
      ...base,
      candidates: [{ asset: conditional, rank: -10 }],
      projectFacts: { platform: 'ios' },
    });
    expect(result.items).toEqual([]);
    expect(result.omitted_count).toBe(1);
  });

  it('keeps an unknown-fit asset, reporting the fraction confirmed', () => {
    const two = anAsset({
      applicability: {
        conditions: [
          { fact: 'platform', in: ['web'] },
          { fact: 'framework', in: ['next'] },
        ],
      },
    });
    const result = rank({
      ...base,
      candidates: [{ asset: two, rank: -10 }],
      projectFacts: { platform: 'web' },
    });
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.project_fit).toBe(0.5);
  });
});

describe('capability match', () => {
  it('keeps only assets declaring a requested capability', () => {
    const result = rank({
      ...base,
      candidates: [
        { asset: anAsset({ id: 'asset_hit' }), rank: -5 },
        {
          asset: anAsset({
            id: 'asset_miss',
            problem: { id: 'problem.other', capabilities: ['storage.blob'] },
          }),
          rank: -6,
        },
      ],
      capabilities: ['auth.oauth.pkce'],
    });
    expect(result.items.map((item) => item.id)).toEqual(['asset_hit']);
    expect(result.omitted_count).toBe(1);
  });

  it('is a no-op when the request names no capability, leaving retrieval to decide', () => {
    const result = rank({
      ...base,
      candidates: [{ asset: anAsset({ id: 'asset_any' }), rank: -5 }],
      capabilities: [],
    });
    expect(result.items).toHaveLength(1);
  });
});

describe('scores are reported, never invented', () => {
  it('reports an asset absent from the snapshot at zero with no evidence', () => {
    const result = rank({ ...base, candidates: [{ asset: anAsset(), rank: -5 }] });
    expect(result.items[0]?.score).toBe(0);
    expect(result.items[0]?.evidence_count).toBe(0);
    expect(result.items[0]?.score_source).toBe('snapshot');
  });
});
