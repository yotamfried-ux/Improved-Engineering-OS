/**
 * The `Ingest` a hook inside a trial can actually use (D22, D23, ADR-0005).
 *
 * Stage 3 exposed the shape of this problem. The plane's credential must not
 * enter the agent's namespace -- a trial that holds a service or installation
 * token has an exfiltration path the isolation boundary was built to deny -- and
 * the trial's network policy deliberately reaches Anthropic and nothing else. So
 * a hook inside the trial can neither hold the token nor route to the plane.
 *
 * The consequence nearly went unnoticed: `telemetry_state` is computed from what
 * the run's own flushes did, so a hook that cannot deliver can only ever end its
 * run INCOMPLETE, and no amount of host-side network access would change that.
 * A host-side flusher draining the outbox *after* the run does not help either;
 * it would leave the hook reporting a lossy run that in fact arrived.
 *
 * This is the in-band alternative. The hook speaks to a unix socket bind-mounted
 * into its mount namespace; the privileged process on the other side holds the
 * token, forwards to the plane, and returns the plane's own answer. So:
 *
 *   - no credential crosses into the namespace,
 *   - no new network route is opened out of it (a mount is not a route),
 *   - `accepted` means the plane accepted, not that something queued it,
 *   - and `remaining` / `everFailed` stay truthful, which is what makes a
 *     COMPLETE run mean anything.
 *
 * One request per connection, newline-terminated JSON. Multiplexing would buy
 * nothing here and framing bugs are the usual way a protocol this small fails.
 */

import { connect } from 'node:net';
import type { Ingest, IngestOutcome, ProxyRequest, ProxyResponse } from '@ieos/core';

/**
 * The launch-context variable naming the socket.
 *
 * Absent means no host proxy was offered, which is the ordinary case on a
 * developer's machine and is not an error.
 */
export const INGEST_SOCKET = 'IEOS_INGEST_SOCKET';

/** Long enough for a plane round trip, short enough not to stall a session. */
const DEFAULT_TIMEOUT_MS = 10_000;

/**
 * Ask the proxy one question.
 *
 * Never throws. Every failure -- no socket, no listener, a truncated reply,
 * malformed JSON, a timeout -- becomes a refusal the caller can record, because
 * the one thing telemetry may never do is interrupt the session it observes.
 */
async function ask(
  socketPath: string,
  request: ProxyRequest,
  timeoutMs: number,
): Promise<ProxyResponse> {
  return new Promise<ProxyResponse>((resolve) => {
    let settled = false;
    const finish = (response: ProxyResponse): void => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(response);
    };

    const socket = connect(socketPath);
    socket.setTimeout(timeoutMs, () => {
      finish({ ok: false, reason: `the ingest proxy did not answer within ${timeoutMs}ms` });
    });
    socket.on('error', (error: Error) => {
      finish({ ok: false, reason: `the ingest proxy is not answering: ${error.message}` });
    });

    const readReply = (line: string): void => {
      if (line.trim() === '') {
        finish({ ok: false, reason: 'the ingest proxy answered with an empty frame' });
        return;
      }
      try {
        // Shape-checked rather than trusted: the proxy is trusted to hold a
        // credential, which is not the same as being trusted to be correct.
        const parsed: unknown = JSON.parse(line);
        if (typeof parsed !== 'object' || parsed === null || !('ok' in parsed)) {
          finish({ ok: false, reason: 'the ingest proxy answered with something unreadable' });
          return;
        }
        finish(parsed as ProxyResponse);
      } catch {
        finish({ ok: false, reason: 'the ingest proxy answered with invalid JSON' });
      }
    };

    let buffered = '';
    socket.on('data', (chunk: Buffer) => {
      if (settled) return;
      buffered += chunk.toString('utf8');
      const newline = buffered.indexOf('\n');
      if (newline >= 0) readReply(buffered.slice(0, newline));
    });
    socket.on('end', () => {
      if (settled) return;
      finish({
        ok: false,
        reason:
          buffered.trim() === ''
            ? 'the ingest proxy closed without answering'
            : 'the ingest proxy closed before terminating its reply frame',
      });
    });

    socket.on('connect', () => {
      // A newline terminates the request. Do not half-close here: Windows named
      // pipes do not preserve a writable peer half the way AF_UNIX does, so EOF
      // as framing can destroy the reply path before the proxy answers.
      socket.write(`${JSON.stringify(request)}\n`);
    });
  });
}

function outcomeOf(response: ProxyResponse): IngestOutcome {
  if (!response.ok) return { status: 'unreachable', reason: response.reason };
  if ('outcome' in response) return response.outcome;
  return { status: 'unreachable', reason: 'the ingest proxy answered the wrong question' };
}

/**
 * An `Ingest` that delegates to a host-side proxy over a unix socket.
 *
 * Note what this deliberately does not do: it does not fall back to anything. If
 * the proxy is unavailable the events stay in the outbox and the run ends
 * INCOMPLETE, which is the truthful state and the one the qualification rule
 * wants. A fallback that reported success would make an undelivered run look
 * measured -- the exact inversion `UNCONFIGURED_INGEST` was written to avoid.
 */
export function socketIngest(options: {
  readonly socketPath: string;
  readonly timeoutMs?: number;
}): Ingest {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const call = (request: ProxyRequest): Promise<ProxyResponse> =>
    ask(options.socketPath, request, timeoutMs);

  return {
    sendEvents: async (events) => outcomeOf(await call({ op: 'sendEvents', events })),
    sendObservations: async (observations) =>
      outcomeOf(await call({ op: 'sendObservations', observations })),
    readMinimal: async (kind) => {
      const response = await call({ op: 'readMinimal', kind });
      return response.ok && 'value' in response ? response.value : null;
    },
    isReachable: async () => {
      const response = await call({ op: 'isReachable' });
      return response.ok && 'reachable' in response ? response.reachable : false;
    },
  };
}
