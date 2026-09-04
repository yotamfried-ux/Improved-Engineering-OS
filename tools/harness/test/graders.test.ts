/**
 * Graders, the grading hierarchy, budgets and trial reports (criterion B2).
 *
 * The Stage 0 deliverable list requires "Grader validity: each grader has
 * positive, negative and mutation controls". Those controls are the point: D14
 * warns that a broken eval produces false confidence, and the Stage 0 manifest
 * names "evaluator does not detect known-bad" as a failure condition.
 */

import { describe, expect, it } from 'vitest';
import {
  buildTrialReport,
  checkGraderValidity,
  classifyUsage,
  combineVerdicts,
  gradeDeterministic,
  gradeTrace,
  gradeWithModel,
  GRADER_PRECEDENCE,
  mustAbort,
  type Gradeable,
  type GraderVerdict,
  type ModelGraderPort,
  type TrialOutcome,
} from '../src/index.ts';

const subject = (over: Partial<Gradeable> = {}): Gradeable => ({
  outcomes: { tests_exit_code: 0, files_changed: 3 },
  toolCalls: [
    { name: 'resolve', at: '2026-09-04T00:00:00.000Z' },
    { name: 'inspect', at: '2026-09-04T00:00:01.000Z' },
    { name: 'edit', at: '2026-09-04T00:00:02.000Z' },
  ],
  transcript: null,
  ...over,
});

const TESTS_PASSED = { id: 'tests-passed', key: 'tests_exit_code', equals: 0 } as const;

describe('deterministic grader', () => {
  it('proves a matching outcome', () => {
    expect(gradeDeterministic(TESTS_PASSED, subject()).status).toBe('proven');
  });

  it('fails a mismatching outcome and says both values', () => {
    const verdict = gradeDeterministic(TESTS_PASSED, subject({ outcomes: { tests_exit_code: 1 } }));
    expect(verdict.status).toBe('failed');
    expect(verdict.evidence).toContain('1');
    expect(verdict.evidence).toContain('expected 0');
  });

  it('reports unproven when the trial never reported the fact', () => {
    // Not observed is a third thing: it is neither a pass nor a failure.
    const verdict = gradeDeterministic(TESTS_PASSED, subject({ outcomes: {} }));
    expect(verdict.status).toBe('unproven');
    expect(verdict.evidence).toMatch(/nothing was observed/u);
  });
});

describe('trace grader', () => {
  it('proves a tool was called', () => {
    expect(gradeTrace({ id: 'r', tool: 'resolve', expectation: 'called' }, subject()).status).toBe(
      'proven',
    );
  });

  it('fails when a required tool was never called', () => {
    expect(gradeTrace({ id: 'r', tool: 'observe', expectation: 'called' }, subject()).status).toBe(
      'failed',
    );
  });

  it('proves a forbidden tool was not called', () => {
    expect(
      gradeTrace({ id: 'r', tool: 'deploy', expectation: 'not_called' }, subject()).status,
    ).toBe('proven');
  });

  it('judges ordering', () => {
    expect(
      gradeTrace(
        { id: 'r', tool: 'resolve', expectation: 'called_before', beforeTool: 'edit' },
        subject(),
      ).status,
    ).toBe('proven');
    expect(
      gradeTrace(
        { id: 'r', tool: 'edit', expectation: 'called_before', beforeTool: 'resolve' },
        subject(),
      ).status,
    ).toBe('failed');
  });

  it('treats an empty trace as unproven, not as proof a tool went uncalled', () => {
    // The failure this closes: a trial with broken telemetry certifying itself
    // by producing no evidence at all.
    const empty = subject({ toolCalls: [] });
    expect(gradeTrace({ id: 'r', tool: 'deploy', expectation: 'not_called' }, empty).status).toBe(
      'unproven',
    );
    expect(gradeTrace({ id: 'r', tool: 'resolve', expectation: 'called' }, empty).status).toBe(
      'unproven',
    );
  });

  it('reports unproven when ordering cannot be judged', () => {
    expect(
      gradeTrace(
        { id: 'r', tool: 'resolve', expectation: 'called_before', beforeTool: 'never_called' },
        subject(),
      ).status,
    ).toBe('unproven');
  });
});

describe('model grader', () => {
  const port = (status: 'proven' | 'failed'): ModelGraderPort => ({
    id: 'relevance',
    judge: () => Promise.resolve({ status, reasoning: 'stub judgement' }),
  });

  it('returns the port verdict', async () => {
    expect((await gradeWithModel(port('proven'), 'was it relevant?', subject())).status).toBe(
      'proven',
    );
  });

  it('is unproven, never a pass, when the port throws', async () => {
    const broken: ModelGraderPort = {
      id: 'relevance',
      judge: () => Promise.reject(new Error('no credential')),
    };
    const verdict = await gradeWithModel(broken, 'q', subject());
    expect(verdict.status).toBe('unproven');
    expect(verdict.evidence).toMatch(/did not produce a verdict/u);
  });
});

describe('the grading hierarchy is enforced', () => {
  const deterministicFail: GraderVerdict = {
    graderId: 'tests',
    kind: 'deterministic',
    status: 'failed',
    evidence: 'the test suite exited 1',
  };
  const modelPass: GraderVerdict = {
    graderId: 'relevance',
    kind: 'model',
    status: 'proven',
    evidence: 'the answer looked helpful',
  };

  it('an LLM grader cannot rescue a failing deterministic test', () => {
    // The report is explicit that this must not happen, and it is the classic
    // reward-hacking shape D14 warns about.
    const combined = combineVerdicts([deterministicFail, modelPass]);
    expect(combined.status).toBe('failed');
    expect(combined.decidedBy.map((v) => v.graderId)).toEqual(['tests']);
    expect(combined.overruled.map((v) => v.graderId)).toEqual(['relevance']);
  });

  it('an LLM grader equally cannot condemn a passing deterministic test', () => {
    const combined = combineVerdicts([
      { ...deterministicFail, status: 'proven', evidence: 'exited 0' },
      { ...modelPass, status: 'failed' },
    ]);
    expect(combined.status).toBe('proven');
  });

  it('keeps the overruled verdict in the record rather than discarding it', () => {
    const combined = combineVerdicts([deterministicFail, modelPass]);
    expect(combined.reasons.join(' ')).toMatch(/overruled by a higher-ranked grader/u);
  });

  it('a lower-ranked grader decides when no higher-ranked one was decisive', () => {
    const combined = combineVerdicts([
      { ...deterministicFail, status: 'unproven', evidence: 'tests did not run' },
      modelPass,
    ]);
    expect(combined.status).toBe('proven');
    expect(combined.decidedBy.map((v) => v.kind)).toEqual(['model']);
  });

  it('is unproven when no grader ran at all', () => {
    const combined = combineVerdicts([]);
    expect(combined.status).toBe('unproven');
    expect(combined.reasons.join(' ')).toMatch(/an ungraded trial proves nothing/u);
  });

  it('is unproven when every grader was itself unproven', () => {
    expect(
      combineVerdicts([
        { ...deterministicFail, status: 'unproven' },
        { ...modelPass, status: 'unproven' },
      ]).status,
    ).toBe('unproven');
  });

  it('within one rank, any failure fails', () => {
    expect(
      combineVerdicts([
        { ...deterministicFail, graderId: 'a', status: 'proven' },
        { ...deterministicFail, graderId: 'b', status: 'failed' },
      ]).status,
    ).toBe('failed');
  });

  it('orders the kinds as the report specifies', () => {
    expect(GRADER_PRECEDENCE.deterministic).toBeLessThan(GRADER_PRECEDENCE.static_check);
    expect(GRADER_PRECEDENCE.static_check).toBeLessThan(GRADER_PRECEDENCE.trace_rule);
    expect(GRADER_PRECEDENCE.trace_rule).toBeLessThan(GRADER_PRECEDENCE.model);
    expect(GRADER_PRECEDENCE.model).toBeLessThan(GRADER_PRECEDENCE.human);
  });
});

describe('grader validity: positive, negative and mutation controls', () => {
  it('accepts a grader that distinguishes good from bad', () => {
    const report = checkGraderValidity(
      'tests-passed',
      (s: Gradeable) => gradeDeterministic(TESTS_PASSED, s),
      {
        positive: subject(),
        negative: subject({ outcomes: { tests_exit_code: 1 } }),
        mutations: [subject({ outcomes: { tests_exit_code: 137 } }), subject({ outcomes: {} })],
      },
    );
    expect(report.failures, report.failures.join('\n')).toEqual([]);
    expect(report.valid).toBe(true);
  });

  it('rejects a grader that always passes', () => {
    // The known-bad detector the Stage 0 manifest requires. A grader that
    // cannot fail has proven nothing about any trial it ever graded.
    const alwaysPass = (): GraderVerdict => ({
      graderId: 'always',
      kind: 'deterministic',
      status: 'proven',
      evidence: 'looks fine to me',
    });
    const report = checkGraderValidity('always', alwaysPass, {
      positive: subject(),
      negative: subject({ outcomes: { tests_exit_code: 1 } }),
      mutations: [],
    });
    expect(report.valid).toBe(false);
    expect(report.failures.join(' ')).toMatch(/cannot distinguish good from bad/u);
  });

  it('rejects a grader that always fails', () => {
    const alwaysFail = (): GraderVerdict => ({
      graderId: 'never',
      kind: 'deterministic',
      status: 'failed',
      evidence: 'nope',
    });
    expect(
      checkGraderValidity('never', alwaysFail, {
        positive: subject(),
        negative: subject({ outcomes: { tests_exit_code: 1 } }),
        mutations: [],
      }).valid,
    ).toBe(false);
  });

  it('rejects a grader insensitive to a mutation', () => {
    // A grader that reads the wrong key passes its positive and negative
    // controls by accident and is still useless.
    const insensitive = (s: Gradeable): GraderVerdict =>
      gradeDeterministic({ id: 'files', key: 'files_changed', equals: 3 }, s);
    const report = checkGraderValidity('files', insensitive, {
      positive: subject(),
      negative: subject({ outcomes: { files_changed: 0 } }),
      // Mutates the thing the grader SHOULD care about, not the thing it does.
      mutations: [subject({ outcomes: { tests_exit_code: 1, files_changed: 3 } })],
    });
    expect(report.valid).toBe(false);
    expect(report.failures.join(' ')).toMatch(/insensitive to it/u);
  });
});

describe('budgets (TD-20)', () => {
  const budget = { wallClockSeconds: 60, maxToolCalls: 20 };

  it('is within budget under the limit', () => {
    expect(classifyUsage(budget, { wallClockSeconds: 30, toolCalls: 10 }).state).toBe('within');
  });

  it('records an overrun without aborting', () => {
    const verdict = classifyUsage(budget, { wallClockSeconds: 90, toolCalls: 10 });
    expect(verdict.state).toBe('over_budget');
    expect(mustAbort(verdict)).toBe(false);
  });

  it('aborts past twice the budget, as the guide specifies', () => {
    const verdict = classifyUsage(budget, { wallClockSeconds: 121, toolCalls: 10 });
    expect(verdict.state).toBe('aborted');
    expect(mustAbort(verdict)).toBe(true);
  });

  it('aborts on any axis, not only the first', () => {
    expect(classifyUsage(budget, { wallClockSeconds: 1, toolCalls: 41 }).state).toBe('aborted');
  });
});

describe('trial reports are conjunctive and never overclaim', () => {
  const outcome = (over: Partial<TrialOutcome> = {}): TrialOutcome =>
    ({
      trialId: 't1',
      taskId: 'task-1',
      driverKind: 'fake',
      result: { completed: true, toolCalls: [], transcriptRef: null },
      isolation: { findings: [], qualificationEligible: true, reasons: [] },
      qualificationEligible: true,
      reasons: [],
      ...over,
    }) as TrialOutcome;

  const passing: GraderVerdict = {
    graderId: 'tests',
    kind: 'deterministic',
    status: 'proven',
    evidence: 'exited 0',
  };

  it('is proven when grading, budget and eligibility all hold', () => {
    const report = buildTrialReport({
      outcome: outcome(),
      verdicts: [passing],
      budget: { wallClockSeconds: 60, maxToolCalls: 20 },
      usage: { wallClockSeconds: 10, toolCalls: 5 },
      artifacts: [],
    });
    expect(report.status).toBe('proven');
  });

  it('is unproven when the trial was not qualification-eligible, however well it graded', () => {
    // Measured something, but not something that counts (D36, ADR-0005).
    const report = buildTrialReport({
      outcome: outcome({
        qualificationEligible: false,
        reasons: ['network: unproven'],
      }),
      verdicts: [passing],
      budget: { wallClockSeconds: 60, maxToolCalls: 20 },
      usage: { wallClockSeconds: 10, toolCalls: 5 },
      artifacts: [],
    });
    expect(report.status).toBe('unproven');
    expect(report.reasons.join(' ')).toContain('network: unproven');
  });

  it('is failed when the trial was aborted for budget', () => {
    const report = buildTrialReport({
      outcome: outcome(),
      verdicts: [passing],
      budget: { wallClockSeconds: 10, maxToolCalls: 20 },
      usage: { wallClockSeconds: 100, toolCalls: 5 },
      artifacts: [],
    });
    expect(report.status).toBe('failed');
  });

  it('is unproven when the driver never reported completion', () => {
    const report = buildTrialReport({
      outcome: outcome({
        result: { completed: false, toolCalls: [], transcriptRef: null },
      }),
      verdicts: [passing],
      budget: { wallClockSeconds: 60, maxToolCalls: 20 },
      usage: { wallClockSeconds: 10, toolCalls: 5 },
      artifacts: [],
    });
    expect(report.status).toBe('unproven');
  });

  it('is unproven when no grader ran', () => {
    const report = buildTrialReport({
      outcome: outcome(),
      verdicts: [],
      budget: { wallClockSeconds: 60, maxToolCalls: 20 },
      usage: { wallClockSeconds: 10, toolCalls: 5 },
      artifacts: [],
    });
    expect(report.status).toBe('unproven');
  });
});
