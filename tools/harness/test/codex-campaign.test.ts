import { describe, expect, it } from 'vitest';
import { validateStage3Campaign, type Stage3CampaignRecord } from '../src/stage3-campaign.ts';

const PRIMARY = ['guard-fail-closed', 'misleading-clue-merge', 'backoff-breaks-a-test'] as const;
const HARD = [
  'plugin-install-marketplace',
  'plan-dod-external-gates',
  'commit-message-protocol',
  'quality-gate-cleanup',
] as const;
const HEAD = 'c'.repeat(40);

function record(task: string, arm: 'eos' | 'native', trial: 1 | 2): Stage3CampaignRecord {
  return {
    campaign: 'S3CDX20A',
    trial_id: `${task}-${arm}-t${String(trial)}`,
    run_id: `run_s3_S3CDX20A_${task.replace(/-/gu, '_')}_${arm}_t${String(trial)}`,
    task_id: task,
    arm,
    eos_revision: HEAD,
    qualification_profile: 'windows-personal-v1',
    ipc_transport: 'windows-named-pipe',
    knowledge_index_digest: 'idx',
    setting_sources: 'project',
    ranking_mode: 'recorded',
    status: 'proven',
    ran_to_completion: true,
    qualification_eligible: true,
    origin_class_the_plane_would_stamp: 'qualification',
    registration: { confirmed: true, reason: null },
    budget: { state: 'within' },
    usage: {
      wallClockSeconds: 1,
      costUsd: null,
      inputTokens: 10,
      outputTokens: 5,
      totalInputTokens: 10,
      turns: 1,
    },
    model: { requested: 'gpt-5.6-sol', resolved: null },
    agent: { driver: 'codex', cli_version: 'codex-cli 0.154.0-alpha.6.2' },
    runtime: { node: 'v24.20.0', platform: 'win32' },
    codex_permission_probe: {
      status: 'PASS',
      method: 'model-free-sandbox',
      profile: 'ieos-stage3',
    },
    tool_calls: [],
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
  };
}

function fullCampaign(): Stage3CampaignRecord[] {
  return [
    ...PRIMARY.flatMap((task) => [1, 2].map((trial) => record(task, 'eos', trial as 1 | 2))),
    ...HARD.flatMap((task) =>
      (['eos', 'native'] as const).flatMap((arm) =>
        [1, 2].map((trial) => record(task, arm, trial as 1 | 2)),
      ),
    ),
  ];
}

const options = {
  campaign: 'S3CDX20A',
  currentRevision: HEAD,
  expectedProfile: 'windows-personal-v1' as const,
  expectedRequestedModel: 'gpt-5.6-sol',
  expectedAgentDriver: 'codex',
  requireResolvedModel: false,
  primaryTaskIds: PRIMARY,
  hardTaskIds: HARD,
};

describe('parallel Codex campaign integrity', () => {
  it('accepts uniformly unreported provider-resolved models without inventing one', () => {
    expect(validateStage3Campaign(fullCampaign(), options)).toEqual([]);
  });

  it('rejects a mixed driver campaign', () => {
    const records = fullCampaign();
    records[0]!.agent = { driver: 'claude-code', cli_version: '2.1.258' };
    expect(validateStage3Campaign(records, options).join('\n')).toMatch(/agent driver/u);
  });

  it('rejects Codex evidence that lacks the runtime permission preflight', () => {
    const records = fullCampaign();
    delete records[0]!.codex_permission_probe;
    expect(validateStage3Campaign(records, options).join('\n')).toMatch(/permission preflight/u);
  });

  it('rejects a mixture of missing and reported resolved models', () => {
    const records = fullCampaign();
    records[0]!.model = { requested: 'gpt-5.6-sol', resolved: 'server-model' };
    expect(validateStage3Campaign(records, options).join('\n')).toMatch(/resolved model/u);
  });

  it('still rejects more than one reported resolved model', () => {
    const records = fullCampaign();
    for (const record of records) record.model = { requested: 'gpt-5.6-sol', resolved: 'one' };
    records[0]!.model = { requested: 'gpt-5.6-sol', resolved: 'two' };
    expect(validateStage3Campaign(records, options).join('\n')).toMatch(/resolved model/u);
  });
});
