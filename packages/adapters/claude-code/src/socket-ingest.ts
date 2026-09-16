/** Ingest over the credential-isolated Stage 3 IPC proxy (D22/D23). */

import { connect } from 'node:net';
import type { Ingest, IngestOutcome, ProxyRequest, ProxyResponse } from '@ieos/core';

export const INGEST_SOCKET = 'IEOS_INGEST_SOCKET';
const DEFAULT_TIMEOUT_MS = 10_000;

async function ask(
  socketPath: string,
  request: ProxyRequest,
  timeoutMs: number,
): Promise<ProxyResponse> {
  return new Promise<ProxyResponse>((resolve) => {
    let settled = false;
    const socket = connect(socketPath);
    const finish = (response: ProxyResponse): void => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(response);
    };

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
      socket.write(`${JSON.stringify(request)}\n`);
    });
  });
}

function outcomeOf(response: ProxyResponse): IngestOutcome {
  if (!response.ok) return { status: 'unreachable', reason: response.reason };
  if ('outcome' in response) return response.outcome;
  return { status: 'unreachable', reason: 'the ingest proxy answered the wrong question' };
}

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
    sendContextSnapshots: async (snapshots) =>
      outcomeOf(await call({ op: 'sendContextSnapshots', snapshots })),
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
