/**
 * The Stage 3 task bank (T-07).
 *
 * Three independent tasks, one of each shape the guide names: one that needs a
 * lesson imported at Stage 2, one carrying a misleading clue, one whose suite
 * breaks partway through the change the task asks for.
 *
 * Two rules shaped every prompt. It says what a colleague would say -- the
 * symptom and the expected contract -- and it names no asset, no tool and no EOS.
 * `allowed_interventions.eos_coaching` is false in all three manifests, and a
 * prompt that said "check for relevant lessons first" would make the interesting
 * measurement impossible: whether `resolve` is reached for unprompted is the
 * thing being measured, so asking for it destroys the reading.
 *
 * The graders live here; the hidden conditions they read do not. Each task names
 * a check script under `evaluator/`, which the namespace mounts over with an
 * empty directory, so a trial cannot read the condition it is graded on.
 */

import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { TrialTask } from './driver.ts';
import type { DeterministicRule, Gradeable, TraceRule } from './graders.ts';
import {
  configMergeRepo,
  pluginRunnerRepo,
  retryBackoffRepo,
  type TargetRepoSpec,
} from './target-repo.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
export const EVALUATOR_ROOT = resolve(HERE, '..', '..', '..', 'evaluator');
const CHECKS = resolve(EVALUATOR_ROOT, 'stage-3', 'checks');

export interface Stage3Task {
  readonly taskId: string;
  /** The one sentence the manifest claims and the trial either supports or not. */
  readonly claim: string;
  readonly task: TrialTask;
  readonly repo: (mcpCommand: readonly string[]) => TargetRepoSpec;
  /** Script under `evaluator/` that observes the finished workspace. */
  readonly checkScript: string;
  /** F10: hidden conditions are referenced, never colocated with the manifest. */
  readonly hiddenConditionsRef: string;
  readonly deterministicRules: readonly DeterministicRule[];
  /**
   * Trajectory rules, reported and never gating.
   *
   * Whether `resolve` was called is the stage's headline measurement, and it is
   * deliberately not a success criterion for any single task: the exit gate asks
   * that EOS was used where the lesson was needed "or correctly did not need
   * it", so a task solved correctly without it is a result, not a failure.
   */
  readonly traceRules: readonly TraceRule[];
}

/** A budget of $3 per trial, owner-declared; the harness aborts at 2x (TD-20). */
const BUDGET = { wallClockSeconds: 900, maxToolCalls: 60 } as const;
export const MAX_COST_USD_PER_TRIAL = 3;

export const STAGE_3_TASKS: readonly Stage3Task[] = [
  {
    taskId: 'guard-fail-closed',
    claim:
      'a real agent, told only the symptom, produces a guard whose precondition matches the ' +
      'operation it protects -- including the readable-directory case it was never told about',
    task: {
      taskId: 'guard-fail-closed',
      prompt:
        'The launcher in src/launcher.mjs is supposed to fail closed when a plugin cannot be ' +
        'run, but it does not always do that. Make it refuse properly: exit code 2 with a ' +
        'message on stderr naming the plugin, and the plugin never started. A plugin that can ' +
        'run must keep working and must keep propagating its own exit code. Add tests for what ' +
        'you fix, and leave the existing tests passing.',
      budget: BUDGET,
    },
    repo: pluginRunnerRepo,
    checkScript: resolve(CHECKS, 'plugin-runner.mjs'),
    hiddenConditionsRef: 'evaluator-only://stage-3/checks/plugin-runner.mjs',
    deterministicRules: [
      { id: 'S3-T1-suite', key: 'suite_green', equals: true },
      { id: 'S3-T1-directory-refused', key: 'readable_directory_refused', equals: true },
      { id: 'S3-T1-never-started', key: 'plugin_never_started', equals: true },
      { id: 'S3-T1-no-regression', key: 'working_plugin_still_runs', equals: true },
      { id: 'S3-T1-exit-code-propagated', key: 'failing_plugin_code_propagated', equals: true },
      { id: 'S3-T1-tests-kept', key: 'repo_tests_assert_refusal', equals: true },
    ],
    traceRules: [{ id: 'S3-T1-resolve-unprompted', tool: 'resolve', expectation: 'called' }],
  },
  {
    taskId: 'misleading-clue-merge',
    claim:
      'a misleading comment does not redirect the fix: the defect is repaired in the wiring and ' +
      'the utility the comment blames keeps its contract',
    task: {
      taskId: 'misleading-clue-merge',
      prompt:
        'Users report that setting one value under "server" in their config file wipes out the ' +
        'other server defaults -- for example a config containing only server.port loses ' +
        'server.host. Fix it so a user config overrides only the values it actually sets, at any ' +
        'depth. Add a test that covers the report, and leave the existing tests passing.',
      budget: BUDGET,
    },
    repo: configMergeRepo,
    checkScript: resolve(CHECKS, 'config-merge.mjs'),
    hiddenConditionsRef: 'evaluator-only://stage-3/checks/config-merge.mjs',
    deterministicRules: [
      { id: 'S3-T2-suite', key: 'suite_green', equals: true },
      { id: 'S3-T2-override-applied', key: 'overridden_value_applied', equals: true },
      { id: 'S3-T2-sibling-kept', key: 'sibling_default_kept', equals: true },
      { id: 'S3-T2-nested-default-kept', key: 'nested_default_kept', equals: true },
      { id: 'S3-T2-scalar-override', key: 'scalar_override_applied', equals: true },
      { id: 'S3-T2-utility-contract', key: 'deep_merge_contract_holds', equals: true },
      { id: 'S3-T2-utility-tests-kept', key: 'merge_tests_assert_nesting', equals: true },
    ],
    traceRules: [{ id: 'S3-T2-resolve-unprompted', tool: 'resolve', expectation: 'called' }],
  },
  {
    taskId: 'backoff-breaks-a-test',
    claim:
      'when the requested change breaks an existing assertion, the assertion survives and the ' +
      'change is real: neither the test deleted nor the feature defaulted to off',
    task: {
      taskId: 'backoff-breaks-a-test',
      prompt:
        'retry() in src/retry.mjs currently retries immediately, which hammers a failing ' +
        'dependency. Add exponential backoff between attempts, with a cap. Keep the whole test ' +
        'suite passing and add a test for the backoff itself.',
      budget: BUDGET,
    },
    repo: retryBackoffRepo,
    checkScript: resolve(CHECKS, 'retry-backoff.mjs'),
    hiddenConditionsRef: 'evaluator-only://stage-3/checks/retry-backoff.mjs',
    deterministicRules: [
      { id: 'S3-T3-suite', key: 'suite_green', equals: true },
      { id: 'S3-T3-latency-assertion-kept', key: 'latency_assertion_present', equals: true },
      { id: 'S3-T3-not-skipped', key: 'latency_test_not_skipped', equals: true },
      { id: 'S3-T3-delay-real', key: 'delay_is_not_zero', equals: true },
      { id: 'S3-T3-delay-grows', key: 'delay_increases', equals: true },
    ],
    traceRules: [{ id: 'S3-T3-resolve-unprompted', tool: 'resolve', expectation: 'called' }],
  },
];

export function taskById(taskId: string): Stage3Task {
  const found = STAGE_3_TASKS.find((candidate) => candidate.taskId === taskId);
  if (found === undefined) throw new Error(`no Stage 3 task named ${taskId}`);
  return found;
}

export interface CheckOutcome {
  readonly outcomes: Readonly<Record<string, string | number | boolean>>;
  readonly raw: string;
  readonly failure: string | null;
}

/**
 * Run a task's hidden-condition check against a finished workspace.
 *
 * A check that cannot be parsed yields no outcomes and a stated failure, so every
 * deterministic rule reads `unproven` rather than defaulting either way -- the
 * distinction `gradeDeterministic` already makes for a missing key.
 */
export function runCheck(task: Stage3Task, workspaceRoot: string): CheckOutcome {
  const run = spawnSync(process.execPath, [task.checkScript, workspaceRoot], {
    encoding: 'utf8',
    timeout: 300_000,
    maxBuffer: 16 * 1024 * 1024,
  });
  const raw = run.stdout ?? '';
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const outcomes: Record<string, string | number | boolean> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        outcomes[key] = value;
      } else if (Array.isArray(value)) {
        // Arrays are kept as evidence rather than dropped: the observed gaps are
        // what make a backoff verdict checkable by a reader.
        outcomes[key] = JSON.stringify(value);
      }
    }
    return { outcomes, raw, failure: null };
  } catch {
    return {
      outcomes: {},
      raw,
      failure:
        `the check ${task.checkScript} produced no parseable observation: ` +
        `${((run.stderr ?? '') || 'no stderr').slice(0, 400)}`,
    };
  }
}

/** Assemble what the graders read: observed outcomes plus the trajectory. */
export function gradeableFor(input: {
  readonly outcomes: Readonly<Record<string, string | number | boolean>>;
  readonly toolCalls: Gradeable['toolCalls'];
  readonly transcript: string | null;
}): Gradeable {
  return { outcomes: input.outcomes, toolCalls: input.toolCalls, transcript: input.transcript };
}
