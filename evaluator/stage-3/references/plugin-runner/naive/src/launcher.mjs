import { spawnSync } from 'node:child_process';
import { accessSync, constants } from 'node:fs';
import { join } from 'node:path';

export const REFUSED = 2;

export function pluginPath(root, name) {
  return join(root, 'plugins', `${name}.sh`);
}

// The plausible wrong fix: "is it there and can I read it?". True for a
// directory, so the guard steps aside and bash exits 126 instead of a refusal.
export function runPlugin(root, name, args = []) {
  const script = pluginPath(root, name);
  try {
    accessSync(script, constants.R_OK);
  } catch {
    process.stderr.write(`plugin ${name} is not available\n`);
    return REFUSED;
  }
  const run = spawnSync('bash', [script, ...args], { encoding: 'utf8' });
  if (run.stdout) process.stdout.write(run.stdout);
  if (run.stderr) process.stderr.write(run.stderr);
  return run.status ?? REFUSED;
}

if (process.argv[1]?.endsWith('launcher.mjs')) {
  const [, , name, ...args] = process.argv;
  process.exit(runPlugin(process.cwd(), name, args));
}
