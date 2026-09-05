/**
 * Serving entry: stdio, pinned to the modern protocol era.
 *
 * `legacy: 'reject'` is deliberate. The SDK will happily serve the 2025 era
 * from the same factory, and accepting it would mean this server sometimes
 * answers without `server/discover`, without `ttlMs`, and without the
 * self-describing `_meta` envelope -- while still reporting success. Stage 1's
 * exit gate is about `2026-07-28` conformance, so an endpoint that silently
 * downgrades would make that gate untestable. A 2025 client gets `-32022`
 * naming the revision this server speaks, which is an answer it can act on.
 */

import { serveStdio, type StdioServerHandle } from '@modelcontextprotocol/server/stdio';
import type { Transport } from '@modelcontextprotocol/server';
import { createIeosMcpServer } from './server.ts';
import type { AgentContractDeps, SnapshotStore } from './handlers.ts';

export interface ServeOptions {
  /**
   * Bring your own transport. The conformance smoke passes an in-memory pair,
   * so the protocol is exercised without spawning a process.
   */
  readonly transport?: Transport;
  readonly onerror?: (error: Error) => void;
}

export function serveIeosMcp(
  deps: AgentContractDeps,
  store: SnapshotStore,
  options: ServeOptions = {},
): StdioServerHandle {
  return serveStdio(() => createIeosMcpServer(deps, store), {
    legacy: 'reject',
    ...(options.transport === undefined ? {} : { transport: options.transport }),
    ...(options.onerror === undefined ? {} : { onerror: options.onerror }),
  });
}
