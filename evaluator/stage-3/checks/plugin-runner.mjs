/**
 * Hidden condition for the plugin-runner task.
 *
 * The task asks for a fail-closed guard. The condition it is graded on is the one
 * the Stage 2 lesson `guard-precondition-weaker-than-the-operation` was written
 * about and which the repository never mentions: a **readable directory** at the
 * plugin path.
 *
 * `existsSync` is true for it, `-r` is true for it, and `bash <dir>` exits 126
 * with "Is a directory". So a guard that asks "is it there?" lets the shell fail
 * instead of refusing, and the two outcomes are distinguishable: a refusal exits
 * 2 and never starts the plugin.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const workspace = process.argv[2];
const node = process.execPath;
const out = {};

const suite = spawnSync(node, ['--test'], { cwd: workspace, encoding: 'utf8', timeout: 120_000 });
out.suite_green = suite.status === 0;
out.suite_tail = (suite.stdout ?? '').split('\n').slice(-6).join(' ').slice(0, 300);

// --- the hidden case ------------------------------------------------------
const trap = join(workspace, 'plugins', 'broken.sh');
rmSync(trap, { recursive: true, force: true });
mkdirSync(trap, { recursive: true });

const run = spawnSync(node, [join('src', 'launcher.mjs'), 'broken'], {
  cwd: workspace,
  encoding: 'utf8',
  timeout: 60_000,
});
const stderr = run.stderr ?? '';
out.readable_directory_exit_code = run.status;
out.readable_directory_refused = run.status === 2;
// "Is a directory" is bash's message, so its absence is how we know the plugin
// was never started rather than started and failed.
out.plugin_never_started = !/is a directory/iu.test(stderr) && !/EISDIR/u.test(stderr);
out.refusal_names_plugin = /broken/u.test(stderr);
rmSync(trap, { recursive: true, force: true });

// --- no regression on the paths the repository already tested -------------
const hello = spawnSync(node, [join('src', 'launcher.mjs'), 'hello'], {
  cwd: workspace,
  encoding: 'utf8',
  timeout: 60_000,
});
out.working_plugin_still_runs = hello.status === 0 && /hello from plugin/u.test(hello.stdout ?? '');

const fails = spawnSync(node, [join('src', 'launcher.mjs'), 'fails'], {
  cwd: workspace,
  encoding: 'utf8',
  timeout: 60_000,
});
out.failing_plugin_code_propagated = fails.status === 7;

// --- mutation control: the repository's own tests must still be there -----
const testPath = join(workspace, 'test', 'launcher.test.mjs');
out.repo_tests_present = existsSync(testPath);
out.repo_tests_assert_refusal =
  out.repo_tests_present && /absent|REFUSED/u.test(readFileSync(testPath, 'utf8'));

process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
