/**
 * The Stage 3 gate rows, and the three scenarios that decide whether they mean
 * anything.
 *
 * Two of these rows were constants. T7 was the literal string `FAIL`, so no set
 * of trials could ever have moved it and the gate could not have been passed even
 * in principle; T6 was the literal string `PASS`, justified by what the
 * simulation manifests forbid rather than by anything a trial produced. These
 * tests exist so that neither can quietly become a constant again: each asserts
 * a row changing in response to the evidence changing.
 */

import { describe, expect, it } from 'vitest';
import { deriveRows, type TrialRecord } from '../src/stage3-rows.ts';

/** A trial that passes everything, as the template to break one field at a time. */
function goodTrial(over: Partial<TrialRecord> = {}): TrialRecord {
  return {
    trial_id: 'task-a-t1',
    run_id: 'run_a_t1',
    task_id: 'task-a',
    eos_revision: 'a'.repeat(40),
    setting_sources: 'project',
    ranking_mode: 'recorded',
    status: 'proven',
    ran_to_completion: true,
    terminal_reason: null,
    qualification_eligible: true,
    origin_class_the_plane_would_stamp: 'qualification',
    registration: { confirmed: true, reason: null },
    budget: { state: 'within' },
    usage: {
      wallClockSeconds: 60,
      costUsd: 0.2,
      inputTokens: 10,
      outputTokens: 100,
      turns: 4,
    },
    tool_calls: [{ name: 'Bash' }],
    resolve_called_unprompted: true,
    eos_tools_used: ['resolve'],
    isolation: { qualificationEligible: true },
    telemetry: {
      ingest_reachable_at_start: true,
      flush_ever_failed: false,
      outbox_events_remaining: 0,
      telemetry_state: 'COMPLETE',
      qualification_eligible: true,
      unavailable_reason: null,
    },
    rescue: { human_interventions: 0, prompts_sent: 1, interactive_stdin: false },
    namespace_observations: { denied_entries_visible: 0 },
    verdicts: [{ graderId: 'g1', kind: 'deterministic', status: 'proven' }],
    ...over,
  };
}

/** Three tasks, two trials each: the smallest shape T1 accepts. */
function allGood(): TrialRecord[] {
  return ['task-a', 'task-b', 'task-c'].flatMap((taskId) =>
    ['t1', 't2'].map((trial) =>
      goodTrial({
        task_id: taskId,
        trial_id: `${taskId}-${trial}`,
        run_id: `run_${taskId}_${trial}`,
      }),
    ),
  );
}

const rowById = (records: readonly TrialRecord[], id: string) => {
  const row = deriveRows(records).find((candidate) => candidate.id === id);
  expect(row, `no ${id} row was produced`).toBeDefined();
  return row!;
};

describe('the three scenarios the gate has to tell apart', () => {
  it('all good: every row passes', () => {
    // The control. Without it the two failure scenarios below would pass against
    // a derivation that failed everything unconditionally -- which is exactly
    // the state T7 was in.
    const rows = deriveRows(allGood());
    expect(rows.map((row) => row.status)).toEqual(rows.map(() => 'PASS'));
    expect(rows.map((row) => row.id)).toEqual([
      'T1',
      'T2',
      'T3',
      'T4',
      'T5',
      'T6',
      'T7',
      'T8',
      'T9',
    ]);
  });

  it('one trial INCOMPLETE: T7 fails and names it, everything else still passes', () => {
    const records = allGood();
    records[3] = goodTrial({
      ...records[3],
      telemetry: {
        ingest_reachable_at_start: true,
        flush_ever_failed: true,
        outbox_events_remaining: 0,
        telemetry_state: 'INCOMPLETE',
        qualification_eligible: false,
        unavailable_reason: null,
      },
    });
    expect(rowById(records, 'T7').status).toBe('FAIL');
    expect(rowById(records, 'T7').evidence).toContain(records[3]!.trial_id);
    expect(rowById(records, 'T7').evidence).toContain('a flush failed');
    // The failure is T7's alone. A row that failed in sympathy would make the
    // report useless for saying what went wrong.
    expect(rowById(records, 'T4').status).toBe('PASS');
    expect(rowById(records, 'T6').status).toBe('PASS');
  });

  it('one trial unregistered: T4 fails, T7 unaffected', () => {
    const records = allGood();
    records[2] = goodTrial({
      ...records[2],
      registration: { confirmed: false, reason: 'no Evidence Plane is enrolled for this harness' },
      origin_class_the_plane_would_stamp: 'operational',
    });
    expect(rowById(records, 'T4').status).toBe('FAIL');
    expect(rowById(records, 'T4').evidence).toContain('5/6 confirmed');
    expect(rowById(records, 'T7').status).toBe('PASS');
  });
});

describe('T7 reads the evidence rather than stating a verdict', () => {
  it('fails when a trial carries no telemetry state at all', () => {
    // Every record written before the harness read the run's terminal state is
    // this case, which is why the current 22 cannot be re-graded into a pass.
    // Omitted rather than set to `undefined`: `exactOptionalPropertyTypes` treats
    // those as different things, and the records in question simply lack the key.
    const records = allGood().map(({ telemetry, ...rest }) => rest);
    const row = rowById(records, 'T7');
    expect(row.status).toBe('FAIL');
    expect(row.evidence).toContain('carry no telemetry state');
  });

  it('fails a COMPLETE run the host never attested for', () => {
    // Draining perfectly is not eligibility. D23 wants it declared before the
    // work, not earned by it.
    const records = allGood();
    records[0] = goodTrial({
      ...records[0],
      telemetry: {
        ingest_reachable_at_start: false,
        flush_ever_failed: false,
        outbox_events_remaining: 0,
        telemetry_state: 'COMPLETE',
        qualification_eligible: false,
        unavailable_reason: null,
      },
    });
    const row = rowById(records, 'T7');
    expect(row.status).toBe('FAIL');
    expect(row.evidence).toContain('no reachability attested at start');
  });

  it('fails a run with events left in the outbox, and says how many', () => {
    const records = allGood();
    records[1] = goodTrial({
      ...records[1],
      telemetry: {
        ingest_reachable_at_start: true,
        flush_ever_failed: false,
        outbox_events_remaining: 4,
        telemetry_state: 'INCOMPLETE',
        qualification_eligible: false,
        unavailable_reason: null,
      },
    });
    expect(rowById(records, 'T7').evidence).toContain('4 event(s) left queued');
  });

  it('cannot pass on an empty record set', () => {
    // `every` over nothing is vacuously true in JavaScript. A report generated
    // from an empty evidence directory must not read as a clean sweep.
    for (const row of deriveRows([])) {
      expect(row.status).not.toBe('PASS');
    }
  });
});

describe('T6 reads the evidence rather than trusting the manifests', () => {
  it('fails when a trial carries no rescue evidence', () => {
    const records = allGood().map(({ rescue, ...rest }) => rest);
    const row = rowById(records, 'T6');
    expect(row.status).toBe('FAIL');
    expect(row.evidence).toContain('record no rescue evidence');
  });

  it('fails when a trial was sent more than one prompt', () => {
    // A second prompt is a second thing said to the agent, whatever it said.
    const records = allGood();
    records[4] = goodTrial({
      ...records[4],
      rescue: { human_interventions: 0, prompts_sent: 2, interactive_stdin: false },
    });
    expect(rowById(records, 'T6').status).toBe('FAIL');
  });

  it('fails when an interactive channel was open, even with no intervention', () => {
    // An unused channel is still a channel. T6 is about what was possible.
    const records = allGood();
    records[5] = goodTrial({
      ...records[5],
      rescue: { human_interventions: 0, prompts_sent: 1, interactive_stdin: true },
    });
    expect(rowById(records, 'T6').status).toBe('FAIL');
  });

  it('fails when an intervention was recorded', () => {
    const records = allGood();
    records[0] = goodTrial({
      ...records[0],
      rescue: { human_interventions: 1, prompts_sent: 1, interactive_stdin: false },
    });
    expect(rowById(records, 'T6').status).toBe('FAIL');
  });
});
