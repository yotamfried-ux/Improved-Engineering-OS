/**
 * The MCP `2026-07-28` conformance smoke named by the Stage 1 exit gate.
 *
 * The gate asks for five things: `server/discover` implemented, self-describing
 * `_meta` accepted on every request, `tools/list` carrying `ttlMs`, `tools/call`
 * working, and the whole thing passing *without the client ever calling
 * `server/discover`*.
 *
 * Two of these are only meaningful with a control:
 *
 *   "`_meta` is accepted" is worth nothing unless something is rejected without
 *   it -- otherwise the server would pass by ignoring the envelope entirely. So
 *   the envelope's absence, its malformation and an unsupported version each
 *   have their own assertion on the error the specification names.
 *
 *   "passes without `server/discover`" is worth nothing if `server/discover` was
 *   never load-bearing. It is asserted here as a whole second session that opens
 *   on `tools/call`, so the modern era is reached with no discovery exchange at
 *   all.
 *
 * The last block runs the same server through the HTTP entry. That leg is a
 * test, not a shipped transport: it exists because the stdio entry pins the
 * protocol era for the life of a connection, so a per-request envelope claim is
 * only ever re-read where each request is its own serving unit. Without it,
 * "self-describing on *every* request" would be a claim this suite could not
 * make.
 */

import { describe, expect, it } from 'vitest';
import { InMemoryTransport, createMcpHandler } from '@modelcontextprotocol/server';
import { serveIeosMcp } from '../src/serve.ts';
import { createIeosMcpServer, SERVER_NAME, TOOL_LIST_CACHE, TOOL_NAMES } from '../src/server.ts';
import type { ContextSnapshot } from '../src/context.ts';
import { FIXTURE_FACTS, MODERN_VERSION, MemoryIndex, RawClient, metaEnvelope } from './fixtures.ts';

function session(): { client: RawClient; close: () => Promise<void> } {
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const handle = serveIeosMcp(
    { index: new MemoryIndex(), facts: FIXTURE_FACTS, staging: null },
    new Map<string, ContextSnapshot>(),
    { transport: serverSide, onerror: () => undefined },
  );
  return { client: new RawClient(clientSide), close: () => handle.close() };
}

async function withSession(run: (client: RawClient) => Promise<void>): Promise<void> {
  const { client, close } = session();
  await client.start();
  try {
    await run(client);
  } finally {
    await close();
  }
}

const RESOLVE_ARGS = { task_hint: 'add oauth login', project_id: 'proj_x', run_id: 'run_x' };

describe('MCP 2026-07-28 conformance smoke', () => {
  it('implements server/discover with the revision, capabilities and identity', async () => {
    await withSession(async (client) => {
      const reply = await client.request('server/discover');
      expect(reply.error).toBeUndefined();
      const result = reply.result as {
        supportedVersions: string[];
        capabilities: Record<string, unknown>;
        _meta: Record<string, { name: string }>;
      };
      expect(result.supportedVersions).toContain(MODERN_VERSION);
      // The server offers tools, so it must declare the capability.
      expect(result.capabilities).toHaveProperty('tools');
      expect(result._meta['io.modelcontextprotocol/serverInfo']?.name).toBe(SERVER_NAME);
    });
  });

  it('carries ttlMs and cacheScope on the cacheable results', async () => {
    await withSession(async (client) => {
      for (const method of ['tools/list', 'server/discover']) {
        const result = (await client.request(method)).result as Record<string, unknown>;
        expect(result['ttlMs']).toBe(TOOL_LIST_CACHE.ttlMs);
        expect(result['cacheScope']).toBe(TOOL_LIST_CACHE.cacheScope);
      }
    });
  });

  it('lists exactly the Agent Contract, in a deterministic order, with its hints', async () => {
    await withSession(async (client) => {
      const result = (await client.request('tools/list')).result as {
        tools: { name: string; annotations?: Record<string, boolean>; inputSchema: unknown }[];
      };
      expect(result.tools.map((tool) => tool.name)).toEqual([...TOOL_NAMES]);
      const byName = new Map(result.tools.map((tool) => [tool.name, tool]));
      for (const read of ['resolve', 'inspect', 'expand']) {
        expect(byName.get(read)?.annotations?.['readOnlyHint']).toBe(true);
      }
      expect(byName.get('observe')?.annotations?.['idempotentHint']).toBe(true);
      // A read that also claimed idempotence would be harmless; a write that
      // claimed to be read-only would not.
      expect(byName.get('observe')?.annotations?.['readOnlyHint']).toBeUndefined();
      for (const tool of result.tools) expect(tool.inputSchema).toBeTypeOf('object');
    });
  });

  it('answers tools/call for every tool in the contract', async () => {
    await withSession(async (client) => {
      const calls: Record<string, Record<string, unknown>> = {
        resolve: RESOLVE_ARGS,
        inspect: { handle: { kind: 'asset', id: 'asset_missing' }, run_id: 'run_x' },
        expand: { ...RESOLVE_ARGS, reason: 'nothing matched', beyond: 'corpus' },
        observe: {
          observation_id: 'obs_01J9Z6Q0K3N6X4R8V2T7M5B1WQ',
          run_id: 'run_x',
          kind: 'outcome',
          subject: { kind: 'asset', id: 'asset_x' },
        },
      };
      for (const [name, args] of Object.entries(calls)) {
        const reply = await client.request('tools/call', { name, arguments: args });
        // Every call reaches its tool: no method-not-found, no transport error.
        expect(reply.error, `${name} produced a protocol error`).toBeUndefined();
        const result = reply.result as { content: { text: string }[]; isError?: boolean };
        expect(result.content[0]?.text).toBeTypeOf('string');
      }
    });
  });

  it('passes without the client ever calling server/discover', async () => {
    await withSession(async (client) => {
      // The session opens on a tool call. Nothing has negotiated anything.
      const call = await client.request('tools/call', {
        name: 'resolve',
        arguments: RESOLVE_ARGS,
      });
      expect(call.error).toBeUndefined();
      const result = call.result as { content: { text: string }[]; isError?: boolean };
      expect(result.isError).toBeUndefined();
      const response = JSON.parse(result.content[0]?.text ?? '{}') as {
        context_snapshot_id: string;
      };
      expect(response.context_snapshot_id.startsWith('ctx_')).toBe(true);

      const list = (await client.request('tools/list')).result as Record<string, unknown>;
      expect(list['ttlMs']).toBe(TOOL_LIST_CACHE.ttlMs);
      expect((list['tools'] as unknown[]).length).toBe(TOOL_NAMES.length);
    });
  });

  describe('the envelope is required, not merely tolerated', () => {
    it('rejects an unsupported protocol version with -32022 and the supported list', async () => {
      await withSession(async (client) => {
        const reply = await client.request('tools/list', {}, metaEnvelope('2025-06-18'));
        expect(reply.error?.code).toBe(-32022);
        expect(reply.error?.data?.['supported']).toEqual([MODERN_VERSION]);
        expect(reply.error?.data?.['requested']).toBe('2025-06-18');
      });
    });

    it('rejects a request that names no protocol version at all', async () => {
      await withSession(async (client) => {
        const reply = await client.request('tools/list', {}, null);
        expect(reply.error?.code).toBe(-32022);
        expect(reply.error?.data?.['supported']).toEqual([MODERN_VERSION]);
      });
    });

    it('rejects a malformed envelope with invalid params', async () => {
      await withSession(async (client) => {
        const reply = await client.request(
          'tools/list',
          {},
          {
            'io.modelcontextprotocol/protocolVersion': MODERN_VERSION,
          },
        );
        expect(reply.error?.code).toBe(-32602);
        expect(reply.error?.message).toContain('io.modelcontextprotocol/clientCapabilities');
      });
    });

    it('rejects the 2025 initialize handshake this endpoint does not serve', async () => {
      await withSession(async (client) => {
        const reply = await client.request(
          'initialize',
          {
            protocolVersion: '2025-06-18',
            capabilities: {},
            clientInfo: { name: 'x', version: '1' },
          },
          null,
        );
        expect(reply.error?.code).toBe(-32022);
      });
    });
  });

  describe('per-request classification, where each request is its own serving unit', () => {
    const handler = () =>
      createMcpHandler(
        () =>
          createIeosMcpServer(
            { index: new MemoryIndex(), facts: FIXTURE_FACTS, staging: null },
            new Map<string, ContextSnapshot>(),
          ),
        { legacy: 'reject', onerror: () => undefined },
      );

    async function post(
      fetchOne: ReturnType<typeof handler>['fetch'],
      method: string,
      meta: Record<string, unknown> | null,
    ): Promise<Record<string, unknown>> {
      const params = meta === null ? {} : { _meta: meta };
      const response = await fetchOne(
        new Request('http://ieos.invalid/mcp', {
          method: 'POST',
          // `2026-07-28` streamable HTTP carries the method and the revision in
          // headers as well as the body, and the entry rejects a request whose
          // headers and body disagree (-32020). The smoke sends both.
          headers: {
            'content-type': 'application/json',
            'mcp-method': method,
            'mcp-protocol-version':
              (meta?.['io.modelcontextprotocol/protocolVersion'] as string) ?? MODERN_VERSION,
          },
          body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
        }),
      );
      return (await response.json()) as Record<string, unknown>;
    }

    it('re-reads the envelope on every request, accepting and rejecting each on its own', async () => {
      const instance = handler();
      try {
        const good = await post(instance.fetch, 'tools/list', metaEnvelope());
        expect(good['error']).toBeUndefined();
        expect((good['result'] as Record<string, unknown>)['ttlMs']).toBe(TOOL_LIST_CACHE.ttlMs);

        // The same endpoint, immediately afterwards, with a version it does not
        // serve. Under a connection-pinned transport this would be waved
        // through on the strength of the earlier request.
        const bad = await post(instance.fetch, 'tools/list', metaEnvelope('2025-06-18'));
        expect((bad['error'] as { code: number }).code).toBe(-32022);

        // And back again: one bad request does not poison the endpoint.
        const goodAgain = await post(instance.fetch, 'server/discover', metaEnvelope());
        expect(goodAgain['error']).toBeUndefined();
      } finally {
        await instance.close();
      }
    });
  });
});
