/**
 * The process that runs *inside* the Stage 3 namespace canary.
 *
 * It invokes the real Claude hook composition root three times but never invokes
 * Claude. That exercises the exact production path whose telemetry must be
 * COMPLETE before a paid qualification trial is allowed to start: hook -> local
 * outbox -> socket ingest -> host proxy -> Evidence Plane acknowledgement.
 */

import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';

const args = process.argv.slice(2);
const flag = (name: string): string | undefined => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};

const eosRootArg = flag('--eos-root');
const projectRootArg = flag('--project');
const repoSha = flag('--repo-sha');
const sessionId = flag('--session') ?? 'sess_stage3_canary';
if (eosRootArg === undefined || projectRootArg === undefined || repoSha === undefined) {
  process.stderr.write(
    'usage: stage3-canary-child.ts --eos-root DIR --project DIR --repo-sha SHA [--session ID]\n',
  );
  process.exit(64);
}
const eosRoot = resolve(eosRootArg);
const projectRoot = resolve(projectRootArg);

const hook = join(eosRoot, 'packages', 'adapters', 'claude-code', 'src', 'hook.ts');
const base = {
  session_id: sessionId,
  cwd: projectRoot,
  model: 'stage3-canary-no-model',
};

const payloads = [
  { ...base, hook_event_name: 'SessionStart' },
  { ...base, hook_event_name: 'PostToolUse', tool_name: 'Bash' },
  { ...base, hook_event_name: 'SessionEnd' },
];

for (const payload of payloads) {
  const run = spawnSync(
    process.execPath,
    [hook, '--eos-root', eosRoot, '--project', projectRoot, '--repo-sha', repoSha],
    {
      input: JSON.stringify(payload),
      encoding: 'utf8',
      env: process.env,
      maxBuffer: 8 * 1024 * 1024,
    },
  );
  if (run.error !== undefined) {
    // spawnSync leaves stdout and stderr null when the child never started.
    // Writing null throws, and the canary would die with a TypeError that hides
    // the real reason.
    process.stderr.write(
      `Stage 3 canary hook ${String(payload.hook_event_name)} failed to start: ${run.error.message}\n`,
    );
    process.exit(1);
  }
  if (run.stdout) process.stdout.write(run.stdout);
  if (run.stderr) process.stderr.write(run.stderr);
  if (run.status !== 0) {
    process.stderr.write(
      `Stage 3 canary hook ${String(payload.hook_event_name)} exited ${String(run.status)}\n`,
    );
    process.exit(run.status ?? 1);
  }
}
