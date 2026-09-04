/**
 * Artifact collection and the trial report (Stage 0 criterion B2).
 *
 * A trial report states, for every claim, whether it was proven, failed or
 * never observed -- using the shared `ClaimStatus` vocabulary rather than a
 * report-specific one. The aggregate is computed, never asserted, so a report
 * cannot claim more than its claims support.
 */

import { aggregateClaims, type ClaimStatus } from '@ieos/core';
import type { TrialOutcome } from './driver.ts';
import { combineVerdicts, type GraderVerdict } from './graders.ts';
import { classifyUsage, type BudgetUsage, type TrialBudget, type BudgetVerdict } from './budget.ts';

export interface CollectedArtifact {
  readonly name: string;
  /** Where the artifact lives; never its contents, which may be large. */
  readonly ref: string;
  readonly bytes: number;
}

export interface TrialReport {
  readonly trialId: string;
  readonly taskId: string;
  readonly driverKind: string;
  /** The overall verdict, derived from everything below. */
  readonly status: ClaimStatus;
  readonly grading: ReturnType<typeof combineVerdicts>;
  readonly budget: BudgetVerdict;
  readonly isolationEligible: boolean;
  readonly qualificationEligible: boolean;
  readonly artifacts: readonly CollectedArtifact[];
  readonly reasons: readonly string[];
}

/**
 * Build a trial report.
 *
 * The overall status is pessimistic and conjunctive: a trial is `proven` only
 * when its graders decided proven AND it stayed within budget AND it was
 * qualification-eligible. An ineligible trial with passing graders is
 * `unproven`, not `proven` -- it measured something, but not something that
 * counts (D36, ADR-0005).
 */
export function buildTrialReport(input: {
  readonly outcome: TrialOutcome;
  readonly verdicts: readonly GraderVerdict[];
  readonly budget: TrialBudget;
  readonly usage: BudgetUsage;
  readonly artifacts: readonly CollectedArtifact[];
}): TrialReport {
  const grading = combineVerdicts(input.verdicts);
  const budget = classifyUsage(input.budget, input.usage);
  const reasons: string[] = [...grading.reasons, ...budget.reasons, ...input.outcome.reasons];

  const components: { status: ClaimStatus }[] = [{ status: grading.status }];

  if (budget.state === 'aborted') {
    components.push({ status: 'failed' });
    reasons.push('the trial was aborted for exceeding twice its declared budget');
  }
  if (!input.outcome.qualificationEligible) {
    components.push({ status: 'unproven' });
  }
  if (!input.outcome.result.completed) {
    components.push({ status: 'unproven' });
    reasons.push('the driver did not report completion, so the outcome was not observed');
  }

  return {
    trialId: input.outcome.trialId,
    taskId: input.outcome.taskId,
    driverKind: input.outcome.driverKind,
    status: aggregateClaims(components),
    grading,
    budget,
    isolationEligible: input.outcome.isolation.qualificationEligible,
    qualificationEligible: input.outcome.qualificationEligible,
    artifacts: input.artifacts,
    reasons,
  };
}

/** Render a report for a human. Failures and unproven items are never elided. */
export function formatTrialReport(report: TrialReport): string {
  const lines = [
    `trial ${report.trialId} / task ${report.taskId} (driver: ${report.driverKind})`,
    `  status: ${report.status.toUpperCase()}`,
    `  qualification-eligible: ${String(report.qualificationEligible)}`,
    `  budget: ${report.budget.state}`,
    `  artifacts: ${String(report.artifacts.length)}`,
  ];
  for (const reason of report.reasons) lines.push(`  - ${reason}`);
  return `${lines.join('\n')}\n`;
}
