/**
 * `ieos-hook` -- the executable the primary agent's settings point at.
 *
 * Deliberately tiny. Everything it does is in `hook-cli.ts`, which is testable;
 * this is the twenty lines that cannot be, and they exist to guarantee one
 * thing: the process exits with the code `runHook` chose and never with an
 * uncaught exception. A hook that threw would print a stack trace into someone's
 * coding session for a telemetry problem.
 */

import { join, resolve } from 'node:path';
import {
  loadRegistry,
  readInstallation,
  readStdin,
  runHook,
  systemClock,
  systemRandom,
  UNCONFIGURED_INGEST,
} from './hook-cli.ts';

const args = process.argv.slice(2);
const flag = (name: string): string | undefined => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};

const eosRoot = resolve(flag('--eos-root') ?? process.cwd());
const projectRoot = resolve(flag('--project') ?? process.cwd());

const exitCode = await (async (): Promise<number> => {
  try {
    const raw = await readStdin(process.stdin);
    const installation = readInstallation(projectRoot);
    const outcome = await runHook(raw, {
      outboxPath: flag('--outbox') ?? join(projectRoot, '.ieos', 'outbox.sqlite'),
      registry: loadRegistry(eosRoot),
      ingest: UNCONFIGURED_INGEST,
      clock: systemClock,
      random: systemRandom,
      repoSha: flag('--repo-sha') ?? 'unknown',
      eosRelease: '0.1.0',
      installationId: installation.installationId,
      projectId: installation.projectId,
      env: process.env,
    });
    if (outcome.stdout !== '') process.stdout.write(outcome.stdout);
    if (outcome.stderr !== '') process.stderr.write(`${outcome.stderr}\n`);
    return outcome.exitCode;
  } catch (error) {
    // The last line of defence. Even a failure to READ the payload exits 1,
    // never 2 and never by throwing.
    process.stderr.write(
      `ieos telemetry: the hook could not run: ${
        error instanceof Error ? error.message : String(error)
      }\n`,
    );
    return 1;
  }
})();

process.exit(exitCode);
