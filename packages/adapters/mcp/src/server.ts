/**
 * The IEOS MCP server: the Agent Contract over MCP `2026-07-28`.
 *
 * Three things about this revision drive the shape of this file, all verified
 * against the specification rather than assumed:
 *
 *   the initialization handshake is gone -- the core is stateless, and every
 *   request describes itself through a `_meta` envelope;
 *   `server/discover` is a server obligation, and clients are explicitly not
 *   required to call it;
 *   the cacheable results (`tools/list`, `server/discover`) carry `ttlMs` and
 *   `cacheScope`.
 *
 * The SDK owns the first two. What is worth recording, because it cost a wrong
 * turn: the modern era is owned by the *serving entry* -- `serveStdio` here,
 * `createMcpHandler` over HTTP -- not by `McpServer` itself. Wiring an
 * `McpServer` straight onto a transport with `connect()` serves the 2025 era:
 * `server/discover` answers `-32601` and lists carry no cache fields. The entry
 * is what classifies the inbound envelope and pins the era, so this file hands
 * a *factory* to the entry and never connects a server itself.
 *
 * The third is ours: `cacheHints` below is what puts `ttlMs` on `tools/list`.
 */

import { McpServer } from '@modelcontextprotocol/server';
import {
  expandRequestSchema,
  inspectRequestSchema,
  observeRequestSchema,
  resolveRequestSchema,
} from '@ieos/core';
import { AgentContractError, expand, inspect, observe, resolve } from './handlers.ts';
import type { AgentContractDeps, SnapshotStore } from './handlers.ts';

export const SERVER_NAME = 'ieos';
export const SERVER_VERSION = '0.1.0';

/**
 * How long a client may cache the tool list.
 *
 * The four tools are fixed at build time -- this server registers exactly the
 * Agent Contract and nothing conditional -- so the list cannot change while the
 * process lives. `public` because the list contains no caller-specific data:
 * every principal sees the same four tools.
 */
export const TOOL_LIST_CACHE = { ttlMs: 300_000, cacheScope: 'public' as const };

/**
 * The tool names, in the order they are registered and therefore listed.
 *
 * `2026-07-28` says servers *should* return tools in a deterministic order. A
 * fixed array is that order, and the conformance smoke compares against it, so
 * a future registration that happened to run in a different order fails a test
 * rather than quietly changing what clients cache.
 */
export const TOOL_NAMES = ['resolve', 'inspect', 'expand', 'observe'] as const;

function textResult(value: unknown): { content: { type: 'text'; text: string }[] } {
  return { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] };
}

/**
 * A refusal, returned as a tool error rather than thrown.
 *
 * `isError` is how MCP says "the tool ran and declined"; a thrown exception
 * would say "the server broke". The difference matters to an agent deciding
 * whether to retry.
 */
function errorResult(error: unknown): {
  content: { type: 'text'; text: string }[];
  isError: true;
} {
  const text =
    error instanceof AgentContractError
      ? `${error.code}: ${error.message}`
      : `internal_error: ${String(error)}`;
  return { content: [{ type: 'text', text }], isError: true };
}

async function attempt(run: () => Promise<unknown>): Promise<ReturnType<typeof textResult>> {
  try {
    return textResult(await run());
  } catch (error) {
    return errorResult(error) as ReturnType<typeof textResult>;
  }
}

/**
 * Build one server instance.
 *
 * Called per serving unit by the entry (one connection under `serveStdio`, one
 * request under `createMcpHandler`), which is what "stateless" means in
 * practice: nothing survives between units except the dependencies handed in
 * here.
 */
export function createIeosMcpServer(deps: AgentContractDeps, store: SnapshotStore): McpServer {
  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    {
      // `2026-07-28` requires a server offering tools to declare the capability.
      capabilities: { tools: {} },
      cacheHints: { 'tools/list': TOOL_LIST_CACHE, 'server/discover': TOOL_LIST_CACHE },
    },
  );

  server.registerTool(
    'resolve',
    {
      title: 'Resolve knowledge for a task',
      description:
        'Return the Champion assets relevant to a task, with a durable context_snapshot_id ' +
        'explaining the decision. Read-only.',
      inputSchema: resolveRequestSchema,
      // D25: the three reads never write. Declaring it lets a client reason
      // about retries without asking.
      annotations: { readOnlyHint: true },
    },
    async (request) => attempt(() => resolve(deps, store, request)),
  );

  server.registerTool(
    'inspect',
    {
      title: 'Inspect an asset, solution set or context snapshot',
      description:
        'Return the full record behind a typed handle: an asset with its body and evidence ' +
        'summary, a solution set with its members, or the inputs of a context snapshot. Read-only.',
      inputSchema: inspectRequestSchema,
      annotations: { readOnlyHint: true },
    },
    async (request) => attempt(() => inspect(deps, store, request)),
  );

  server.registerTool(
    'expand',
    {
      title: 'Widen the search beyond the first answer',
      description:
        'Same shape as resolve, for a search deliberately widened beyond a solution set, a type ' +
        'or the corpus, carrying the reason it was widened. Read-only.',
      inputSchema: expandRequestSchema,
      annotations: { readOnlyHint: true },
    },
    async (request) => attempt(() => expand(deps, store, request)),
  );

  server.registerTool(
    'observe',
    {
      title: 'Record an observation about a run',
      description:
        'Record an outcome, correction, discovery or friction against a run. Writes to staging ' +
        'only, never to canonical knowledge. Idempotent on the caller-minted observation_id.',
      inputSchema: observeRequestSchema,
      // T-04: idempotent because the caller mints observation_id and the server
      // enforces it UNIQUE -- not because the operation happens to be safe.
      annotations: { idempotentHint: true },
    },
    async (request) => attempt(() => observe(deps, request)),
  );

  return server;
}
