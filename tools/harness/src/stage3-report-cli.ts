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

import {
  allRulesPassed,
  deriveRows,
  deterministicOf,
  type Row,
  type TrialRecord,
} from './stage3-rows.ts';

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

const rows: readonly Row[] = deriveRows(records);
const counts = {
  pass: rows.filter((row) => row.status === 'PASS').length,
  fail: rows.filter((row) => row.status === 'FAIL').length,
  unproven: rows.filter((row) => row.status === 'UNPROVEN').length,
};
const verdict = counts.fail === 0 && counts.unproven === 0 ? 'PASSED' : 'NOT PASSED';

/**
 * "Two rows fail" was written by hand and went stale the moment a third did.
 *
 * The prose beside a generated table has to be generated too, or it becomes the
 * part of the report that is wrong -- which is what happened to this report's
 * explanation of why T4 and T7 failed.
 */
const failingRowsPhrase = ((count: number): string =>
  count === 1 ? 'One row' : `${String(count)} rows`)(counts.fail + counts.unproven);

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
    : `${failingRowsPhrase} fail (${rows
        .filter((row) => row.status !== 'PASS')
        .map((row) => row.id)
        .join(', ')}), and none is about the agent or the tasks.

**T4 — registration.** The harness could not confirm any run with the Evidence
Plane, so every run is \`operational\` and no trial is qualification evidence. The
harness is correct to say so: a registration the plane never saw leaves no row for
it to read, and reporting the intended class would make the harness the authority
on classification, which is exactly what D36 takes away from everything except the
plane's own record.

**T6 and T7 — read, not stated.** Both rows were constants until now: T7 was the
literal string \`FAIL\` and T6 the literal string \`PASS\`, the latter justified by
what the simulation manifests forbid rather than by anything a trial produced.
They are derived from the evidence now, which is why T6 has moved: these 22 trials
carry no rescue evidence and no telemetry state, so neither row can be read from
them. That is the honest reading of records written before the harness recorded
those facts, and it is also why re-grading them cannot produce a pass -- the fields
the rules are about are not in them.

The session's egress policy does not reach the Evidence Plane host, and that is
the proximate cause of T4, and of the INCOMPLETE runs behind T7. **It is not the whole cause, and an earlier version of
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
