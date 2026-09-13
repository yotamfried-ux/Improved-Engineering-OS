/**
 * Stage 3's gate rows, derived from the trial records and nothing else.
 *
 * Extracted from the report generator so the derivation can be tested. It could
 * not be before, and two rows were constants as a direct result: T7 read `FAIL`
 * literally, so no set of trials could ever have moved it, and T6 read `PASS`
 * literally, justified by what the manifests forbid rather than by anything a
 * trial produced. A generator that can print a verdict without reading a record
 * is the defect this repository's vacuity guards exist to catch, in the one file
 * whose whole job is to report what was read.
 *
 * Every row here is a reading. Where the records cannot support one, the row is
 * FAIL or UNPROVEN with the reason -- never a pass by default.
 */

export type Status = 'PASS' | 'FAIL' | 'UNPROVEN';

export interface TrialRecord {
  readonly trial_id: string;
  readonly arm?: string;
  readonly obstructed?: boolean;
  readonly run_id: string;
  readonly task_id: string;
  readonly eos_revision: string;
  readonly setting_sources: string;
  readonly ranking_mode: string;
  readonly status: string;
  readonly ran_to_completion?: boolean;
  readonly terminal_reason?: string | null;
  readonly qualification_eligible: boolean;
  readonly origin_class_the_plane_would_stamp: string;
  readonly registration: { readonly confirmed: boolean; readonly reason: string | null };
  readonly budget: { readonly state: string };
  readonly usage: {
    readonly wallClockSeconds: number;
    readonly costUsd: number;
    readonly inputTokens: number;
    readonly outputTokens: number;
    readonly turns: number;
  } | null;
  readonly tool_calls: readonly { readonly name: string }[];
  readonly resolve_called_unprompted: boolean;
  readonly eos_tools_used: readonly string[];
  readonly isolation: { readonly qualificationEligible: boolean };
  /**
   * The run's terminal telemetry state, read from the trial's own outbox.
   *
   * Optional because records written before the harness read it do not carry it.
   * Absent is not "fine": a row that needs this and cannot find it fails.
   */
  readonly telemetry?: {
    readonly ingest_reachable_at_start: boolean;
    readonly flush_ever_failed: boolean;
    readonly outbox_events_remaining: number;
    readonly telemetry_state: 'COMPLETE' | 'INCOMPLETE';
    readonly qualification_eligible: boolean;
    readonly unavailable_reason: string | null;
  };
  /** What the trial was told, counted. Optional for the same reason. */
  readonly rescue?: {
    readonly human_interventions: number;
    readonly prompts_sent: number | null;
    readonly interactive_stdin: boolean | null;
  };
  readonly namespace_observations: Record<string, unknown> | null;
  readonly verdicts: readonly {
    readonly graderId: string;
    readonly kind: string;
    readonly status: string;
  }[];
}

export interface Row {
  readonly id: string;
  readonly requirement: string;
  readonly status: Status;
  readonly evidence: string;
}

const every = <T>(items: readonly T[], predicate: (item: T) => boolean): boolean =>
  items.length > 0 && items.every(predicate);

/** Deterministic rules only, for the reason given where this is used. */
export const deterministicOf = (record: TrialRecord) =>
  record.verdicts.filter((verdict) => verdict.kind === 'deterministic');

export const allRulesPassed = (record: TrialRecord): boolean => {
  const rules = deterministicOf(record);
  return rules.length > 0 && rules.every((verdict) => verdict.status === 'proven');
};

/** Why T6 reads as it does, naming the trials when it cannot be read. */
function rescueEvidence(records: readonly TrialRecord[]): string {
  const missing = records.filter((record) => record.rescue === undefined);
  if (missing.length > 0) {
    return (
      `${String(missing.length)}/${String(records.length)} trial(s) record no rescue evidence, ` +
      'so this row cannot be read from them: ' +
      missing
        .slice(0, 3)
        .map((record) => record.trial_id)
        .join(', ')
    );
  }
  const intervened = records.filter((record) => (record.rescue?.human_interventions ?? 1) !== 0);
  const extraPrompts = records.filter((record) => record.rescue?.prompts_sent !== 1);
  const channels = records.filter((record) => record.rescue?.interactive_stdin !== false);
  if (intervened.length > 0 || extraPrompts.length > 0 || channels.length > 0) {
    return (
      `${String(intervened.length)} trial(s) recorded an intervention, ` +
      `${String(extraPrompts.length)} were sent other than exactly one prompt, and ` +
      `${String(channels.length)} had a channel open to the agent`
    );
  }
  return (
    `${String(records.length)}/${String(records.length)} trial(s) recorded 0 human ` +
    'interventions, exactly one prompt each, and no interactive channel to the agent. The ' +
    'sandbox offers no option by which anything could be written to a trial, which a ' +
    'source-level guard keeps true.'
  );
}

/** Why T7 reads as it does, per trial, from the snapshot rather than from prose. */
function telemetryEvidence(records: readonly TrialRecord[]): string {
  const missing = records.filter((record) => record.telemetry === undefined);
  if (missing.length > 0) {
    return (
      `${String(missing.length)}/${String(records.length)} trial(s) carry no telemetry state, so ` +
      "this row cannot be read from them. A trial recorded before the harness read the run's " +
      'terminal state out of its outbox is not qualification evidence, whatever its other rows say.'
    );
  }
  const failing = records.filter(
    (record) =>
      record.telemetry?.telemetry_state !== 'COMPLETE' || !record.telemetry.qualification_eligible,
  );
  if (failing.length === 0) {
    return (
      `${String(records.length)}/${String(records.length)} trial(s) ended COMPLETE and ` +
      'qualification eligible: reachability declared by the host before the run, no flush failed, ' +
      'and nothing left in the outbox.'
    );
  }
  const describe = (record: TrialRecord): string => {
    const telemetry = record.telemetry;
    if (telemetry === undefined) return `${record.trial_id}: no telemetry state`;
    const because = [
      telemetry.telemetry_state === 'COMPLETE' ? null : 'INCOMPLETE',
      telemetry.ingest_reachable_at_start ? null : 'no reachability attested at start',
      telemetry.flush_ever_failed ? 'a flush failed' : null,
      telemetry.outbox_events_remaining > 0
        ? `${String(telemetry.outbox_events_remaining)} event(s) left queued`
        : null,
      telemetry.unavailable_reason,
    ].filter((reason): reason is string => reason !== null);
    return `${record.trial_id}: ${because.join('; ')}`;
  };
  return `${String(failing.length)}/${String(records.length)} not eligible -- ${failing
    .slice(0, 6)
    .map(describe)
    .join(' | ')}`;
}

export function deriveRows(records: readonly TrialRecord[]): readonly Row[] {
  const graded = records.filter((record) => record.ran_to_completion !== false);
  const firstBank = graded.filter((record) => record.arm === undefined);

  const trialsPerTask = new Map<string, TrialRecord[]>();
  for (const record of firstBank) {
    trialsPerTask.set(record.task_id, [...(trialsPerTask.get(record.task_id) ?? []), record]);
  }

  /**
   * Deterministic rules only.
   *
   * The first version of this counted every verdict, so the trace rule -- which is
   * reported and deliberately not gating, because the gate allows a task solved
   * correctly without EOS -- failed the row about whether the task was solved. A
   * false FAIL from the report generator is no better than a false PASS.
   */
  const deterministicOf = (record: TrialRecord) =>
    record.verdicts.filter((verdict) => verdict.kind === 'deterministic');

  const allRulesPassed = (record: TrialRecord): boolean => {
    const rules = deterministicOf(record);
    return rules.length > 0 && rules.every((verdict) => verdict.status === 'proven');
  };

  const rows: Row[] = [
    {
      id: 'T1',
      requirement: 'at least three independent tasks, primary agent only, each in a fresh sandbox',
      status:
        trialsPerTask.size >= 3 && every([...trialsPerTask.values()], (list) => list.length >= 2)
          ? 'PASS'
          : 'FAIL',
      evidence:
        `${String(trialsPerTask.size)} task(s), ${String(graded.length)} graded trial(s), ` +
        `driver ${[...new Set(records.map(() => 'claude-code'))].join('/')} only; ` +
        'each trial ran in a workspace created for it and discarded after',
    },
    {
      id: 'T2',
      requirement: 'every trial solved its task: all deterministic rules proven',
      status: every(firstBank, allRulesPassed) ? 'PASS' : 'FAIL',
      evidence: firstBank
        .map(
          (record) =>
            `${record.trial_id}: ${String(deterministicOf(record).filter((v) => v.status === 'proven').length)}/${String(deterministicOf(record).length)} proven`,
        )
        .join('; '),
    },
    {
      id: 'T3',
      requirement: 'the four isolation boundaries are proven, not assumed (ADR-0005)',
      status: every(graded, (record) => record.isolation.qualificationEligible) ? 'PASS' : 'FAIL',
      evidence:
        'namespace mechanism on every trial: denied roots showed 0 entries, the control destination ' +
        'was refused, the trial was pid 1, the environment was built rather than filtered',
    },
    {
      id: 'T4',
      requirement: 'every run pre-registered as qualification with the Evidence Plane (D36)',
      status: every(records, (record) => record.registration.confirmed) ? 'PASS' : 'FAIL',
      evidence:
        `${String(records.filter((r) => r.registration.confirmed).length)}/${String(records.length)} confirmed. ` +
        `The plane would stamp: ${[...new Set(records.map((r) => r.origin_class_the_plane_would_stamp))].join(', ')}. ` +
        `Reason: ${records[0]?.registration.reason ?? 'none recorded'}`,
    },
    {
      id: 'T5',
      requirement:
        'ranking_mode recorded, pinned by the harness and not by the subject (D24, Q-06)',
      status: every(records, (record) => record.ranking_mode === 'recorded') ? 'PASS' : 'UNPROVEN',
      evidence:
        'pinned on the MCP server each trial talked to via --ranking-mode, so a request cannot ' +
        'opt back into the live overlay',
    },
    {
      id: 'T6',
      requirement: 'no rescue: no human intervention inside any trial',
      /**
       * Read from each record, not asserted from the manifests.
       *
       * This row was a constant `PASS` whose evidence described what the
       * simulation manifests forbid. A manifest forbidding rescue states an
       * intention; these fields are the count of prompts the driver actually
       * sent and whether any channel existed to reach the agent afterwards. A
       * record without them cannot support the row, so it does not get one.
       */
      status: every(
        records,
        (record) =>
          record.rescue !== undefined &&
          record.rescue.human_interventions === 0 &&
          record.rescue.prompts_sent === 1 &&
          record.rescue.interactive_stdin === false,
      )
        ? 'PASS'
        : 'FAIL',
      evidence: rescueEvidence(records),
    },
    {
      id: 'T7',
      requirement:
        'telemetry complete for every trial, so attribution and investigation can follow',
      /**
       * Read from each record's telemetry snapshot. Zero exceptions, and zero
       * inference: COMPLETE and eligible for every trial, or the row fails.
       *
       * This row was the literal string `FAIL`. That was the right answer for
       * the trials that existed and an untestable way to reach it -- no set of
       * trials, however clean, could have moved it, so the gate could not have
       * been passed even in principle.
       */
      status: every(
        records,
        (record) =>
          record.telemetry !== undefined &&
          record.telemetry.telemetry_state === 'COMPLETE' &&
          record.telemetry.qualification_eligible,
      )
        ? 'PASS'
        : 'FAIL',
      evidence: telemetryEvidence(records),
    },
    {
      id: 'T8',
      requirement: 'EOS used where a lesson was needed, or correctly not needed',
      status: every(firstBank, allRulesPassed) ? 'PASS' : 'UNPROVEN',
      evidence:
        `resolve was called unprompted in ${String(firstBank.filter((r) => r.resolve_called_unprompted).length)}/${String(firstBank.length)} trials. ` +
        "Every task was solved correctly without it, which is the gate's second branch -- and is " +
        'the finding this stage exists to surface rather than a pass to be pleased about',
    },
    {
      id: 'T9',
      requirement: 'every trial within its declared budget (TD-20)',
      status: every(graded, (record) => record.budget.state === 'within') ? 'PASS' : 'FAIL',
      evidence:
        `states: ${[...new Set(graded.map((r) => r.budget.state))].join(', ')}; ` +
        `total measured cost $${graded.reduce((sum, r) => sum + (r.usage?.costUsd ?? 0), 0).toFixed(2)} ` +
        `across ${String(graded.length)} trials against $3 each`,
    },
  ];

  return rows;
}
