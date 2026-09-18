import { describe, expect, it } from 'vitest';
import { rank } from '../src/rank.ts';
import { anAsset, scoresFor } from './fixtures.ts';

describe('failed_solution recommendation boundary', () => {
  it('keeps failed solutions inspectable in the index input but never returns them from rank', () => {
    const failed = anAsset({ id: 'asset_failed', type: 'failed_solution', title: 'Do not use' });
    const valid = anAsset({ id: 'asset_valid', title: 'Use this' });

    const result = rank({
      candidates: [
        { asset: failed, rank: -100 },
        { asset: valid, rank: -1 },
      ],
      solutionSets: [],
      scores: scoresFor({ asset_failed: 1, asset_valid: 0.1 }),
      projectFacts: {},
      capabilities: [],
      limit: 10,
    });

    expect(result.items.map((item) => item.id)).toEqual(['asset_valid']);
    expect(result.omitted_count).toBe(1);
  });
});
