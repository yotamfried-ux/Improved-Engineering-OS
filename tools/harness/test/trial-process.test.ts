/**
 * The trial child's timeout is a bound, not a request.
 *
 * `runTrialProcess` exists because a synchronous spawn froze the host event
 * loop that serves the ingest proxy, which is how the second live Windows
 * canary delivered nothing. A timeout that a trial can outlive would put the
 * same stall back by a different route: the host would wait on `close` while
 * the run's evidence window passed.
 */

import { describe, expect, it } from 'vitest';
import { runTrialProcess } from '../src/trial-process.ts';

/**
 * The smallest environment a child `node -e` needs on either platform.
 *
 * `env` replaces the environment outright, so this is built rather than
 * inherited; on win32 a bare environment is not enough to start a process.
 */
function minimalEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const name of ['PATH', 'Path', 'SystemRoot', 'COMSPEC', 'TEMP']) {
    const value = process.env[name];
    if (value !== undefined) env[name] = value;
  }
  return env;
}

describe('a trial cannot outlive its timeout', () => {
  it('settles a child that ignores SIGTERM, rather than waiting on close', async () => {
    // SIGTERM is catchable on POSIX, so this child genuinely refuses the polite
    // request and only SIGKILL ends it. On win32 nothing can ignore the kill,
    // and the same assertions hold for the ordinary reason -- which is the
    // point: the bound does not depend on which platform the trial runs on.
    const started = Date.now();
    const result = await runTrialProcess(
      process.execPath,
      ['-e', 'process.on("SIGTERM", () => {}); setInterval(() => {}, 1000);'],
      {
        cwd: process.cwd(),
        env: minimalEnv(),
        timeoutMs: 300,
        maxBufferBytes: 1024 * 1024,
        killGraceMs: 150,
      },
    );

    expect(result.timedOut).toBe(true);
    // 300ms to the timeout, then at most one grace to SIGKILL and one more
    // before the result is returned without `close`. The generous ceiling is
    // deliberate: this asserts termination is bounded, not how fast a loaded
    // runner gets there.
    expect(Date.now() - started).toBeLessThan(10_000);
  });

  it('still reports an ordinary exit exactly, with no termination in the way', async () => {
    // The ladder must not disturb the normal path, which is every trial that
    // behaves: the status and the captured output are what the harness grades.
    const result = await runTrialProcess(
      process.execPath,
      ['-e', 'process.stdout.write("done"); process.exit(3);'],
      { cwd: process.cwd(), env: minimalEnv(), timeoutMs: 30_000, maxBufferBytes: 1024 * 1024 },
    );

    expect(result.status).toBe(3);
    expect(result.stdout).toBe('done');
    expect(result.timedOut).toBe(false);
    expect(result.error).toBeNull();
  });
});
