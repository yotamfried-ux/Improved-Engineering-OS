/**
 * Grader validity for the Stage 3 task bank.
 *
 * The Stage 0 simulation manifest names "the evaluator does not detect
 * known-bad" as a failure condition, so each task's graders are put in front of
 * a correct solution, the plausible wrong one its trap produces, and mutations of
 * the correct one. The hidden-condition checks under `evaluator/` are the same
 * scripts a real trial is graded by -- not a reimplementation of them, which
 * would leave the real ones untested.
 *
 * No agent, no namespace and no network: the question "can this grader tell good
 * from bad" should not cost a trial to ask, and should be asked on every commit.
 */

import { afterEach, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gradeDeterministic } from '../src/graders.ts';
import { runCheck, STAGE_3_TASKS, taskById, EVALUATOR_ROOT } from '../src/task-bank.ts';
import { contributorSetupRepo, planDodRepo, writeTargetRepo } from '../src/target-repo.ts';

const REFERENCES = join(EVALUATOR_ROOT, 'stage-3', 'references');
const REPO_ROOT = join(EVALUATOR_ROOT, '..');
const CHECK_TIMEOUT = 180_000;
const workspaces: string[] = [];

afterEach(() => {
  while (workspaces.length > 0) {
    rmSync(workspaces.pop() as string, { recursive: true, force: true });
  }
});

/** A target repo with a reference variant laid over it, as a trial would leave it. */
function workspaceWith(taskId: string, repoName: string, variant: string | null): string {
  const task = taskById(taskId);
  const root = mkdtempSync(join(tmpdir(), `ieos-s3-${taskId}-`));
  workspaces.push(root);
  writeTargetRepo(root, task.repo());
  // A git repository, because one fixture's whole subject is the staged diff. Done for
  // every task rather than one, so the helper stays the same shape for all of them.
  for (const args of [
    ['init', '-q', '.'],
    ['add', '-A'],
    ['-c', 'user.email=g@ieos.invalid', '-c', 'user.name=graders', 'commit', '-q', '-m', 'fixture'],
  ]) {
    const run = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
    expect(run.status, `git ${args.join(' ')} failed: ${run.stderr ?? ''}`).toBe(0);
  }
  if (variant !== null) {
    cpSync(join(REFERENCES, repoName, variant), root, { recursive: true });
  }
  return root;
}

function verdictsFor(taskId: string, root: string): ReturnType<typeof gradeDeterministic>[] {
  const task = taskById(taskId);
  const check = runCheck(task, root);
  expect(check.failure, `the check produced no observation: ${check.raw.slice(0, 300)}`).toBeNull();
  const subject = { outcomes: check.outcomes, toolCalls: [], transcript: null };
  return task.deterministicRules.map((rule) => gradeDeterministic(rule, subject));
}

const statuses = (verdicts: ReturnType<typeof gradeDeterministic>[]): string[] =>
  verdicts.map((verdict) => `${verdict.graderId}=${verdict.status}`);

describe('the task bank is the one the guide asks for', () => {
  it('has three independent tasks', () => {
    expect(STAGE_3_TASKS).toHaveLength(3);
    expect(new Set(STAGE_3_TASKS.map((task) => task.taskId)).size).toBe(3);
  });

  it('never names an asset, a tool or EOS in a prompt', () => {
    // The hidden condition is that the agent was told only that EOS exists. A
    // prompt naming `resolve` would make the stage's headline measurement -- was
    // it reached for unprompted -- unanswerable.
    for (const task of STAGE_3_TASKS) {
      const prompt = task.task.prompt.toLowerCase();
      for (const forbidden of ['ieos', 'eos', 'resolve', 'inspect', 'lesson', 'mcp', 'knowledge']) {
        expect(prompt, `${task.taskId} mentions "${forbidden}"`).not.toContain(forbidden);
      }
    }
  });

  it('keeps every hidden condition outside simulations/ (F10)', () => {
    for (const task of STAGE_3_TASKS) {
      expect(task.hiddenConditionsRef).toMatch(/^evaluator-only:\/\//u);
    }
  });
});

describe('guard-fail-closed: the graders detect known-bad', () => {
  it(
    'the correct fix passes every rule',
    () => {
      const verdicts = verdictsFor(
        'guard-fail-closed',
        workspaceWith('guard-fail-closed', 'plugin-runner', 'correct'),
      );
      expect(statuses(verdicts).filter((entry) => !entry.endsWith('=proven'))).toEqual([]);
    },
    CHECK_TIMEOUT,
  );

  it(
    'the plausible wrong fix -- readable instead of runnable -- fails',
    () => {
      const verdicts = verdictsFor(
        'guard-fail-closed',
        workspaceWith('guard-fail-closed', 'plugin-runner', 'naive'),
      );
      // Named rules, not a count: this is the trap the task exists to set, and a
      // different rule failing would mean the trial measured something else.
      const byId = new Map(verdicts.map((verdict) => [verdict.graderId, verdict.status]));
      expect(byId.get('S3-T1-directory-refused')).toBe('failed');
      expect(byId.get('S3-T1-never-started')).toBe('failed');
    },
    CHECK_TIMEOUT,
  );

  it(
    'the untouched repository fails: the defect is really there',
    () => {
      const verdicts = verdictsFor(
        'guard-fail-closed',
        workspaceWith('guard-fail-closed', 'plugin-runner', null),
      );
      expect(verdicts.some((verdict) => verdict.status === 'failed')).toBe(true);
    },
    CHECK_TIMEOUT,
  );

  it(
    'deleting the repository tests stops the correct fix from passing',
    () => {
      const root = workspaceWith('guard-fail-closed', 'plugin-runner', 'correct');
      cpSync(join(REFERENCES, 'plugin-runner', 'mutation-tests-deleted'), root, {
        recursive: true,
      });
      const verdicts = verdictsFor('guard-fail-closed', root);
      expect(verdicts.some((verdict) => verdict.status !== 'proven')).toBe(true);
    },
    CHECK_TIMEOUT,
  );
});

describe('misleading-clue-merge: the graders detect known-bad', () => {
  it(
    'the correct fix -- repair the wiring -- passes every rule',
    () => {
      const verdicts = verdictsFor(
        'misleading-clue-merge',
        workspaceWith('misleading-clue-merge', 'config-merge', 'correct'),
      );
      expect(statuses(verdicts).filter((entry) => !entry.endsWith('=proven'))).toEqual([]);
    },
    CHECK_TIMEOUT,
  );

  it(
    'believing the comment and editing the utility fails',
    () => {
      const verdicts = verdictsFor(
        'misleading-clue-merge',
        workspaceWith('misleading-clue-merge', 'config-merge', 'naive'),
      );
      const byId = new Map(verdicts.map((verdict) => [verdict.graderId, verdict.status]));
      expect(byId.get('S3-T2-sibling-kept')).toBe('failed');
      expect(byId.get('S3-T2-utility-contract')).toBe('failed');
    },
    CHECK_TIMEOUT,
  );

  it(
    'the untouched repository fails: the defect is really there',
    () => {
      const verdicts = verdictsFor(
        'misleading-clue-merge',
        workspaceWith('misleading-clue-merge', 'config-merge', null),
      );
      const byId = new Map(verdicts.map((verdict) => [verdict.graderId, verdict.status]));
      expect(byId.get('S3-T2-sibling-kept')).toBe('failed');
    },
    CHECK_TIMEOUT,
  );
});

describe('backoff-breaks-a-test: the graders detect known-bad', () => {
  it(
    'the correct fix passes every rule, latency assertion intact',
    () => {
      const verdicts = verdictsFor(
        'backoff-breaks-a-test',
        workspaceWith('backoff-breaks-a-test', 'retry-backoff', 'correct'),
      );
      expect(statuses(verdicts).filter((entry) => !entry.endsWith('=proven'))).toEqual([]);
    },
    CHECK_TIMEOUT,
  );

  it(
    'deleting the assertion that got in the way fails, green suite notwithstanding',
    () => {
      const root = workspaceWith('backoff-breaks-a-test', 'retry-backoff', 'naive');
      const verdicts = verdictsFor('backoff-breaks-a-test', root);
      const byId = new Map(verdicts.map((verdict) => [verdict.graderId, verdict.status]));
      expect(byId.get('S3-T3-latency-assertion-kept')).toBe('failed');
      // The point of the control: the suite passes and the trial still fails.
      expect(byId.get('S3-T3-suite')).toBe('proven');
    },
    CHECK_TIMEOUT,
  );

  it(
    'backoff that is off by default fails, option notwithstanding',
    () => {
      const root = workspaceWith('backoff-breaks-a-test', 'retry-backoff', 'correct');
      cpSync(join(REFERENCES, 'retry-backoff', 'mutation-zero-delay'), root, { recursive: true });
      const verdicts = verdictsFor('backoff-breaks-a-test', root);
      const byId = new Map(verdicts.map((verdict) => [verdict.graderId, verdict.status]));
      expect(byId.get('S3-T3-delay-real')).toBe('failed');
    },
    CHECK_TIMEOUT,
  );

  it(
    'the untouched repository fails: no backoff exists yet',
    () => {
      const verdicts = verdictsFor(
        'backoff-breaks-a-test',
        workspaceWith('backoff-breaks-a-test', 'retry-backoff', null),
      );
      const byId = new Map(verdicts.map((verdict) => [verdict.graderId, verdict.status]));
      expect(byId.get('S3-T3-delay-real')).toBe('failed');
    },
    CHECK_TIMEOUT,
  );
});

describe('the hard bank is grounded, not invented', () => {
  it('cites assets that exist in the corpus', () => {
    // The hard tasks are graded on facts only a corpus asset carries. If the asset
    // is not there, the task is not hard, it is impossible -- and if it were added
    // to make a task passable, the experiment would be the exam written around its
    // own answer key. Both cited assets predate both tasks.
    for (const relative of [
      join('failed_solution', 'slash-command-from-bash'),
      join('control_guidance', 'quality-gates'),
    ]) {
      const asset = join(REPO_ROOT, 'knowledge', 'assets', relative, 'asset.yaml');
      expect(
        existsSync(asset),
        `${relative} is cited by a hard task but is not in the corpus`,
      ).toBe(true);
    }
  });

  it('grades on facts the target repository does not contain', () => {
    // If the answer is in the fixture, the task measures reading rather than
    // retrieval, which is how the first bank came to measure nothing.
    const setup = contributorSetupRepo();
    const setupText = setup.files.map((file) => file.content).join('\n');
    expect(setupText).not.toContain('obra/superpowers-marketplace');
    expect(setupText).not.toContain('superpowers');

    const planRepo = planDodRepo();
    const planText = planRepo.files.map((file) => file.content).join('\n');
    expect(planText).not.toContain('Live External Gates');
  });
});

describe('plugin-install-marketplace: the graders detect known-bad', () => {
  it(
    'the correct fix passes every rule',
    () => {
      const verdicts = verdictsFor(
        'plugin-install-marketplace',
        workspaceWith('plugin-install-marketplace', 'contributor-setup', 'correct'),
      );
      expect(statuses(verdicts).filter((entry) => !entry.endsWith('=proven'))).toEqual([]);
    },
    CHECK_TIMEOUT,
  );

  it(
    'reaching for the recorded failed marketplace fails',
    () => {
      const verdicts = verdictsFor(
        'plugin-install-marketplace',
        workspaceWith('plugin-install-marketplace', 'contributor-setup', 'naive'),
      );
      const byId = new Map(verdicts.map((verdict) => [verdict.graderId, verdict.status]));
      expect(byId.get('S3-H1-correct-marketplace')).toBe('failed');
      expect(byId.get('S3-H1-not-recorded-failure')).toBe('failed');
    },
    CHECK_TIMEOUT,
  );

  it(
    'the untouched repository fails: the step really is missing',
    () => {
      const verdicts = verdictsFor(
        'plugin-install-marketplace',
        workspaceWith('plugin-install-marketplace', 'contributor-setup', null),
      );
      const byId = new Map(verdicts.map((verdict) => [verdict.graderId, verdict.status]));
      expect(byId.get('S3-H1-correct-marketplace')).toBe('failed');
      // The suite still passes, so the row that fails is the one about the task.
      expect(byId.get('S3-H1-suite')).toBe('proven');
    },
    CHECK_TIMEOUT,
  );
});

describe('plan-dod-external-gates: the graders detect known-bad', () => {
  it(
    'the correct plan passes every rule',
    () => {
      const verdicts = verdictsFor(
        'plan-dod-external-gates',
        workspaceWith('plan-dod-external-gates', 'plan-dod', 'correct'),
      );
      expect(statuses(verdicts).filter((entry) => !entry.endsWith('=proven'))).toEqual([]);
    },
    CHECK_TIMEOUT,
  );

  it(
    'a post-commit gate inside the DoD checklist fails, plan and tests notwithstanding',
    () => {
      const verdicts = verdictsFor(
        'plan-dod-external-gates',
        workspaceWith('plan-dod-external-gates', 'plan-dod', 'naive'),
      );
      const byId = new Map(verdicts.map((verdict) => [verdict.graderId, verdict.status]));
      expect(byId.get('S3-H2-no-post-commit-in-dod')).toBe('failed');
      expect(byId.get('S3-H2-gates-section')).toBe('failed');
      // Everything else about this solution is right, which is the point: the rule
      // is structural and nothing else catches it.
      expect(byId.get('S3-H2-suite')).toBe('proven');
      expect(byId.get('S3-H2-plan-written')).toBe('proven');
    },
    CHECK_TIMEOUT,
  );

  it(
    'the untouched repository fails: no plan was written',
    () => {
      const verdicts = verdictsFor(
        'plan-dod-external-gates',
        workspaceWith('plan-dod-external-gates', 'plan-dod', null),
      );
      const byId = new Map(verdicts.map((verdict) => [verdict.graderId, verdict.status]));
      expect(byId.get('S3-H2-plan-written')).toBe('failed');
    },
    CHECK_TIMEOUT,
  );
});

describe('commit-message-protocol: the graders detect known-bad', () => {
  it(
    'the correct hook passes every rule',
    () => {
      const verdicts = verdictsFor(
        'commit-message-protocol',
        workspaceWith('commit-message-protocol', 'commit-gate', 'correct'),
      );
      expect(statuses(verdicts).filter((entry) => !entry.endsWith('=proven'))).toEqual([]);
    },
    CHECK_TIMEOUT,
  );

  it(
    'Conventional Commits -- the convention an agent reaches for -- fails',
    () => {
      const verdicts = verdictsFor(
        'commit-message-protocol',
        workspaceWith('commit-message-protocol', 'commit-gate', 'naive'),
      );
      const byId = new Map(verdicts.map((verdict) => [verdict.graderId, verdict.status]));
      // Not a count: this is the trap, and a different rule failing would mean the
      // trial measured something else.
      expect(byId.get('S3-H3-all-four-sections')).toBe('failed');
      expect(byId.get('S3-H3-empty-tests-refused')).toBe('failed');
    },
    CHECK_TIMEOUT,
  );

  it(
    'the untouched repository fails: the hook really only checks length',
    () => {
      const verdicts = verdictsFor(
        'commit-message-protocol',
        workspaceWith('commit-message-protocol', 'commit-gate', null),
      );
      const byId = new Map(verdicts.map((verdict) => [verdict.graderId, verdict.status]));
      expect(byId.get('S3-H3-all-four-sections')).toBe('failed');
      // Its own suite passes, so the row that fails is the one about the task.
      expect(byId.get('S3-H3-suite')).toBe('proven');
    },
    CHECK_TIMEOUT,
  );
});

describe('quality-gate-cleanup: the graders detect known-bad', () => {
  it(
    'the correct gate passes every rule',
    () => {
      const verdicts = verdictsFor(
        'quality-gate-cleanup',
        workspaceWith('quality-gate-cleanup', 'quality-gate', 'correct'),
      );
      expect(statuses(verdicts).filter((entry) => !entry.endsWith('=proven'))).toEqual([]);
    },
    CHECK_TIMEOUT,
  );

  it(
    'blocking everything that looks like debug output fails on the distinction',
    () => {
      const verdicts = verdictsFor(
        'quality-gate-cleanup',
        workspaceWith('quality-gate-cleanup', 'quality-gate', 'naive'),
      );
      const byId = new Map(verdicts.map((verdict) => [verdict.graderId, verdict.status]));
      // The naive gate is defensible engineering and still wrong for this project:
      // it blocks the log line and has no bypass.
      expect(byId.get('S3-H4-log-allowed')).toBe('failed');
      expect(byId.get('S3-H4-named-bypass')).toBe('failed');
      // And it gets the easy half right, so the failure is about the distinction.
      expect(byId.get('S3-H4-debugger-blocked')).toBe('proven');
    },
    CHECK_TIMEOUT,
  );

  it(
    'the untouched repository fails: the stub allows everything',
    () => {
      const verdicts = verdictsFor(
        'quality-gate-cleanup',
        workspaceWith('quality-gate-cleanup', 'quality-gate', null),
      );
      const byId = new Map(verdicts.map((verdict) => [verdict.graderId, verdict.status]));
      expect(byId.get('S3-H4-debugger-blocked')).toBe('failed');
      expect(byId.get('S3-H4-merge-marker-blocked')).toBe('failed');
    },
    CHECK_TIMEOUT,
  );
});
