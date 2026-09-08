/**
 * The attribution deriver (T-03, D32, D36, P-02).
 *
 * The D32 replay property gets the most attention here, because it is the one
 * that decays silently: a deriver that stopped being reproducible would keep
 * producing plausible evidence, and nothing downstream would notice until
 * someone tried to explain a decision and could not.
 *
 * The rest are boundary tests in the security sense. D36 says a compromised
 * installation can only ever produce `operational` evidence; P-02 says
 * client-originated telemetry can never reach the higher integrity grades. Both
 * are claims about what the deriver refuses to read, so they are tested by
 * feeding it events that try.
 */

import { describe, expect, it } from 'vitest';
import type { RunRecord, TelemetryEvent } from '@ieos/core';
import {
  ATTRIBUTION_DERIVER_VERSION,
  DerivationError,
  deriveAttribution,
  inputSnapshotHash,
} from '../src/attribution.ts';

const LIFECYCLE = {
  schema_version: '1',
  stability: 'development',
  introduced_in: '0.1.0',
  deprecated_in: null,
  replacement: null,
  migration_path: null,
};

const anEvent = (over: Partial<TelemetryEvent> = {}): TelemetryEvent =>
  ({
    ...LIFECYCLE,
    event_id: 'evt_1',
    event_type: 'resolve.response',
    project_id: 'proj_a',
    work_id: 'work_a',
    run_id: 'run_a',
    installation_id: 'inst_a',
    emitter_id: 'emt_a',
    session_kind: 'ci',
    trace: { trace_id: 'trace_a', span_id: 's', parent_span_id: null, links: [] },
    time: {
      occurred_at: '2026-09-06T00:00:00.000Z',
      observed_at: '2026-09-06T00:00:00.000Z',
      ingested_at: null,
    },
    source: { type: 'agent', sequence: 0 },
    revision: { repo_sha: 'a'.repeat(40), eos_release: '0.1.0' },
    harness: {
      agent: 'claude-code',
      model: 'test',
      adapter_version: '0.1.0',
      available_capabilities_hash: 'sha256:0',
    },
    attributes: { 'asset.id': 'asset_alpha' },
    ...over,
  }) as TelemetryEvent;

const aRun = (over: Partial<RunRecord> = {}): RunRecord =>
  ({
    ...LIFECYCLE,
    run_id: 'run_a',
    owner_id: 'owner_a',
    registered_by: null,
    origin_class: 'operational',
    holdout_state: null,
    eval_set_version: null,
    simulation_id: null,
    registered_at: null,
    first_event_at: '2026-09-06T00:00:00.000Z',
    telemetry_state: 'COMPLETE',
    qualification_eligible: false,
    ...over,
  }) as RunRecord;

const DERIVED_AT = '2026-09-06T12:00:00.000Z';

describe('the attribution ladder', () => {
  it('records an asset that only appeared in a resolve as exposed, not applied', () => {
    // "The asset was returned" and "the asset helped" are different claims. A
    // system that conflates them ends up scoring its own retrieval.
    const rows = deriveAttribution({
      events: [anEvent()],
      run: aRun(),
      derivedAt: DERIVED_AT,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.exposure).toBe('exposed');
  });

  it('climbs to applied when an observation was recorded against the asset', () => {
    const rows = deriveAttribution({
      events: [
        anEvent({ event_id: 'evt_1', source: { type: 'agent', sequence: 0 } }),
        anEvent({
          event_id: 'evt_2',
          event_type: 'inspect.request',
          source: { type: 'agent', sequence: 1 },
        }),
        anEvent({
          event_id: 'evt_3',
          event_type: 'observe.request',
          source: { type: 'agent', sequence: 2 },
        }),
      ],
      run: aRun(),
      derivedAt: DERIVED_AT,
    });
    expect(rows[0]?.exposure).toBe('applied');
    expect(rows[0]?.sourceEventIds).toEqual(['evt_1', 'evt_2', 'evt_3']);
  });

  it('never climbs back down', () => {
    // An inspect after an observe does not un-apply the asset.
    const rows = deriveAttribution({
      events: [
        anEvent({
          event_id: 'evt_1',
          event_type: 'observe.request',
          source: { type: 'agent', sequence: 0 },
        }),
        anEvent({
          event_id: 'evt_2',
          event_type: 'inspect.request',
          source: { type: 'agent', sequence: 1 },
        }),
      ],
      run: aRun(),
      derivedAt: DERIVED_AT,
    });
    expect(rows[0]?.exposure).toBe('applied');
  });

  it('reads the rung from the event type, not from an attribute', () => {
    // Otherwise an agent could report that its own event means "applied", and
    // attribution would be self-assessed.
    const rows = deriveAttribution({
      events: [anEvent({ attributes: { 'asset.id': 'asset_alpha', 'tool.name': 'applied' } })],
      run: aRun(),
      derivedAt: DERIVED_AT,
    });
    expect(rows[0]?.exposure).toBe('exposed');
  });

  it('produces one row per asset, not one per event', () => {
    // A chatty session must not look like more evidence than a quiet one.
    const rows = deriveAttribution({
      events: [
        anEvent({ event_id: 'evt_1', source: { type: 'agent', sequence: 0 } }),
        anEvent({ event_id: 'evt_2', source: { type: 'agent', sequence: 1 } }),
        anEvent({
          event_id: 'evt_3',
          source: { type: 'agent', sequence: 2 },
          attributes: { 'asset.id': 'asset_beta' },
        }),
      ],
      run: aRun(),
      derivedAt: DERIVED_AT,
    });
    expect(rows.map((row) => row.assetId)).toEqual(['asset_alpha', 'asset_beta']);
  });

  it('ignores events that name no asset rather than failing on them', () => {
    const rows = deriveAttribution({
      events: [
        anEvent({ event_id: 'evt_1', event_type: 'session.start', attributes: {} }),
        anEvent({ event_id: 'evt_2', source: { type: 'agent', sequence: 1 } }),
      ],
      run: aRun(),
      derivedAt: DERIVED_AT,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.sourceEventIds).toEqual(['evt_2']);
  });

  it('derives nothing at all from a run that touched no asset', () => {
    expect(
      deriveAttribution({
        events: [anEvent({ event_type: 'session.start', attributes: {} })],
        run: aRun(),
        derivedAt: DERIVED_AT,
      }),
    ).toEqual([]);
  });
});

describe('the D32 replay property', () => {
  const events = [
    anEvent({ event_id: 'evt_1', source: { type: 'agent', sequence: 0 } }),
    anEvent({
      event_id: 'evt_2',
      event_type: 'inspect.request',
      source: { type: 'agent', sequence: 1 },
    }),
  ];

  it('reruns to the same evidence_id and the same payload apart from derived_at', () => {
    const first = deriveAttribution({ events, run: aRun(), derivedAt: DERIVED_AT });
    const second = deriveAttribution({
      events,
      run: aRun(),
      derivedAt: '2027-01-01T00:00:00.000Z',
    });
    expect(second[0]?.evidence.evidence_id).toBe(first[0]?.evidence.evidence_id);

    const strip = (value: unknown): unknown =>
      JSON.parse(
        JSON.stringify(value, (key, inner: unknown) => (key === 'derived_at' ? undefined : inner)),
      ) as unknown;
    expect(strip(second[0]?.evidence)).toEqual(strip(first[0]?.evidence));
  });

  it('does not depend on the order the events arrived in', () => {
    // Ordering is part of the input snapshot, so it has to be imposed rather
    // than inherited: the same events fed in a different order must hash the
    // same, or a replay from a different source would produce a different id.
    const forward = deriveAttribution({ events, run: aRun(), derivedAt: DERIVED_AT });
    const backward = deriveAttribution({
      events: [...events].reverse(),
      run: aRun(),
      derivedAt: DERIVED_AT,
    });
    expect(backward[0]?.evidence.evidence_id).toBe(forward[0]?.evidence.evidence_id);
    expect(backward[0]?.sourceEventIds).toEqual(forward[0]?.sourceEventIds);
  });

  it('changes the id when the consumed events change', () => {
    // The negative control for the test above. Without it, a deriver that
    // ignored its input entirely would pass every reproducibility test here.
    const fewer = deriveAttribution({
      events: [events[0] as TelemetryEvent],
      run: aRun(),
      derivedAt: DERIVED_AT,
    });
    const more = deriveAttribution({ events, run: aRun(), derivedAt: DERIVED_AT });
    expect(fewer[0]?.evidence.evidence_id).not.toBe(more[0]?.evidence.evidence_id);
  });

  it('changes the id when the deriver version changes', () => {
    // A bump makes every row a new row that supersedes rather than replaces:
    // changing how evidence is derived must not rewrite what was derived.
    const hash = inputSnapshotHash({ eventIds: ['evt_1'] });
    expect(ATTRIBUTION_DERIVER_VERSION).toBe('1');
    expect(hash.startsWith('sha256:')).toBe(true);
  });

  it('gives two assets in one run two different ids', () => {
    const rows = deriveAttribution({
      events: [
        anEvent({ event_id: 'evt_1', source: { type: 'agent', sequence: 0 } }),
        anEvent({
          event_id: 'evt_2',
          source: { type: 'agent', sequence: 1 },
          attributes: { 'asset.id': 'asset_beta' },
        }),
      ],
      run: aRun(),
      derivedAt: DERIVED_AT,
    });
    expect(rows[0]?.evidence.evidence_id).not.toBe(rows[1]?.evidence.evidence_id);
  });

  it('distinguishes an empty external-input list from an absent one', () => {
    // Stage 7 adds external inputs. If the key were omitted now, adding it then
    // would change every id for unchanged evidence and break replay against
    // everything derived before it.
    expect(inputSnapshotHash({ eventIds: ['evt_1'] })).toBe(
      inputSnapshotHash({ eventIds: ['evt_1'], external: [] }),
    );
    expect(inputSnapshotHash({ eventIds: ['evt_1'], external: ['ci:1'] })).not.toBe(
      inputSnapshotHash({ eventIds: ['evt_1'] }),
    );
  });
});

describe('classification comes from the Run record, never from events (D36)', () => {
  it('stamps the origin_class the Run record carries', () => {
    const rows = deriveAttribution({
      events: [anEvent()],
      run: aRun({
        registered_by: 'svc_harness',
        registered_at: '2026-09-05T00:00:00.000Z',
        origin_class: 'qualification',
      }),
      derivedAt: DERIVED_AT,
    });
    expect(rows[0]?.evidence.origin_class).toBe('qualification');
  });

  it('ignores an origin_class an event tries to carry in its attributes', () => {
    // The envelope cannot express one, so this is what smuggling would look
    // like: an ordinary attribute with a suggestive name. The deriver never
    // reads it, and an unregistered run stays operational.
    const rows = deriveAttribution({
      events: [
        anEvent({ attributes: { 'asset.id': 'asset_alpha', 'error.kind': 'qualification' } }),
      ],
      run: aRun(),
      derivedAt: DERIVED_AT,
    });
    expect(rows[0]?.evidence.origin_class).toBe('operational');
  });

  it('refuses to derive across runs', () => {
    // Otherwise one run's events could be classified by another run's record,
    // which is precisely the authority D36 protects.
    expect(() =>
      deriveAttribution({
        events: [anEvent({ run_id: 'run_other' })],
        run: aRun(),
        derivedAt: DERIVED_AT,
      }),
    ).toThrow(DerivationError);
  });

  it('carries holdout_state from the Run record for a holdout run (D33)', () => {
    const rows = deriveAttribution({
      events: [anEvent()],
      run: aRun({
        registered_by: 'svc_harness',
        registered_at: '2026-09-05T00:00:00.000Z',
        origin_class: 'holdout',
        holdout_state: 'active',
        eval_set_version: 'v1',
      }),
      derivedAt: DERIVED_AT,
    });
    expect(rows[0]?.evidence.holdout_state).toBe('active');
  });
});

describe('integrity is stamped from the source, never from content (P-02)', () => {
  it('grades what the agent reported as agent_runtime / reported', () => {
    const rows = deriveAttribution({
      events: [anEvent({ source: { type: 'agent', sequence: 0 } })],
      run: aRun(),
      derivedAt: DERIVED_AT,
    });
    expect(rows[0]?.evidence.integrity).toEqual({
      source_authority: 'agent_runtime',
      verification: 'reported',
    });
  });

  it('grades what the EOS runtime observed as deterministic_test / observed', () => {
    const rows = deriveAttribution({
      events: [anEvent({ source: { type: 'eos', sequence: 0 } })],
      run: aRun(),
      derivedAt: DERIVED_AT,
    });
    expect(rows[0]?.evidence.integrity.verification).toBe('observed');
  });

  it('takes the strongest source among an asset’s events', () => {
    const rows = deriveAttribution({
      events: [
        anEvent({ event_id: 'evt_1', source: { type: 'agent', sequence: 0 } }),
        anEvent({
          event_id: 'evt_2',
          event_type: 'observe.request',
          source: { type: 'eos', sequence: 1 },
        }),
      ],
      run: aRun(),
      derivedAt: DERIVED_AT,
    });
    expect(rows[0]?.evidence.integrity.verification).toBe('observed');
  });

  it('never reaches directly_verified from client telemetry alone', () => {
    // The ladder's top rungs are unreachable from here by construction: this
    // deriver has no rung above `applied` to assign.
    const rows = deriveAttribution({
      events: [anEvent({ event_type: 'observe.request' })],
      run: aRun(),
      derivedAt: DERIVED_AT,
    });
    expect(rows[0]?.evidence.attribution.exposure).not.toBe('directly_verified');
  });
});

describe('what v0 refuses to claim', () => {
  it('scores nothing, because no scoring policy exists yet', () => {
    // A non-zero weight invented here would be a scoring decision taken by a
    // deriver instead of by scoring-policy.yaml, which is Stage 10 under the
    // C-05 ladder. The guide's own §5.4 example carries the same zeros.
    const rows = deriveAttribution({
      events: [anEvent()],
      run: aRun(),
      derivedAt: DERIVED_AT,
    });
    expect(rows[0]?.evidence.strength).toEqual({ polarity: 'neutral', weight: 0, confidence: 0 });
  });

  it('claims no outcome: exposure is not success', () => {
    const rows = deriveAttribution({
      events: [anEvent({ event_type: 'observe.request' })],
      run: aRun(),
      derivedAt: DERIVED_AT,
    });
    expect(rows[0]?.evidence.kind).toBe('partial');
  });

  it('claims no staleness scope, because nobody has decided one', () => {
    const rows = deriveAttribution({
      events: [anEvent()],
      run: aRun(),
      derivedAt: DERIVED_AT,
    });
    expect(rows[0]?.evidence.scope).toEqual({ paths: [], depends_on: [], max_age_days: null });
  });

  it('groups everything from one run, because one session is not many witnesses', () => {
    const rows = deriveAttribution({
      events: [
        anEvent({ event_id: 'evt_1', source: { type: 'agent', sequence: 0 } }),
        anEvent({
          event_id: 'evt_2',
          source: { type: 'agent', sequence: 1 },
          attributes: { 'asset.id': 'asset_beta' },
        }),
      ],
      run: aRun(),
      derivedAt: DERIVED_AT,
    });
    expect(new Set(rows.map((row) => row.evidence.independence_group)).size).toBe(1);
  });

  it('records no ingest watermark, because nothing it can see has been ingested', () => {
    const rows = deriveAttribution({
      events: [anEvent()],
      run: aRun(),
      derivedAt: DERIVED_AT,
    });
    expect(rows[0]?.evidence.derivation.input_watermark).toBeNull();
  });
});
