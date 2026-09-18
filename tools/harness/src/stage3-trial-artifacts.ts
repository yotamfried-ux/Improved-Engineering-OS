import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export function assertFreshTrialArtifacts(options: {
  readonly recordPath: string;
  readonly transcriptPath: string;
}): void {
  if (existsSync(options.recordPath)) {
    throw new Error(
      `trial record already exists at ${options.recordPath}; refusing to overwrite qualification evidence`,
    );
  }
  if (existsSync(options.transcriptPath)) {
    throw new Error(
      `trial transcript already exists at ${options.transcriptPath}; refusing to overwrite qualification evidence`,
    );
  }
}

export function assertCampaignRevisionCompatible(options: {
  readonly outDir: string;
  readonly campaign: string;
  readonly currentRevision: string;
}): void {
  if (!existsSync(options.outDir)) return;
  for (const name of readdirSync(options.outDir).filter((candidate) =>
    candidate.endsWith('.json'),
  )) {
    const path = join(options.outDir, name);
    let record: { campaign?: unknown; eos_revision?: unknown };
    try {
      record = JSON.parse(readFileSync(path, 'utf8')) as {
        campaign?: unknown;
        eos_revision?: unknown;
      };
    } catch {
      throw new Error(
        `existing campaign evidence at ${path} is not valid JSON; refusing to continue the campaign`,
      );
    }
    if (record.campaign !== options.campaign) {
      throw new Error(
        `existing evidence at ${path} belongs to campaign ${String(record.campaign)}, not ${options.campaign}`,
      );
    }
    if (record.eos_revision !== options.currentRevision) {
      throw new Error(
        `existing campaign evidence at ${path} was produced at a different repository revision (${String(record.eos_revision)}); refusing to mix revisions`,
      );
    }
  }
}
