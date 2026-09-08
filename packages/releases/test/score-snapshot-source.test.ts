/**
 * Where the score snapshot's numbers came from (D24, D34).
 *
 * At Stage 2 the Evidence Plane answers UNPROVEN, because scoring is Stage 10.
 * So a snapshot read from the plane and a bootstrap snapshot contain the same
 * numbers, and the only thing separating them is the recorded source. That is
 * exactly why the source is recorded: without it, the day the plane starts
 * returning real scores would look identical to the day before it, and a silent
 * fallback would look like a working read forever.
 */

import { describe, expect, it } from 'vitest';
import { buildScoreSnapshot, emitUnprovenSnapshot, snapshotFromOverlay } from '../src/index.ts';

const ASSETS = ['asset_b', 'asset_a'];

const UNPROVEN_OVERLAY = {
  state: 'UNPROVEN',
  scores: [],
  computed_at: null,
  scoring_policy_version: '0',
};

describe('reading the Evidence Plane', () => {
  it('records the plane as the source when the read succeeds', async () => {
    const built = await buildScoreSnapshot({
      assetIds: ASSETS,
      readOverlay: () => Promise.resolve(UNPROVEN_OVERLAY),
    });
    expect(built.source).toBe('evidence_plane');
    expect(built.fallbackReason).toBeNull();
  });

  it('produces the SAME numbers as the bootstrap at Stage 2, and says so differently', () => {
    // The distinction the source field exists for.
    const fromPlane = snapshotFromOverlay(UNPROVEN_OVERLAY, ASSETS);
    expect(fromPlane?.digest).toBe(emitUnprovenSnapshot(ASSETS).digest);
  });

  it('carries real scores through when the plane has them', () => {
    const derived = snapshotFromOverlay(
      {
        state: 'DERIVED',
        scores: [{ id: 'asset_a', score: 0.75, evidence_count: 3 }],
        computed_at: '2026-09-08T00:00:00.000Z',
        scoring_policy_version: '1',
        score_view_id: 'sv_x',
      },
      ASSETS,
    );
    expect(derived?.snapshot.assets).toEqual([
      { id: 'asset_a', score: 0.75, evidence_count: 3 },
      // Not dropped: an asset the scorer said nothing about keeps the prior.
      // Dropping it would shrink the corpus `resolve` can see because nobody
      // had an opinion yet, which is the opposite of "no evidence".
      { id: 'asset_b', score: 0.5, evidence_count: 0 },
    ]);
  });

  it('sorts by id, so the same overlay always digests the same', () => {
    const first = snapshotFromOverlay(UNPROVEN_OVERLAY, ['asset_b', 'asset_a']);
    const second = snapshotFromOverlay(UNPROVEN_OVERLAY, ['asset_a', 'asset_b']);
    expect(second?.digest).toBe(first?.digest);
  });
});

describe('when the plane cannot be read', () => {
  it('falls back to the bootstrap rather than failing the build (D24)', async () => {
    // D24's whole reason for a snapshot is that `resolve` must work offline. A
    // build that could not run without the plane would have inverted that.
    const built = await buildScoreSnapshot({
      assetIds: ASSETS,
      readOverlay: () => Promise.reject(new Error('offline')),
    });
    expect(built.source).toBe('bootstrap');
    expect(built.fallbackReason).toContain('offline');
    expect(built.snapshot.state).toBe('UNPROVEN');
  });

  it('says so when no plane is configured at all', async () => {
    const built = await buildScoreSnapshot({ assetIds: ASSETS, readOverlay: null });
    expect(built.source).toBe('bootstrap');
    expect(built.fallbackReason).toContain('no Evidence Plane is configured');
  });

  it('falls back rather than shipping an overlay it cannot read', async () => {
    for (const bad of [null, 'nope', { state: 'MEASURED' }, {}]) {
      const built = await buildScoreSnapshot({
        assetIds: ASSETS,
        readOverlay: () => Promise.resolve(bad),
      });
      expect(built.source).toBe('bootstrap');
    }
  });
});

describe('what an overlay may not contain', () => {
  it('refuses a score outside [0,1] rather than clamping it', () => {
    // A clamp would silently accept a scorer that had gone wrong, and the
    // release would ship its output looking well-formed.
    expect(
      snapshotFromOverlay(
        { state: 'DERIVED', scores: [{ id: 'asset_a', score: 1.5, evidence_count: 1 }] },
        ASSETS,
      ),
    ).toBeNull();
    expect(
      snapshotFromOverlay(
        { state: 'DERIVED', scores: [{ id: 'asset_a', score: -1, evidence_count: 1 }] },
        ASSETS,
      ),
    ).toBeNull();
  });

  it('refuses a negative evidence count', () => {
    expect(
      snapshotFromOverlay(
        { state: 'DERIVED', scores: [{ id: 'asset_a', score: 0.5, evidence_count: -3 }] },
        ASSETS,
      ),
    ).toBeNull();
  });

  it('refuses a DERIVED snapshot with no computed_at, at the contract', () => {
    // The schema's own rule: a derived snapshot must record when it was
    // computed. Enforced there rather than here, so no other writer can produce
    // the state this rejects.
    expect(() =>
      snapshotFromOverlay(
        { state: 'DERIVED', scores: [], computed_at: null, score_view_id: 'sv_x' },
        ASSETS,
      ),
    ).toThrow();
  });

  it('carries no Champion, whatever the overlay says (D34, C-01)', () => {
    // The Champion is part of the release index. A snapshot carrying one would
    // let a live score move a canonical answer that only a promotion may move.
    const derived = snapshotFromOverlay(
      {
        state: 'UNPROVEN',
        scores: [],
        champion_id: 'asset_a',
        canonical_state: 'pinned',
      },
      ASSETS,
    );
    expect(JSON.stringify(derived?.snapshot)).not.toContain('champion');
    expect(JSON.stringify(derived?.snapshot)).not.toContain('canonical_state');
  });
});
