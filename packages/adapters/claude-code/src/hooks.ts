/** Pure Claude Code hook decisions and attribution extraction (Q-09/D23/D32). */

import type { EventType, SessionKind } from '@ieos/core';

export const HOOK_EVENTS = ['SessionStart', 'PostToolUse', 'Stop', 'SessionEnd'] as const;
export type HookEvent = (typeof HOOK_EVENTS)[number];
export type HookExit = 0 | 1;
export const BLOCKING_EXIT_CODE = 2;

export interface HookInput {
  readonly hook_event_name: string;
  readonly session_id?: string;
  readonly cwd?: string;
  readonly tool_name?: string;
  readonly tool_use_id?: string;
  readonly tool_input?: unknown;
  /** Current Claude Code PostToolUse field. */
  readonly tool_response?: unknown;
  /** Legacy compatibility only; new hooks use `tool_response`. */
  readonly tool_output?: unknown;
  readonly exit_reason?: string;
  readonly startup_reason?: string;
  readonly model?: string;
}

export class HookInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HookInputError';
  }
}

export function isHookEvent(value: string): value is HookEvent {
  return (HOOK_EVENTS as readonly string[]).includes(value);
}

export function parseHookInput(raw: string): HookInput & { hook_event_name: HookEvent } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new HookInputError('the hook payload on stdin is not valid JSON');
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new HookInputError('the hook payload is not a JSON object');
  }
  const input = parsed as HookInput;
  if (typeof input.hook_event_name !== 'string' || !isHookEvent(input.hook_event_name)) {
    throw new HookInputError(
      `unregistered hook event ${JSON.stringify(String(input.hook_event_name))}; ` +
        `this adapter handles ${HOOK_EVENTS.join(', ')}`,
    );
  }
  if (typeof input.session_id !== 'string' || input.session_id === '') {
    throw new HookInputError('the hook payload carries no session_id');
  }
  return input as HookInput & { hook_event_name: HookEvent };
}

export interface HookEmission {
  readonly eventType: EventType;
  readonly attributes: Record<string, unknown>;
}

export interface HookPlan {
  readonly event: HookEvent;
  readonly emit: HookEmission | null;
  readonly flush: boolean;
  readonly finishesRun: boolean;
  readonly startsRun: boolean;
}

export function planHook(input: HookInput & { hook_event_name: HookEvent }): HookPlan {
  switch (input.hook_event_name) {
    case 'SessionStart':
      return {
        event: 'SessionStart',
        emit: {
          eventType: 'session.start',
          attributes: { 'session.startup_reason': input.startup_reason ?? 'startup' },
        },
        flush: false,
        finishesRun: false,
        startsRun: true,
      };

    case 'PostToolUse':
      return {
        event: 'PostToolUse',
        emit: {
          eventType: 'tool.call',
          attributes: {
            'tool.name': input.tool_name ?? 'unknown',
            'tool.outcome': toolOutcome(input.tool_response ?? input.tool_output),
            ...assetAttribute(input),
          },
        },
        flush: false,
        finishesRun: false,
        startsRun: false,
      };

    case 'Stop':
      return {
        event: 'Stop',
        emit: null,
        flush: true,
        finishesRun: false,
        startsRun: false,
      };

    case 'SessionEnd':
      return {
        event: 'SessionEnd',
        emit: {
          eventType: 'session.end',
          attributes: { 'session.exit_reason': input.exit_reason ?? 'other' },
        },
        flush: true,
        finishesRun: true,
        startsRun: false,
      };
  }
}

function toolOutcome(output: unknown): string {
  if (typeof output === 'object' && output !== null) {
    const record = output as Record<string, unknown>;
    if (record['success'] === false || record['isError'] === true) return 'error';
    return 'ok';
  }
  if (typeof output !== 'string') return 'ok';
  return /\berror\b|\bfailed\b|\bexception\b/iu.test(output) ? 'error' : 'ok';
}

function typedAsset(value: unknown): string | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  return record['kind'] === 'asset' && typeof record['id'] === 'string' && record['id'] !== ''
    ? record['id']
    : undefined;
}

function assetAttribute(input: HookInput): Record<string, unknown> {
  const name = input.tool_name ?? '';
  if (!name.includes('ieos') && !['inspect', 'observe', 'expand'].includes(name)) return {};
  if (input.tool_input === null || typeof input.tool_input !== 'object') return {};
  const record = input.tool_input as Record<string, unknown>;
  const assetId = typedAsset(record['handle']) ?? typedAsset(record['subject']);
  return assetId === undefined ? {} : { 'asset.id': assetId };
}

function ieosTool(name: string | undefined): 'resolve' | 'inspect' | 'observe' | 'expand' | null {
  if (name === undefined) return null;
  for (const tool of ['resolve', 'inspect', 'observe', 'expand'] as const) {
    if (name === tool || name.endsWith(`__${tool}`)) return tool;
  }
  return null;
}

function parseJsonText(value: unknown): unknown {
  if (typeof value !== 'string') return undefined;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
}

/**
 * Extract only the structured MCP result needed for attribution.
 *
 * The hook never persists the tool response itself. This parser deliberately
 * narrows arbitrary output to ids and counts, preserving D26's metadata-only
 * boundary while accepting the content-block shape MCP tools return.
 */
function mcpResult(response: unknown): unknown {
  const direct = parseJsonText(response);
  if (direct !== undefined) return direct;
  if (response === null || typeof response !== 'object' || Array.isArray(response)) return response;
  const record = response as Record<string, unknown>;
  if (record['structuredContent'] !== undefined) return record['structuredContent'];
  const content = record['content'];
  if (Array.isArray(content)) {
    for (const block of content) {
      if (block !== null && typeof block === 'object') {
        const parsed = parseJsonText((block as Record<string, unknown>)['text']);
        if (parsed !== undefined) return parsed;
      }
    }
  }
  return response;
}

/**
 * Semantic events consumed by evidence derivation.
 *
 * Hooks are the single attribution source. MCP handlers do not emit a second
 * copy, so one real tool call cannot be counted twice. These events record what
 * the agent reported through its tool lifecycle; they do not upgrade the claim
 * to verified outcome evidence.
 */
export function attributionEvents(input: HookInput): readonly HookEmission[] {
  if (input.hook_event_name !== 'PostToolUse') return [];
  const tool = ieosTool(input.tool_name);
  if (tool === null || input.tool_input === null || typeof input.tool_input !== 'object') return [];
  const request = input.tool_input as Record<string, unknown>;

  if (tool === 'inspect') {
    const assetId = typedAsset(request['handle']);
    return assetId === undefined
      ? []
      : [{ eventType: 'inspect.request', attributes: { 'tool.name': input.tool_name ?? tool, 'asset.id': assetId } }];
  }

  if (tool === 'observe') {
    const assetId = typedAsset(request['subject']);
    return assetId === undefined
      ? []
      : [{ eventType: 'observe.request', attributes: { 'tool.name': input.tool_name ?? tool, 'asset.id': assetId } }];
  }

  if (tool !== 'resolve') return [];
  const result = mcpResult(input.tool_response ?? input.tool_output);
  if (result === null || typeof result !== 'object' || Array.isArray(result)) return [];
  const response = result as Record<string, unknown>;
  const items = response['items'];
  if (!Array.isArray(items)) return [];
  const snapshotId =
    typeof response['context_snapshot_id'] === 'string' ? response['context_snapshot_id'] : undefined;
  const emitted: HookEmission[] = [];
  for (const item of items) {
    if (item === null || typeof item !== 'object') continue;
    const id = (item as Record<string, unknown>)['id'];
    if (typeof id !== 'string' || id === '') continue;
    emitted.push({
      eventType: 'resolve.response',
      attributes: {
        'tool.name': input.tool_name ?? tool,
        'asset.id': id,
        ...(snapshotId === undefined ? {} : { 'context_snapshot.id': snapshotId }),
      },
    });
  }
  return emitted;
}

export interface HookOutcome {
  readonly exitCode: HookExit;
  readonly stderr: string;
  readonly stdout: string;
}

export function failed(reason: string): HookOutcome {
  return {
    exitCode: 1,
    stderr: `ieos telemetry: ${reason}. Coding is unaffected; the run is marked INCOMPLETE (D23).`,
    stdout: '',
  };
}

export function succeeded(note = ''): HookOutcome {
  return { exitCode: 0, stderr: note, stdout: '' };
}

export type { SessionKind };
