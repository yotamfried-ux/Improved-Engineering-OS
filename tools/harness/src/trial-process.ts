/**
 * Run one trial child without blocking the host process.
 *
 * The host serves the credential-holding ingest proxy (named pipe or AF_UNIX
 * socket) from its own event loop. A synchronous spawn would freeze that loop for
 * the whole trial, so every hook flush inside the trial would time out and no
 * evidence could land -- which is exactly how the first live Windows canary
 * failed. The child therefore runs asynchronously.
 *
 * T6, no rescue: stdin is `ignore`, set here and nowhere else, and callers have
 * no option by which anything could be written to the child.
 */

import { spawn } from 'node:child_process';

/** Default grace for each step of the termination ladder below. */
const DEFAULT_KILL_GRACE_MS = 2_000;

export interface TrialProcessOptions {
  readonly cwd: string;
  readonly env: Readonly<Record<string, string>>;
  readonly timeoutMs: number;
  readonly maxBufferBytes: number;
  /**
   * How long SIGTERM is given before SIGKILL, and then SIGKILL before the
   * result is returned regardless. Exposed so tests need not wait the default.
   */
  readonly killGraceMs?: number;
}

export interface TrialProcessResult {
  readonly status: number | null;
  readonly signal: NodeJS.Signals | null;
  readonly stdout: string;
  readonly stderr: string;
  /** True when the host killed the child for exceeding `timeoutMs`. */
  readonly timedOut: boolean;
  /** Set when the child could not start or overflowed its output budget. */
  readonly error: string | null;
}

export function runTrialProcess(
  command: string,
  args: readonly string[],
  options: TrialProcessOptions,
): Promise<TrialProcessResult> {
  return new Promise<TrialProcessResult>((resolve) => {
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let bytes = 0;
    let timedOut = false;
    let error: string | null = null;
    let settled = false;

    const child = spawn(command, [...args], {
      cwd: options.cwd,
      // Built, not inherited: `env` replaces the environment outright.
      env: { ...options.env },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });

    const grace = options.killGraceMs ?? DEFAULT_KILL_GRACE_MS;
    let escalation: NodeJS.Timeout | undefined;
    let settlement: NodeJS.Timeout | undefined;

    /**
     * Stop the trial within a bounded time, whatever it does about it.
     *
     * SIGTERM is a request, and a trial is free to ignore it; `close` also
     * waits on every descendant holding the output pipes, which a grandchild
     * can do after the child itself is gone. Either way the promise would
     * outlive `timeoutMs` and the bound would not be one. So the ladder is
     * SIGTERM, then SIGKILL, then returning the result without `close`.
     */
    const terminate = (): void => {
      if (escalation !== undefined) return;
      child.kill('SIGTERM');
      escalation = setTimeout(() => {
        child.kill('SIGKILL');
        settlement = setTimeout(() => finish(null, 'SIGKILL'), grace);
      }, grace);
    };

    const timer = setTimeout(() => {
      timedOut = true;
      terminate();
    }, options.timeoutMs);

    const collect =
      (into: Buffer[]) =>
      (chunk: Buffer): void => {
        bytes += chunk.length;
        if (bytes > options.maxBufferBytes) {
          if (error === null)
            error = `the trial exceeded ${String(options.maxBufferBytes)} bytes of output`;
          terminate();
          return;
        }
        into.push(chunk);
      };
    child.stdout.on('data', collect(stdout));
    child.stderr.on('data', collect(stderr));

    const finish = (status: number | null, signal: NodeJS.Signals | null): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (escalation !== undefined) clearTimeout(escalation);
      if (settlement !== undefined) clearTimeout(settlement);
      resolve({
        status,
        signal,
        stdout: Buffer.concat(stdout).toString('utf8'),
        stderr: Buffer.concat(stderr).toString('utf8'),
        timedOut,
        error,
      });
    };

    child.on('error', (spawnError) => {
      error = spawnError.message;
      finish(null, null);
    });
    child.on('close', (status, signal) => finish(status, signal));
  });
}
