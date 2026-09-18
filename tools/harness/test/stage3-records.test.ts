import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadStage3CampaignRecords } from '../src/stage3-records.ts';

const scratch: string[] = [];
afterEach(() => {
  for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function root(): string {
  const dir = mkdtempSync(join(tmpdir(), 'ieos-stage3-campaign-'));
  scratch.push(dir);
  return dir;
}

function writeRecord(
  eosRoot: string,
  campaign: string,
  filename: string,
  declaredCampaign = campaign,
): void {
  const dir = join(eosRoot, 'qualification', 'evidence', 'stage-3', campaign);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, filename),
    JSON.stringify({ campaign: declaredCampaign, trial_id: filename.replace(/\.json$/u, '') }),
    'utf8',
  );
}

describe('Stage 3 campaign record loading', () => {
  it('loads only the requested campaign and ignores historical/root records', () => {
    const eosRoot = root();
    writeRecord(eosRoot, 'qual2026', 'q1.json');
    writeRecord(eosRoot, 'value2026', 'v1.json');
    const legacy = join(eosRoot, 'qualification', 'evidence', 'stage-3');
    writeFileSync(
      join(legacy, 'historical.json'),
      JSON.stringify({ trial_id: 'historical' }),
      'utf8',
    );

    const loaded = loadStage3CampaignRecords({ eosRoot, campaign: 'qual2026' });
    expect(loaded.records.map((record) => record.trial_id)).toEqual(['q1']);
  });

  it('fails closed when a record is stored under the wrong campaign directory', () => {
    const eosRoot = root();
    writeRecord(eosRoot, 'qual2026', 'q1.json', 'other2026');
    expect(() =>
      loadStage3CampaignRecords({ eosRoot, campaign: 'qual2026' }),
    ).toThrow(/declares campaign other2026/u);
  });

  it('returns an empty campaign instead of falling back to historical evidence', () => {
    const eosRoot = root();
    expect(
      loadStage3CampaignRecords({ eosRoot, campaign: 'qual2026' }).records,
    ).toEqual([]);
  });
});
