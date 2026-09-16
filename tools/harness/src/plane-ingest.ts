/** Credential-holding HTTP ingest and the narrow trial proxy (D22/D23). */

import { createServer, type Server } from 'node:net';
import { unlinkSync } from 'node:fs';
import type { Ingest, IngestOutcome, ProxyRequest, ProxyResponse } from '@ieos/core';

const TOKEN_HEADER = 'X-IEOS-Installation-Token';

export function httpIngest(options: {
  readonly endpoint: string;
  readonly installationToken: string;
  readonly fetch: typeof globalThis.fetch;
}): Ingest {
  const base = options.endpoint.replace(/\/$/u, '');

  const post = async (route: string, body: unknown): Promise<Response> =>
    options.fetch(`${base}/${route}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', [TOKEN_HEADER]: options.installationToken },
      body: JSON.stringify(body),
    });

  /** HTTP 200 is never enough for a write: the body must name accepted ids. */
  const outcomeFor = async (
    send: () => Promise<Response>,
    expectedIds: readonly string[],
  ): Promise<IngestOutcome> => {
    let response: Response;
    try {
      response = await send();
    } catch (error) {
      return {
        status: 'unreachable',
        reason: error instanceof Error ? error.message : String(error),
      };
    }

    if (response.ok) {
      try {
        const body = (await response.json()) as { data?: { accepted?: unknown } };
        const accepted = body.data?.accepted;
        if (!Array.isArray(accepted) || !accepted.every((id) => typeof id === 'string')) {
          return {
            status: 'unreachable',
            reason: 'the Evidence Plane returned 200 without a readable accepted-id list',
          };
        }
        const expected = new Set(expectedIds);
        if (accepted.some((id) => !expected.has(id))) {
          return {
            status: 'unreachable',
            reason: 'the Evidence Plane acknowledged an id that was not in the request',
          };
        }
        return { status: 'accepted', acceptedEventIds: accepted };
      } catch {
        return {
          status: 'unreachable',
          reason: 'the Evidence Plane returned 200 with an unreadable acknowledgement body',
        };
      }
    }

    let code = String(response.status);
    try {
      const body = (await response.json()) as { code?: unknown };
      if (typeof body.code === 'string') code = body.code;
    } catch {
      // A refusal with an unreadable body is still a refusal.
    }
    return response.status >= 500
      ? { status: 'unreachable', reason: `the Evidence Plane failed: ${code}` }
      : { status: 'rejected', reason: `the Evidence Plane refused: ${code}` };
  };

  return {
    sendEvents: (events) =>
      outcomeFor(
        () => post('ingest_events', { events }),
        events.map((event) => event.event_id),
      ),
    sendObservations: (observations) =>
      outcomeFor(
        () => post('ingest_observations', { observations }),
        observations.map((observation) => observation.observation_id),
      ),
    sendContextSnapshots: (snapshots) =>
      outcomeFor(
        () => post('ingest_context_snapshots', { snapshots }),
        snapshots.map((snapshot) => snapshot.context_snapshot_id),
      ),
    readMinimal: async (kind) => {
      try {
        const response = await post('read_minimal', { kind });
        if (!response.ok) return null;
        const body = (await response.json()) as { data?: unknown };
        return body.data ?? null;
      } catch {
        return null;
      }
    },
    isReachable: async () => {
      try {
        const response = await post('read_minimal', { kind: 'health' });
        return response.ok;
      } catch {
        return false;
      }
    },
  };
}

export interface PlaneProxy {
  readonly socketPath: string;
  close(): Promise<void>;
}

export function servePlaneProxy(options: {
  readonly socketPath: string;
  readonly ingest: Ingest;
  readonly onRequest?: (op: string, response: ProxyResponse) => void;
}): Promise<PlaneProxy> {
  const answer = async (request: ProxyRequest): Promise<ProxyResponse> => {
    switch (request.op) {
      case 'sendEvents':
        return { ok: true, outcome: await options.ingest.sendEvents(request.events) };
      case 'sendObservations':
        return { ok: true, outcome: await options.ingest.sendObservations(request.observations) };
      case 'sendContextSnapshots':
        return options.ingest.sendContextSnapshots === undefined
          ? { ok: false, reason: 'the ingest implementation does not support context snapshots' }
          : { ok: true, outcome: await options.ingest.sendContextSnapshots(request.snapshots) };
      case 'readMinimal':
        return { ok: true, value: await options.ingest.readMinimal(request.kind) };
      case 'isReachable':
        return { ok: true, reachable: await options.ingest.isReachable() };
      default:
        return { ok: false, reason: 'the ingest proxy does not serve that operation' };
    }
  };

  const server: Server = createServer((socket) => {
    let buffered = '';
    let handled = false;
    const reply = (response: ProxyResponse, op: string): void => {
      options.onRequest?.(op, response);
      socket.end(`${JSON.stringify(response)}\n`);
    };
    const handleFrame = (frame: string): void => {
      if (handled) return;
      handled = true;
      void (async () => {
        let request: ProxyRequest;
        try {
          request = JSON.parse(frame.trim()) as ProxyRequest;
        } catch {
          reply({ ok: false, reason: 'the request was not readable JSON' }, 'unparseable');
          return;
        }
        try {
          reply(await answer(request), String((request as { op?: unknown }).op ?? 'unknown'));
        } catch (error) {
          reply(
            {
              ok: false,
              reason: `the ingest proxy failed: ${
                error instanceof Error ? error.message : String(error)
              }`,
            },
            'failed',
          );
        }
      })();
    };

    socket.on('error', () => {
      handled = true;
      socket.destroy();
    });
    socket.on('data', (chunk: Buffer) => {
      if (handled) return;
      buffered += chunk.toString('utf8');
      const newline = buffered.indexOf('\n');
      if (newline >= 0) handleFrame(buffered.slice(0, newline));
    });
    socket.on('end', () => {
      if (handled) return;
      handled = true;
      if (!socket.destroyed) {
        reply(
          { ok: false, reason: 'the request ended before a complete newline-delimited frame' },
          'incomplete',
        );
      }
    });
  });

  return new Promise<PlaneProxy>((resolve, reject) => {
    server.once('error', reject);
    server.listen(options.socketPath, () => {
      resolve({
        socketPath: options.socketPath,
        close: () =>
          new Promise<void>((done) => {
            server.close(() => {
              try {
                unlinkSync(options.socketPath);
              } catch {
                // Already absent.
              }
              done();
            });
          }),
      });
    });
  });
}
