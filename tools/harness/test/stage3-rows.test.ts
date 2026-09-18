import { describe, expect, it } from 'vitest';
import { deriveRows, type TrialRecord } from '../src/stage3-rows.ts';

function goodTrial(over: Partial<TrialRecord> = {}): TrialRecord {
  return {
    trial_id: 'task-a-t1',
    run_id: 'run_a_t1',
    task_id: 'task-a',
    eos_revision: 'a'.repeat(40),
    qualification_profile: 'windows-personal-v1',
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
    trial_integrity: { qualificationEligible: true, kernelIsolationRequired: false },
    telemetry: {
      ingest_reachable_at_start: true,
      flush_ever_failed: false,
      outbox_events_remaining: 0,
      telemetry_state: 'COMPLETE',
      qualification_eligible: true,
      unavailable_reason: null,
    },
    rescue: { human_interventions: 0, prompts_sent: 1, interactive_stdin: false },
    namespace_observations: null,
    verdicts: [{ graderId: 'g1', kind: 'deterministic', status: 'proven' }],
    ...over,
  };
}

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

describe('Stage 3 gate rows', () => {
  it('all good: every row passes under windows-personal-v1', () => {
    const rows = deriveRows(allGood());
    expect(rows.map((row) => row.status)).toEqual(rows.map(() => 'PASS'));
    expect(rowById(allGood(), 'T3').evidence).toContain('windows-personal-v1');
    expect(rowById(allGood(), 'T3').evidence).toContain('does not claim PID/network');
  });


  it('treats current eos-arm records marked qualification as the formal Stage 3 bank', () => {
    const records = allGood().map((record) => ({
      ...record,
      campaign: 'qual2026',
      bank: 'qualification' as const,
      arm: 'eos',
    }));
    expect(deriveRows(records).map((row) => row.status)).toEqual(
      deriveRows(records).map(() => 'PASS'),
    );
  });

  it('does not let value-bank records satisfy the formal three-task gate', () => {
    const records = allGood().map((record) => ({
      ...record,
      campaign: 'value2026',
      bank: 'value' as const,
      arm: 'eos',
    }));
    expect(rowById(records, 'T1').status).toBe('FAIL');
    expect(rowById(records, 'T2').status).toBe('FAIL');
    expect(rowById(records, 'T8').status).toBe('UNPROVEN');
  });

  it('T3 fails if the new platform-integrity evidence is absent', () => {
    const records = allGood().map(({ trial_integrity, ...rest }) => rest);
    const row = rowById(records, 'T3');
    expect(row.status).toBe('FAIL');
    expect(row.evidence).toContain('predate the platform-profile integrity record');
  });

  it('T3 fails if a required Windows integrity check failed', () => {
    const records = allGood();
    records[0] = goodTrial({
      ...records[0],
      trial_integrity: { qualificationEligible: false, kernelIsolationRequired: false },
    });
    expect(rowById(records, 'T3').status).toBe('FAIL');
  });

  it('one trial INCOMPLETE fails T7 without changing T4/T6', () => {
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
    expect(rowById(records, 'T7').evidence).toContain('a flush failed');
    expect(rowById(records, 'T4').status).toBe('PASS');
    expect(rowById(records, 'T6').status).toBe('PASS');
  });

  it('one unregistered trial fails T4 without changing T7', () => {
    const records = allGood();
    records[2] = goodTrial({
      ...records[2],
      registration: { confirmed: false, reason: 'not registered' },
      origin_class_the_plane_would_stamp: 'operational',
    });
    expect(rowById(records, 'T4').status).toBe('FAIL');
    expect(rowById(records, 'T4').evidence).toContain('5/6 confirmed');
    expect(rowById(records, 'T7').status).toBe('PASS');
  });

  it('T7 fails when telemetry evidence is absent', () => {
    const records = allGood().map(({ telemetry, ...rest }) => rest);
    expect(rowById(records, 'T7').status).toBe('FAIL');
  });

  it('T7 fails when reachability was not attested', () => {
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
    expect(rowById(records, 'T7').evidence).toContain('no reachability attested at start');
  });

  it('T7 reports queued events', () => {
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

  it('no row passes on an empty record set', () => {
    for (const row of deriveRows([])) expect(row.status).not.toBe('PASS');
  });

  it('T6 fails without rescue evidence', () => {
    const records = allGood().map(({ rescue, ...rest }) => rest);
    expect(rowById(records, 'T6').status).toBe('FAIL');
  });

  it('T6 fails on a second prompt', () => {
    const records = allGood();
    records[4] = goodTrial({
      ...records[4],
      rescue: { human_interventions: 0, prompts_sent: 2, interactive_stdin: false },
    });
    expect(rowById(records, 'T6').status).toBe('FAIL');
  });

  it('T6 fails on an interactive channel', () => {
    const records = allGood();
    records[5] = goodTrial({
      ...records[5],
      rescue: { human_interventions: 0, prompts_sent: 1, interactive_stdin: true },
    });
    expect(rowById(records, 'T6').status).toBe('FAIL');
  });

  it('T6 fails on a human intervention', () => {
    const records = allGood();
    records[0] = goodTrial({
      ...records[0],
      rescue: { human_interventions: 1, prompts_sent: 1, interactive_stdin: false },
    });
    expect(rowById(records, 'T6').status).toBe('FAIL');
  });
});
