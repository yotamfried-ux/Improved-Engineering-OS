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
   * The distinction that matters: a refusal is `rejected` and a failure to ask is
   * `unreachable`. Collapsing them would let a plane that is rejecting every
   * batch look like an outage, and an outage look like a contract violation --
   * and `everFailed` treats both as fatal to eligibility, so the run's verdict
   * would be right for the wrong reason and undiagnosable.
   */
  const outcomeFor = async (
    send: () => Promise<Response>,
    acceptedIds: readonly string[],
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
    if (response.ok) return { status: 'accepted', acceptedEventIds: acceptedIds };
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
      outcomeFor(() => post('ingest_observations', { observations }), []),
    readMinimal: async (kind) => {
      try {
        const response = await post('read_minimal', { kind });
        if (!response.ok) return null;
        return (await response.json()) as unknown;
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

  // `allowHalfOpen` is the whole reason this works. Without it Node closes our
  // side the moment the trial's FIN arrives, so an answer computed after an
  // `await` -- which every answer here is, because it waits on the plane -- is
  // written to a socket that has already gone. The symptom is an empty reply the
  // client can only read as "unreachable", which would have made every trial
  // INCOMPLETE for a reason invisible from either end.
  const server: Server = createServer({ allowHalfOpen: true }, (socket) => {
    let buffered = '';
    const reply = (response: ProxyResponse, op: string): void => {
      options.onRequest?.(op, response);
      socket.end(`${JSON.stringify(response)}\n`);
    };
    socket.on('error', () => {
      // A trial that hangs up mid-request is not the proxy's problem to report.
      socket.destroy();
    });
    socket.on('data', (chunk: Buffer) => {
      buffered += chunk.toString('utf8');
    });
    socket.on('end', () => {
      void (async () => {
        let request: ProxyRequest;
        try {
          request = JSON.parse(buffered.trim()) as ProxyRequest;
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
