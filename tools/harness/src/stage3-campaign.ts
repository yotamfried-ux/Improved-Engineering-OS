import { allRulesPassed, type TrialRecord } from './stage3-rows.ts';

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

export type Stage3CampaignRecord = Mutable<TrialRecord> & {
  campaign?: string;
  arm?: string;
  ipc_transport?: 'windows-named-pipe' | 'unix-socket' | string;
  model?: { requested: string | null; resolved: string | null };
  agent?: { driver: string; cli_version: string | null };
  runtime?: { node: string; platform: string };
};

export interface Stage3CampaignValidationOptions {
  readonly campaign: string;
  readonly currentRevision: string;
  readonly expectedProfile: 'windows-personal-v1' | 'linux-namespace-v1';
  readonly expectedRequestedModel: string;
  /** Defaults to the historical Stage 3 primary driver. */
  readonly expectedAgentDriver?: string;
  /** Defaults true. Codex JSONL currently may not expose the provider-resolved model. */
  readonly requireResolvedModel?: boolean;
  readonly primaryTaskIds: readonly string[];
  readonly hardTaskIds: readonly string[];
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

export function validateStage3Campaign(
  records: readonly Stage3CampaignRecord[],
  options: Stage3CampaignValidationOptions,
): string[] {
  const reasons: string[] = [];

  if (records.length !== 22) {
    reasons.push(`expected 22 records, found ${String(records.length)}`);
  }
  if (records.some((record) => record.campaign !== options.campaign)) {
    reasons.push('one or more records do not declare this campaign');
  }
  if (new Set(records.map((record) => record.run_id)).size !== records.length) {
    reasons.push('run_id is not unique across the campaign');
  }
  if (new Set(records.map((record) => record.trial_id)).size !== records.length) {
    reasons.push('trial_id is not unique across the campaign');
  }

  const revisions = unique(records.map((record) => record.eos_revision));
  if (revisions.length !== 1) {
    reasons.push(`the campaign mixes repository revisions: ${revisions.join(', ')}`);
  } else if (revisions[0] !== options.currentRevision) {
    reasons.push(
      `campaign revision ${revisions[0] ?? '(missing)'} is not the current repository revision ${options.currentRevision}`,
    );
  }

  const profiles = unique(records.map((record) => record.qualification_profile ?? '(missing)'));
  if (profiles.length !== 1 || profiles[0] !== options.expectedProfile) {
    reasons.push(
      `qualification profile must be exactly ${options.expectedProfile}; observed ${profiles.join(', ')}`,
    );
  }

  const expectedTransport =
    options.expectedProfile === 'windows-personal-v1' ? 'windows-named-pipe' : 'unix-socket';
  const transports = unique(records.map((record) => record.ipc_transport ?? '(missing)'));
  if (transports.length !== 1 || transports[0] !== expectedTransport) {
    reasons.push(
      `IPC transport must be exactly ${expectedTransport}; observed ${transports.join(', ')}`,
    );
  }

  const indexDigests = unique(
    records.map((record) => record.knowledge_index_digest ?? '(missing)'),
  );
  if (indexDigests.length !== 1 || indexDigests[0] === '(missing)') {
    reasons.push(
      `knowledge index digest must be reported and identical across the campaign; observed ${indexDigests.join(', ')}`,
    );
  }

  const requestedModels = unique(records.map((record) => record.model?.requested ?? '(missing)'));
  if (requestedModels.length !== 1 || requestedModels[0] !== options.expectedRequestedModel) {
    reasons.push(
      `requested model must be exactly ${options.expectedRequestedModel}; observed ${requestedModels.join(', ')}`,
    );
  }

  const resolvedValues = records.map((record) => record.model?.resolved ?? null);
  const resolvedModels = unique(resolvedValues.filter((value): value is string => value !== null));
  const missingResolved = resolvedValues.filter((value) => value === null).length;
  if (options.requireResolvedModel !== false) {
    if (resolvedModels.length !== 1 || missingResolved > 0) {
      reasons.push(
        `resolved model must be reported and identical across the campaign; observed ${[
          ...resolvedModels,
          ...(missingResolved > 0 ? ['(missing)'] : []),
        ].join(', ')}`,
      );
    }
  } else if (resolvedModels.length > 1 || (resolvedModels.length === 1 && missingResolved > 0)) {
    reasons.push(
      `resolved model must be uniformly unavailable or one identical reported value; observed ${[
        ...resolvedModels,
        ...(missingResolved > 0 ? ['(missing)'] : []),
      ].join(', ')}`,
    );
  }

  const expectedDriver = options.expectedAgentDriver ?? 'claude-code';
  const drivers = unique(records.map((record) => record.agent?.driver ?? '(missing)'));
  if (drivers.length !== 1 || drivers[0] !== expectedDriver) {
    reasons.push(`agent driver must be ${expectedDriver}; observed ${drivers.join(', ')}`);
  }
  const cliVersions = unique(records.map((record) => record.agent?.cli_version ?? '(missing)'));
  if (cliVersions.length !== 1 || cliVersions[0] === '(missing)') {
    reasons.push(
      `agent CLI version must be reported and identical across the campaign; observed ${cliVersions.join(', ')}`,
    );
  }
  if (
    expectedDriver === 'codex' &&
    records.some(
      (record) =>
        record.codex_permission_probe?.status !== 'PASS' ||
        record.codex_permission_probe.method !== 'model-free-sandbox' ||
        record.codex_permission_probe.profile !== 'ieos-stage3',
    )
  ) {
    reasons.push(
      'every Codex trial must record a passing model-free ieos-stage3 permission preflight',
    );
  }

  const nodeVersions = unique(records.map((record) => record.runtime?.node ?? '(missing)'));
  if (
    nodeVersions.length !== 1 ||
    nodeVersions[0] === '(missing)' ||
    !/^v?24\./u.test(nodeVersions[0] ?? '')
  ) {
    reasons.push(
      `Node runtime must be one 24.x version across the campaign; observed ${nodeVersions.join(', ')}`,
    );
  }
  const expectedPlatform = options.expectedProfile === 'windows-personal-v1' ? 'win32' : 'linux';
  const platforms = unique(records.map((record) => record.runtime?.platform ?? '(missing)'));
  if (platforms.length !== 1 || platforms[0] !== expectedPlatform) {
    reasons.push(`runtime platform must be ${expectedPlatform}; observed ${platforms.join(', ')}`);
  }

  for (const taskId of options.primaryTaskIds) {
    const found = records.filter((record) => record.task_id === taskId);
    if (found.length !== 2) {
      reasons.push(`${taskId}: expected 2 primary trials, found ${String(found.length)}`);
    }
    if (found.some((record) => record.arm !== 'eos')) {
      reasons.push(`${taskId}: primary trials must run with the EOS installation present`);
    }
    const expectedTrialIds = [`${taskId}-eos-t1`, `${taskId}-eos-t2`];
    const observedTrialIds = found.map((record) => record.trial_id).sort();
    if (
      observedTrialIds.length !== expectedTrialIds.length ||
      expectedTrialIds.some((trialId) => !observedTrialIds.includes(trialId))
    ) {
      reasons.push(
        `${taskId}: expected exact primary trial ids ${expectedTrialIds.join(', ')}; observed ${observedTrialIds.join(', ') || '(none)'}`,
      );
    }
  }

  for (const taskId of options.hardTaskIds) {
    const found = records.filter((record) => record.task_id === taskId);
    const eos = found.filter((record) => record.arm === 'eos');
    const native = found.filter((record) => record.arm === 'native');
    if (eos.length !== 2 || native.length !== 2 || found.length !== 4) {
      reasons.push(
        `${taskId}: expected 2 eos + 2 native trials, found ${String(eos.length)} + ${String(native.length)}`,
      );
    }
    const expectedTrialIds = [
      `${taskId}-eos-t1`,
      `${taskId}-eos-t2`,
      `${taskId}-native-t1`,
      `${taskId}-native-t2`,
    ];
    const observedTrialIds = found.map((record) => record.trial_id).sort();
    if (
      observedTrialIds.length !== expectedTrialIds.length ||
      expectedTrialIds.some((trialId) => !observedTrialIds.includes(trialId))
    ) {
      reasons.push(
        `${taskId}: expected exact paired trial ids ${expectedTrialIds.join(', ')}; observed ${observedTrialIds.join(', ') || '(none)'}`,
      );
    }
  }

  const expectedTaskIds = new Set([...options.primaryTaskIds, ...options.hardTaskIds]);
  const unexpected = unique(
    records
      .filter((record) => !expectedTaskIds.has(record.task_id))
      .map((record) => record.task_id),
  );
  if (unexpected.length > 0) {
    reasons.push(`unexpected task ids: ${unexpected.join(', ')}`);
  }

  return reasons;
}

export interface CampaignArmSummary {
  readonly trials: number;
  readonly passed: number;
  readonly resolveCalls: number;
  readonly meanCostUsd: number | null;
  readonly meanWallClockSeconds: number;
  readonly meanToolCalls: number;
  readonly meanTotalInputTokens: number;
}

export interface CampaignTaskSummary {
  readonly taskId: string;
  readonly eos: CampaignArmSummary;
  readonly native: CampaignArmSummary;
  readonly delta: {
    readonly costPercent: number | null;
    readonly wallClockPercent: number | null;
    readonly toolCalls: number;
    readonly totalInputTokensPercent: number | null;
  };
}

function mean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function meanKnown(values: readonly (number | null)[]): number | null {
  const known = values.filter((value): value is number => value !== null);
  return known.length === values.length ? mean(known) : null;
}

function armSummary(records: readonly Stage3CampaignRecord[]): CampaignArmSummary {
  return {
    trials: records.length,
    passed: records.filter(allRulesPassed).length,
    resolveCalls: records.filter((record) => record.resolve_called_unprompted).length,
    meanCostUsd: meanKnown(records.map((record) => record.usage?.costUsd ?? null)),
    meanWallClockSeconds: mean(records.map((record) => record.usage?.wallClockSeconds ?? 0)),
    meanToolCalls: mean(records.map((record) => record.tool_calls.length)),
    meanTotalInputTokens: mean(records.map((record) => record.usage?.totalInputTokens ?? 0)),
  };
}

function percentDelta(value: number | null, baseline: number | null): number | null {
  if (value === null || baseline === null || baseline === 0) return null;
  return ((value - baseline) / baseline) * 100;
}

export function summarizeStage3Campaign(
  records: readonly Stage3CampaignRecord[],
  hardTaskIds: readonly string[],
): CampaignTaskSummary[] {
  return hardTaskIds.map((taskId) => {
    const forTask = records.filter((record) => record.task_id === taskId);
    const eos = armSummary(forTask.filter((record) => record.arm === 'eos'));
    const native = armSummary(forTask.filter((record) => record.arm === 'native'));
    return {
      taskId,
      eos,
      native,
      delta: {
        costPercent: percentDelta(eos.meanCostUsd, native.meanCostUsd),
        wallClockPercent: percentDelta(eos.meanWallClockSeconds, native.meanWallClockSeconds),
        toolCalls: eos.meanToolCalls - native.meanToolCalls,
        totalInputTokensPercent: percentDelta(
          eos.meanTotalInputTokens,
          native.meanTotalInputTokens,
        ),
      },
    };
  });
}
