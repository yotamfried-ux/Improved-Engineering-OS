/**
 * The bootstrap UNPROVEN snapshot (Stage 0 criterion B6) and the claim-status
 * model it belongs to.
 *
 * Two things are under test:
 *
 *   the D24/Q-02 snapshot itself -- deterministic, hashes identically across
 *   platforms, and says in its own data that nothing has been proven;
 *
 *   the three-way distinction the constitution requires -- proven, failed, and
 *   never-observed -- including the rule that absence of evidence must never
 *   silently become a pass.
 */

import { describe, expect, it } from 'vitest';
import {
  aggregateClaims,
  buildUnprovenSnapshot,
  claimSchema,
  fromBoundaryVerdict,
  fromCheckOutcome,
  fromFitnessStatus,
  fromSnapshotState,
  fromTelemetryState,
  scoreSnapshotSchema,
  UNIFORM_PRIOR,
  type ClaimRecord,
} from '@ieos/core';
import { EMPTY_SNAPSHOT_DIGEST, emitUnprovenSnapshot } from '../src/index.ts';

const LIFECYCLE = {
  schema_version: '1',
  stability: 'development' as const,
  introduced_in: '0.1.0',
  deprecated_in: null,
  replacement: null,
  migration_path: null,
};

describe('the bootstrap snapshot is emitted, valid and honest (D24, Q-02)', () => {
  it('emits a snapshot that satisfies the contract', () => {
    const emitted = emitUnprovenSnapshot(['asset_b', 'asset_a']);
    expect(scoreSnapshotSchema.safeParse(emitted.snapshot).success).toBe(true);
  });

  it('says UNPROVEN in its own data rather than looking measured', () => {
    const { snapshot } = emitUnprovenSnapshot(['asset_a']);
    expect(snapshot.state).toBe('UNPROVEN');
    expect(snapshot.computed_at).toBeNull();
    expect(snapshot.score_view_id).toBeNull();
    expect(snapshot.scoring_policy_version).toBe('0');
    expect(snapshot.assets.every((a) => a.evidence_count === 0)).toBe(true);
    expect(snapshot.assets.every((a) => a.score === UNIFORM_PRIOR)).toBe(true);
  });

  it('carries no champion field: champions come from the release index (C-01)', () => {
    const { snapshot } = emitUnprovenSnapshot(['asset_a']);
    expect(Object.keys(snapshot)).not.toContain('champion_id');
    expect(Object.keys(snapshot)).not.toContain('canonical_state');
  });
});

describe('determinism -- the Stage 0 cross-platform gate depends on it', () => {
  it('produces identical bytes and digest on repeat emission', () => {
    const first = emitUnprovenSnapshot(['asset_b', 'asset_a']);
    const second = emitUnprovenSnapshot(['asset_b', 'asset_a']);
    expect(second.content).toBe(first.content);
    expect(second.digest).toBe(first.digest);
  });

  it('ignores the order asset ids were supplied in', () => {
    expect(emitUnprovenSnapshot(['asset_a', 'asset_b']).digest).toBe(
      emitUnprovenSnapshot(['asset_b', 'asset_a']).digest,
    );
  });

  it('changes when the asset set changes, so the digest is not a constant', () => {
    expect(emitUnprovenSnapshot(['asset_a']).digest).not.toBe(
      emitUnprovenSnapshot(['asset_a', 'asset_b']).digest,
    );
  });

  it('pins the empty-snapshot digest as the cross-platform fixture', () => {
    // This exact value is what the Windows smoke job compares against. It
    // depends on no filesystem, clock or locale, so any difference between
    // platforms is a real canonicalization defect rather than an environment
    // artefact.
    expect(EMPTY_SNAPSHOT_DIGEST).toBe(
      'sha256:e8c450ac1ae5c1a2c33cb466346cfef6da3cb4f520b9675800f5aa85ee6febbe',
    );
  });

  it('digests the canonical form, not the file bytes', () => {
    // A formatting change must not read as a content change, and a content
    // change must not be hidden by formatting.
    const emitted = emitUnprovenSnapshot([]);
    expect(emitted.content).not.toBe(emitted.digest);
    expect(emitted.content.endsWith('\n')).toBe(true);
  });

  it('the underlying builder sorts, so the emitter inherits determinism', () => {
    expect(buildUnprovenSnapshot(['b', 'a']).assets.map((a) => a.id)).toEqual(['a', 'b']);
  });
});

// ---------------------------------------------------------------------------
// The claim-status model
// ---------------------------------------------------------------------------

const aClaim = (over: Partial<ClaimRecord> = {}): unknown => ({
  ...LIFECYCLE,
  id: 'claim.example',
  statement: 'the digest is identical on every required platform',
  status: 'proven',
  unproven_reason: null,
  evidence: 'observed on linux in this run',
  observed_on: ['linux'],
  required_on: ['linux'],
  ...over,
});

describe('the three-way distinction is structural', () => {
  it('accepts a proven claim that carries evidence', () => {
    expect(claimSchema.safeParse(aClaim()).success).toBe(true);
  });

  it('accepts a failed claim', () => {
    expect(
      claimSchema.safeParse(
        aClaim({ status: 'failed', evidence: 'digest differed between two runs' }),
      ).success,
    ).toBe(true);
  });

  it('accepts an unproven claim that says why', () => {
    expect(
      claimSchema.safeParse(
        aClaim({
          status: 'unproven',
          unproven_reason: 'not_executed',
          evidence: 'the Windows job has never run',
          observed_on: [],
        }),
      ).success,
    ).toBe(true);
  });

  it('rejects an unproven claim with no reason, because silence reads as a pass', () => {
    const result = claimSchema.safeParse(aClaim({ status: 'unproven', observed_on: [] }));
    expect(result.success).toBe(false);
  });

  it('rejects a claim with no evidence at all, even a proven one', () => {
    expect(claimSchema.safeParse(aClaim({ evidence: '' })).success).toBe(false);
  });

  it('rejects unproven_reason on a claim that is not unproven', () => {
    expect(claimSchema.safeParse(aClaim({ unproven_reason: 'blocked' })).success).toBe(false);
  });

  it('rejects "proven" on fewer platforms than the claim requires', () => {
    // The rule that stops "green on Linux" from becoming "green" -- and the
    // exact shape of the D35 cross-platform gate.
    const result = claimSchema.safeParse(
      aClaim({ observed_on: ['linux'], required_on: ['linux', 'win32'] }),
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toMatch(/win32/u);
      expect(result.error.issues[0]?.message).toMatch(/unproven, not proven/u);
    }
  });

  it('accepts the same claim once it is honestly marked unproven', () => {
    expect(
      claimSchema.safeParse(
        aClaim({
          status: 'unproven',
          unproven_reason: 'not_executed',
          observed_on: ['linux'],
          required_on: ['linux', 'win32'],
        }),
      ).success,
    ).toBe(true);
  });

  it('has exactly three statuses, with no room for "probably fine"', () => {
    for (const status of ['skipped', 'partial', 'n/a', 'unknown']) {
      expect(claimSchema.safeParse(aClaim({ status } as never)).success).toBe(false);
    }
  });
});

describe('the existing vocabularies map onto one model', () => {
  it.each([
    ['proven', 'proven'],
    ['violated', 'failed'],
    ['unproven', 'unproven'],
  ])('boundary verdict %s -> %s', (verdict, expected) => {
    expect(fromBoundaryVerdict(verdict as never)).toBe(expected);
  });

  it.each([
    ['pass', 'proven'],
    ['fail', 'failed'],
    ['unexecuted', 'unproven'],
  ])('check outcome %s -> %s', (outcome, expected) => {
    expect(fromCheckOutcome(outcome as never)).toBe(expected);
  });

  it('snapshot state, telemetry state and fitness status all map conservatively', () => {
    expect(fromSnapshotState('DERIVED')).toBe('proven');
    expect(fromSnapshotState('UNPROVEN')).toBe('unproven');
    expect(fromTelemetryState('COMPLETE')).toBe('proven');
    expect(fromTelemetryState('INCOMPLETE')).toBe('unproven');
    expect(fromFitnessStatus('enforced')).toBe('proven');
    // Neither `partial` nor `not-yet-enforceable` is a pass.
    expect(fromFitnessStatus('partial')).toBe('unproven');
    expect(fromFitnessStatus('not-yet-enforceable')).toBe('unproven');
  });
});

describe('aggregation is pessimistic, and an empty set is never a pass', () => {
  it('is proven only when everything is proven', () => {
    expect(aggregateClaims([{ status: 'proven' }, { status: 'proven' }])).toBe('proven');
  });

  it('is failed when anything failed, even alongside unproven entries', () => {
    expect(
      aggregateClaims([{ status: 'proven' }, { status: 'unproven' }, { status: 'failed' }]),
    ).toBe('failed');
  });

  it('is unproven when anything is unproven', () => {
    expect(aggregateClaims([{ status: 'proven' }, { status: 'unproven' }])).toBe('unproven');
  });

  it('is unproven for an empty set -- nothing observed is not nothing wrong', () => {
    // The vacuous-success failure mode, closed at the aggregation level.
    expect(aggregateClaims([])).toBe('unproven');
  });
});
