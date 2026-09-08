/**
 * The investigation view (T-03, guide Stage 2).
 *
 * The Stage 2 deliverable is "the raw event timeline plus the derived
 * attribution rows", and the tests that matter are the ones about the word
 * *raw*: events that produced no evidence still appear, and a run that lost
 * telemetry says so before anything else. A tidy timeline that quietly omitted
 * either would answer the wrong question -- what the system concluded, rather
 * than what it saw.
 */

import { describe, expect, it } from 'vitest';
import type { RunRecord, TelemetryEvent } from '@ieos/core';
import { deriveAttribution } from '../src/attribution.ts';
import { investigate, renderInvestigation } from '../src/investigate.ts';

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

const events = [
  anEvent({ event_id: 'evt_start', event_type: 'session.start', attributes: {} }),
  anEvent({ event_id: 'evt_resolve', source: { type: 'agent', sequence: 1 } }),
  anEvent({
    event_id: 'evt_inspect',
    event_type: 'inspect.request',
    source: { type: 'agent', sequence: 2 },
  }),
];

function view(run: RunRecord = aRun()) {
  const rows = deriveAttribution({ events, run, derivedAt: '2026-09-06T12:00:00.000Z' });
  return investigate({ run, events, rows });
}

describe('the timeline', () => {
  it('keeps events that produced no evidence', () => {
    // Most events do not name an asset. Dropping them would make the timeline
    // look like the derivation's input rather than like the run.
    const timeline = view().timeline;
    expect(timeline.map((entry) => entry.eventId)).toEqual([
      'evt_start',
      'evt_resolve',
      'evt_inspect',
    ]);
  });

  it('says which events produced which evidence, and which produced none', () => {
    const timeline = view().timeline;
    expect(timeline[0]?.contributedTo).toEqual([]);
    expect(timeline[1]?.contributedTo).toHaveLength(1);
    expect(timeline[2]?.contributedTo).toEqual(timeline[1]?.contributedTo);
  });

  it('orders by emitter and sequence, not by the order it was handed', () => {
    const shuffled = investigate({
      run: aRun(),
      events: [...events].reverse(),
      rows: [],
    });
    expect(shuffled.timeline.map((entry) => entry.sequence)).toEqual([0, 1, 2]);
  });

  it('renders an empty run as empty rather than as nothing', () => {
    const text = renderInvestigation(investigate({ run: aRun(), events: [], rows: [] }));
    expect(text).toContain('(no events recorded for this run)');
    expect(text).toContain('(no asset was exposed, inspected or applied in this run)');
  });
});

describe('a run whose telemetry was lost', () => {
  it('is reported as INCOMPLETE before the timeline, not after it', () => {
    // The reader's next question is whether the timeline below can be trusted
    // to be whole. Answering it in a footnote answers it too late.
    const text = renderInvestigation(
      view(aRun({ telemetry_state: 'INCOMPLETE', qualification_eligible: false })),
    );
    const noteAt = text.indexOf('did not report complete telemetry');
    const timelineAt = text.indexOf('timeline (');
    expect(noteAt).toBeGreaterThan(-1);
    expect(noteAt).toBeLessThan(timelineAt);
  });

  it('says UNKNOWN rather than COMPLETE when nothing wrote the terminal state', () => {
    // `null` is its own answer. Rendering it as COMPLETE is exactly the lie D23
    // names: telemetry loss must never look like a measured run.
    const investigation = view(aRun({ telemetry_state: null, qualification_eligible: null }));
    expect(investigation.telemetryState).toBe('UNKNOWN');
    expect(renderInvestigation(investigation)).toContain('did not report complete telemetry');
  });
});

describe('the rendered report', () => {
  it('names the run, its classification and every derived row', () => {
    const text = renderInvestigation(view());
    expect(text).toContain('run run_a');
    expect(text).toContain('origin_class:          operational');
    expect(text).toContain('asset_alpha  inspected');
    expect(text).toContain('agent_runtime / reported');
    expect(text).toContain('evt_resolve, evt_inspect');
  });

  it('is a pure function of its input', () => {
    // No clock, no filesystem, no environment: the same run renders the same
    // text, which is what makes an investigation quotable in a report.
    expect(renderInvestigation(view())).toBe(renderInvestigation(view()));
  });
});
