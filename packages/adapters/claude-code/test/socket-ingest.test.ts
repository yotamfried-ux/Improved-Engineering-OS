/**
 * The trial side of the ingest proxy.
 *
 * Tested against a server written here rather than against the harness's real
 * proxy, deliberately: a client and a server that share an implementation can
 * agree on a protocol neither of them reads correctly. Each end is checked
 * against an independent counterpart, and the canary checks the two real
 * implementations together over a real socket.
 */

import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer, type Server } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Clock, ProxyRequest, ProxyResponse, RandomSource } from '@ieos/core';
import { openOutbox, SqliteRunStateStore } from '@ieos/store-sqlite';
import { parseAttributeRegistry, type AttributeRegistry } from '@ieos/telemetry';
import { afterEach, describe, expect, it } from 'vitest';
import { REACHABILITY_ATTESTATION, runHook, type HookDeps } from '../src/hook-cli.ts';
import { socketIngest } from '../src/socket-ingest.ts';

const scratch: string[] = [];
const servers: Server[] = [];
let ipcSequence = 0;

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((done) => {
          server.close(() => done());
        }),
    ),
  );
  for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function scratchDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'ieos-socket-ingest-'));
  scratch.push(dir);
  return dir;
}

/**
 * A local IPC endpoint for the platform running the smoke suite.
 *
 * Stage 3 production runs only on the Linux namespace mechanism and therefore
 * use AF_UNIX. The Windows smoke still exercises the same Node IPC client/server
 * protocol, but Node names that transport with a named pipe rather than a
 * filesystem socket. Treating `C:\\...\\ingest.sock` as an IPC endpoint makes
 * Windows wait on an invalid listener until Vitest times out, which proves
 * nothing about the protocol.
 */
function ipcPath(label = 'ingest'): string {
  ipcSequence += 1;
  return process.platform === 'win32'
    ? `\\\\.\\pipe\\ieos-socket-ingest-${process.pid}-${ipcSequence}-${label}`
    : join(scratchDir(), `${label}.sock`);
}

/** A server that answers however the test tells it to, one request per connection. */
async function serve(
  answer: (request: ProxyRequest) => ProxyResponse | string,
): Promise<{ socketPath: string; seen: ProxyRequest[] }> {
  const socketPath = ipcPath();
  const seen: ProxyRequest[] = [];
  // The client half-closes after its one framed request. Keep the server's
  // writable half alive until it sends the reply; Windows named pipes otherwise
  // close it on peer FIN and turn a valid request/response into EPIPE.
  const server = createServer({ allowHalfOpen: true }, (socket) => {
    let buffered = '';
    socket.on('data', (chunk: Buffer) => {
      buffered += chunk.toString('utf8');
    });
    socket.on('end', () => {
      const request = JSON.parse(buffered.trim()) as ProxyRequest;
      seen.push(request);
      const reply = answer(request);
      socket.end(typeof reply === 'string' ? reply : `${JSON.stringify(reply)}\n`);
    });
  });
  servers.push(server);
  await new Promise<void>((done) => {
    server.listen(socketPath, () => done());
  });
  return { socketPath, seen };
}

const accepting = (request: ProxyRequest): ProxyResponse => {
  switch (request.op) {
    case 'sendEvents':
      return {
        ok: true,
        outcome: {
          status: 'accepted',
          acceptedEventIds: request.events.map((event) => event.event_id),
        },
      };
    case 'sendObservations':
      return { ok: true, outcome: { status: 'accepted', acceptedEventIds: [] } };
    case 'readMinimal':
      return { ok: true, value: { ok: true } };
    case 'isReachable':
      return { ok: true, reachable: true };
  }
};

describe('the Ingest a trial can use (ADR-0005, D22)', () => {
  it('carries the plane’s own outcome back, per operation', async () => {
    const { socketPath, seen } = await serve(accepting);
    const ingest = socketIngest({ socketPath });

    expect(await ingest.isReachable()).toBe(true);
    expect(await ingest.readMinimal('health')).toEqual({ ok: true });
    const sent = await ingest.sendEvents([{ event_id: 'evt_1' } as never]);
    expect(sent).toEqual({ status: 'accepted', acceptedEventIds: ['evt_1'] });
    expect(await ingest.sendObservations([])).toEqual({
      status: 'accepted',
      acceptedEventIds: [],
    });
    expect(seen.map((request) => request.op)).toEqual([
      'isReachable',
      'readMinimal',
      'sendEvents',
      'sendObservations',
    ]);
  });

  it('relays a rejection as a rejection, not as an outage', async () => {
    // `everFailed` treats both as fatal, so a collapsed distinction would give
    // the right verdict for a reason nobody could diagnose.
    const { socketPath } = await serve(() => ({
      ok: true,
      outcome: { status: 'rejected', reason: 'the Evidence Plane refused: unknown_installation' },
    }));
    expect(await socketIngest({ socketPath }).sendEvents([])).toEqual({
      status: 'rejected',
      reason: 'the Evidence Plane refused: unknown_installation',
    });
  });

  it('reports unreachable instead of throwing when no proxy is listening', async () => {
    // The rule telemetry may never break: a missing proxy is a recorded refusal,
    // not an exception in someone's coding session.
    const ingest = socketIngest({ socketPath: ipcPath('absent') });
    expect(await ingest.sendEvents([])).toMatchObject({ status: 'unreachable' });
    expect(await ingest.isReachable()).toBe(false);
    expect(await ingest.readMinimal('health')).toBeNull();
  });

  it('refuses a reply it cannot read rather than assuming success', async () => {
    for (const bad of ['not json\n', '\n', '{"missing":"ok"}\n']) {
      const { socketPath } = await serve(() => bad);
      expect(await socketIngest({ socketPath }).sendEvents([])).toMatchObject({
        status: 'unreachable',
      });
    }
  });

  it('refuses an answer to a different question', async () => {
    // A proxy trusted to hold a credential is not thereby trusted to be correct.
    // An `isReachable` shape returned for `sendEvents` must not read as accepted.
    const { socketPath } = await serve(() => ({ ok: true, reachable: true }));
    expect(await socketIngest({ socketPath }).sendEvents([])).toMatchObject({
      status: 'unreachable',
    });
  });
});

describe('a run that can actually end COMPLETE (D23, T7)', () => {
  const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
  const registry: AttributeRegistry = parseAttributeRegistry(
    readFileSync(join(repoRoot, 'contracts', 'telemetry-attributes.yaml'), 'utf8'),
  );
  const clock: Clock = {
    nowMs: () => 1_757_116_800_000,
    nowIso: () => '2026-09-13T00:00:00.000Z',
  };
  const random: RandomSource = {
    bytes: (length) => new Uint8Array(length).map((_, index) => (index * 37) % 251),
  };
  const payload = (event: string, over: Record<string, unknown> = {}): string =>
    JSON.stringify({ hook_event_name: event, session_id: 'sess_socket', cwd: '/tmp', ...over });

  it('drains through the proxy and qualifies, which was impossible before', async () => {
    // The whole point of the in-band proxy. Before it, a trial's flush had
    // nowhere to reach, so `everFailed` was always true and every run was
    // INCOMPLETE -- and no amount of host-side network access could change that,
    // which is what the earlier Stage 3 report missed.
    const { socketPath, seen } = await serve(accepting);
    const deps: HookDeps = {
      outboxPath: join(scratchDir(), 'outbox.sqlite'),
      registry,
      ingest: socketIngest({ socketPath }),
      clock,
      random,
      repoSha: 'a'.repeat(40),
      eosRelease: '0.1.0',
      installationId: 'inst_a',
      projectId: 'proj_a',
      env: {
        CI: '1',
        IEOS_RUN_ID: 'run_s3_canary',
        [REACHABILITY_ATTESTATION]: 'true',
      },
    };

    await runHook(payload('SessionStart'), deps);
    await runHook(payload('PostToolUse', { tool_name: 'Bash' }), deps);
    const end = await runHook(payload('SessionEnd'), deps);

    expect(end.exitCode).toBe(0);
    const db = await openOutbox(deps.outboxPath);
    try {
      const state = new SqliteRunStateStore(db).recent(1)[0];
      expect(state?.runId).toBe('run_s3_canary');
      expect(state?.ingestReachableAtStart).toBe(true);
      expect(state?.telemetryState).toBe('COMPLETE');
      expect(state?.qualificationEligible).toBe(true);
    } finally {
      db.close();
    }
    // Delivered in band, during the run -- not left for something to drain later.
    expect(seen.some((request) => request.op === 'sendEvents')).toBe(true);
  });

  it('stays INCOMPLETE when the proxy refuses, attestation notwithstanding', async () => {
    // Eligibility still requires the events to have landed. A host that attests
    // reachability cannot make a lossy run qualify.
    const { socketPath } = await serve(() => ({
      ok: true,
      outcome: { status: 'unreachable', reason: 'the Evidence Plane failed: 503' },
    }));
    const deps: HookDeps = {
      outboxPath: join(scratchDir(), 'outbox.sqlite'),
      registry,
      ingest: socketIngest({ socketPath }),
      clock,
      random,
      repoSha: 'a'.repeat(40),
      eosRelease: '0.1.0',
      installationId: 'inst_a',
      projectId: 'proj_a',
      env: { CI: '1', [REACHABILITY_ATTESTATION]: 'true' },
    };
    await runHook(payload('SessionStart'), deps);
    await runHook(payload('PostToolUse', { tool_name: 'Bash' }), deps);
    await runHook(payload('SessionEnd'), deps);
    const db = await openOutbox(deps.outboxPath);
    try {
      const state = new SqliteRunStateStore(db).recent(1)[0];
      expect(state?.telemetryState).toBe('INCOMPLETE');
      expect(state?.qualificationEligible).toBe(false);
    } finally {
      db.close();
    }
  });
});
