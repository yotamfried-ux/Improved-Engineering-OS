/**
 * Running one trial, end to end.
 *
 * The only place `qualificationEligible` is computed. It requires two
 * independent things to be true, and both are checked here so neither can be
 * assumed by a caller:
 *
 *   1. the run was pre-registered as something other than `operational` (D36);
 *   2. every boundary the policy requires was *proven*, not merely unexamined
 *      (ADR-0005).
 */

import { probe, type Trial } from './sandbox.ts';
import type { AgentDriver, TrialOutcome, TrialTask } from './driver.ts';
import type { RunRegistry } from './run-registry.ts';

export interface RunTrialOptions {
  readonly trial: Trial;
  readonly task: TrialTask;
  readonly driver: AgentDriver;
  readonly registry: RunRegistry;
  readonly runId: string;
}

export async function runTrial(options: RunTrialOptions): Promise<TrialOutcome> {
  const { trial, task, driver, registry, runId } = options;

  const isolation = probe(trial);
  const reasons = [...isolation.reasons];

  const originClass = registry.originClassFor(runId);
  if (!registry.isRegistered(runId)) {
    reasons.push(
      `run ${runId} was never registered, so its evidence is "operational" and cannot ` +
        'count as qualification (D36)',
    );
  } else if (originClass !== 'qualification' && originClass !== 'holdout') {
    reasons.push(
      `run ${runId} is registered as "${originClass}", which is not a qualification class (D36)`,
    );
  }

  registry.markStarted(runId);
  const result = await driver.run(trial, task);

  return {
    trialId: trial.trialId,
    taskId: task.taskId,
    driverKind: driver.kind,
    result,
    isolation,
    qualificationEligible: reasons.length === 0,
    reasons,
  };
}
