/**
 * Graders and the grading hierarchy (Stage 0 criterion B2).
 *
 * The report fixes the hierarchy and the reason for it:
 *
 *   deterministic outcome/state  >  static/type/security checks
 *   >  trace/trajectory rules  >  LLM grader  >  human calibration
 *
 * with the rule spelled out: *"An LLM grader is suited to questions like 'was
 * the recommendation relevant?', but must not outrank a test showing the code
 * failed."* That ordering is encoded here rather than left to whoever writes a
 * grader, because the failure mode -- a model grader talking a failing trial
 * into a pass -- is exactly what D14 lists under reward hacking.
 *
 * Every grader returns a `ClaimStatus`, so "the grader did not run" is a
 * first-class outcome and never collapses into a pass.
 */

import { aggregateClaims, type ClaimStatus } from '@ieos/core';
import type { ToolCallRecord } from './driver.ts';

export type GraderKind = 'deterministic' | 'static_check' | 'trace_rule' | 'model' | 'human';

/**
 * Lower number outranks higher. Exported so the precedence is inspectable and
 * testable rather than implicit in a comparison somewhere.
 */
export const GRADER_PRECEDENCE = {
  deterministic: 0,
  static_check: 1,
  trace_rule: 2,
  model: 3,
  human: 4,
} as const satisfies Record<GraderKind, number>;

export interface GraderVerdict {
  readonly graderId: string;
  readonly kind: GraderKind;
  readonly status: ClaimStatus;
  /** What was observed, or why nothing was. Required on every verdict. */
  readonly evidence: string;
}

export interface Gradeable {
  /** Outcome facts the trial produced: exit codes, file state, test results. */
  readonly outcomes: Readonly<Record<string, string | number | boolean>>;
  readonly toolCalls: readonly ToolCallRecord[];
  readonly transcript: string | null;
}

// ---------------------------------------------------------------------------
// deterministic
// ---------------------------------------------------------------------------

export interface DeterministicRule {
  readonly id: string;
  /** The outcome key this rule reads. */
  readonly key: string;
  readonly equals: string | number | boolean;
}

/**
 * Grade on outcome/state facts.
 *
 * A missing key is `unproven`, never a failure and never a pass: the trial did
 * not report that fact, which is a different thing from reporting a bad one.
 */
export function gradeDeterministic(rule: DeterministicRule, subject: Gradeable): GraderVerdict {
  const actual = subject.outcomes[rule.key];
  if (actual === undefined) {
    return {
      graderId: rule.id,
      kind: 'deterministic',
      status: 'unproven',
      evidence: `the trial reported no outcome for ${JSON.stringify(rule.key)}, so nothing was observed`,
    };
  }
  return {
    graderId: rule.id,
    kind: 'deterministic',
    status: actual === rule.equals ? 'proven' : 'failed',
    evidence: `${rule.key} = ${JSON.stringify(actual)}, expected ${JSON.stringify(rule.equals)}`,
  };
}

// ---------------------------------------------------------------------------
// trace / trajectory
// ---------------------------------------------------------------------------

export interface TraceRule {
  readonly id: string;
  /** Tool name the rule concerns. */
  readonly tool: string;
  readonly expectation: 'called' | 'not_called' | 'called_before';
  /** Required for `called_before`. */
  readonly beforeTool?: string;
}

/**
 * Grade on the trajectory: what the agent did, in what order.
 *
 * An empty trace is `unproven` rather than a verdict either way. With no
 * recorded tool calls there is nothing to conclude, and concluding
 * "not_called: proven" from silence is precisely how a trial with broken
 * telemetry would certify itself.
 */
export function gradeTrace(rule: TraceRule, subject: Gradeable): GraderVerdict {
  if (subject.toolCalls.length === 0) {
    return {
      graderId: rule.id,
      kind: 'trace_rule',
      status: 'unproven',
      evidence:
        'no tool calls were recorded, so the trajectory is unknown; an empty trace is not ' +
        'evidence that a tool went uncalled',
    };
  }

  const names = subject.toolCalls.map((call) => call.name);
  const firstIndex = names.indexOf(rule.tool);

  switch (rule.expectation) {
    case 'called':
      return {
        graderId: rule.id,
        kind: 'trace_rule',
        status: firstIndex >= 0 ? 'proven' : 'failed',
        evidence:
          firstIndex >= 0
            ? `${rule.tool} was called (position ${String(firstIndex)} of ${String(names.length)})`
            : `${rule.tool} was never called; trace was [${names.join(', ')}]`,
      };
    case 'not_called':
      return {
        graderId: rule.id,
        kind: 'trace_rule',
        status: firstIndex >= 0 ? 'failed' : 'proven',
        evidence:
          firstIndex >= 0
            ? `${rule.tool} was called but should not have been`
            : `${rule.tool} was not called, across ${String(names.length)} recorded calls`,
      };
    case 'called_before': {
      const other = rule.beforeTool;
      if (other === undefined) {
        return {
          graderId: rule.id,
          kind: 'trace_rule',
          status: 'unproven',
          evidence: 'called_before requires beforeTool; the rule is incomplete',
        };
      }
      const otherIndex = names.indexOf(other);
      if (firstIndex < 0 || otherIndex < 0) {
        return {
          graderId: rule.id,
          kind: 'trace_rule',
          status: 'unproven',
          evidence: `ordering cannot be judged: ${rule.tool} or ${other} was never called`,
        };
      }
      return {
        graderId: rule.id,
        kind: 'trace_rule',
        status: firstIndex < otherIndex ? 'proven' : 'failed',
        evidence: `${rule.tool} at ${String(firstIndex)}, ${other} at ${String(otherIndex)}`,
      };
    }
    default:
      return {
        graderId: rule.id,
        kind: 'trace_rule',
        status: 'unproven',
        evidence: 'unrecognised expectation',
      };
  }
}

// ---------------------------------------------------------------------------
// model grader
// ---------------------------------------------------------------------------

/**
 * A model grader, behind a port.
 *
 * No model is called from `packages/` or from the ordinary test suite: a model
 * call is live external execution, costs money and is nondeterministic, so it
 * is a Stage 3 activity rather than a Stage 0 one. Stage 0 fixes the shape and
 * the precedence.
 */
export interface ModelGraderPort {
  readonly id: string;
  /** Returns a status and its reasoning, or `unproven` when it could not run. */
  judge(question: string, subject: Gradeable): Promise<{ status: ClaimStatus; reasoning: string }>;
}

export async function gradeWithModel(
  port: ModelGraderPort,
  question: string,
  subject: Gradeable,
): Promise<GraderVerdict> {
  try {
    const { status, reasoning } = await port.judge(question, subject);
    return { graderId: port.id, kind: 'model', status, evidence: reasoning };
  } catch (error) {
    // A grader that could not run is unproven, never a pass.
    return {
      graderId: port.id,
      kind: 'model',
      status: 'unproven',
      evidence: `model grader did not produce a verdict: ${String(error)}`,
    };
  }
}

// ---------------------------------------------------------------------------
// combining verdicts
// ---------------------------------------------------------------------------

export interface CombinedGrade {
  readonly status: ClaimStatus;
  /** The verdicts that actually determined the result. */
  readonly decidedBy: readonly GraderVerdict[];
  /** Verdicts a higher-ranked grader overruled, kept for the record. */
  readonly overruled: readonly GraderVerdict[];
  readonly reasons: readonly string[];
}

/**
 * Combine grader verdicts under the report's hierarchy.
 *
 * The rule: the highest-ranked kind that produced a *decisive* verdict
 * (`proven` or `failed`) decides. A model grader cannot overturn a
 * deterministic one, in either direction — it cannot rescue a failing test, and
 * it equally cannot condemn a passing one.
 *
 * If no grader was decisive, the result is `unproven`. That includes the case
 * where every grader was itself unproven, which is the vacuous-success shape.
 */
export function combineVerdicts(verdicts: readonly GraderVerdict[]): CombinedGrade {
  if (verdicts.length === 0) {
    return {
      status: 'unproven',
      decidedBy: [],
      overruled: [],
      reasons: ['no grader ran; an ungraded trial proves nothing'],
    };
  }

  const decisive = verdicts.filter((verdict) => verdict.status !== 'unproven');
  if (decisive.length === 0) {
    return {
      status: 'unproven',
      decidedBy: [],
      overruled: [],
      reasons: verdicts.map((verdict) => `${verdict.graderId}: unproven -- ${verdict.evidence}`),
    };
  }

  const bestRank = Math.min(...decisive.map((verdict) => GRADER_PRECEDENCE[verdict.kind]));
  const decidedBy = decisive.filter((verdict) => GRADER_PRECEDENCE[verdict.kind] === bestRank);
  const overruled = decisive.filter((verdict) => GRADER_PRECEDENCE[verdict.kind] > bestRank);

  return {
    // Within one rank, aggregation stays pessimistic: any failure fails.
    status: aggregateClaims(decidedBy.map((verdict) => ({ status: verdict.status }))),
    decidedBy,
    overruled,
    reasons: [
      ...decidedBy.map((verdict) => `${verdict.graderId} (${verdict.kind}): ${verdict.evidence}`),
      ...overruled.map(
        (verdict) =>
          `${verdict.graderId} (${verdict.kind}) said ${verdict.status}, overruled by a ` +
          `higher-ranked grader`,
      ),
    ],
  };
}

// ---------------------------------------------------------------------------
// grader validity: positive, negative and mutation controls
// ---------------------------------------------------------------------------

export interface GraderControls<TSubject extends Gradeable> {
  /** A subject the grader must call `proven`. */
  readonly positive: TSubject;
  /** A subject the grader must call `failed`. */
  readonly negative: TSubject;
  /** Subjects that perturb the positive case; each must not stay `proven`. */
  readonly mutations: readonly TSubject[];
}

export interface ValidityReport {
  readonly graderId: string;
  readonly valid: boolean;
  readonly failures: readonly string[];
}

/**
 * Check that a grader can distinguish good from bad.
 *
 * The Stage 0 simulation manifest lists "the evaluator does not detect
 * known-bad" as a failure condition, and D14 warns that a broken eval yields
 * false confidence. A grader that returns the same verdict for its positive and
 * negative control proves nothing about any trial it has ever graded.
 */
export function checkGraderValidity<TSubject extends Gradeable>(
  graderId: string,
  grade: (subject: TSubject) => GraderVerdict,
  controls: GraderControls<TSubject>,
): ValidityReport {
  const failures: string[] = [];

  const positive = grade(controls.positive);
  if (positive.status !== 'proven') {
    failures.push(
      `positive control graded ${positive.status}, expected proven -- ${positive.evidence}`,
    );
  }

  const negative = grade(controls.negative);
  if (negative.status !== 'failed') {
    failures.push(
      `negative control graded ${negative.status}, expected failed -- ${negative.evidence}`,
    );
  }

  if (positive.status === negative.status) {
    failures.push(
      'positive and negative controls received the same verdict; this grader cannot ' +
        'distinguish good from bad and proves nothing',
    );
  }

  for (const [index, mutation] of controls.mutations.entries()) {
    const verdict = grade(mutation);
    if (verdict.status === 'proven') {
      failures.push(
        `mutation ${String(index)} still graded proven; the grader is insensitive to it -- ` +
          verdict.evidence,
      );
    }
  }

  return { graderId, valid: failures.length === 0, failures };
}
