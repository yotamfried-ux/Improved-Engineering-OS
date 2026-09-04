/**
 * D32 replay (Stage 0 criterion B5).
 *
 * D32 states the invariant exactly: "rerun the same deriver over the same
 * snapshot -> identical `evidence_id` and identical payload after stripping
 * `derived_at`."
 *
 * So the test reruns a deriver, and checks both halves. The negative controls
 * matter as much as the positive case: a replay test that cannot fail would
 * certify a nondeterministic deriver as reproducible, which is worse than
 * having no replay test at all.
 *
 * The deriver here is synthetic, as the Stage 0 deliverable list specifies
 * ("D32 replay test on a synthetic derivation"). The real `attribution` deriver
 * is Stage 2; it will be tested against this same comparison function.
 */

import { describe, expect, it } from 'vitest';
import {
  compareReplay,
  inputSnapshotHash,
  projectForReplay,
  REPLAY_EXCLUDED_FIELDS,
  validateSupersession,
  type DerivationInputs,
} from '../src/replay.ts';
import { evidenceId } from '../src/ids.ts';
import { evidenceSchema, type EvidenceRecord } from '../src/contracts/evidence.ts';

// ---------------------------------------------------------------------------
// A synthetic deriver
// ---------------------------------------------------------------------------

interface SyntheticEvent {
  readonly event_id: string;
  readonly kind: 'resolve' | 'inspect' | 'apply' | 'test_exit';
  readonly asset_id: string;
  readonly exit_code?: number;
}

const DERIVER_ID = 'attribution';
const DERIVER_VERSION = '1';
const RUN_ID = 'run_01J9Z6Q0K3N6X4R8V2T7M5B1WQ';

/**
 * A deterministic attribution deriver over synthetic events.
 *
 * Mirrors the Stage 2 shape described by T-03 (`EXPOSED | INSPECTED | APPLIED`
 * from resolve/inspect/observe events) closely enough to be a real exercise of
 * the contract, without being the Stage 2 deriver.
 *
 * `derivedAt` is a parameter precisely so a test can vary it and prove it is
 * excluded from the comparison.
 */
function derive(
  events: readonly SyntheticEvent[],
  inputs: DerivationInputs,
  derivedAt: string,
): EvidenceRecord {
  const snapshotHash = inputSnapshotHash(inputs);
  const assetId = events[0]?.asset_id ?? 'asset_unknown';

  const applied = events.some((event) => event.kind === 'apply');
  const inspected = events.some((event) => event.kind === 'inspect');
  const observedExit = events.find((event) => event.kind === 'test_exit');

  const exposure = applied ? 'applied' : inspected ? 'inspected' : 'exposed';

  // Integrity is stamped from the event SOURCE, never from event content (D32,
  // P-02). An observed process exit is `deterministic_test`/`observed`; anything
  // the agent merely reported stays `agent_runtime`/`reported`.
  const integrity =
    observedExit === undefined
      ? { source_authority: 'agent_runtime' as const, verification: 'reported' as const }
      : { source_authority: 'deterministic_test' as const, verification: 'observed' as const };

  return evidenceSchema.parse({
    schema_version: '1',
    stability: 'development',
    introduced_in: '0.1.0',
    deprecated_in: null,
    replacement: null,
    migration_path: null,
    evidence_id: evidenceId({
      run_id: RUN_ID,
      deriver_id: DERIVER_ID,
      deriver_version: DERIVER_VERSION,
      input_snapshot_hash: snapshotHash,
    }),
    subject: { type: 'asset', id: assetId },
    kind: observedExit?.exit_code === 0 ? 'success' : 'partial',
    origin_class: 'operational',
    holdout_state: null,
    independence_group: 'ig_01J9Z6Q0K3N6X4R8V2T7M5B1WQ',
    strength: { polarity: 'positive', weight: applied ? 0.4 : 0.1, confidence: 0.5 },
    attribution: {
      exposure,
      // Sorted: the derivation depends on the set of events consumed, not on
      // the order they were read in.
      source_event_ids: [...events.map((event) => event.event_id)].sort(),
      trace_id: 't1',
    },
    integrity,
    derivation: {
      deriver_id: DERIVER_ID,
      deriver_version: DERIVER_VERSION,
      input_snapshot_hash: snapshotHash,
      input_watermark: '2026-09-04T00:00:00.000Z',
      derived_at: derivedAt,
      supersedes_derivation_id: null,
    },
    revision: { repo_sha: 'c'.repeat(40) },
    scope: { paths: ['src/auth/**'], depends_on: ['dependency:@example/pkg'], max_age_days: 90 },
  }) as EvidenceRecord;
}

const EVENTS: readonly SyntheticEvent[] = [
  { event_id: 'evt_1', kind: 'resolve', asset_id: 'asset_01J9Z6Q0K3N6X4R8V2T7M5B1WQ' },
  { event_id: 'evt_2', kind: 'inspect', asset_id: 'asset_01J9Z6Q0K3N6X4R8V2T7M5B1WQ' },
  { event_id: 'evt_3', kind: 'apply', asset_id: 'asset_01J9Z6Q0K3N6X4R8V2T7M5B1WQ' },
];

const INPUTS: DerivationInputs = {
  sourceEventIds: ['evt_1', 'evt_2', 'evt_3'],
  externalInputs: [],
};

// ---------------------------------------------------------------------------
// The invariant
// ---------------------------------------------------------------------------

describe('D32 replay: same deriver, same snapshot', () => {
  it('yields an identical evidence_id', () => {
    const first = derive(EVENTS, INPUTS, '2026-09-04T00:00:00.000Z');
    const second = derive(EVENTS, INPUTS, '2026-09-05T12:34:56.000Z');
    expect(second.evidence_id).toBe(first.evidence_id);
  });

  it('yields an identical payload once derived_at is stripped', () => {
    const first = derive(EVENTS, INPUTS, '2026-09-04T00:00:00.000Z');
    const second = derive(EVENTS, INPUTS, '2026-09-05T12:34:56.000Z');

    const comparison = compareReplay(first, second);
    expect(comparison.differences, JSON.stringify(comparison.differences, null, 2)).toEqual([]);
    expect(comparison.identical).toBe(true);
    expect(comparison.sameEvidenceId).toBe(true);
    expect(comparison.samePayload).toBe(true);
  });

  it('the two runs really did differ in derived_at, so the test is not vacuous', () => {
    const first = derive(EVENTS, INPUTS, '2026-09-04T00:00:00.000Z');
    const second = derive(EVENTS, INPUTS, '2026-09-05T12:34:56.000Z');
    expect(first.derivation.derived_at).not.toBe(second.derivation.derived_at);
  });

  it('ignores the order events were consumed in', () => {
    const reversed = [...EVENTS].reverse();
    const reorderedInputs: DerivationInputs = {
      sourceEventIds: ['evt_3', 'evt_2', 'evt_1'],
      externalInputs: [],
    };
    const comparison = compareReplay(
      derive(EVENTS, INPUTS, '2026-09-04T00:00:00.000Z'),
      derive(reversed, reorderedInputs, '2026-09-04T00:00:00.000Z'),
    );
    expect(comparison.identical).toBe(true);
  });

  it('excludes exactly the one field D32 names, and no more', () => {
    // An exclusion list that grows quietly is how a replay test stops proving
    // reproducibility.
    expect(REPLAY_EXCLUDED_FIELDS).toEqual(['derivation.derived_at']);
  });

  it('the projection drops derived_at and keeps everything else', () => {
    const record = derive(EVENTS, INPUTS, '2026-09-04T00:00:00.000Z');
    const projected = projectForReplay(record) as {
      derivation: Record<string, unknown>;
      evidence_id: string;
    };
    expect(projected.derivation).not.toHaveProperty('derived_at');
    expect(projected.derivation['input_snapshot_hash']).toBe(record.derivation.input_snapshot_hash);
    expect(projected.evidence_id).toBe(record.evidence_id);
  });
});

// ---------------------------------------------------------------------------
// Negative controls
// ---------------------------------------------------------------------------

describe('negative controls: the replay test can fail', () => {
  it('detects a deriver whose payload drifts while its inputs do not', () => {
    // The failure the id-only comparison would miss entirely.
    const first = derive(EVENTS, INPUTS, '2026-09-04T00:00:00.000Z');
    const drifted: EvidenceRecord = {
      ...first,
      strength: { ...first.strength, confidence: 0.9 },
    };

    const comparison = compareReplay(first, drifted);
    expect(comparison.sameEvidenceId).toBe(true);
    expect(comparison.samePayload).toBe(false);
    expect(comparison.identical).toBe(false);
    expect(comparison.differences.map((d) => d.field)).toContain('strength.confidence');
  });

  it('detects a changed evidence_id', () => {
    const first = derive(EVENTS, INPUTS, '2026-09-04T00:00:00.000Z');
    const other = derive(
      EVENTS,
      { ...INPUTS, sourceEventIds: ['evt_1', 'evt_2'] },
      '2026-09-04T00:00:00.000Z',
    );

    const comparison = compareReplay(first, other);
    expect(comparison.sameEvidenceId).toBe(false);
    expect(comparison.identical).toBe(false);
    expect(comparison.differences.map((d) => d.field)).toContain('evidence_id');
  });

  it('names the field that drifted, not merely that something did', () => {
    const first = derive(EVENTS, INPUTS, '2026-09-04T00:00:00.000Z');
    const drifted: EvidenceRecord = {
      ...first,
      attribution: { ...first.attribution, exposure: 'inspected' },
    };
    const comparison = compareReplay(first, drifted);
    expect(comparison.differences).toEqual([
      { field: 'attribution.exposure', first: '"applied"', second: '"inspected"' },
    ]);
  });

  it('would fail for a deriver that stamped a timestamp into a non-excluded field', () => {
    const first = derive(EVENTS, INPUTS, '2026-09-04T00:00:00.000Z');
    const leaky: EvidenceRecord = {
      ...first,
      derivation: { ...first.derivation, input_watermark: '2026-09-05T00:00:00.000Z' },
    };
    expect(compareReplay(first, leaky).identical).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// input_snapshot_hash
// ---------------------------------------------------------------------------

describe('input_snapshot_hash (D32)', () => {
  it('is stable for the same input set in any order', () => {
    expect(inputSnapshotHash({ sourceEventIds: ['a', 'b'], externalInputs: [] })).toBe(
      inputSnapshotHash({ sourceEventIds: ['b', 'a'], externalInputs: [] }),
    );
  });

  it('changes when an event is added, which is what supersession keys on', () => {
    expect(inputSnapshotHash({ sourceEventIds: ['a'], externalInputs: [] })).not.toBe(
      inputSnapshotHash({ sourceEventIds: ['a', 'b'], externalInputs: [] }),
    );
  });

  it('changes when a late external input arrives (the D32 CI-failure case)', () => {
    const before = inputSnapshotHash({ sourceEventIds: ['a'], externalInputs: [] });
    const after = inputSnapshotHash({
      sourceEventIds: ['a'],
      externalInputs: [{ kind: 'ci_conclusion', id: 'check_1', value: 'failure' }],
    });
    expect(after).not.toBe(before);
  });

  it('distinguishes a CI success from a CI failure on the same inputs', () => {
    const passed = inputSnapshotHash({
      sourceEventIds: ['a'],
      externalInputs: [{ kind: 'ci_conclusion', id: 'check_1', value: 'success' }],
    });
    const failed = inputSnapshotHash({
      sourceEventIds: ['a'],
      externalInputs: [{ kind: 'ci_conclusion', id: 'check_1', value: 'failure' }],
    });
    expect(passed).not.toBe(failed);
  });

  it('rejects a duplicate event id rather than de-duplicating it silently', () => {
    expect(() => inputSnapshotHash({ sourceEventIds: ['a', 'a'], externalInputs: [] })).toThrow(
      /duplicate source event id/u,
    );
  });

  it('produces a D35 digest', () => {
    expect(inputSnapshotHash({ sourceEventIds: ['a'], externalInputs: [] })).toMatch(
      /^sha256:[0-9a-f]{64}$/u,
    );
  });
});

// ---------------------------------------------------------------------------
// Supersession
// ---------------------------------------------------------------------------

describe('supersession (D32): late input creates a new derivation, deletes nothing', () => {
  const original = derive(EVENTS, INPUTS, '2026-09-04T00:00:00.000Z');

  /** A CI failure arriving a day later — D32's own worked example. */
  const lateInputs: DerivationInputs = {
    sourceEventIds: ['evt_1', 'evt_2', 'evt_3'],
    externalInputs: [{ kind: 'ci_conclusion', id: 'check_1', value: 'failure' }],
  };

  const superseding: EvidenceRecord = (() => {
    const next = derive(EVENTS, lateInputs, '2026-09-05T00:00:00.000Z');
    return {
      ...next,
      derivation: { ...next.derivation, supersedes_derivation_id: original.evidence_id },
    };
  })();

  it('produces a different evidence_id and a different input snapshot', () => {
    expect(superseding.evidence_id).not.toBe(original.evidence_id);
    expect(superseding.derivation.input_snapshot_hash).not.toBe(
      original.derivation.input_snapshot_hash,
    );
  });

  it('is a valid supersession', () => {
    const check = validateSupersession(original, superseding);
    expect(check.reasons, check.reasons.join('\n')).toEqual([]);
    expect(check.valid).toBe(true);
  });

  it('rejects a "supersession" over unchanged inputs, which is really a replay', () => {
    const replayed = derive(EVENTS, INPUTS, '2026-09-06T00:00:00.000Z');
    const fake: EvidenceRecord = {
      ...replayed,
      derivation: { ...replayed.derivation, supersedes_derivation_id: original.evidence_id },
    };
    const check = validateSupersession(original, fake);
    expect(check.valid).toBe(false);
    expect(check.reasons.join(' ')).toMatch(/identical inputs are a replay/u);
  });

  it('rejects a supersession that does not name what it supersedes', () => {
    const check = validateSupersession(
      original,
      derive(EVENTS, lateInputs, '2026-09-05T00:00:00.000Z'),
    );
    expect(check.valid).toBe(false);
    expect(check.reasons.join(' ')).toMatch(/must name the previous evidence_id/u);
  });

  it('rejects a supersession concerning a different subject', () => {
    const elsewhere: EvidenceRecord = {
      ...superseding,
      subject: { type: 'asset', id: 'asset_somewhere_else' },
    };
    const check = validateSupersession(original, elsewhere);
    expect(check.valid).toBe(false);
    expect(check.reasons.join(' ')).toMatch(/same subject/u);
  });

  it('keeps the original: superseding never mutates or deletes it', () => {
    expect(original.derivation.supersedes_derivation_id).toBeNull();
    expect(
      compareReplay(original, derive(EVENTS, INPUTS, '2026-09-09T00:00:00.000Z')).identical,
    ).toBe(true);
  });
});
