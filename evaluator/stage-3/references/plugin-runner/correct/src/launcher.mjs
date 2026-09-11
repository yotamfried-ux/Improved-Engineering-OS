import { spawnSync } from 'node:child_process';
import { accessSync, constants, statSync } from 'node:fs';
import { join } from 'node:path';

export const REFUSED = 2;

export function pluginPath(root, name) {
  return join(root, 'plugins', `${name}.sh`);
}

/**
 * True only for something bash can actually run: a regular file, readable.
 *
 * `existsSync` and a readability test are both weaker than that, and the gap
 * between them is the fail-open path -- a readable directory satisfies either one
 * and makes bash exit 126.
 */
function isRunnableScript(path) {
  try {
    if (!statSync(path).isFile()) return false;
    accessSync(path, constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

export function runPlugin(root, name, args = []) {
  const script = pluginPath(root, name);
  if (!isRunnableScript(script)) {
    process.stderr.write(`plugin ${name} is not a usable plugin script\n`);
    return REFUSED;
  }
  const run = spawnSync('bash', [script, ...args], { encoding: 'utf8' });
  if (run.stdout) process.stdout.write(run.stdout);
  if (run.stderr) process.stderr.write(run.stderr);
  return run.status ?? REFUSED;
}

if (process.argv[1]?.endsWith('launcher.mjs')) {
  const [, , name, ...args] = process.argv;
  if (name === undefined) {
    process.stderr.write('usage: launcher.mjs <name> [args...]\n');
    process.exit(REFUSED);
  }
  process.exit(runPlugin(process.cwd(), name, args));
}
