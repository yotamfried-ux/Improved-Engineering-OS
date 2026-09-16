import { describe, expect, it } from 'vitest';
import { attributionEvents, planHook } from '../src/hooks.ts';

describe('real PostToolUse attribution payloads', () => {
  it('ignores a same-named tool from a non-IEOS MCP server', () => {
    const response = {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ context_snapshot_id: 'ctx_a', items: [{ id: 'asset_a' }] }),
        },
      ],
    };
    for (const tool_name of [
      'mcp__other__resolve',
      'mcp__notieos__resolve',
      'mcp__other__ieos__resolve',
    ]) {
      expect(
        attributionEvents({
          hook_event_name: 'PostToolUse',
          session_id: 'session_a',
          tool_name,
          tool_input: { task_hint: 'bash command' },
          tool_response: response,
        }),
      ).toEqual([]);
    }
    expect(
      attributionEvents({
        hook_event_name: 'PostToolUse',
        session_id: 'session_a',
        tool_name: 'mcp__other__inspect',
        tool_input: { handle: { kind: 'asset', id: 'asset_a' } },
      }),
    ).toEqual([]);
  });

  it('uses tool_response and typed handles for inspect', () => {
    const input = {
      hook_event_name: 'PostToolUse' as const,
      session_id: 'session_a',
      tool_name: 'mcp__ieos__inspect',
      tool_input: { handle: { kind: 'asset', id: 'asset_a' }, run_id: 'run_a' },
      tool_response: { content: [{ type: 'text', text: '{"asset":{"id":"asset_a"}}' }] },
    };

    expect(planHook(input).emit?.attributes).toMatchObject({
      'tool.name': 'mcp__ieos__inspect',
      'tool.outcome': 'ok',
      'asset.id': 'asset_a',
    });
    expect(attributionEvents(input)).toEqual([
      {
        eventType: 'inspect.request',
        attributes: { 'tool.name': 'mcp__ieos__inspect', 'asset.id': 'asset_a' },
      },
    ]);
  });

  it('emits one exposed event per actual resolve item and binds the snapshot', () => {
    const input = {
      hook_event_name: 'PostToolUse' as const,
      session_id: 'session_a',
      tool_name: 'mcp__ieos__resolve',
      tool_input: { task_hint: 'bash command', project_id: 'proj_a', run_id: 'run_a' },
      tool_response: {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              context_snapshot_id: 'ctx_a',
              items: [{ id: 'asset_a' }, { id: 'asset_b' }],
            }),
          },
        ],
      },
    };

    expect(attributionEvents(input)).toEqual([
      {
        eventType: 'resolve.response',
        attributes: {
          'tool.name': 'mcp__ieos__resolve',
          'asset.id': 'asset_a',
          'context_snapshot.id': 'ctx_a',
        },
      },
      {
        eventType: 'resolve.response',
        attributes: {
          'tool.name': 'mcp__ieos__resolve',
          'asset.id': 'asset_b',
          'context_snapshot.id': 'ctx_a',
        },
      },
    ]);
  });

  it('records observe as agent-reported use without claiming verified benefit', () => {
    const input = {
      hook_event_name: 'PostToolUse' as const,
      session_id: 'session_a',
      tool_name: 'mcp__ieos__observe',
      tool_input: {
        observation_id: 'obs_a',
        run_id: 'run_a',
        kind: 'outcome',
        subject: { kind: 'asset', id: 'asset_a' },
        note: 'agent says this helped',
      },
      tool_response: { content: [{ type: 'text', text: '{"status":"recorded"}' }] },
    };

    expect(attributionEvents(input)).toEqual([
      {
        eventType: 'observe.request',
        attributes: { 'tool.name': 'mcp__ieos__observe', 'asset.id': 'asset_a' },
      },
    ]);
  });
});
