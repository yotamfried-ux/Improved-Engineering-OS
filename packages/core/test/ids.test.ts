/**
 * D19 minted identities and the deterministic identifiers of D24, D25 and D32.
 *
 * Each pinned identifier was reproduced by an independent implementation before
 * being written here, so a pin records what D35 specifies rather than what this
 * code happened to emit.
 *
 * The `Clock` and `RandomSource` ports are supplied as fixed test doubles, so
 * every assertion here is exact rather than "matches a pattern". Nothing in
 * `core` reaches for the wall clock or the system CSPRNG on its own; if that
 * ever changes, these tests stop being deterministic and say so.
 */

import { describe, expect, it } from 'vitest';
import {
  contextSnapshotId,
  effectiveScoreViewId,
  evidenceId,
  isDeterministicId,
  isMintedId,
  mintId,
  mintUlid,
} from '../src/ids.ts';
import { InvalidIdentifierError } from '../src/errors.ts';
import type { Clock, RandomSource } from '../src/ports/index.ts';

const fixedClock = (ms: number): Clock => ({
  nowMs: () => ms,
  nowIso: () => new Date(ms).toISOString(),
});

/** Deterministic bytes: 0x00, 0x01, ... so the encoded output is checkable by hand. */
const countingRandom: RandomSource = {
  bytes: (length) => Uint8Array.from({ length }, (_unused, index) => index),
};

const zeroRandom: RandomSource = { bytes: (length) => new Uint8Array(length) };

describe('minted ULID identities (D19)', () => {
  it('is 26 Crockford base32 characters', () => {
    const ulid = mintUlid(fixedClock(0), zeroRandom);
    expect(ulid).toHaveLength(26);
    expect(ulid).toBe('0'.repeat(26));
  });

  it('encodes the timestamp in the first 10 characters, so ids sort by time', () => {
    const earlier = mintUlid(fixedClock(1_000), zeroRandom);
    const later = mintUlid(fixedClock(2_000), zeroRandom);
    expect(earlier < later).toBe(true);
  });

  it('varies with randomness at the same instant', () => {
    const a = mintUlid(fixedClock(1_000), zeroRandom);
    const b = mintUlid(fixedClock(1_000), countingRandom);
    expect(a).not.toBe(b);
    expect(a.slice(0, 10)).toBe(b.slice(0, 10));
  });

  it('never emits I, L, O or U, which is the point of the Crockford alphabet', () => {
    const ulid = mintUlid(fixedClock(1_699_999_999_999), countingRandom);
    expect(ulid).not.toMatch(/[ILOU]/u);
  });

  it('prefixes minted ids by type', () => {
    expect(mintId('asset', fixedClock(0), zeroRandom)).toBe(`asset_${'0'.repeat(26)}`);
  });

  it.each([
    ['a negative timestamp', -1],
    ['a non-integer timestamp', 1.5],
    ['a timestamp past the 48-bit ULID limit', 281_474_976_710_656],
  ])('rejects %s', (_label, ms) => {
    expect(() => mintUlid(fixedClock(ms), zeroRandom)).toThrow(InvalidIdentifierError);
  });

  it('rejects the wrong amount of randomness rather than padding it', () => {
    const short: RandomSource = { bytes: () => new Uint8Array(4) };
    expect(() => mintUlid(fixedClock(0), short)).toThrow(/exactly 10 bytes/u);
  });
});

describe('identity recognisers', () => {
  it('accepts a well-formed minted id', () => {
    expect(isMintedId('asset_01J9Z6Q0K3N6X4R8V2T7M5B1WQ')).toBe(true);
    expect(isMintedId('asset_01J9Z6Q0K3N6X4R8V2T7M5B1WQ', 'asset')).toBe(true);
  });

  it.each([
    ['the wrong prefix for the expected type', 'run_01J9Z6Q0K3N6X4R8V2T7M5B1WQ', 'asset'],
    ['an unknown prefix', 'widget_01J9Z6Q0K3N6X4R8V2T7M5B1WQ', undefined],
    ['no prefix at all', '01J9Z6Q0K3N6X4R8V2T7M5B1WQ', undefined],
    ['a body that is too short', 'asset_01J9Z6', undefined],
    ['a body with an excluded letter', 'asset_01J9Z6Q0K3N6X4R8V2T7M5B1WI', undefined],
    ['an empty prefix', '_01J9Z6Q0K3N6X4R8V2T7M5B1WQ', undefined],
  ])('rejects %s', (_label, value, prefix) => {
    expect(isMintedId(value, prefix as never)).toBe(false);
  });

  it('keeps minted and deterministic id spaces apart', () => {
    const deterministic = evidenceId({
      run_id: 'run_1',
      deriver_id: 'attribution',
      deriver_version: '1',
      input_snapshot_hash: 'sha256:00',
    });
    expect(isDeterministicId(deterministic, 'evd')).toBe(true);
    expect(isMintedId(deterministic)).toBe(false);
    expect(isDeterministicId('asset_01J9Z6Q0K3N6X4R8V2T7M5B1WQ')).toBe(false);
  });
});

describe('evidence_id (D32, C-03)', () => {
  const inputs = {
    run_id: 'run_01J9Z6Q0K3N6X4R8V2T7M5B1WQ',
    deriver_id: 'attribution',
    deriver_version: '3',
    input_snapshot_hash: 'sha256:44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a',
  } as const;

  it('replays to the same id -- the D32 property', () => {
    expect(evidenceId(inputs)).toBe(evidenceId({ ...inputs }));
  });

  it('is pinned', () => {
    expect(evidenceId(inputs)).toBe('evd_HW5BB4DC4CYANHICZEUNAKCPSYWHHNRDHSPBACREA4ASASP2XMPQ');
  });

  it('changes when the deriver version changes, so derivations do not collide', () => {
    expect(evidenceId({ ...inputs, deriver_version: '4' })).not.toBe(evidenceId(inputs));
  });

  it('changes when the input snapshot changes, which is what supersession keys on', () => {
    expect(evidenceId({ ...inputs, input_snapshot_hash: 'sha256:ff' })).not.toBe(
      evidenceId(inputs),
    );
  });

  it('does not depend on the order the caller wrote the fields', () => {
    const reordered = {
      input_snapshot_hash: inputs.input_snapshot_hash,
      deriver_version: inputs.deriver_version,
      deriver_id: inputs.deriver_id,
      run_id: inputs.run_id,
    };
    expect(evidenceId(reordered)).toBe(evidenceId(inputs));
  });
});

describe('context_snapshot_id (D25, T-05)', () => {
  const inputs = {
    repo_sha: 'a'.repeat(40),
    profile_status_digest: 'sha256:00',
    change_scope: ['src/auth/**'],
    capability_snapshot_hash: 'sha256:11',
    index_digest: 'sha256:22',
    ranking_mode: 'recorded',
    effective_score_view_id: 'esv_x',
    eos_release: '0.1.0',
  } as const;

  it('is stable across calls, so the same decision is addressable on another machine', () => {
    expect(contextSnapshotId(inputs)).toBe(contextSnapshotId({ ...inputs }));
  });

  it('is pinned', () => {
    expect(contextSnapshotId(inputs)).toBe(
      'ctx_XC2P3MWXWU4N3NHZT5LC6DPIVP3S27MEZIJGA5SOIJ3S4LB5HCGA',
    );
  });

  it('distinguishes ranking modes, so a recorded decision is never confused with an overlay one', () => {
    expect(contextSnapshotId({ ...inputs, ranking_mode: 'live_overlay' })).not.toBe(
      contextSnapshotId(inputs),
    );
  });

  it('is sensitive to change scope order, because scope order is part of the request', () => {
    expect(contextSnapshotId({ ...inputs, change_scope: ['src/auth/**', 'src/db/**'] })).not.toBe(
      contextSnapshotId({ ...inputs, change_scope: ['src/db/**', 'src/auth/**'] }),
    );
  });
});

describe('effective_score_view_id (D24, P-03)', () => {
  const base = {
    mode: 'live_overlay',
    parent_score_view_id: null,
    scoring_policy_version: '0',
    evidence_watermark: null,
    computed_at: null,
  } as const;

  const assets = [
    { id: 'asset_b', effective_score: 0.5, evidence_count: 0, source: 'snapshot' },
    { id: 'asset_a', effective_score: 0.5, evidence_count: 0, source: 'snapshot' },
  ] as const;

  it('ignores the order assets were considered in', () => {
    expect(effectiveScoreViewId({ ...base, assets })).toBe(
      effectiveScoreViewId({ ...base, assets: [...assets].reverse() }),
    );
  });

  it('changes when a score changes, so an overlay decision is reconstructible', () => {
    const nudged = [{ ...assets[0], effective_score: 0.6 }, assets[1]];
    expect(effectiveScoreViewId({ ...base, assets: nudged })).not.toBe(
      effectiveScoreViewId({ ...base, assets }),
    );
  });

  it('changes when an asset is added or removed', () => {
    expect(effectiveScoreViewId({ ...base, assets: [assets[0]] })).not.toBe(
      effectiveScoreViewId({ ...base, assets }),
    );
  });

  it('is pinned', () => {
    expect(effectiveScoreViewId({ ...base, assets })).toBe(
      'esv_JSJGYYGBWP53Y6YU2QFLGQHCDPIGB7ZQSNN5JIAJQL3EEXUENLCA',
    );
  });
});
