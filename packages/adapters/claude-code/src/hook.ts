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
import { INGEST_SOCKET, socketIngest } from './socket-ingest.ts';

/**
 * Which `Ingest` this invocation gets.
 *
 * A socket, when the trusted launch context offers one -- inside a trial that is
 * the harness, and the process on the other side holds the credential this one
 * must not. Otherwise the honest unconfigured implementation, which reports
 * itself unreachable and so leaves every run INCOMPLETE.
 *
 * Deliberately no third case. There is no environment variable here that names
 * an endpoint or carries a token: a hook that could be pointed at a plane by its
 * own environment would be a hook a trial could point anywhere, and the
 * credential boundary would be back inside the namespace.
 */
const chooseIngest = (socketPath: string | undefined) =>
  socketPath !== undefined && socketPath !== ''
    ? socketIngest({ socketPath })
    : UNCONFIGURED_INGEST;

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
      ingest: chooseIngest(process.env[INGEST_SOCKET]),
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
