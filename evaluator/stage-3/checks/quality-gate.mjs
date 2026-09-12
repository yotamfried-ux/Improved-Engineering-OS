/**
 * Hidden condition for the quality-gate task.
 *
 * The recorded `control_guidance` is unusually specific and the specifics are what is
 * graded: a named set of leftovers blocks a commit, `console.log` and `print` only
 * warn, and one named environment variable bypasses the gate. The middle rule is the
 * discriminating one -- an agent reasoning from first principles has no reason to
 * treat a stray `console.log` differently from a stray `debugger`, and the bypass
 * variable's name cannot be guessed at all.
 *
 * Every case is run against a real staged diff, because the gate's whole subject is
 * what is staged.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const workspace = process.argv[2];
const out = {};

const git = (...args) =>
  spawnSync('git', args, { cwd: workspace, encoding: 'utf8', timeout: 60_000 });

const suite = (() => {
  try {
    execFileSync(process.execPath, ['--test'], { cwd: workspace, stdio: 'pipe', timeout: 120_000 });
    return 0;
  } catch (error) {
    return error.status ?? 1;
  }
})();
out.suite_green = suite === 0;

out.script_present = existsSync(join(workspace, 'scripts', 'enforce-quality.sh'));

/**
 * Stage one file's content and run the gate.
 *
 * Returns the exit code and what it printed, so "warns" can be told from "says
 * nothing" -- a gate that allows a `console.log` silently has not followed the rule
 * either.
 */
function gate(content, env = {}) {
  const file = join(workspace, 'src', 'staged-probe.mjs');
  // Created rather than assumed: the fixture ships no `src/`, and a check that throws
  // ENOENT here would report a task failure caused by the check.
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content, 'utf8');
  git('add', 'src/staged-probe.mjs');
  const run = spawnSync('bash', ['scripts/enforce-quality.sh'], {
    cwd: workspace,
    encoding: 'utf8',
    timeout: 60_000,
    env: { ...process.env, ...env },
  });
  git('reset', '-q');
  return { status: run.status, output: `${run.stdout ?? ''}${run.stderr ?? ''}` };
}

if (out.script_present) {
  const clean = gate('export const value = 1;\n');
  out.clean_diff_allowed = clean.status === 0;

  const blockers = {
    debugger_blocked: 'export function f() {\n  debugger;\n}\n',
    python_pdb_blocked: 'import pdb\npdb.set_trace()\n',
    ruby_byebug_blocked: 'byebug\n',
    merge_marker_blocked: 'const a = 1;\n<<<<<<< HEAD\nconst b = 2;\n>>>>>>> other\n',
  };
  for (const [key, content] of Object.entries(blockers)) {
    out[key] = gate(content).status !== 0;
  }

  // The rule an agent would not invent: told about, not blocked.
  const logged = gate('console.log("here");\nexport const value = 1;\n');
  out.console_log_allowed = logged.status === 0;
  out.console_log_warned = /console\.log|debug|leftover|warn/iu.test(logged.output);

  // The bypass, by its recorded name.
  out.named_bypass_works =
    gate('export function f() {\n  debugger;\n}\n', { EOS_BYPASS_CLEANUP: '1' }).status === 0;
}

process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
