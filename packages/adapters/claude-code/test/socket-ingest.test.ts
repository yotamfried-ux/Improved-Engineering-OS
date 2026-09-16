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

function ipcPath(label = 'ingest'): string {
  ipcSequence += 1;
  return process.platform === 'win32'
    ? `\\\\.\\pipe\\ieos-socket-ingest-${process.pid}-${ipcSequence}-${label}`
    : join(scratchDir(), `${label}.sock`);
}

async function serve(
  answer: (request: ProxyRequest) => ProxyResponse | string,
): Promise<{ socketPath: string; seen: ProxyRequest[] }> {
  const socketPath = ipcPath();
  const seen: ProxyRequest[] = [];
  const server = createServer((socket) => {
    let buffered = '';
    let answered = false;
    socket.on('data', (chunk: Buffer) => {
      if (answered) return;
      buffered += chunk.toString('utf8');
      const newline = buffered.indexOf('\n');
      if (newline < 0) return;
      answered = true;
      const request = JSON.parse(buffered.slice(0, newline).trim()) as ProxyRequest;
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
      return {
        ok: true,
        outcome: {
          status: 'accepted',
          acceptedEventIds: request.observations.map((observation) => observation.observation_id),
        },
      };
    case 'sendContextSnapshots':
      return {
        ok: true,
        outcome: {
          status: 'accepted',
          acceptedEventIds: request.snapshots.map((snapshot) => snapshot.context_snapshot_id),
        },
      };
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
    expect(await ingest.sendContextSnapshots?.([])).toEqual({
      status: 'accepted',
      acceptedEventIds: [],
    });
    expect(seen.map((request) => request.op)).toEqual([
      'isReachable',
      'readMinimal',
      'sendEvents',
      'sendObservations',
      'sendContextSnapshots',
    ]);
  });

  it('relays a rejection as a rejection, not as an outage', async () => {
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
    expect(seen.some((request) => request.op === 'sendEvents')).toBe(true);
  });

  it('stays INCOMPLETE when the proxy refuses, attestation notwithstanding', async () => {
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
