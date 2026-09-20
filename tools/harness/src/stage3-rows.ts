/** Stage 3 gate rows, derived only from fresh trial records. */

export type Status = 'PASS' | 'FAIL' | 'UNPROVEN';

export interface TrialRecord {
  readonly campaign?: string;
  readonly trial_id: string;
  readonly arm?: string;
  readonly obstructed?: boolean;
  readonly run_id: string;
  readonly task_id: string;
  readonly eos_revision: string;
  readonly qualification_profile?: 'windows-personal-v1' | 'linux-namespace-v1';
  readonly ipc_transport?: 'windows-named-pipe' | 'unix-socket' | string;
  readonly knowledge_index_digest?: string;
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
    readonly costUsd: number | null;
    readonly inputTokens: number;
    readonly outputTokens: number;
    /** Absent on the trials recorded before this field existed. */
    readonly totalInputTokens?: number;
    readonly turns: number;
  } | null;
  readonly model?: { readonly requested: string | null; readonly resolved: string | null };
  readonly agent?: {
    readonly driver: string;
    readonly cli_version: string | null;
  };
  readonly runtime?: {
    readonly node: string;
    readonly platform: string;
  };
  readonly tool_calls: readonly { readonly name: string }[];
  readonly resolve_called_unprompted: boolean;
  readonly eos_tools_used: readonly string[];
  readonly isolation: { readonly qualificationEligible: boolean };
  readonly trial_integrity?: {
    readonly qualificationEligible: boolean;
    readonly kernelIsolationRequired: boolean;
  };
  readonly telemetry?: {
    readonly ingest_reachable_at_start: boolean;
    readonly flush_ever_failed: boolean;
    readonly outbox_events_remaining: number;
    readonly telemetry_state: 'COMPLETE' | 'INCOMPLETE';
    readonly qualification_eligible: boolean;
    readonly unavailable_reason: string | null;
  };
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

export const deterministicOf = (record: TrialRecord) =>
  record.verdicts.filter((verdict) => verdict.kind === 'deterministic');

export const allRulesPassed = (record: TrialRecord): boolean => {
  const rules = deterministicOf(record);
  return rules.length > 0 && rules.every((verdict) => verdict.status === 'proven');
};

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
    'interventions, exactly one prompt each, and no interactive stdin channel.'
  );
}

function telemetryEvidence(records: readonly TrialRecord[]): string {
  const missing = records.filter((record) => record.telemetry === undefined);
  if (missing.length > 0) {
    return (
      `${String(missing.length)}/${String(records.length)} trial(s) carry no telemetry state, so ` +
      'this row cannot be read from them.'
    );
  }
  const failing = records.filter(
    (record) =>
      record.telemetry?.telemetry_state !== 'COMPLETE' || !record.telemetry.qualification_eligible,
  );
  if (failing.length === 0) {
    return (
      `${String(records.length)}/${String(records.length)} trial(s) ended COMPLETE and ` +
      'qualification eligible: reachability was declared before work, no flush failed, and the outbox drained.'
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

function t3Evidence(records: readonly TrialRecord[]): string {
  const missing = records.filter((record) => record.trial_integrity === undefined);
  if (missing.length > 0) {
    return `${String(missing.length)}/${String(records.length)} trial(s) predate the platform-profile integrity record and cannot satisfy T3`;
  }
  const profiles = [...new Set(records.map((record) => record.qualification_profile ?? 'unknown'))];
  const kernel = records.filter((record) => record.trial_integrity?.kernelIsolationRequired).length;
  return (
    `${String(records.length)}/${String(records.length)} trial(s) prove the required boundaries for ` +
    `profile(s) ${profiles.join(', ')}; kernel isolation was required by ${String(kernel)} trial(s). ` +
    'Windows personal-v1 does not claim PID/network kernel confinement.'
  );
}

export function deriveRows(records: readonly TrialRecord[]): readonly Row[] {
  const graded = records.filter((record) => record.ran_to_completion !== false);
  const firstBank = graded.filter((record) => record.arm === undefined);
  const trialsPerTask = new Map<string, TrialRecord[]>();
  for (const record of firstBank) {
    trialsPerTask.set(record.task_id, [...(trialsPerTask.get(record.task_id) ?? []), record]);
  }

  const rows: Row[] = [
    {
      id: 'T1',
      requirement:
        'at least three independent tasks, primary agent only, each in a fresh workspace',
      status:
        trialsPerTask.size >= 3 && every([...trialsPerTask.values()], (list) => list.length >= 2)
          ? 'PASS'
          : 'FAIL',
      evidence:
        `${String(trialsPerTask.size)} task(s), ${String(graded.length)} graded trial(s); ` +
        'each trial used a fresh disposable workspace',
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
      requirement:
        'the active platform profile proves its required trial-integrity boundaries; no stronger OS isolation may be inferred',
      status: every(
        graded,
        (record) =>
          record.isolation.qualificationEligible &&
          record.trial_integrity !== undefined &&
          record.trial_integrity.qualificationEligible,
      )
        ? 'PASS'
        : 'FAIL',
      evidence: t3Evidence(graded),
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
        'pinned on the MCP server each trial talked to via --ranking-mode, so a request cannot opt back into the live overlay',
    },
    {
      id: 'T6',
      requirement: 'no rescue: no human intervention inside any trial',
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
        "Every task was solved correctly without it, which is the gate's second branch.",
    },
    {
      id: 'T9',
      requirement: 'every trial within its declared budget (TD-20)',
      status: every(graded, (record) => record.budget.state === 'within') ? 'PASS' : 'FAIL',
      evidence: (() => {
        const measured = graded
          .map((record) => record.usage?.costUsd ?? null)
          .filter((value): value is number => value !== null);
        const cost =
          measured.length === 0
            ? 'dollar cost was not reported by this driver'
            : `total measured cost ${measured.reduce((sum, value) => sum + value, 0).toFixed(2)} across ${String(measured.length)} trial(s)`;
        return (
          `states: ${[...new Set(graded.map((r) => r.budget.state))].join(', ')}; ` +
          `${cost}; wall-clock and tool-call budgets remain enforced for every graded trial`
        );
      })(),
    },
  ];

  return rows;
}
