import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CodexDriver,
  codexArgsFor,
  codexCompleted,
  codexMcpOverride,
  codexModelOf,
  codexToolCallsOf,
  codexUsageOf,
  unexpectedCodexToolCalls,
  parseCodexEvents,
  persistIsolatedCodexAuth,
  prepareIsolatedCodexHome,
} from '../src/drivers/codex.ts';

const EVENTS = [
  JSON.stringify({ type: 'thread.started', thread_id: 't' }),
  JSON.stringify({
    type: 'item.completed',
    item: { type: 'command_execution', command: 'npm test', exit_code: 0, status: 'completed' },
  }),
  JSON.stringify({
    type: 'item.completed',
    item: {
      type: 'mcp_tool_call',
      server: 'ieos',
      tool: 'resolve',
      arguments: { hint: 'quality' },
      result: { structured_content: { items: [] } },
      status: 'completed',
    },
  }),
  JSON.stringify({
    type: 'turn.completed',
    usage: {
      input_tokens: 1000,
      cached_input_tokens: 600,
      cache_write_input_tokens: 100,
      output_tokens: 200,
    },
  }),
].join('\n');

describe('Codex JSONL evidence parser', () => {
  it('parses structured events and ignores non-JSON diagnostics', () => {
    const events = parseCodexEvents(`not json\n${EVENTS}\n`);
    expect(events).toHaveLength(4);
    expect(codexCompleted(events, 0)).toBe(true);
    expect(codexCompleted(events, 1)).toBe(false);
  });

  it('rejects malformed structured events instead of fabricating evidence', () => {
    const events = parseCodexEvents(
      [
        'null',
        '[]',
        '{}',
        JSON.stringify({ type: 'turn.completed', usage: {} }),
        JSON.stringify({
          type: 'turn.completed',
          usage: {
            input_tokens: 1,
            cached_input_tokens: 0,
            cache_write_input_tokens: 0,
            output_tokens: -1,
          },
        }),
        JSON.stringify({
          type: 'turn.completed',
          usage: {
            input_tokens: 1,
            cached_input_tokens: 0,
            cache_write_input_tokens: 0,
            output_tokens: 2,
          },
        }),
      ].join('\n'),
    );

    expect(events).toHaveLength(1);
    expect(codexUsageOf(events, 1)).toMatchObject({
      totalInputTokens: 1,
      outputTokens: 2,
      turns: 1,
    });
  });

  it('extracts command and IEOS MCP tool calls', () => {
    expect(codexToolCallsOf(parseCodexEvents(EVENTS)).map((call) => call.name)).toEqual([
      'Bash',
      'mcp__ieos__resolve',
    ]);
  });

  it('fails closed on observed web, foreign MCP, or EOS calls in the native arm', () => {
    expect(
      unexpectedCodexToolCalls(
        [
          { name: 'Bash', at: '' },
          { name: 'WebSearch', at: '' },
          { name: 'mcp__github__search', at: '' },
          { name: 'mcp__ieos__resolve', at: '' },
        ],
        false,
      ),
    ).toEqual(['WebSearch', 'mcp__github__search', 'mcp__ieos__resolve']);
  });

  it('accepts only the four IEOS MCP tools in the EOS arm', () => {
    expect(
      unexpectedCodexToolCalls(
        [
          { name: 'Bash', at: '' },
          { name: 'Edit', at: '' },
          { name: 'mcp__ieos__resolve', at: '' },
          { name: 'mcp__ieos__inspect', at: '' },
          { name: 'mcp__ieos__expand', at: '' },
          { name: 'mcp__ieos__observe', at: '' },
        ],
        true,
      ),
    ).toEqual([]);
  });

  it('records token usage without inventing a dollar charge', () => {
    const usage = codexUsageOf(parseCodexEvents(EVENTS), 12.5);
    expect(usage).toMatchObject({
      wallClockSeconds: 12.5,
      costUsd: null,
      inputTokens: 300,
      cacheReadInputTokens: 600,
      cacheCreationInputTokens: 100,
      totalInputTokens: 1000,
      outputTokens: 200,
      turns: 1,
    });
  });

  it('never pretends the requested model was provider-resolved', () => {
    expect(codexModelOf(parseCodexEvents(EVENTS), 'gpt-5.6-sol')).toEqual({
      requested: 'gpt-5.6-sol',
      resolved: null,
    });
    expect(
      codexModelOf([{ type: 'thread.started', server_model: 'gpt-5.6-sol-202609' }], 'gpt-5.6-sol'),
    ).toEqual({
      requested: 'gpt-5.6-sol',
      resolved: 'gpt-5.6-sol-202609',
    });
  });
});

describe('Codex auth isolation', () => {
  it('refuses to fall back to ambient state when file-backed auth is absent', () => {
    const source = mkdtempSync(join(tmpdir(), 'ieos-codex-auth-missing-'));
    try {
      expect(() => prepareIsolatedCodexHome(source)).toThrow(/auth\.json.*refusing/iu);
    } finally {
      rmSync(source, { recursive: true, force: true });
    }
  });

  it('copies only auth into the disposable home and persists a refreshed auth file', () => {
    const source = mkdtempSync(join(tmpdir(), 'ieos-codex-auth-source-'));
    let isolated: string | null = null;
    try {
      writeFileSync(join(source, 'auth.json'), '{"token":"original"}\n', 'utf8');
      writeFileSync(join(source, 'config.toml'), 'mcp_servers={ ambient={} }\n', 'utf8');
      writeFileSync(join(source, 'AGENTS.md'), 'ambient instructions\n', 'utf8');

      isolated = prepareIsolatedCodexHome(source);
      expect(readdirSync(isolated).sort()).toEqual(['auth.json']);
      expect(readFileSync(join(isolated, 'auth.json'), 'utf8')).toContain('original');

      writeFileSync(join(isolated, 'auth.json'), '{"token":"refreshed"}\n', 'utf8');
      persistIsolatedCodexAuth(isolated, source);

      expect(readFileSync(join(source, 'auth.json'), 'utf8')).toContain('refreshed');
      expect(readFileSync(join(source, 'config.toml'), 'utf8')).toContain('ambient');
      expect(readFileSync(join(source, 'AGENTS.md'), 'utf8')).toContain('ambient instructions');
    } finally {
      if (isolated !== null) rmSync(isolated, { recursive: true, force: true });
      rmSync(source, { recursive: true, force: true });
    }
  });

  it('removes the isolated home when setup fails before process execution', async () => {
    const authSource = mkdtempSync(join(tmpdir(), 'ieos-codex-auth-cleanup-'));
    const workspace = mkdtempSync(join(tmpdir(), 'ieos-codex-workspace-cleanup-'));
    const transcripts = mkdtempSync(join(tmpdir(), 'ieos-codex-transcripts-cleanup-'));
    const homesBefore = new Set(
      readdirSync(tmpdir()).filter((name) => name.startsWith('ieos-codex-home-')),
    );

    try {
      writeFileSync(join(authSource, 'auth.json'), '{"token":"cleanup-test"}\n', 'utf8');
      const driver = new CodexDriver({
        eosRoot: join(workspace, 'missing-eos-root'),
        transcriptDir: transcripts,
        allowedHosts: [],
        deniedRoots: [],
        telemetrySocketPath: join(workspace, 'missing.sock'),
        authSourceDir: authSource,
        executable: 'codex-do-not-run',
        model: 'gpt-5.6-sol',
      });

      await expect(
        driver.run(
          {
            trialId: 'cleanup',
            workspaceRoot: workspace,
            environment: {},
            policy: {
              filesystem: { allowedRoots: [workspace], deniedRoots: [] },
              environment: { allowedNames: [] },
              process: { allowedExecutables: [] },
              network: { mode: 'deny', allowedHosts: [] },
              requiredBoundaries: [],
            },
            dispose(): void {},
          },
          {
            taskId: 'cleanup',
            prompt: 'must never execute',
            budget: { wallClockSeconds: 1, maxToolCalls: 1 },
          },
        ),
      ).rejects.toThrow();

      const leakedHomes = readdirSync(tmpdir()).filter(
        (name) => name.startsWith('ieos-codex-home-') && !homesBefore.has(name),
      );
      expect(leakedHomes).toEqual([]);
    } finally {
      rmSync(authSource, { recursive: true, force: true });
      rmSync(workspace, { recursive: true, force: true });
      rmSync(transcripts, { recursive: true, force: true });
    }
  });
});

describe('Codex experiment configuration', () => {
  const server = {
    command: 'node',
    args: ['server-cli.ts', '--ranking-mode', 'recorded'],
  } as const;

  it('fails closed on EOS MCP startup and exposes only the four IEOS tools', () => {
    const override = codexMcpOverride(server);
    expect(override).toContain('required=true');
    expect(override).toContain('enabled_tools=["resolve","inspect","expand","observe"]');
  });

  it('removes every MCP server in the native arm', () => {
    expect(codexMcpOverride()).toBe('mcp_servers={}');
  });

  it('suppresses ambient config, execpolicy and hosted web search', () => {
    const args = codexArgsFor({ model: 'gpt-5.6-sol', prompt: 'task', mcpServer: server });
    expect(args).toContain('--ignore-user-config');
    expect(args).toContain('--ignore-rules');
    expect(args).toContain('cli_auth_credentials_store="file"');
    expect(args).toContain('check_for_update_on_startup=false');
    expect(args).toContain('default_permissions="ieos-stage3"');
    expect(args).toContain('permissions.ieos-stage3.extends=":workspace"');
    expect(args).toContain('permissions.ieos-stage3.filesystem.":root"="deny"');
    expect(args).toContain('permissions.ieos-stage3.filesystem.":minimal"="read"');
    expect(args).toContain('permissions.ieos-stage3.filesystem.":tmpdir"="deny"');
    expect(args).toContain('permissions.ieos-stage3.filesystem.":slash_tmp"="deny"');
    expect(args).toContain('permissions.ieos-stage3.network.enabled=false');
    expect(args).not.toContain('--sandbox');
    expect(args).not.toContain('workspace-write');
    expect(args).toContain('--ephemeral');
    expect(args).toContain('web_search="disabled"');
    expect(args).toContain('features.multi_agent=false');
    expect(args).toContain('features.apps=false');
    expect(args).toContain('features.remote_plugin=false');
    expect(args.filter((arg) => arg === 'task')).toHaveLength(1);
  });
});
