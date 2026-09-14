/**
 * Report one fresh Stage 3 qualification campaign without mixing historical
 * evidence into it.
 *
 * The 2026-09-12 evidence remains immutable evidence of the failed attempt. A
 * rerun belongs in its own directory and gets its own verdict. This generator
 * also pins the matrix: a subset cannot accidentally satisfy T1-T9 merely
 * because every record that happens to exist is clean.
 *
 * Usage:
 *   node tools/harness/src/stage3-campaign-report-cli.ts --campaign <id> [--out FILE]
 */

import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { deriveRows, type TrialRecord } from './stage3-rows.ts';
import { STAGE_3_HARD_TASKS, STAGE_3_TASKS } from './task-bank.ts';

interface CampaignRecord extends TrialRecord {
  readonly campaign?: string;
}

const args = process.argv.slice(2);
const flag = (name: string): string | undefined => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};

const campaign = flag('--campaign');
if (campaign === undefined || !/^[A-Za-z0-9_]{1,12}$/u.test(campaign)) {
  process.stderr.write('--campaign is required and must be 1-12 ASCII letters, digits or underscores\n');
  process.exit(64);
}

const eosRoot = resolve(import.meta.dirname, '..', '..', '..');
const evidenceDir = join(eosRoot, 'qualification', 'evidence', 'stage-3', campaign);
const outPath = resolve(
  flag('--out') ?? join(eosRoot, 'qualification', 'reports', `stage-03-${campaign}.md`),
);

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
  (name) => JSON.parse(readFileSync(join(evidenceDir, name), 'utf8')) as CampaignRecord,
);
const primaryIds = new Set(STAGE_3_TASKS.map((task) => task.taskId));
const hardIds = new Set(STAGE_3_HARD_TASKS.map((task) => task.taskId));

const matrixReasons: string[] = [];
if (records.length !== 22) matrixReasons.push(`expected 22 records, found ${String(records.length)}`);
if (records.some((record) => record.campaign !== campaign)) {
  matrixReasons.push('one or more records do not declare this campaign');
}
if (new Set(records.map((record) => record.run_id)).size !== records.length) {
  matrixReasons.push('run_id is not unique across the campaign');
}
if (new Set(records.map((record) => record.trial_id)).size !== records.length) {
  matrixReasons.push('trial_id is not unique across the campaign');
}
if (new Set(records.map((record) => record.eos_revision)).size !== 1) {
  matrixReasons.push('the campaign mixes EOS revisions');
}

for (const task of STAGE_3_TASKS) {
  const found = records.filter((record) => record.task_id === task.taskId);
  if (found.length !== 2) {
    matrixReasons.push(`${task.taskId}: expected 2 primary trials, found ${String(found.length)}`);
  }
  if (found.some((record) => record.arm !== 'eos')) {
    matrixReasons.push(`${task.taskId}: primary trials must run with the EOS installation present`);
  }
}

for (const task of STAGE_3_HARD_TASKS) {
  const found = records.filter((record) => record.task_id === task.taskId);
  const eos = found.filter((record) => record.arm === 'eos');
  const native = found.filter((record) => record.arm === 'native');
  if (eos.length !== 2 || native.length !== 2 || found.length !== 4) {
    matrixReasons.push(
      `${task.taskId}: expected 2 eos + 2 native trials, found ${String(eos.length)} + ${String(native.length)}`,
    );
  }
}

const unknownTasks = records.filter(
  (record) => !primaryIds.has(record.task_id) && !hardIds.has(record.task_id),
);
if (unknownTasks.length > 0) {
  matrixReasons.push(
    `unexpected task ids: ${[...new Set(unknownTasks.map((record) => record.task_id))].join(', ')}`,
  );
}

/**
 * `deriveRows` predates campaigns and identifies the primary bank by absence of
 * `arm`. The current runner always states what installation was present, so the
 * campaign report normalises the three primary task ids to that historical
 * representation before deriving T1/T2/T8. This changes no measured fact; it
 * makes the matrix role explicit instead of encoding it as a missing field.
 *
 * With `exactOptionalPropertyTypes`, "absent" and `undefined` are deliberately
 * different. Remove the campaign-only fields structurally rather than assigning
 * `arm: undefined`, so this adapter cannot manufacture a value the legacy shape
 * never had.
 */
const normalized: TrialRecord[] = records.map((record): TrialRecord => {
  const { campaign: _campaign, ...withoutCampaign } = record;
  if (!primaryIds.has(record.task_id)) return withoutCampaign;
  const { arm: _arm, ...primary } = withoutCampaign;
  return primary;
});
const rows = deriveRows(normalized);
const rowsPass = rows.length === 9 && rows.every((row) => row.status === 'PASS');
const matrixPass = matrixReasons.length === 0;
const verdict = matrixPass && rowsPass ? 'PASSED' : 'NOT PASSED';

const hardSummary = STAGE_3_HARD_TASKS.map((task) => {
  const found = records.filter((record) => record.task_id === task.taskId);
  const summary = (arm: 'eos' | 'native'): string => {
    const armRecords = found.filter((record) => record.arm === arm);
    const passed = armRecords.filter((record) => {
      const deterministic = record.verdicts.filter((item) => item.kind === 'deterministic');
      return deterministic.length > 0 && deterministic.every((item) => item.status === 'proven');
    }).length;
    const resolved = armRecords.filter((record) => record.resolve_called_unprompted).length;
    return `${String(passed)}/${String(armRecords.length)} solved; resolve ${String(resolved)}/${String(armRecords.length)}`;
  };
  return `| ${task.taskId} | ${summary('eos')} | ${summary('native')} |`;
}).join('\n');

const report = `# Stage 3 qualification campaign — ${campaign}

**Verdict: ${verdict}**

Evidence directory: \`qualification/evidence/stage-3/${campaign}/\`  
Revision: \`${records[0]?.eos_revision ?? 'none'}\`  
Records: **${String(records.length)} / 22**

## Matrix integrity

**${matrixPass ? 'PASS' : 'FAIL'}** — 6 primary trials (3 tasks × 2) and 16 paired trials (4 tasks × 2 arms × 2), one campaign, one revision, unique trial/run ids.

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

## Paired hard bank

| Task | EOS arm | Native arm |
| --- | --- | --- |
${hardSummary}

This report does not read the historical root-level Stage 3 records. They remain evidence of the earlier failed qualification and cannot be retroactively upgraded by a later run.
`;

writeFileSync(outPath, report, 'utf8');
process.stdout.write(`${report}\nreport: ${outPath}\n`);
process.exit(verdict === 'PASSED' ? 0 : 3);
