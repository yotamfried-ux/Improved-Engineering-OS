/** Generate the formal Stage 3 gate report for one fresh qualification campaign. */

import { writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { loadStage3CampaignRecords } from './stage3-records.ts';
import {
  deriveRows,
  deterministicOf,
  isQualificationRecord,
  type TrialRecord,
} from './stage3-rows.ts';

const args = process.argv.slice(2);
const flag = (name: string): string | undefined => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};

const campaign = flag('--campaign');
if (campaign === undefined || !/^[A-Za-z0-9_]{1,12}$/u.test(campaign)) {
  process.stderr.write(
    'usage: stage3:report --campaign <1-12 ASCII letters, digits or underscores> [--out FILE]\n',
  );
  process.exitCode = 64;
} else {
  const eosRoot = resolve(import.meta.dirname, '..', '..', '..');
  const { evidenceDir, records } = loadStage3CampaignRecords({ eosRoot, campaign });
  if (records.length === 0) {
    process.stderr.write(`no trial records under ${evidenceDir}; nothing to report\n`);
    process.exitCode = 3;
  } else {
    const rows = deriveRows(records);
    const counts = {
      pass: rows.filter((row) => row.status === 'PASS').length,
      fail: rows.filter((row) => row.status === 'FAIL').length,
      unproven: rows.filter((row) => row.status === 'UNPROVEN').length,
    };
    const revisions = [...new Set(records.map((record) => record.eos_revision))];
    const onlyQualification = records.every(isQualificationRecord);
    const exactRevision = revisions.length === 1;
    const verdict =
      counts.fail === 0 &&
      counts.unproven === 0 &&
      onlyQualification &&
      exactRevision
        ? 'PASSED'
        : 'NOT PASSED';

    const outArg = flag('--out');
    const today = new Date().toISOString().slice(0, 10);
    const outPath =
      outArg === undefined
        ? join(eosRoot, 'qualification', 'reports', `stage-03-${campaign}-${today}.md`)
        : resolve(outArg);

    const trialLine = (record: TrialRecord): string => {
      const deterministic = deterministicOf(record);
      const proven = deterministic.filter((item) => item.status === 'proven').length;
      return (
        `| ${record.task_id} | ${record.trial_id} | ${record.arm ?? 'n/a'} | ` +
        `${String(proven)}/${String(deterministic.length)} | ` +
        `${record.resolve_called_unprompted ? 'yes' : 'no'} | ` +
        `${record.telemetry?.telemetry_state ?? 'missing'} | ` +
        `${record.telemetry?.qualification_eligible === true ? 'yes' : 'no'} | ` +
        `$${(record.usage?.costUsd ?? 0).toFixed(3)} | ` +
        `${(record.usage?.wallClockSeconds ?? 0).toFixed(1)} | ` +
        `${String(record.tool_calls.length)} |`
      );
    };

    const campaignProblems = [
      onlyQualification
        ? null
        : 'The campaign contains value-bank records; the formal Stage 3 gate report accepts qualification-bank records only.',
      exactRevision
        ? null
        : `The campaign mixes EOS revisions: ${revisions.join(', ')}.`,
    ].filter((item): item is string => item !== null);

    const report = `# Stage 3 qualification campaign — ${campaign}

**Verdict: ${verdict}** — ${String(counts.pass)} pass, ${String(counts.fail)} fail, ${String(counts.unproven)} unproven

Campaign: \`${campaign}\`
Exact EOS revision: ${exactRevision ? `\`${revisions[0]}\`` : '**mixed — invalid for an exact-head qualification claim**'}
Profiles: ${[...new Set(records.map((record) => record.qualification_profile ?? 'unknown'))].join(', ')}
Records: ${String(records.length)}

${campaignProblems.length === 0 ? '' : `## Campaign integrity\n\n${campaignProblems.map((problem) => `- ${problem}`).join('\n')}\n\n`}
## Gate rows

| Row | Requirement | Status | Evidence |
| --- | --- | --- | --- |
${rows
  .map(
    (row) =>
      `| ${row.id} | ${row.requirement} | **${row.status}** | ${row.evidence.replace(/\|/gu, '\\|')} |`,
  )
  .join('\n')}

## Trial measurements

| Task | Trial | Arm | Deterministic rules | resolve unprompted | Telemetry | Eligible | Cost | Wall s | Tool calls |
| --- | --- | --- | ---: | --- | --- | --- | ---: | ---: | ---: |
${records.map(trialLine).join('\n')}

This report is campaign-scoped. Historical Stage 3 records and value-bank A/B records are not imported into this gate verdict.
`;

    writeFileSync(outPath, report, 'utf8');
    process.stdout.write(
      `${outPath}\n\nVerdict: ${verdict} — ${String(counts.pass)} pass, ${String(counts.fail)} fail, ${String(counts.unproven)} unproven\n`,
    );
  }
}
