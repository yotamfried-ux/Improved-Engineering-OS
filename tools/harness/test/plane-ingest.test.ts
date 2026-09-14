/**
 * The host side of the ingest path: the plane client, and the proxy that lends it.
 *
 * The client is exercised against an injected `fetch` and the proxy against a
 * socket client written here, for the reason the trial-side test gives: two ends
 * sharing an implementation can agree on a protocol neither reads correctly.
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { connect } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Ingest, ProxyRequest, ProxyResponse } from '@ieos/core';
import { afterEach, describe, expect, it } from 'vitest';
import { httpIngest, servePlaneProxy, type PlaneProxy } from '../src/plane-ingest.ts';

const scratch: string[] = [];
const proxies: PlaneProxy[] = [];
let ipcSequence = 0;

afterEach(async () => {
  await Promise.all(proxies.splice(0).map((proxy) => proxy.close()));
  for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/**
 * A local IPC endpoint. Production Stage 3 is Linux/AF_UNIX; the Windows smoke
 * uses a named pipe so it exercises the same Node protocol instead of trying to
 * listen on an ordinary `C:\\...\\ingest.sock` path.
 */
function socketPath(): string {
  ipcSequence += 1;
  if (process.platform === 'win32') {
    return `\\\\.\\pipe\\ieos-plane-proxy-${process.pid}-${ipcSequence}`;
  }
  const dir = mkdtempSync(join(tmpdir(), 'ieos-plane-proxy-'));
  scratch.push(dir);
  return join(dir, 'ingest.sock');
}

/** Speak the protocol by hand, as the trial's client would. */
async function ask(path: string, raw: string): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const socket = connect(path, () => socket.end(raw));
    let buffered = '';
    socket.on('data', (chunk: Buffer) => {
      buffered += chunk.toString('utf8');
    });
    socket.on('end', () => resolve(buffered.trim()));
    socket.on('error', reject);
  });
}

const responseTo = async (path: string, request: ProxyRequest): Promise<ProxyResponse> =>
  JSON.parse(await ask(path, `${JSON.stringify(request)}\n`)) as ProxyResponse;

function stubFetch(reply: (url: string, init: RequestInit) => { status: number; body?: unknown }): {
  fetch: typeof globalThis.fetch;
  calls: { url: string; init: RequestInit }[];
} {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchImpl = ((url: string, init: RequestInit) => {
    calls.push({ url, init });
    const { status, body } = reply(url, init);
    return Promise.resolve(
      new Response(body === undefined ? null : JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
      }),
    );
  }) as unknown as typeof globalThis.fetch;
  return { fetch: fetchImpl, calls };
}

const client = (
  reply: (url: string, init: RequestInit) => { status: number; body?: unknown },
): { ingest: Ingest; calls: { url: string; init: RequestInit }[] } => {
  const { fetch, calls } = stubFetch(reply);
  return {
    ingest: httpIngest({
      endpoint: 'https://plane.invalid/ingest/',
      installationToken: 'inst-token',
      fetch,
    }),
    calls,
  };
};

const accepted = (...ids: string[]) => ({
  status: 200,
  body: { data: { accepted: ids, count: ids.length } },
});

describe('the plane client the repository did not have (D22, D22.2)', () => {
  it('sends events to ingest_events with the installation token in the D22.2 header', async () => {
    const { ingest, calls } = client(() => accepted('evt_1'));
    const outcome = await ingest.sendEvents([{ event_id: 'evt_1' } as never]);

    expect(outcome).toEqual({ status: 'accepted', acceptedEventIds: ['evt_1'] });
    expect(calls[0]?.url).toBe('https://plane.invalid/ingest/ingest_events');
    const headers = calls[0]?.init.headers as Record<string, string>;
    expect(headers['X-IEOS-Installation-Token']).toBe('inst-token');
    // Not the header Supabase reserves for its own JWTs (D22.2).
    expect(headers['Authorization']).toBeUndefined();
  });

  it('acknowledges only the ids the plane says are durable', async () => {
    const { ingest } = client(() => accepted('evt_1'));
    expect(
      await ingest.sendEvents([
        { event_id: 'evt_1' } as never,
        { event_id: 'evt_2' } as never,
      ]),
    ).toEqual({ status: 'accepted', acceptedEventIds: ['evt_1'] });
  });

  it('refuses a bare or malformed 200 instead of deleting unconfirmed evidence', async () => {
    for (const body of [undefined, {}, { data: {} }, { data: { accepted: 'evt_1' } }]) {
      const { ingest } = client(() => ({ status: 200, ...(body === undefined ? {} : { body }) }));
      expect(await ingest.sendEvents([{ event_id: 'evt_1' } as never])).toMatchObject({
        status: 'unreachable',
      });
    }
  });

  it('refuses an acknowledgement for an event the request never sent', async () => {
    const { ingest } = client(() => accepted('evt_other'));
    expect(await ingest.sendEvents([{ event_id: 'evt_1' } as never])).toMatchObject({
      status: 'unreachable',
    });
  });

  it('cannot express a run class, however it is called (D36)', async () => {
    // The port has no `origin_class`, so a compromised installation cannot pose
    // as qualification evidence. Asserted on the wire, not just in the types.
    const { ingest, calls } = client(() => accepted('evt_1'));
    await ingest.sendEvents([{ event_id: 'evt_1' } as never]);
    expect(String(calls[0]?.init.body)).not.toContain('origin_class');
  });

  it('separates a refusal from an outage', async () => {
    // 4xx is the plane saying no; 5xx is the plane failing to answer. Both are
    // fatal to eligibility, so collapsing them would give the right verdict for
    // a reason nobody could diagnose.
    const refusing = client(() => ({ status: 403, body: { code: 'unknown_installation' } }));
    expect(await refusing.ingest.sendEvents([])).toEqual({
      status: 'rejected',
      reason: 'the Evidence Plane refused: unknown_installation',
    });

    const failing = client(() => ({ status: 503, body: { code: 'unavailable' } }));
    expect(await failing.ingest.sendEvents([])).toEqual({
      status: 'unreachable',
      reason: 'the Evidence Plane failed: unavailable',
    });
  });

  it('treats a transport error as unreachable rather than throwing', async () => {
    const thrower = (() => Promise.reject(new Error('ENOTFOUND'))) as typeof globalThis.fetch;
    const ingest = httpIngest({
      endpoint: 'https://plane.invalid/ingest',
      installationToken: 't',
      fetch: thrower,
    });
    expect(await ingest.sendEvents([])).toEqual({ status: 'unreachable', reason: 'ENOTFOUND' });
    expect(await ingest.isReachable()).toBe(false);
    expect(await ingest.readMinimal('health')).toBeNull();
  });

  it('unwraps the plane response for minimal reads', async () => {
    const { ingest } = client(() => ({ status: 200, body: { data: { ok: true } } }));
    expect(await ingest.readMinimal('health')).toEqual({ ok: true });
  });

  it('calls reachability a question the plane answered, not a socket that opened', async () => {
    // A proxy in front of a plane that rejects this token would pass a
    // connection test and still deliver nothing, and D23 wants the declaration
    // to mean the evidence can land.
    const ok = client((url) => ({ status: url.endsWith('read_minimal') ? 200 : 500, body: {} }));
    expect(await ok.ingest.isReachable()).toBe(true);
    const unauthorized = client(() => ({ status: 401, body: { code: 'bad_token' } }));
    expect(await unauthorized.ingest.isReachable()).toBe(false);
  });
});

describe('the proxy that lends the credential without handing it over (ADR-0005)', () => {
  const accepting: Ingest = {
    sendEvents: (events) =>
      Promise.resolve({
        status: 'accepted',
        acceptedEventIds: events.map((event) => event.event_id),
      }),
    sendObservations: () => Promise.resolve({ status: 'accepted', acceptedEventIds: [] }),
    readMinimal: () => Promise.resolve({ ok: true }),
    isReachable: () => Promise.resolve(true),
  };

  it('answers each operation with the plane’s own outcome', async () => {
    const path = socketPath();
    proxies.push(await servePlaneProxy({ socketPath: path, ingest: accepting }));

    expect(await responseTo(path, { op: 'isReachable' })).toEqual({ ok: true, reachable: true });
    expect(await responseTo(path, { op: 'readMinimal', kind: 'health' })).toEqual({
      ok: true,
      value: { ok: true },
    });
    expect(
      await responseTo(path, { op: 'sendEvents', events: [{ event_id: 'evt_1' } as never] }),
    ).toEqual({ ok: true, outcome: { status: 'accepted', acceptedEventIds: ['evt_1'] } });
  });

  it('refuses an operation outside the closed list instead of forwarding it', async () => {
    // The surface is the security property. Anything that widens it -- a route
    // the trial can name, a passthrough -- puts the credential back in reach.
    const path = socketPath();
    proxies.push(await servePlaneProxy({ socketPath: path, ingest: accepting }));
    const answer = JSON.parse(
      await ask(path, `${JSON.stringify({ op: 'readSecrets' })}\n`),
    ) as ProxyResponse;
    expect(answer.ok).toBe(false);
  });

  it('answers a request it cannot parse, rather than leaving the trial to time out', async () => {
    // A silent socket reads as a timeout, and a timeout is a different diagnosis
    // from a malformed request.
    const path = socketPath();
    proxies.push(await servePlaneProxy({ socketPath: path, ingest: accepting }));
    const answer = JSON.parse(await ask(path, 'not json\n')) as ProxyResponse;
    expect(answer).toEqual({ ok: false, reason: 'the request was not readable JSON' });
  });

  it('answers when the plane client throws, instead of hanging', async () => {
    const path = socketPath();
    const throwing: Ingest = {
      ...accepting,
      sendEvents: () => Promise.reject(new Error('client bug')),
    };
    proxies.push(await servePlaneProxy({ socketPath: path, ingest: throwing }));
    const answer = (await responseTo(path, { op: 'sendEvents', events: [] })) as {
      ok: false;
      reason: string;
    };
    expect(answer.ok).toBe(false);
    expect(answer.reason).toContain('client bug');
  });

  it('reports what it answered, so a canary can assert the round trip happened', async () => {
    const path = socketPath();
    const seen: string[] = [];
    proxies.push(
      await servePlaneProxy({
        socketPath: path,
        ingest: accepting,
        onRequest: (op) => seen.push(op),
      }),
    );
    await responseTo(path, { op: 'isReachable' });
    await responseTo(path, { op: 'sendEvents', events: [] });
    expect(seen).toEqual(['isReachable', 'sendEvents']);
  });

  it('leaves no IPC endpoint behind when it closes', async () => {
    // A stale endpoint is how the next trial gets a proxy that is not there.
    const path = socketPath();
    const proxy = await servePlaneProxy({ socketPath: path, ingest: accepting });
    await proxy.close();
    const answer = await ask(path, '{"op":"isReachable"}\n').catch((error: Error) => error.message);
    expect(String(answer)).toMatch(/ENOENT|ECONNREFUSED/u);
  });
});
