import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  summarizeStage3Campaign,
  validateStage3Campaign,
  type Stage3CampaignRecord,
} from '../src/stage3-campaign.ts';
import {
  assertCampaignRevisionCompatible,
  assertFreshTrialArtifacts,
} from '../src/stage3-trial-artifacts.ts';

const PRIMARY = ['guard-fail-closed', 'misleading-clue-merge', 'backoff-breaks-a-test'] as const;
const HARD = [
  'plugin-install-marketplace',
  'plan-dod-external-gates',
  'commit-message-protocol',
  'quality-gate-cleanup',
] as const;
const HEAD = 'a'.repeat(40);

function record(options: {
  task: string;
  arm: 'eos' | 'native';
  trial: 1 | 2;
}): Stage3CampaignRecord {
  const { task, arm, trial } = options;
  return {
    campaign: 'fresh26',
    trial_id: `${task}-${arm}-t${String(trial)}`,
    run_id: `run_s3_fresh26_${task.replace(/-/gu, '_')}_${arm}_t${String(trial)}`,
    task_id: task,
    arm,
    eos_revision: HEAD,
    qualification_profile: 'windows-personal-v1',
    ipc_transport: 'windows-named-pipe',
    knowledge_index_digest: 'idx_qualified',
    setting_sources: 'project',
    ranking_mode: 'recorded',
    status: 'proven',
    ran_to_completion: true,
    qualification_eligible: true,
    origin_class_the_plane_would_stamp: 'qualification',
    registration: { confirmed: true, reason: null },
    budget: { state: 'within' },
    usage: {
      wallClockSeconds: arm === 'eos' ? 120 : 90,
      costUsd: arm === 'eos' ? 0.6 : 0.4,
      inputTokens: 100,
      outputTokens: 200,
      totalInputTokens: arm === 'eos' ? 2000 : 1500,
      turns: 8,
    },
    tool_calls: Array.from({ length: arm === 'eos' ? 12 : 9 }, () => ({
      name: 'Bash',
    })),
    resolve_called_unprompted: arm === 'eos',
    eos_tools_used: arm === 'eos' ? ['resolve'] : [],
    isolation: { qualificationEligible: true },
    trial_integrity: { qualificationEligible: true, kernelIsolationRequired: false },
    telemetry: {
      ingest_reachable_at_start: true,
      flush_ever_failed: false,
      outbox_events_remaining: 0,
      telemetry_state: 'COMPLETE',
      qualification_eligible: true,
      unavailable_reason: null,
    },
    rescue: { human_interventions: 0, prompts_sent: 1, interactive_stdin: false },
    namespace_observations: null,
    verdicts: [{ graderId: 'g', kind: 'deterministic', status: 'proven' }],
    model: {
      requested: 'claude-sonnet-5',
      resolved: 'claude-sonnet-5-20260901',
    },
    agent: { driver: 'claude-code', cli_version: '2.1.258' },
    runtime: { node: 'v24.20.0', platform: 'win32' },
  };
}

function fullCampaign(): Stage3CampaignRecord[] {
  return [
    ...PRIMARY.flatMap((task) =>
      [1, 2].map((trial) => record({ task, arm: 'eos', trial: trial as 1 | 2 })),
    ),
    ...HARD.flatMap((task) =>
      (['eos', 'native'] as const).flatMap((arm) =>
        [1, 2].map((trial) => record({ task, arm, trial: trial as 1 | 2 })),
      ),
    ),
  ];
}

describe('Stage 3 fresh campaign integrity', () => {
  it(\n    'accepts exactly one current revision, profile, runtime, agent version and resolved model',\n    () => {
    expect(
      validateStage3Campaign(fullCampaign(), {
        campaign: 'fresh26',
        currentRevision: HEAD,
        expectedProfile: 'windows-personal-v1',
        expectedRequestedModel: 'claude-sonnet-5',
        primaryTaskIds: PRIMARY,
        hardTaskIds: HARD,
      }),
    ).toEqual([]);
    },
  );

  it.each([
    [
      'revision',
      (records: Stage3CampaignRecord[]) => (records[0]!.eos_revision = 'b'.repeat(40)),
      /revision/u,
    ],
    [
      'profile',
      (records: Stage3CampaignRecord[]) =>
        (records[0]!.qualification_profile = 'linux-namespace-v1'),
      /profile/u,
    ],
    [
      'knowledge index',
      (records: Stage3CampaignRecord[]) =>
        (records[0]!.knowledge_index_digest = 'idx_other'),
      /knowledge index digest/u,
    ],
    [
      'resolved model',
      (records: Stage3CampaignRecord[]) =>
        (records[0]!.model = {
          requested: 'claude-sonnet-5',
          resolved: 'other-model',
        }),
      /resolved model/u,
    ],
    [
      'agent version',
      (records: Stage3CampaignRecord[]) =>
        (records[0]!.agent = {
          driver: 'claude-code',
          cli_version: '2.1.999',
        }),
      /Claude Code version/u,
    ],
    [
      'node runtime',
      (records: Stage3CampaignRecord[]) =>
        (records[0]!.runtime = { node: 'v22.18.0', platform: 'win32' }),
      /Node runtime/u,
    ],
  ])('fails a campaign that mixes %s', (_label, mutate, expected) => {
    const records = fullCampaign();
    mutate(records);
    expect(
      validateStage3Campaign(records, {
        campaign: 'fresh26',
        currentRevision: HEAD,
        expectedProfile: 'windows-personal-v1',
        expectedRequestedModel: 'claude-sonnet-5',
        primaryTaskIds: PRIMARY,
        hardTaskIds: HARD,
      }).join('\n'),
    ).toMatch(expected);
  });

  it('fails closed when the model did not report what actually ran', () => {
    const records = fullCampaign();
    records[0]!.model = { requested: 'claude-sonnet-5', resolved: null };
    expect(
      validateStage3Campaign(records, {
        campaign: 'fresh26',
        currentRevision: HEAD,
        expectedProfile: 'windows-personal-v1',
        expectedRequestedModel: 'claude-sonnet-5',
        primaryTaskIds: PRIMARY,
        hardTaskIds: HARD,
      }).join('\n'),
    ).toMatch(/resolved model/u);
  });

  it('reports the experiment as vectors rather than one aggregate score', () => {
    const summary = summarizeStage3Campaign(fullCampaign(), HARD);
    const quality = summary.find((row) => row.taskId === 'quality-gate-cleanup');
    expect(quality).toMatchObject({
      eos: {
        trials: 2,
        meanCostUsd: 0.6,
        meanWallClockSeconds: 120,
        meanToolCalls: 12,
        meanTotalInputTokens: 2000,
      },
      native: {
        trials: 2,
        meanCostUsd: 0.4,
        meanWallClockSeconds: 90,
        meanToolCalls: 9,
        meanTotalInputTokens: 1500,
      },
    });
    expect(quality?.delta.costPercent).toBeCloseTo(50);
    expect(quality?.delta.wallClockPercent).toBeCloseTo(33.333, 2);
  });
});

describe('Stage 3 trial evidence immutability', () => {
  it('refuses to continue a campaign after the repository HEAD changed', () => {
    const root = mkdtempSync(join(tmpdir(), 'ieos-stage3-artifacts-'));
    writeFileSync(
      join(root, 'task-eos-t1.json'),
      JSON.stringify({ campaign: 'fresh26', eos_revision: HEAD }),
      'utf8',
    );
    expect(() =>
      assertCampaignRevisionCompatible({
        outDir: root,
        campaign: 'fresh26',
        currentRevision: HEAD,
      }),
    ).not.toThrow();
    expect(() =>
      assertCampaignRevisionCompatible({
        outDir: root,
        campaign: 'fresh26',
        currentRevision: 'b'.repeat(40),
      }),
    ).toThrow(/different repository revision/u);
  });

  it('refuses to overwrite an existing trial record or transcript', () => {
    const root = mkdtempSync(join(tmpdir(), 'ieos-stage3-artifacts-'));
    const transcriptDir = join(root, 'transcripts');
    mkdirSync(transcriptDir, { recursive: true });
    const recordPath = join(root, 'task-eos-t1.json');
    const transcriptPath = join(transcriptDir, 'task-eos-t1-task.ndjson');

    expect(() => assertFreshTrialArtifacts({ recordPath, transcriptPath })).not.toThrow();

    writeFileSync(recordPath, '{}\n', 'utf8');
    expect(() => assertFreshTrialArtifacts({ recordPath, transcriptPath })).toThrow(
      /record already exists/u,
    );
  });

  it('refuses a transcript-only collision left by an interrupted trial', () => {
    const root = mkdtempSync(join(tmpdir(), 'ieos-stage3-artifacts-'));
    const transcriptDir = join(root, 'transcripts');
    mkdirSync(transcriptDir, { recursive: true });
    const recordPath = join(root, 'task-eos-t1.json');
    const transcriptPath = join(transcriptDir, 'task-eos-t1-task.ndjson');
    writeFileSync(transcriptPath, '{}\n', 'utf8');

    expect(() => assertFreshTrialArtifacts({ recordPath, transcriptPath })).toThrow(
      /transcript already exists/u,
    );
  });
});
