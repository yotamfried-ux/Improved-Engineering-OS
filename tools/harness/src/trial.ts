/**
 * Running one trial, end to end.
 *
 * The only place `qualificationEligible` is computed. It requires two
 * independent things to be true, and both are checked here so neither can be
 * assumed by a caller:
 *
 *   1. the run was pre-registered as something other than `operational` (D36);
 *   2. every boundary the policy requires was *proven*, not merely unexamined
 *      (ADR-0005) -- and proven both before the agent ran and after it did.
 *
 * The second probe is the correction to a real gap. Probing only up front
 * answers "was this workspace clean when we handed it over", which is not the
 * question: a driver handed a clean workspace can link its way out of it, and
 * the outcome would still have read `filesystem: proven`. Isolation is a
 * property of the trial, so it is judged on the trial, not on its opening
 * state.
 */

import { probe, type Trial } from './sandbox.ts';
import { buildIsolationReport, strictestOf, type BoundaryFinding } from './isolation.ts';
import type { AgentDriver, TrialOutcome, TrialTask } from './driver.ts';
import type { RunRegistry } from './run-registry.ts';

export interface RunTrialOptions {
  readonly trial: Trial;
  readonly task: TrialTask;
  readonly driver: AgentDriver;
  readonly registry: RunRegistry;
  readonly runId: string;
  /**
   * Findings from a mechanism outside the directory sandbox, if one ran.
   *
   * From Stage 3 the namespace sandbox reports what it established, and those
   * findings sit alongside the probe's rather than replacing them: the probe's
   * `network: unproven` is a statement about the probe, so
   * `deriveQualificationEligibility` lets evidence outrank an admission of
   * ignorance while a violation from either still decides the boundary.
   */
  readonly mechanismFindings?: readonly BoundaryFinding[];
}

export async function runTrial(options: RunTrialOptions): Promise<TrialOutcome> {
  const { trial, task, driver, registry, runId } = options;

  const before = probe(trial);
  const originClass = registry.originClassFor(runId);
  const registrationReasons: string[] = [];
  if (!registry.isRegistered(runId)) {
    registrationReasons.push(
      `run ${runId} was never registered, so its evidence is "operational" and cannot ` +
        'count as qualification (D36)',
    );
  } else if (!registry.isConfirmedByPlane(runId)) {
    // Separated from "never registered" because the fix differs: this one is an
    // unenrolled or unreachable Evidence Plane, not a harness that forgot.
    registrationReasons.push(
      `run ${runId} was registered locally but not with the Evidence Plane, so the plane will ` +
        'stamp its events "operational" and this trial is not qualification evidence (D36)',
    );
  } else if (originClass !== 'qualification' && originClass !== 'holdout') {
    registrationReasons.push(
      `run ${runId} is registered as "${originClass}", which is not a qualification class (D36)`,
    );
  }

  registry.markStarted(runId);
  const result = await driver.run(trial, task);

  // Probed again, on the workspace the driver leaves behind.
  const probed = strictestOf(trial.policy, before.findings, probe(trial).findings);
  const isolation =
    options.mechanismFindings === undefined || options.mechanismFindings.length === 0
      ? probed
      : buildIsolationReport(trial.policy, [...probed.findings, ...options.mechanismFindings]);
  const reasons = [...isolation.reasons, ...registrationReasons];

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
