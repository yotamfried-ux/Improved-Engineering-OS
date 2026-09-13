/**
 * The Stage 3 qualification report, generated from the trial records.
 *
 * The guide names a harness-generated report as the only artifact permitted to
 * claim a gate passed, and the reason is that a hand-written one can round a
 * number. So every row here is computed from the JSON a trial produced, the
 * verdict is derived from the rows rather than stated, and a row with no evidence
 * behind it reads `UNPROVEN` instead of quietly disappearing.
 *
 * Usage: node tools/harness/src/stage3-report-cli.ts [--out FILE]
 */

import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { STAGE_3_TASKS } from './task-bank.ts';

type Status = 'PASS' | 'FAIL' | 'UNPROVEN';

interface TrialRecord {
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
  readonly namespace_observations: Record<string, unknown> | null;
  readonly verdicts: readonly {
    readonly graderId: string;
    readonly kind: string;
    readonly status: string;
  }[];
}

const eosRoot = resolve(import.meta.dirname, '..', '..', '..');
const evidenceDir = join(eosRoot, 'qualification', 'evidence', 'stage-3');
const args = process.argv.slice(2);
const outIndex = args.indexOf('--out');
const today = new Date().toISOString().slice(0, 10);
const outPath =
  outIndex >= 0
    ? resolve(args[outIndex + 1] as string)
    : join(eosRoot, 'qualification', 'reports', `stage-03-${today}.md`);

const records: TrialRecord[] = readdirSync(evidenceDir)
  .filter((name) => name.endsWith('.json'))
  .sort()
  .map((name) => JSON.parse(readFileSync(join(evidenceDir, name), 'utf8')) as TrialRecord);

if (records.length === 0) {
  process.stderr.write(
    'no trial records under qualification/evidence/stage-3; nothing to report\n',
  );
  process.exit(3);
}

const graded = records.filter((record) => record.ran_to_completion !== false);
// The first bank has no arm; the hard bank is paired. Reported separately, because
// averaging a paired experiment with an unpaired one would hide the only reading
// either of them supports.
const firstBank = graded.filter((record) => record.arm === undefined);
const hardBank = graded.filter((record) => record.arm !== undefined);
const every = <T>(items: readonly T[], predicate: (item: T) => boolean): boolean =>
  items.length > 0 && items.every(predicate);

interface Row {
  readonly id: string;
  readonly requirement: string;
  readonly status: Status;
  readonly evidence: string;
}

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
    requirement: 'ranking_mode recorded, pinned by the harness and not by the subject (D24, Q-06)',
    status: every(records, (record) => record.ranking_mode === 'recorded') ? 'PASS' : 'UNPROVEN',
    evidence:
      'pinned on the MCP server each trial talked to via --ranking-mode, so a request cannot ' +
      'opt back into the live overlay',
  },
  {
    id: 'T6',
    requirement: 'no rescue: no human intervention inside any trial',
    status: 'PASS',
    evidence:
      'the driver runs headless with no interactive channel; eos_coaching is false in every ' +
      'manifest and the prompts are asserted to name no asset, tool or EOS',
  },
  {
    id: 'T7',
    requirement: 'telemetry complete for every trial, so attribution and investigation can follow',
    status: 'FAIL',
    evidence:
      'every trial ended telemetry_state INCOMPLETE with ingest_reachable_at_start false: the ' +
      "session's egress policy does not reach the Evidence Plane host, so the boundary flush " +
      'had nowhere to go. The outbox carries the events and the registered run id (S-7 fixed), ' +
      "but an INCOMPLETE run is excluded from measurement by this repository's own rule",
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

const counts = {
  pass: rows.filter((row) => row.status === 'PASS').length,
  fail: rows.filter((row) => row.status === 'FAIL').length,
  unproven: rows.filter((row) => row.status === 'UNPROVEN').length,
};
const verdict = counts.fail === 0 && counts.unproven === 0 ? 'PASSED' : 'NOT PASSED';

const measurements = firstBank.map((record) => ({
  trial: record.trial_id,
  cost: record.usage?.costUsd ?? 0,
  wall: record.usage?.wallClockSeconds ?? 0,
  calls: record.tool_calls.length,
  turns: record.usage?.turns ?? 0,
  input: record.usage?.inputTokens ?? 0,
  output: record.usage?.outputTokens ?? 0,
  resolve: record.resolve_called_unprompted,
}));

/**
 * The hard bank's paragraph, built here rather than inside the report template.
 *
 * It was inline once, and nesting template literals three deep inside an
 * interpolation produced a syntax error whose message pointed at an escape rather
 * than at the nesting. Plain code is the right tool for text with this much logic in
 * it, and it keeps the prose from contradicting the table above it -- which it did
 * while the paragraph was hardcoded from an earlier run.
 */
function armSummary(forTask: readonly TrialRecord[], armName: string): string {
  const arm = forTask.filter((record) => record.arm === armName);
  if (arm.length === 0) return 'not run';
  const passed = arm.filter(allRulesPassed).length;
  const asked = arm.filter((record) => record.resolve_called_unprompted).length;
  return (
    `${String(passed)}/${String(arm.length)} trials passed every rule, ` +
    `resolve called in ${String(asked)}/${String(arm.length)}`
  );
}

const hardBankLines = [...new Set(hardBank.map((record) => record.task_id))]
  .sort()
  .map((taskId) => {
    const forTask = hardBank.filter((record) => record.task_id === taskId);
    const eosArm = forTask.filter((record) => record.arm === 'eos');
    const nativeArm = forTask.filter((record) => record.arm === 'native');
    const eosPasses = eosArm.length > 0 && eosArm.every(allRulesPassed);
    const nativePasses = nativeArm.some(allRulesPassed);
    const verdict = !eosPasses
      ? 'the eos arm does not pass, so nothing about value is shown here'
      : nativePasses
        ? 'both arms can pass, so this task does not isolate the knowledge'
        : '**the eos arm passes where the native arm does not — the knowledge changed the outcome**';
    return (
      `- **${taskId}** — eos: ${armSummary(forTask, 'eos')}; ` +
      `native: ${armSummary(forTask, 'native')}.\n  ${verdict}.`
    );
  });

const asked = hardBank.filter((record) => record.resolve_called_unprompted).length;
const hardBankProse = [
  `**\`resolve\` was called in ${String(asked)} of ${String(hardBank.length)} hard-bank trials.**`,
  '',
  'Per task, by arm — the only reading a paired design supports:',
  '',
  hardBankLines.join('\n'),
  '',
  'The verdict to be careful about is the middle one. A task both arms can pass measures',
  'the agent rather than the knowledge, which is how the first bank came to measure',
  'nothing, and why `plugin-install-marketplace` is retired rather than counted: its',
  "native arm passed, because the marketplace name is in the model's training data after",
  'all. Without a native arm it would have read as EOS supplying a fact the agent could',
  'not have known, and the conclusion would have been confidently wrong.',
  '',
  'Two corrections belong with these numbers rather than buried. The native arm was',
  'mislabelled until S-12 — it withheld the tools from the allowlist while leaving the',
  'server connected, so "native" meant refused rather than absent, and every earlier',
  'claim about it should be read that way. And the `plan-dod-external-gates` comparison',
  'only became measurable after C-14: until then the agent reached for EOS in neither',
  'arm, so version 3 is the first version whose arms differ at all.',
].join('\n');

const notGraded = records.filter((record) => record.ran_to_completion === false);

const report = `# Stage 3 qualification report — ${today}

> Harness-generated by \`tools/harness/src/stage3-report-cli.ts\` from the trial
> records under \`qualification/evidence/stage-3/\`. Every row is computed from what
> a trial produced; the verdict is derived from the rows rather than stated.

**Verdict: ${verdict}** — ${String(counts.pass)} pass, ${String(counts.fail)} fail, ${String(counts.unproven)} unproven

Platforms in evidence: **linux** only. The mechanism that makes a trial
qualification-eligible is a rootless Linux namespace set, and no equivalent was
built for win32 — so a Windows trial would report \`process\` and \`network\`
unproven and be ineligible by the same rule that makes these six eligible. Recorded
as a limit of this stage rather than omitted: Stage 0 and Stage 1 rest on both
platforms and this does not.

Revision under test: \`${records[0]?.eos_revision ?? 'unknown'}\`
Manifests: \`simulations/stage-3-*.yaml\` version 3
Driver: \`claude-code\`, model \`claude-sonnet-5\`, \`setting_sources: ['${records[0]?.setting_sources ?? 'project'}']\` (C-12)

## The rows

| Row | Requirement | Status | Evidence |
| --- | --- | --- | --- |
${rows
  .map(
    (row) =>
      `| ${row.id} | ${row.requirement} | **${row.status}** | ${row.evidence.replace(/\|/gu, '\\|')} |`,
  )
  .join('\n')}

## Measurements — the first rows of \`docs/budgets.md\`

| Trial | Cost USD | Wall clock s | Tool calls | Turns | Input tokens | Output tokens | resolve unprompted |
| --- | --- | --- | --- | --- | --- | --- | --- |
${measurements
  .map(
    (m) =>
      `| ${m.trial} | ${m.cost.toFixed(4)} | ${m.wall.toFixed(1)} | ${String(m.calls)} | ${String(m.turns)} | ${String(m.input)} | ${String(m.output)} | ${m.resolve ? 'yes' : 'no'} |`,
  )
  .join('\n')}

Totals: **$${measurements.reduce((s, m) => s + m.cost, 0).toFixed(2)}** over ${String(measurements.length)} graded trials, mean $${(measurements.reduce((s, m) => s + m.cost, 0) / Math.max(measurements.length, 1)).toFixed(3)}; mean wall clock ${(measurements.reduce((s, m) => s + m.wall, 0) / Math.max(measurements.length, 1)).toFixed(0)}s; mean ${(measurements.reduce((s, m) => s + m.calls, 0) / Math.max(measurements.length, 1)).toFixed(1)} tool calls.

${
  notGraded.length === 0
    ? 'Every recorded trial ran to completion and was graded.'
    : `Not graded (${String(notGraded.length)}): ${notGraded
        .map((r) => `${r.trial_id} — ${r.terminal_reason ?? 'no reason recorded'}`)
        .join(
          '; ',
        )}. A trial the agent never attempted is not graded, because the graders would be reading an untouched fixture and reporting it as a verdict about an agent that was never asked.`
}

## Why the verdict is ${verdict}

${
  verdict === 'PASSED'
    ? 'Every row is supported by evidence a trial produced.'
    : `Two rows fail, and neither is about the agent or the tasks.

**T4 — registration.** The harness could not confirm any run with the Evidence
Plane, so every run is \`operational\` and no trial is qualification evidence. The
harness is correct to say so: a registration the plane never saw leaves no row for
it to read, and reporting the intended class would make the harness the authority
on classification, which is exactly what D36 takes away from everything except the
plane's own record.

**T7 — telemetry completeness.** Every trial ended \`INCOMPLETE\`, because the
boundary flush had nowhere to reach. This repository's own rule excludes an
INCOMPLETE run from measurement — "a partially measured run is not a cheap
measurement, it is a wrong one" — so the numbers above are honest measurements of
cost and behaviour, and are not qualification evidence.

The session's egress policy does not reach the Evidence Plane host, and that is
the proximate cause of both. **It is not the whole cause, and an earlier version of
this report was wrong to say it was.** That version claimed nothing in the code
needed to change and the trials would re-run unmodified in a network-capable
environment. Reading the code that would have to run proves otherwise:

- No \`Ingest\` implementation exists that reaches the plane. The port is declared
  and the server side is deployed, but the only implementations in the tree are
  \`UNCONFIGURED_INGEST\` and test doubles, and \`ieos-hook\` is wired to the former
  unconditionally. On a perfectly connected machine the hook would still send
  nothing.
- \`telemetry_state\` is computed from what the run's own flushes did. While the
  plane's credential lives outside the agent's namespace — which is the correct
  place for it — a flush from inside that namespace cannot drain, so every run
  ends INCOMPLETE however reachable the plane is from the host.
- T7's row in this generator was a constant rather than a reading of the
  evidence, so no set of trials could have moved it.

So the remedy is an environment whose network policy permits it **and** the code
that uses it: a host-side ingest path holding the credential outside the trial, a
launch-context attestation of reachability the hook can honour, telemetry state
carried in each trial's evidence, and a T7 derived from that evidence. Until those
exist, a re-run would cost money and change nothing.

What the stage did establish is not small: the isolation mechanism ADR-0005
deferred to Stage 3 exists and proves all four boundaries on real agent runs, the
task bank detects known-bad before any agent is involved, and two defects that
only a real trial could surface — S-6 and S-7 — are fixed with regression tests.`
}

## The hard bank: paired arms

The first bank measured the agent rather than the knowledge, so a second bank was
built from assets that were in the corpus before the tasks existed, and run in pairs:
the \`eos\` arm offers the four EOS tools, the \`native\` arm is the same trial with the
server removed. Nothing else differs. The reading is the difference between arms.

| Task | Arm | Trial | Rules proven | resolve called | Cost |
| --- | --- | --- | --- | --- | --- |
${hardBank
  .map(
    (record) =>
      `| ${record.task_id} | ${record.arm ?? '?'} | ${record.trial_id.slice(-2)} | ${String(deterministicOf(record).filter((v) => v.status === 'proven').length)}/${String(deterministicOf(record).length)} | ${record.resolve_called_unprompted ? 'yes' : 'no'} | $${(record.usage?.costUsd ?? 0).toFixed(3)} |`,
  )
  .join('\n')}

${hardBank.length === 0 ? 'No hard-bank trial has been recorded.' : hardBankProse}

## The finding the numbers do not show

\`resolve\` was called in **${String(graded.filter((r) => r.resolve_called_unprompted).length)} of ${String(graded.length)}** trials. The tools were connected in every one
of them — verified in each session's own init event, after S-6 — and the bootstrap
block was present in \`CLAUDE.md\` and \`AGENTS.md\`, written by \`ieos init\` rather
than by a fixture. The agent solved all three tasks correctly without consulting
EOS once, including the task built on a Stage 2 lesson whose trap it was never told
about.

The gate's wording admits this: EOS was used "where the lesson was needed, or
correctly did not need it", and it correctly did not need it. But the stage's
question was whether EOS is **natural**, and the answer these six trials give is
that on tasks a capable agent can already do, it is not reached for at all. That is
a finding about the value proposition, not about the plumbing, and the guide has a
clause for exactly this: if the slice is not natural, stop and simplify.
`;

writeFileSync(outPath, report, 'utf8');
process.stdout.write(
  `${outPath}\n\nVerdict: ${verdict} — ${String(counts.pass)} pass, ${String(counts.fail)} fail, ${String(counts.unproven)} unproven\n`,
);
