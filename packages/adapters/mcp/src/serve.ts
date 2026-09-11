/**
 * Serving entry: stdio, serving both protocol eras.
 *
 * This used to pass `legacy: 'reject'`, and the reasoning was about the gate
 * rather than about clients: serving the 2025 era means sometimes answering
 * without `server/discover`, without `ttlMs` and without the self-describing
 * `_meta` envelope while still reporting success, and Stage 1's exit gate is
 * about `2026-07-28` conformance, so a silent downgrade looked like it would make
 * that gate untestable.
 *
 * Stage 3 measured what it actually did (finding S-6). The primary agent's own
 * MCP client opens with an `initialize` request and no envelope, which is a
 * 2025-era opening; the server answered `-32022`, the client marked the server
 * `failed`, and the agent was offered no EOS tools at all. The first real trial
 * therefore recorded "resolve was not called" -- which read like a finding about
 * the agent and was a fact about this line.
 *
 * Stage 1's conformance smoke did not catch it because it was written against the
 * same reading of the specification as the server: a client that always sends the
 * envelope can never discover that real clients do not. So the era is no longer
 * refused, and the gate stays testable the way it was already testable -- the
 * modern guarantees are asserted on a connection that opens in the modern era,
 * and per-request envelope re-reading is asserted through the HTTP entry, where
 * each request is its own serving unit. What changes is that the server no longer
 * refuses the era its clients speak, which is not a property any gate should have
 * been protecting.
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
    // 'serve' pins a 2025-era opening to its own instance from the same factory.
    // A client that speaks the modern era still gets the modern era; nothing is
    // downgraded for a client that did not ask for it.
    legacy: 'serve',
    ...(options.transport === undefined ? {} : { transport: options.transport }),
    ...(options.onerror === undefined ? {} : { onerror: options.onerror }),
  });
}
