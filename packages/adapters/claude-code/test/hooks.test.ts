/**
 * The primary agent's hooks (Q-09, D23, D26).
 *
 * One property dominates: **this adapter never exits 2.** On `Stop` that code
 * prevents the session from stopping, so a hook returning it because an Evidence
 * Plane was unreachable would let telemetry decide whether a developer may
 * finish work. D23 forbids exactly that, in one sentence: coding continues.
 *
 * The exit code is therefore asserted on every path this file can reach --
 * success, a dropped attribute, an unreachable plane, a malformed payload, a
 * broken outbox and an unanticipated throw -- rather than on the happy one.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import type { Clock, Ingest, RandomSource } from '@ieos/core';
import { openOutbox, SqliteOutbox, SqliteRunStateStore } from '@ieos/store-sqlite';
import { parseAttributeRegistry, type AttributeRegistry } from '@ieos/telemetry';
import { readFileSync } from 'node:fs';
import {
  BLOCKING_EXIT_CODE,
  HOOK_EVENTS,
  HookInputError,
  parseHookInput,
  planHook,
} from '../src/hooks.ts';
import { hookSettings, REGISTERED_EVENTS } from '../src/settings.ts';
import { REACHABILITY_ATTESTATION, runHook, type HookDeps } from '../src/hook-cli.ts';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const registry: AttributeRegistry = parseAttributeRegistry(
  readFileSync(join(repoRoot, 'contracts', 'telemetry-attributes.yaml'), 'utf8'),
);

const scratch: string[] = [];
afterEach(() => {
  for (const dir of scratch.splice(0)) {
    rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
});

function outboxPath(): string {
  const dir = mkdtempSync(join(tmpdir(), 'ieos-hook-'));
  scratch.push(dir);
  return join(dir, '.ieos', 'outbox.sqlite');
}

/**
 * A path the outbox genuinely cannot be created at, on any platform.
 *
 * A regular FILE with a path underneath it: `mkdir` fails there on POSIX and on
 * Windows alike. The first version used `/dev/null/nope`, which is unopenable
 * only on POSIX -- on Windows it resolves to `C:\dev\null\nope`, which mkdir
 * happily creates, so the case quietly stopped being exercised there.
 */
function unopenableOutboxPath(): string {
  const dir = mkdtempSync(join(tmpdir(), 'ieos-hook-blocked-'));
  scratch.push(dir);
  const blocker = join(dir, 'not-a-directory');
  writeFileSync(blocker, 'a file, not a directory', 'utf8');
  return join(blocker, 'outbox.sqlite');
}

const clock: Clock = {
  nowMs: () => 1_757_116_800_000,
  nowIso: () => '2026-09-08T00:00:00.000Z',
};
const random: RandomSource = {
  bytes: (length) => {
    const out = new Uint8Array(length);
    for (let i = 0; i < length; i += 1) out[i] = (i * 37 + Math.floor(Math.random() * 251)) % 256;
    return out;
  },
};

const reachableIngest = (): Ingest => ({
  sendEvents: (events) =>
    Promise.resolve({ status: 'accepted', acceptedEventIds: events.map((e) => e.event_id) }),
  sendObservations: () => Promise.resolve({ status: 'accepted', acceptedEventIds: [] }),
  readMinimal: () => Promise.resolve(null),
  isReachable: () => Promise.resolve(true),
});

const unreachableIngest = (): Ingest => ({
  sendEvents: () => Promise.resolve({ status: 'unreachable', reason: 'offline' }),
  sendObservations: () => Promise.resolve({ status: 'unreachable', reason: 'offline' }),
  readMinimal: () => Promise.resolve(null),
  isReachable: () => Promise.resolve(false),
});

function deps(over: Partial<HookDeps> = {}): HookDeps {
  return {
    outboxPath: outboxPath(),
    registry,
    ingest: reachableIngest(),
    clock,
    random,
    repoSha: 'a'.repeat(40),
    eosRelease: '0.1.0',
    installationId: 'inst_a',
    projectId: 'proj_a',
    env: { CI: '1' },
    ...over,
  };
}

const payload = (event: string, over: Record<string, unknown> = {}): string =>
  JSON.stringify({ hook_event_name: event, session_id: 'sess_1', cwd: '/tmp', ...over });

describe('the exit-code rule (D23)', () => {
  it('never returns the blocking code, on any event, on any path', async () => {
    // The single most important assertion in this package. On `Stop`, 2
    // prevents stopping.
    const shared = deps();
    const outcomes = [];
    outcomes.push(await runHook(payload('SessionStart'), shared));
    outcomes.push(await runHook(payload('PostToolUse', { tool_name: 'Bash' }), shared));
    outcomes.push(await runHook(payload('Stop'), shared));
    outcomes.push(await runHook(payload('SessionEnd'), shared));
    outcomes.push(await runHook('not json', shared));
    outcomes.push(await runHook(payload('PreToolUse'), shared));
    outcomes.push(await runHook(payload('SessionStart'), deps({ ingest: unreachableIngest() })));
    outcomes.push(
      await runHook(payload('SessionStart'), deps({ outboxPath: unopenableOutboxPath() })),
    );
    for (const outcome of outcomes) {
      expect(outcome.exitCode).not.toBe(BLOCKING_EXIT_CODE);
      expect(outcome.exitCode === 0 || outcome.exitCode === 1).toBe(true);
    }
  });

  it('reports a telemetry failure rather than hiding it', async () => {
    // Exit 1 is non-blocking and visible. Exit 0 with a silent failure would
    // leave a lossy run looking quiet.
    const shared = deps({ ingest: unreachableIngest() });
    await runHook(payload('SessionStart'), shared);
    const outcome = await runHook(payload('SessionEnd'), shared);
    expect(outcome.exitCode).toBe(1);
    expect(outcome.stderr).toContain('Coding is unaffected');
    expect(outcome.stderr).toContain('INCOMPLETE');
  });

  it('refuses an unregistered event instead of guessing what it means', async () => {
    const outcome = await runHook(payload('PreToolUse'), deps());
    expect(outcome.exitCode).toBe(1);
    expect(outcome.stderr).toContain('unregistered hook event');
  });

  it('refuses a payload with no session_id', () => {
    // Without it, every hook of one session would mint its own run and the
    // session would appear as several half-empty ones.
    expect(() => parseHookInput(JSON.stringify({ hook_event_name: 'Stop' }))).toThrow(
      HookInputError,
    );
  });

  it('keeps an unknown FIELD, because the payload is the agent’s contract', () => {
    // A new field in a future agent version must not stop telemetry.
    const input = parseHookInput(payload('Stop', { something_new: 1 }));
    expect(input.hook_event_name).toBe('Stop');
  });
});

describe('what each event does', () => {
  it('registers for exactly the four events Q-09 names', () => {
    expect([...HOOK_EVENTS]).toEqual(['SessionStart', 'PostToolUse', 'Stop', 'SessionEnd']);
    expect([...REGISTERED_EVENTS]).toEqual([...HOOK_EVENTS]);
  });

  it('flushes at the terminal boundaries and nowhere else (D23)', () => {
    expect(planHook(parseHookInput(payload('SessionStart'))).flush).toBe(false);
    expect(planHook(parseHookInput(payload('PostToolUse'))).flush).toBe(false);
    expect(planHook(parseHookInput(payload('Stop'))).flush).toBe(true);
    expect(planHook(parseHookInput(payload('SessionEnd'))).flush).toBe(true);
  });

  it('emits nothing on Stop, which fires once per turn', () => {
    // An event per turn saying "a turn ended" is noise; the boundary flush is
    // the whole reason D23 names Stop.
    expect(planHook(parseHookInput(payload('Stop'))).emit).toBeNull();
  });

  it('records a tool call’s outcome and never its output', () => {
    // A tool's output is arbitrary text -- source, a prompt, an error body --
    // which is exactly where a secret rides along.
    const plan = planHook(
      parseHookInput(
        payload('PostToolUse', {
          tool_name: 'Bash',
          tool_output: 'error: connection refused to db://user:hunter2@host',
        }),
      ),
    );
    expect(plan.emit?.attributes['tool.outcome']).toBe('error');
    expect(JSON.stringify(plan.emit?.attributes)).not.toContain('hunter2');
  });

  it('attributes an EOS inspect call to the asset it named', () => {
    const plan = planHook(
      parseHookInput(
        payload('PostToolUse', {
          tool_name: 'mcp__ieos__inspect',
          tool_input: { handle: 'asset_x' },
        }),
      ),
    );
    expect(plan.emit?.attributes['asset.id']).toBe('asset_x');
  });

  it('attributes nothing when the tool named no asset', () => {
    const plan = planHook(
      parseHookInput(payload('PostToolUse', { tool_name: 'Bash', tool_input: { command: 'ls' } })),
    );
    expect(plan.emit?.attributes['asset.id']).toBeUndefined();
  });
});

describe('the run one session produces', () => {
  it('gives every hook of one session the same run', async () => {
    const shared = deps();
    await runHook(payload('SessionStart'), shared);
    await runHook(payload('PostToolUse', { tool_name: 'Bash' }), shared);
    await runHook(payload('SessionEnd'), shared);

    const db = await openOutbox(shared.outboxPath);
    try {
      const runs = new SqliteRunStateStore(db).recent(10);
      expect(runs).toHaveLength(1);
      expect(runs[0]?.sessionKey).toBe('sess_1');
    } finally {
      db.close();
    }
  });

  it('does not mint a run for a session that never started one', async () => {
    // A session that began before EOS was installed. Minting here would produce
    // a run that never declared its eligibility, which D23 requires up front.
    const shared = deps();
    const outcome = await runHook(payload('PostToolUse', { tool_name: 'Bash' }), shared);
    expect(outcome.exitCode).toBe(0);
    expect(outcome.stderr).toContain('no run has begun');

    const db = await openOutbox(shared.outboxPath);
    try {
      expect(new SqliteRunStateStore(db).recent(10)).toEqual([]);
    } finally {
      db.close();
    }
  });

  it('declares ingest reachability at SessionStart, not afterwards (D23)', async () => {
    const shared = deps({ ingest: unreachableIngest() });
    await runHook(payload('SessionStart'), shared);
    const db = await openOutbox(shared.outboxPath);
    try {
      expect(new SqliteRunStateStore(db).forSession('sess_1')?.ingestReachableAtStart).toBe(false);
    } finally {
      db.close();
    }
  });

  it('ends COMPLETE when everything was delivered', async () => {
    const shared = deps();
    await runHook(payload('SessionStart'), shared);
    await runHook(payload('PostToolUse', { tool_name: 'Bash' }), shared);
    await runHook(payload('SessionEnd'), shared);
    const db = await openOutbox(shared.outboxPath);
    try {
      const state = new SqliteRunStateStore(db).forSession('sess_1');
      expect(state?.telemetryState).toBe('COMPLETE');
      expect(new SqliteOutbox(db).depth()).toBe(0);
    } finally {
      db.close();
    }
  });

  it('ends INCOMPLETE and keeps the events when the plane was unreachable', async () => {
    // The events stay queued, so a later process can still deliver them, and
    // the run says plainly that this one did not.
    const shared = deps({ ingest: unreachableIngest() });
    await runHook(payload('SessionStart'), shared);
    await runHook(payload('SessionEnd'), shared);
    const db = await openOutbox(shared.outboxPath);
    try {
      const state = new SqliteRunStateStore(db).forSession('sess_1');
      expect(state?.telemetryState).toBe('INCOMPLETE');
      expect(state?.qualificationEligible).toBe(false);
      expect(new SqliteOutbox(db).depth()).toBeGreaterThan(0);
    } finally {
      db.close();
    }
  });
});

describe('attributes leaving the hook', () => {
  it('passes only allowlisted keys, and says what it dropped', async () => {
    const shared = deps();
    await runHook(payload('SessionStart'), shared);
    const outcome = await runHook(
      payload('PostToolUse', { tool_name: 'Bash', tool_output: 'ok' }),
      shared,
    );
    expect(outcome.exitCode).toBe(0);

    const db = await openOutbox(shared.outboxPath);
    try {
      const queued = await new SqliteOutbox(db).pending(10);
      const toolCall = queued.find((event) => event.event_type === 'tool.call');
      expect(Object.keys(toolCall?.attributes ?? {}).sort()).toEqual(['tool.name', 'tool.outcome']);
    } finally {
      db.close();
    }
  });

  it('reports a dropped attribute rather than losing it silently', async () => {
    // A dropped attribute means instrumentation has drifted from the contract,
    // and nothing else in the system would say so.
    const narrow: AttributeRegistry = { allowed: [], forbidden: [] };
    const shared = deps({
      registry: {
        ...narrow,
        allowed: [{ key: 'tool.name', type: 'string', sensitivity: 'public', maxLength: 64 }],
      },
    });
    await runHook(payload('SessionStart'), shared);
    const outcome = await runHook(payload('PostToolUse', { tool_name: 'Bash' }), shared);
    expect(outcome.stderr).toContain('not in the allowlist were dropped');
    expect(outcome.stderr).toContain('tool.outcome');
  });

  it('carries the two session attributes the registry now declares', async () => {
    const shared = deps();
    await runHook(payload('SessionStart', { startup_reason: 'resume' }), shared);
    const db = await openOutbox(shared.outboxPath);
    try {
      const queued = await new SqliteOutbox(db).pending(10);
      expect(queued[0]?.attributes['session.startup_reason']).toBe('resume');
    } finally {
      db.close();
    }
  });
});

describe('the settings ieos init writes', () => {
  it('registers one command for all four events', () => {
    const settings = hookSettings({ command: 'node', args: ['/eos/hook.ts'] });
    expect(Object.keys(settings.hooks).sort()).toEqual([...REGISTERED_EVENTS].sort());
    const commands = Object.values(settings.hooks).map((m) => m[0]?.hooks[0]?.command);
    expect(new Set(commands).size).toBe(1);
  });

  it('quotes a path with a space, because a checkout may live in one', () => {
    const settings = hookSettings({ command: 'node', args: ['/My Projects/eos/hook.ts'] });
    expect(settings.hooks['Stop']?.[0]?.hooks[0]?.command).toContain('"/My Projects/eos/hook.ts"');
  });
});

describe('a hostile or broken environment', () => {
  it('survives an outbox path it cannot create', async () => {
    const outcome = await runHook(
      payload('SessionStart'),
      deps({ outboxPath: unopenableOutboxPath() }),
    );
    expect(outcome.exitCode).toBe(1);
    expect(outcome.stderr).toContain('outbox');
  });

  it('survives a corrupt outbox file', async () => {
    // Written to the outbox path itself. The first version tried to derive a
    // sibling path with a string replace on a POSIX separator, which silently
    // did nothing on Windows and then wrote into a directory that did not exist.
    const path = outboxPath();
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, 'not a database', 'utf8');
    const outcome = await runHook(payload('SessionStart'), deps({ outboxPath: path }));
    // Either it refuses to open the file or it reports the failure -- never the
    // blocking code, and never a throw out of the process.
    expect(outcome.exitCode).toBe(1);
    expect(outcome.exitCode).not.toBe(BLOCKING_EXIT_CODE);
  });

  it('survives an ingest that throws rather than answering', async () => {
    // Driven through to a flush on purpose. SessionStart no longer touches the
    // ingest at all -- reachability is the host's declaration now -- so opening
    // the run against a throwing ingest proves nothing. The delivery path is
    // where a throw has to be survivable.
    const throwing: Ingest = {
      sendEvents: () => Promise.reject(new Error('socket hang up')),
      sendObservations: () => Promise.reject(new Error('socket hang up')),
      readMinimal: () => Promise.resolve(null),
      isReachable: () => Promise.reject(new Error('socket hang up')),
    };
    const shared = deps({ ingest: throwing });
    const started = await runHook(payload('SessionStart'), shared);
    await runHook(payload('PostToolUse', { tool_name: 'Bash' }), shared);
    const ended = await runHook(payload('SessionEnd'), shared);
    for (const outcome of [started, ended]) {
      expect(outcome.exitCode).not.toBe(BLOCKING_EXIT_CODE);
    }
    // Reported, because the events did not land.
    expect(ended.exitCode).toBe(1);
  });
});

describe('a pre-registered run id (S-7, D36)', () => {
  async function runIdFor(env: Record<string, string>): Promise<string | undefined> {
    const shared = deps({ env });
    await runHook(payload('SessionStart'), shared);
    const db = await openOutbox(shared.outboxPath);
    try {
      return new SqliteRunStateStore(db).recent(1)[0]?.runId;
    } finally {
      db.close();
    }
  }

  it('emits under the run the harness registered when one is injected', async () => {
    // The whole of D36 in one assertion: a class fixed before the first event only
    // means something if the event carries the run that was registered. Stage 3
    // found the harness registering `run_s3_...` while the outbox carried a
    // freshly minted id, so the registered run produced no events and the
    // emitting run was never registered.
    expect(await runIdFor({ CI: '1', IEOS_RUN_ID: 'run_s3_guard_fail_closed_t1' })).toBe(
      'run_s3_guard_fail_closed_t1',
    );
  });

  it('mints its own when nothing is injected', async () => {
    const runId = await runIdFor({ CI: '1' });
    expect(runId).toMatch(/^run_[0-9A-HJKMNP-TV-Z]{26}$/u);
  });

  it('refuses a malformed injected id rather than emitting under it', async () => {
    // An unvalidated variable would put arbitrary text in the run identity of
    // every event, where nothing downstream could tell it from an id.
    const runId = await runIdFor({ CI: '1', IEOS_RUN_ID: 'not a run id; drop table runs' });
    expect(runId).toMatch(/^run_[0-9A-HJKMNP-TV-Z]{26}$/u);
  });
});

describe('who declares ingest reachability (D23, and the Stage 3 correction)', () => {
  async function reachabilityFor(env: Record<string, string>, ingest?: Ingest): Promise<boolean> {
    const shared = deps(ingest === undefined ? { env } : { env, ingest });
    await runHook(payload('SessionStart'), shared);
    const db = await openOutbox(shared.outboxPath);
    try {
      return new SqliteRunStateStore(db).forSession('sess_1')?.ingestReachableAtStart === true;
    } finally {
      db.close();
    }
  }

  it('takes the trusted host at its word when it attests reachable', async () => {
    // The fix this exists for. The credential lives outside the agent's
    // namespace on purpose, so a hook inside it cannot probe the plane -- and a
    // hook insisting on its own probe could never declare `true`, leaving every
    // trial ineligible however well the machine was configured.
    expect(
      await reachabilityFor({ CI: '1', [REACHABILITY_ATTESTATION]: 'true' }, unreachableIngest()),
    ).toBe(true);
  });

  it('takes it at its word when it attests unreachable, over a reachable probe', async () => {
    // The host is the authority in both directions, not only the convenient one.
    expect(
      await reachabilityFor({ CI: '1', [REACHABILITY_ATTESTATION]: 'false' }, reachableIngest()),
    ).toBe(false);
  });

  it('does not probe at all when nothing is attested: absent is false', async () => {
    // The correction. An earlier version fell back to the hook's own probe,
    // which was safe only while the only `Ingest` was the unconfigured one. Once
    // a hook inside a trial could reach a host proxy, that fallback let a host
    // which simply forgot to attest collect `true` from the proxy -- turning a
    // declaration D23 requires up front into one arrived at afterwards by the
    // run's own machinery. A reachable ingest must not rescue a missing
    // attestation.
    expect(await reachabilityFor({ CI: '1' }, reachableIngest())).toBe(false);
    expect(await reachabilityFor({ CI: '1' }, unreachableIngest())).toBe(false);
  });

  it('says why a run without an attestation is ineligible', async () => {
    // Silence here is how a whole qualification run gets thrown away: 22 trials
    // that ran, cost money and are all ineligible for a reason nobody printed.
    const outcome = await runHook(payload('SessionStart'), deps({ env: { CI: '1' } }));
    expect(`${outcome.stdout}${outcome.stderr}`).toContain(REACHABILITY_ATTESTATION);
  });

  it('reads an unparseable attestation as false rather than optimistically', async () => {
    // Fail closed. `IEOS_INGEST_REACHABLE_AT_START=1` or `=yes` is a
    // misconfigured launch context, and an attestation that cannot be parsed is
    // not an attestation.
    for (const value of ['1', 'yes', 'TRUE', 'true ', '']) {
      expect(
        await reachabilityFor({ CI: '1', [REACHABILITY_ATTESTATION]: value }, reachableIngest()),
      ).toBe(false);
    }
  });

  it('says so on stderr when it refuses an attestation, instead of failing quietly', async () => {
    // A run silently demoted to ineligible is the failure mode this whole
    // correction is about. It has to be visible where a person will see it.
    const outcome = await runHook(
      payload('SessionStart'),
      deps({ env: { CI: '1', [REACHABILITY_ATTESTATION]: 'probably' } }),
    );
    expect(outcome.exitCode).not.toBe(BLOCKING_EXIT_CODE);
    expect(`${outcome.stdout}${outcome.stderr}`).toContain(REACHABILITY_ATTESTATION);
  });

  it('cannot grant eligibility on its own: a lossy run stays INCOMPLETE', async () => {
    // The invariant the attestation must not be able to break. Reachable at the
    // start plus a flush that never drained is still not qualification evidence.
    const shared = deps({
      env: { CI: '1', [REACHABILITY_ATTESTATION]: 'true' },
      ingest: unreachableIngest(),
    });
    await runHook(payload('SessionStart'), shared);
    await runHook(payload('PostToolUse', { tool_name: 'Bash' }), shared);
    await runHook(payload('SessionEnd'), shared);
    const db = await openOutbox(shared.outboxPath);
    try {
      const state = new SqliteRunStateStore(db).recent(1)[0];
      expect(state?.ingestReachableAtStart).toBe(true);
      expect(state?.telemetryState).toBe('INCOMPLETE');
      expect(state?.qualificationEligible).toBe(false);
    } finally {
      db.close();
    }
  });
});
