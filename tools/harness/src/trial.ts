/** Running one trial, end to end. */

import { probe, type Trial } from './sandbox.ts';
import { buildIsolationReport, strictestOf, type BoundaryFinding } from './isolation.ts';
import type { AgentDriver, TrialOutcome, TrialTask } from './driver.ts';
import type { RunRegistry } from './run-registry.ts';
import type { TrialIntegrityReport } from './trial-integrity.ts';

export interface RunTrialOptions {
  readonly trial: Trial;
  readonly task: TrialTask;
  readonly driver: AgentDriver;
  readonly registry: RunRegistry;
  readonly runId: string;
  /** Findings from an OS mechanism, available only after the driver returned. */
  readonly mechanismFindings?: () => readonly BoundaryFinding[];
  /**
   * Cross-platform experiment-integrity evidence: secret non-propagation,
   * explicit tools/environment, prompt count, closed stdin and host-proxy IPC.
   * Stage 3 supplies it; older/non-qualification harness tests may omit it.
   */
  readonly integrityReport?: () => TrialIntegrityReport | null;
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

  const probed = strictestOf(trial.policy, before.findings, probe(trial).findings);
  const mechanism = options.mechanismFindings?.() ?? [];
  const isolation =
    mechanism.length === 0
      ? probed
      : buildIsolationReport(trial.policy, [...probed.findings, ...mechanism]);

  const integrity = options.integrityReport?.();
  const integrityReasons =
    integrity === undefined
      ? []
      : integrity === null
        ? ['trial integrity evidence was requested but the driver produced none']
        : integrity.qualificationEligible
          ? []
          : integrity.reasons;
  const reasons = [...isolation.reasons, ...integrityReasons, ...registrationReasons];

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
