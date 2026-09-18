/**
 * Report one fresh Stage 3 qualification campaign without mixing historical
 * evidence into it.
 *
 * Besides the formal T1-T9 gate, this report validates the experiment matrix
 * itself: one exact repository revision, qualification profile, Node runtime,
 * Claude Code version and resolved model across all 22 trials.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  summarizeStage3Campaign,
  validateStage3Campaign,
  type Stage3CampaignRecord,
} from './stage3-campaign.ts';
import { qualificationProfileFor } from './qualification-profile.ts';
import { deriveRows, deterministicOf, type TrialRecord } from './stage3-rows.ts';
import { STAGE_3_HARD_TASKS, STAGE_3_TASKS } from './task-bank.ts';

const args = process.argv.slice(2);
const flag = (name: string): string | undefined => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};

const campaign = flag('--campaign');
if (campaign === undefined || !/^[A-Za-z0-9_]{1,12}$/u.test(campaign)) {
  process.stderr.write(
    '--campaign is required and must be 1-12 ASCII letters, digits or underscores\n',
  );
  process.exit(64);
}

const eosRoot = resolve(import.meta.dirname, '..', '..', '..');
const evidenceDir = join(eosRoot, 'qualification', 'evidence', 'stage-3', campaign);
const outPath = resolve(
  flag('--out') ?? join(eosRoot, 'qualification', 'reports', `stage-03-${campaign}.md`),
);
const currentRevision = execFileSync('git', ['rev-parse', 'HEAD'], {
  cwd: eosRoot,
  encoding: 'utf8',
}).trim();
const expectedProfile = qualificationProfileFor();

let names: string[];
try {
  names = readdirSync(evidenceDir)
    .filter((name) => name.endsWith('.json'))
    .sort();
} catch {
  process.stderr.write(`no evidence directory exists for Stage 3 campaign ${campaign}\n`);
  process.exit(3);
}

const records = names.map(
  (name) =>
    JSON.parse(readFileSync(join(evidenceDir, name), 'utf8')) as Stage3CampaignRecord,
);
const primaryIds = STAGE_3_TASKS.map((task) => task.taskId);
const hardIds = STAGE_3_HARD_TASKS.map((task) => task.taskId);
const primaryIdSet = new Set(primaryIds);

const matrixReasons = validateStage3Campaign(records, {
  campaign,
  currentRevision,
  expectedProfile,
  expectedRequestedModel: 'claude-sonnet-5',
  primaryTaskIds: primaryIds,
  hardTaskIds: hardIds,
});

/**
 * deriveRows predates campaigns and identifies the formal primary bank by the
 * absence of an arm. The current runner states arm=eos explicitly, so normalize
 * only those three primary task records before deriving T1/T2/T8.
 */
const normalized: TrialRecord[] = records.map((record): TrialRecord => {
  const { campaign: _campaign, ...withoutCampaign } = record;
  if (!primaryIdSet.has(record.task_id)) return withoutCampaign;
  const { arm: _arm, ...primary } = withoutCampaign;
  return primary;
});
const rows = deriveRows(normalized);
const rowsPass =
  rows.length === 9 && rows.every((row) => row.status === 'PASS');
const matrixPass = matrixReasons.length === 0;
const verdict = matrixPass && rowsPass ? 'PASSED' : 'NOT PASSED';

const summaries = summarizeStage3Campaign(records, hardIds);
const pct = (value: number | null): string =>
  value === null ? 'n/a' : `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;
const signed = (value: number): string =>
  `${value >= 0 ? '+' : ''}${value.toFixed(1)}`;

const hardSummary = summaries
  .map((summary) => {
    const eosSolved = `${String(summary.eos.passed)}/${String(summary.eos.trials)}`;
    const nativeSolved = `${String(summary.native.passed)}/${String(summary.native.trials)}`;
    const resolve = [
      `${String(summary.eos.resolveCalls)}/${String(summary.eos.trials)}`,
      `${String(summary.native.resolveCalls)}/${String(summary.native.trials)}`,
    ].join(' → ');
    const cost =
      `${summary.eos.meanCostUsd.toFixed(3)} → ${summary.native.meanCostUsd.toFixed(3)} ` +
      `(EOS vs native ${pct(summary.delta.costPercent)})`;
    const wall =
      `${summary.eos.meanWallClockSeconds.toFixed(1)} → ` +
      `${summary.native.meanWallClockSeconds.toFixed(1)} ` +
      `(${pct(summary.delta.wallClockPercent)})`;
    const tools =
      `${summary.eos.meanToolCalls.toFixed(1)} → ` +
      `${summary.native.meanToolCalls.toFixed(1)} ` +
      `(${signed(summary.delta.toolCalls)})`;
    const input =
      `${String(Math.round(summary.eos.meanTotalInputTokens))} → ` +
      `${String(Math.round(summary.native.meanTotalInputTokens))} ` +
      `(${pct(summary.delta.totalInputTokensPercent)})`;
    return `| ${summary.taskId} | ${eosSolved} | ${nativeSolved} | ${resolve} | ${cost} | ${wall} | ${tools} | ${input} |`;
  })
  .join('\n');

const trialMeasurements = records
  .map((record) => {
    const deterministic = deterministicOf(record);
    const proven = deterministic.filter(
      (item) => item.status === 'proven',
    ).length;
    return (
      `| ${record.task_id} | ${record.arm ?? '?'} | ${record.trial_id.slice(-2)} | ` +
      `${String(proven)}/${String(deterministic.length)} | ` +
      `${record.resolve_called_unprompted ? 'yes' : 'no'} | ` +
      `$${(record.usage?.costUsd ?? 0).toFixed(3)} | ` +
      `${(record.usage?.wallClockSeconds ?? 0).toFixed(1)} | ` +
      `${String(record.tool_calls.length)} | ` +
      `${String(record.usage?.totalInputTokens ?? 0)} | ` +
      `${String(record.usage?.outputTokens ?? 0)} | ` +
      `${record.telemetry?.telemetry_state ?? 'missing'} |`
    );
  })
  .join('\n');

const one = (values: readonly (string | null | undefined)[]): string =>
  [...new Set(values.map((value) => value ?? '(missing)'))].join(', ');

const report = `# Stage 3 qualification campaign — ${campaign}

**Verdict: ${verdict}**

Evidence directory: \`qualification/evidence/stage-3/${campaign}/\`  
Current repository revision: \`${currentRevision}\`  
Recorded revision(s): \`${one(records.map((record) => record.eos_revision))}\`  
Qualification profile(s): \`${one(records.map((record) => record.qualification_profile))}\`  
Node runtime(s): \`${one(records.map((record) => record.runtime?.node))}\`  
Claude Code version(s): \`${one(records.map((record) => record.agent?.cli_version))}\`  
Requested model(s): \`${one(records.map((record) => record.model?.requested))}\`  
Resolved model(s): \`${one(records.map((record) => record.model?.resolved))}\`  
Records: **${String(records.length)} / 22**

## Matrix integrity

**${matrixPass ? 'PASS' : 'FAIL'}** — the campaign must contain the fixed 22-run matrix on one current revision, one qualification profile, one Node 24.x runtime, one Claude Code version and one resolved model.

${matrixReasons.length === 0 ? 'No matrix violations.' : matrixReasons.map((reason) => `- ${reason}`).join('\n')}

## Gate rows

| Row | Requirement | Status | Evidence |
| --- | --- | --- | --- |
${rows
  .map(
    (row) =>
      `| ${row.id} | ${row.requirement} | **${row.status}** | ${row.evidence.replace(/\|/gu, '\\|')} |`,
  )
  .join('\n')}

## Paired hard-bank vectors

No aggregate performance score is computed. Each task and resource axis is reported separately.

| Task | EOS solved | Native solved | resolve EOS → native | Mean cost | Mean wall s | Mean tool calls | Mean total input tokens |
| --- | ---: | ---: | --- | --- | --- | --- | --- |
${hardSummary}

\`plugin-install-marketplace\` remains the calibration/noise-floor task. It is not treated as a knowledge-value discriminator.

## Per-trial measurements

| Task | Arm | Trial | Deterministic rules | resolve | Cost | Wall s | Tool calls | Total input tokens | Output tokens | Telemetry |
| --- | --- | --- | ---: | --- | ---: | ---: | ---: | ---: | ---: | --- |
${trialMeasurements}

This report reads only this campaign directory. Historical root-level Stage 3 records remain evidence of earlier attempts and cannot be retroactively upgraded by a later run.
`;

writeFileSync(outPath, report, 'utf8');
process.stdout.write(`${report}\nreport: ${outPath}\n`);
process.exitCode = verdict === 'PASSED' ? 0 : 3;
