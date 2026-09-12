/**
 * Isolation: what Stage 0 proves, and what it refuses to claim (ADR-0005).
 *
 * The tests are split deliberately. The first group proves boundaries a
 * directory sandbox genuinely can establish. The second group asserts that the
 * boundaries it cannot establish are reported `unproven` and make the trial
 * ineligible -- because the failure mode research finding R5 names is a harness
 * that reports success for a check it never ran.
 */

import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  BOUNDARY_KINDS,
  createTrial,
  defaultTrialPolicy,
  deriveQualificationEligibility,
  findingFor,
  isContainedBy,
  probe,
  writeIntoTrial,
  FakeAgentDriver,
  RunRegistry,
  runTrial,
  LateRegistrationError,
  type AgentDriver,
  type DriverResult,
  type IsolationPolicy,
  type Trial,
} from '../src/index.ts';

const EVALUATOR_ROOT = join(tmpdir(), 'ieos-evaluator-fixture');
const open: Trial[] = [];
const scratchDirs: string[] = [];

function trialWith(policy: IsolationPolicy, sourceEnvironment = {}): Trial {
  const trial = createTrial({ trialId: 't1', policy, sourceEnvironment });
  open.push(trial);
  return trial;
}

const basePolicy = (): IsolationPolicy =>
  defaultTrialPolicy({ workspaceRoot: 'unused', evaluatorRoot: EVALUATOR_ROOT });

afterEach(() => {
  for (const trial of open.splice(0)) trial.dispose();
  for (const dir of scratchDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
});

describe('what a directory sandbox genuinely proves', () => {
  it('grants no environment variable that was not explicitly named', () => {
    const trial = trialWith(basePolicy(), {
      PATH: '/usr/bin',
      HOME: '/home/x',
      AWS_SECRET_ACCESS_KEY: 'leaked',
      IEOS_INSTALLATION_TOKEN: 'leaked',
    });

    expect(Object.keys(trial.environment).sort()).toEqual(['HOME', 'PATH']);
    expect(trial.environment).not.toHaveProperty('AWS_SECRET_ACCESS_KEY');
    expect(trial.environment).not.toHaveProperty('IEOS_INSTALLATION_TOKEN');
    expect(findingFor(probe(trial), 'environment')?.verdict).toBe('proven');
  });

  it('builds the environment rather than filtering one, so nothing is inherited by default', () => {
    const trial = trialWith({
      ...basePolicy(),
      environment: { allowedNames: [] },
    });
    expect(Object.keys(trial.environment)).toEqual([]);
  });

  it('gives two trials workspaces that cannot see each other', () => {
    const a = trialWith(basePolicy());
    const b = createTrial({ trialId: 't2', policy: basePolicy() });
    open.push(b);

    expect(a.workspaceRoot).not.toBe(b.workspaceRoot);
    expect(isContainedBy(a.workspaceRoot, b.workspaceRoot)).toBe(false);
    expect(isContainedBy(b.workspaceRoot, a.workspaceRoot)).toBe(false);

    writeIntoTrial(a, 'notes.md', 'state from trial a');
    expect(findingFor(probe(b), 'filesystem')?.verdict).toBe('proven');
  });

  it('refuses a write that escapes the workspace via traversal', () => {
    const trial = trialWith(basePolicy());
    expect(() => writeIntoTrial(trial, '../escaped.md', 'x')).toThrow(
      /outside the trial workspace/u,
    );
  });

  it('detects a symlink out of the workspace, which is how evaluator files actually leak', () => {
    const trial = trialWith(basePolicy());
    mkdirSync(EVALUATOR_ROOT, { recursive: true });
    writeFileSync(join(EVALUATOR_ROOT, 'expected-output.json'), '{"answer":42}', 'utf8');
    symlinkSync(EVALUATOR_ROOT, join(trial.workspaceRoot, 'hidden'));

    const report = probe(trial);
    const filesystem = findingFor(report, 'filesystem');
    expect(filesystem?.verdict).toBe('violated');
    expect(filesystem?.evidence).toContain('hidden');
    expect(report.qualificationEligible).toBe(false);
  });

  it('treats a denied root inside the workspace as a violation, not an oversight', () => {
    const trial = trialWith(basePolicy());
    const contaminated: IsolationPolicy = {
      ...trial.policy,
      filesystem: {
        allowedRoots: [trial.workspaceRoot],
        deniedRoots: [join(trial.workspaceRoot, 'evaluator')],
      },
    };
    const report = probe({ ...trial, policy: contaminated });
    expect(findingFor(report, 'filesystem')?.verdict).toBe('violated');
  });
});

describe('what Stage 0 refuses to claim', () => {
  it('reports process containment unproven, with the reason', () => {
    const finding = findingFor(probe(trialWith(basePolicy())), 'process');
    expect(finding?.verdict).toBe('unproven');
    expect(finding?.evidence).toMatch(/temporary directory cannot constrain process creation/u);
  });

  it('reports network containment unproven, with the reason', () => {
    const finding = findingFor(probe(trialWith(basePolicy())), 'network');
    expect(finding?.verdict).toBe('unproven');
    expect(finding?.evidence).toMatch(/cannot constrain network egress/u);
  });

  it('makes a trial ineligible while a required boundary is unproven', () => {
    const report = probe(trialWith(basePolicy()));
    expect(report.qualificationEligible).toBe(false);
    expect(report.reasons.join(' ')).toContain('network: unproven');
    expect(report.reasons.join(' ')).toContain('process: unproven');
  });

  it('becomes eligible only when the policy stops requiring what cannot be proven', () => {
    const relaxed: IsolationPolicy = {
      ...basePolicy(),
      requiredBoundaries: ['filesystem', 'environment'],
    };
    expect(probe(trialWith(relaxed)).qualificationEligible).toBe(true);
  });

  it('has no representation for "isolated: true"', () => {
    const report = probe(trialWith(basePolicy()));
    expect(report).not.toHaveProperty('isolated');
    for (const finding of report.findings) {
      expect(['proven', 'violated', 'unproven']).toContain(finding.verdict);
    }
  });

  it('covers every declared boundary kind, so none is silently skipped', () => {
    const report = probe(trialWith(basePolicy()));
    expect(report.findings.map((f) => f.boundary).sort()).toEqual([...BOUNDARY_KINDS].sort());
  });
});

describe('a required boundary that was never probed counts as unproven', () => {
  it('fails eligibility rather than passing by omission', () => {
    const { eligible, reasons } = deriveQualificationEligibility(basePolicy(), [
      { boundary: 'filesystem', verdict: 'proven', evidence: 'checked' },
    ]);
    expect(eligible).toBe(false);
    expect(reasons.join(' ')).toContain('never probed');
  });

  it('passes when every required boundary was proven', () => {
    const findings = BOUNDARY_KINDS.map((boundary) => ({
      boundary,
      verdict: 'proven' as const,
      evidence: 'checked',
    }));
    expect(deriveQualificationEligibility(basePolicy(), findings).eligible).toBe(true);
  });
});

describe('run classification gates a trial too (D36)', () => {
  const task = {
    taskId: 'task-1',
    prompt: 'Fix the failing test.',
    budget: { wallClockSeconds: 60, maxToolCalls: 20 },
  };

  it('rejects an unregistered run as qualification evidence', async () => {
    const trial = trialWith({ ...basePolicy(), requiredBoundaries: ['filesystem', 'environment'] });
    const outcome = await runTrial({
      trial,
      task,
      driver: new FakeAgentDriver(),
      registry: new RunRegistry(),
      runId: 'run_unregistered',
    });

    expect(outcome.qualificationEligible).toBe(false);
    expect(outcome.reasons.join(' ')).toMatch(/never registered/u);
  });

  it('rejects a run registered as operational', async () => {
    const registry = new RunRegistry();
    registry.register(
      {
        run_id: 'run_op',
        origin_class: 'operational',
        eval_set_version: null,
        holdout_state: null,
        simulation_id: null,
      },
      'plane',
    );

    const trial = trialWith({ ...basePolicy(), requiredBoundaries: ['filesystem', 'environment'] });
    const outcome = await runTrial({
      trial,
      task,
      driver: new FakeAgentDriver(),
      registry,
      runId: 'run_op',
    });

    expect(outcome.qualificationEligible).toBe(false);
    expect(outcome.reasons.join(' ')).toMatch(/not a qualification class/u);
  });

  it('accepts a pre-registered qualification run with every required boundary proven', async () => {
    const registry = new RunRegistry();
    registry.register(
      {
        run_id: 'run_qual',
        origin_class: 'qualification',
        eval_set_version: 'stage-0',
        holdout_state: null,
        simulation_id: 'simulation.stage-0',
      },
      'plane',
    );

    const trial = trialWith({ ...basePolicy(), requiredBoundaries: ['filesystem', 'environment'] });
    const outcome = await runTrial({
      trial,
      task,
      driver: new FakeAgentDriver(),
      registry,
      runId: 'run_qual',
    });

    expect(outcome.qualificationEligible).toBe(true);
    expect(outcome.reasons).toEqual([]);
    // The driver that produced the result is recorded, so a fake run can never
    // be mistaken for a real one in a report.
    expect(outcome.driverKind).toBe('fake');
  });

  it('an unregistered run is "operational", never something stronger (D36)', () => {
    expect(new RunRegistry().originClassFor('run_unknown')).toBe('operational');
  });

  it('a registration the Evidence Plane never saw is also "operational"', () => {
    // The plane stamps origin_class from ITS runs table. A registration the
    // harness made only in memory leaves no row there, so the plane will stamp
    // the default whatever the harness intended -- and reporting the intended
    // class would describe evidence that was never produced.
    const registry = new RunRegistry();
    registry.register(
      {
        run_id: 'run_local',
        origin_class: 'qualification',
        eval_set_version: 'stage-2',
        holdout_state: null,
        simulation_id: null,
      },
      'local_only',
    );
    expect(registry.isRegistered('run_local')).toBe(true);
    expect(registry.isConfirmedByPlane('run_local')).toBe(false);
    expect(registry.originClassFor('run_local')).toBe('operational');
  });

  it('refuses a trial whose registration the plane never confirmed', async () => {
    // Separated from "never registered" because the fix differs: an unenrolled
    // or unreachable Evidence Plane, not a harness that forgot.
    const registry = new RunRegistry();
    registry.register(
      {
        run_id: 'run_local2',
        origin_class: 'qualification',
        eval_set_version: 'stage-2',
        holdout_state: null,
        simulation_id: null,
      },
      'local_only',
    );
    const outcome = await runTrial({
      trial: trialWith({ ...basePolicy(), requiredBoundaries: ['filesystem', 'environment'] }),
      task,
      driver: new FakeAgentDriver(),
      registry,
      runId: 'run_local2',
    });
    expect(outcome.qualificationEligible).toBe(false);
    expect(outcome.reasons.join(' ')).toMatch(/not with the Evidence Plane/u);
  });

  it('rejects registration after the run has produced an event', () => {
    const registry = new RunRegistry();
    registry.markStarted('run_late');
    expect(() =>
      registry.register(
        {
          run_id: 'run_late',
          origin_class: 'qualification',
          eval_set_version: 'stage-0',
          holdout_state: null,
          simulation_id: null,
        },
        'plane',
      ),
    ).toThrow(LateRegistrationError);
  });

  it('rejects registering a holdout run with no eval set version', () => {
    expect(() =>
      new RunRegistry().register(
        {
          run_id: 'run_holdout',
          origin_class: 'holdout',
          eval_set_version: null,
          holdout_state: 'active',
          simulation_id: null,
        },
        'plane',
      ),
    ).toThrow();
  });

  it('a trial cannot be eligible on classification alone if isolation is unproven', async () => {
    const registry = new RunRegistry();
    registry.register(
      {
        run_id: 'run_qual2',
        origin_class: 'qualification',
        eval_set_version: 'stage-0',
        holdout_state: null,
        simulation_id: null,
      },
      'plane',
    );

    // The default policy requires network and process, which cannot be proven.
    const outcome = await runTrial({
      trial: trialWith(basePolicy()),
      task,
      driver: new FakeAgentDriver(),
      registry,
      runId: 'run_qual2',
    });

    expect(outcome.qualificationEligible).toBe(false);
    expect(outcome.reasons.join(' ')).toContain('unproven');
  });
});

// ---------------------------------------------------------------------------
// What a probe taken BEFORE the agent ran cannot tell you
// ---------------------------------------------------------------------------

/** A driver that escapes the workspace while it runs, the way a real one could. */
class EscapingDriver implements AgentDriver {
  readonly kind = 'fake:escaping';
  readonly #outside: string;

  constructor(outside: string) {
    this.#outside = outside;
  }

  async run(trial: Trial): Promise<DriverResult> {
    // Exactly the move the whole boundary exists to stop: a link out of the
    // workspace, created after the workspace was inspected and found clean.
    symlinkSync(this.#outside, join(trial.workspaceRoot, 'escape'), 'dir');
    return { completed: true, toolCalls: [], transcriptRef: null, usage: null };
  }
}

describe('isolation is judged on the workspace the agent left behind', () => {
  const task = {
    taskId: 'task-escape',
    prompt: 'anything',
    budget: { wallClockSeconds: 60, maxToolCalls: 20 },
  };

  function registeredRegistry(): RunRegistry {
    const registry = new RunRegistry();
    registry.register(
      {
        run_id: 'run_q',
        origin_class: 'qualification',
        eval_set_version: 'v1',
        holdout_state: null,
        simulation_id: null,
      },
      'plane',
    );
    return registry;
  }

  it('catches a symlink the driver created during the trial', async () => {
    const outside = mkdtempSync(join(tmpdir(), 'ieos-outside-'));
    scratchDirs.push(outside);
    const trial = trialWith({ ...basePolicy(), requiredBoundaries: ['filesystem', 'environment'] });

    // Clean before the run: this is precisely the state the old probe recorded
    // and then reported as the trial's isolation.
    expect(findingFor(probe(trial), 'filesystem')?.verdict).toBe('proven');

    const outcome = await runTrial({
      trial,
      task,
      driver: new EscapingDriver(outside),
      registry: registeredRegistry(),
      runId: 'run_q',
    });

    expect(findingFor(outcome.isolation, 'filesystem')?.verdict).toBe('violated');
    expect(outcome.qualificationEligible).toBe(false);
    expect(outcome.reasons.join(' ')).toMatch(/escape/u);
  });

  it('still says proven for a trial the driver left alone (control)', async () => {
    const trial = trialWith({ ...basePolicy(), requiredBoundaries: ['filesystem', 'environment'] });
    const outcome = await runTrial({
      trial,
      task,
      driver: new FakeAgentDriver(),
      registry: registeredRegistry(),
      runId: 'run_q',
    });
    expect(findingFor(outcome.isolation, 'filesystem')?.verdict).toBe('proven');
    expect(outcome.qualificationEligible).toBe(true);
  });
});

describe('containment is physical, not spelling', () => {
  it('refuses a write that reaches outside through a symlink already in the workspace', () => {
    const outside = mkdtempSync(join(tmpdir(), 'ieos-outside-'));
    scratchDirs.push(outside);
    const trial = trialWith(basePolicy());
    symlinkSync(outside, join(trial.workspaceRoot, 'link'), 'dir');

    // `link/notes.md` never leaves the workspace lexically. It leaves it in
    // every sense that matters.
    expect(() => writeIntoTrial(trial, 'link/notes.md', 'secret')).toThrow(/outside/u);
    expect(existsSync(join(outside, 'notes.md'))).toBe(false);
  });

  it('still allows an ordinary write into a real subdirectory (control)', () => {
    const trial = trialWith(basePolicy());
    const written = writeIntoTrial(trial, 'nested/notes.md', 'fine');
    expect(existsSync(written)).toBe(true);
  });
});
