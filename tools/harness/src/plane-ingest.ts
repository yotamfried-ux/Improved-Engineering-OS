/**
 * The client side of the `ingest` function, and the proxy that lends it to a
 * trial without lending the credential (D22, D22.2, D23, ADR-0005).
 *
 * Two pieces that only make sense together:
 *
 * `httpIngest` is the `Ingest` implementation the repository did not have. The
 * port has existed since Stage 0 and the server has been deployed since Stage 2,
 * but the only implementations in the tree were `UNCONFIGURED_INGEST` and test
 * doubles -- so `ieos-hook` sent nothing on any machine, however well connected.
 * That is the defect Stage 3's report mistook for a network policy.
 *
 * `servePlaneProxy` is what makes it usable from inside a trial. It holds the
 * installation token on the host, listens on a unix socket the trial can see by
 * bind mount, and answers with the plane's own outcome. The trial gets delivery
 * without a credential and without a route.
 *
 * Built here, beside `plane-registrar.ts`, for the reason given there: the
 * harness owns its transport to the plane. Nothing in `packages/` may import
 * this, and nothing needs to -- the hook talks to the socket, not to the plane.
 */

import { createServer, type Server } from 'node:net';
import { unlinkSync } from 'node:fs';
import type { Ingest, IngestOutcome, ProxyRequest, ProxyResponse } from '@ieos/core';

/** D22.2, and the same header the service principal uses for `register_run`. */
const TOKEN_HEADER = 'X-IEOS-Installation-Token';

/**
 * An `Ingest` over the deployed `ingest` function.
 *
 * `fetch` is injected for the same reason the registrar injects it: the
 * interesting behaviour is what happens when the plane refuses, and that needs
 * no network to test.
 *
 * The token here is an INSTALLATION token, never the service token. An
 * installation may emit events; only a service principal may classify a run, and
 * this client has no way to express a class -- the port has no `origin_class`
 * parameter, by design (D36).
 */
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

  /**
   * Translate one HTTP answer into an outcome.
   *
   * For events, HTTP 200 is not the acknowledgement. The database returns the
   * ids it can prove durable, and only those ids may leave the outbox. Treating
   * a bare 200 as "all accepted" is a telemetry-loss bug: a partial or malformed
   * response would delete evidence the plane never stored and could let T7 read
   * COMPLETE falsely.
   *
   * The second distinction that matters: a refusal is `rejected` and a failure
   * to ask is `unreachable`. `everFailed` treats both as fatal to eligibility,
   * but keeping the diagnosis preserves the reason.
   */
  const outcomeFor = async (
    send: () => Promise<Response>,
    expectedEventIds?: readonly string[],
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
      if (expectedEventIds === undefined) {
        return { status: 'accepted', acceptedEventIds: [] };
      }
      try {
        const body = (await response.json()) as {
          data?: { accepted?: unknown };
        };
        const accepted = body.data?.accepted;
        if (!Array.isArray(accepted) || !accepted.every((id) => typeof id === 'string')) {
          return {
            status: 'unreachable',
            reason: 'the Evidence Plane returned 200 without a readable accepted-id list',
          };
        }
        const expected = new Set(expectedEventIds);
        if (accepted.some((id) => !expected.has(id))) {
          return {
            status: 'unreachable',
            reason: 'the Evidence Plane acknowledged an event id that was not in the request',
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
    // 5xx is the plane failing to answer, not the plane saying no.
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
      outcomeFor(() => post('ingest_observations', { observations })),
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
    /**
     * Reachability is `read_minimal` answering, not a TCP connection.
     *
     * A socket that opens to a proxy in front of a plane whose token is wrong
     * proves nothing about whether this run's evidence can land, and D23 wants
     * the declaration to mean the latter.
     */
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

/**
 * Answer a trial's ingest requests on a unix socket, forwarding to `ingest`.
 *
 * The security property in one sentence: the token is in this process's memory
 * and the trial can only reach this process through a socket that accepts four
 * fixed operations, none of which can name a credential, an endpoint or a run
 * class. Widening this surface is the way to lose that property, so the
 * operation list is closed and unknown ops are refused rather than forwarded.
 */
export function servePlaneProxy(options: {
  readonly socketPath: string;
  readonly ingest: Ingest;
  /** Notified for every answered request, so a canary can assert what happened. */
  readonly onRequest?: (op: string, response: ProxyResponse) => void;
}): Promise<PlaneProxy> {
  const answer = async (request: ProxyRequest): Promise<ProxyResponse> => {
    switch (request.op) {
      case 'sendEvents':
        return { ok: true, outcome: await options.ingest.sendEvents(request.events) };
      case 'sendObservations':
        return { ok: true, outcome: await options.ingest.sendObservations(request.observations) };
      case 'readMinimal':
        return { ok: true, value: await options.ingest.readMinimal(request.kind) };
      case 'isReachable':
        return { ok: true, reachable: await options.ingest.isReachable() };
      default:
        return { ok: false, reason: 'the ingest proxy does not serve that operation' };
    }
  };

  // The wire contract is newline-framed, not EOF-framed. That distinction is
  // required for Windows named pipes: a client half-close there can remove the
  // reply path entirely, while AF_UNIX happens to preserve it. Reading a full
  // frame as soon as `\n` arrives makes the same protocol work on both transports
  // and leaves connection close for what it should mean: the exchange is over.
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
          // The proxy answers even when the plane client throws. A hung trial
          // waiting on a silent socket would look like a timeout, and a timeout
          // is a different diagnosis from a broken client.
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
      // A trial that hangs up mid-request is not the proxy's problem to report.
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
      // A peer that closes before the newline sent only a partial frame. Do not
      // reinterpret EOF as framing; that is the cross-platform bug this path
      // exists to prevent.
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
                // Already gone, which is the state we wanted.
              }
              done();
            });
          }),
      });
    });
  });
}
