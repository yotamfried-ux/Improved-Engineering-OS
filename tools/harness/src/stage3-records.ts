import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { TrialRecord } from './stage3-rows.ts';

export function loadStage3CampaignRecords(options: {
  readonly eosRoot: string;
  readonly campaign: string;
}): { readonly evidenceDir: string; readonly records: readonly TrialRecord[] } {
  const evidenceDir = join(
    options.eosRoot,
    'qualification',
    'evidence',
    'stage-3',
    options.campaign,
  );
  if (!existsSync(evidenceDir)) return { evidenceDir, records: [] };

  const records = readdirSync(evidenceDir)
    .filter((name) => name.endsWith('.json'))
    .sort()
    .map(
      (name) =>
        JSON.parse(readFileSync(join(evidenceDir, name), 'utf8')) as TrialRecord,
    );

  for (const record of records) {
    if (record.campaign !== options.campaign) {
      throw new Error(
        `record ${record.trial_id} declares campaign ${String(record.campaign)} but was found under ${options.campaign}`,
      );
    }
  }
  return { evidenceDir, records };
}
