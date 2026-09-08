/**
 * The primary agent's hook contract, as a pure decision (Q-09, D23, D26).
 *
 * Only one agent gets hooks at Stage 2. Q-09 is explicit about that, and the
 * reason is worth keeping in view: Stage 3 asks whether EOS is natural for one
 * real agent end to end, and agent neutrality is a different question that
 * Stage 8 asks with a second adapter. Building both now would answer neither.
 *
 * Everything here is a pure function of the hook payload. The composition root
 * beside it does the I/O. That split is what makes the exit-code rule testable
 * without a running agent -- and the exit-code rule is the part where a mistake
 * is worst.
 *
 * **The exit-code rule.** Verified against the published hook reference:
 *
 *   exit 0    success. stdout is read as JSON when it looks like JSON;
 *             stderr goes to the debug log only.
 *   exit 2    a BLOCKING error on events that can block -- and on `Stop` what
 *             it blocks is stopping. A telemetry hook that returned 2 there
 *             would hold a coding session open because a network call failed.
 *   other     non-blocking. The action proceeds and a notice is shown.
 *
 * So this adapter never returns 2, from any event, for any reason. D23 states
 * the same rule from the other direction: telemetry failure is recorded as
 * `telemetry_state`, reported through stderr, and never allowed to block
 * coding. A failure exits 1 -- non-blocking, but visible, because a telemetry
 * hook that failed silently would leave a run looking quiet rather than lossy.
 */

import type { EventType, SessionKind } from '@ieos/core';

/** The four events this adapter handles (Q-09). */
export const HOOK_EVENTS = ['SessionStart', 'PostToolUse', 'Stop', 'SessionEnd'] as const;
export type HookEvent = (typeof HOOK_EVENTS)[number];

/**
 * Exit codes this adapter may return.
 *
 * `2` is deliberately absent from the type, not merely unused. A value that
 * cannot be named cannot be returned by a later edit either.
 */
export type HookExit = 0 | 1;

/** The blocking code, named so tests can assert it is never produced. */
export const BLOCKING_EXIT_CODE = 2;

export interface HookInput {
  readonly hook_event_name: string;
  readonly session_id?: string;
  readonly cwd?: string;
  readonly tool_name?: string;
  readonly tool_use_id?: string;
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

/**
 * Parse the JSON the agent writes to the hook's stdin.
 *
 * Unknown fields are kept rather than rejected: the hook payload is the agent's
 * contract, not ours, and a new field appearing in a future version must not
 * stop telemetry. An unknown *event* is a different matter -- this adapter is
 * registered for four, so a fifth arriving means the registration and the code
 * disagree, and guessing would emit an event nobody can interpret.
 */
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
    // Every event of one coding session must land on one run. Without the
    // session id there is nothing to key that on, and events would scatter
    // across runs that each look half-empty.
    throw new HookInputError('the hook payload carries no session_id');
  }
  return input as HookInput & { hook_event_name: HookEvent };
}

/** What one hook invocation should do. */
export interface HookPlan {
  readonly event: HookEvent;
  /** The telemetry event to emit, or null when this hook only flushes. */
  readonly emit: {
    readonly eventType: EventType;
    readonly attributes: Record<string, unknown>;
  } | null;
  /** Whether this event is a terminal boundary that must flush synchronously. */
  readonly flush: boolean;
  /** Whether this event ends the run and writes its terminal state. */
  readonly finishesRun: boolean;
  /** Whether this event begins the run and declares eligibility up front (D23). */
  readonly startsRun: boolean;
}

/**
 * Decide what a hook invocation does.
 *
 * `Stop` flushes without emitting. It fires when the assistant finishes a turn,
 * which happens many times in a session; emitting there would add an event per
 * turn that says only "a turn ended", and the boundary flush is the whole
 * reason D23 names Stop at all.
 */
export function planHook(input: HookInput & { hook_event_name: HookEvent }): HookPlan {
  switch (input.hook_event_name) {
    case 'SessionStart':
      return {
        event: 'SessionStart',
        emit: {
          eventType: 'session.start',
          // `startup_reason` distinguishes a fresh session from a resume or a
          // compact, which is the difference between a run and a continuation.
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
            // The outcome, never the output. A tool's output is arbitrary text
            // -- source, a prompt, an error body -- and D26's allowlist exists
            // because that is exactly where a secret rides along.
            'tool.outcome': toolOutcome(input.tool_output),
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

/**
 * `ok` or `error`, and nothing else.
 *
 * The allowlist declares `tool.outcome` as one of a small vocabulary precisely
 * so this cannot become a place where an error message escapes. A tool output
 * that looks like a failure is reported as `error`; what the failure said is
 * not this hook's to carry.
 */
function toolOutcome(output: unknown): string {
  if (typeof output !== 'string') return 'ok';
  return /\berror\b|\bfailed\b|\bexception\b/iu.test(output) ? 'error' : 'ok';
}

/**
 * The asset an EOS tool call was about, when the call names one.
 *
 * Read from the tool NAME and the tool's own input, so attribution is about
 * calls the agent actually made to EOS rather than about anything it said.
 */
function assetAttribute(input: HookInput): Record<string, unknown> {
  const name = input.tool_name ?? '';
  if (!name.includes('ieos') && !['inspect', 'observe', 'expand'].includes(name)) return {};
  const toolInput = (input as { tool_input?: unknown }).tool_input;
  if (toolInput === null || typeof toolInput !== 'object') return {};
  const handle = (toolInput as Record<string, unknown>)['handle'];
  return typeof handle === 'string' && handle.startsWith('asset_') ? { 'asset.id': handle } : {};
}

export interface HookOutcome {
  readonly exitCode: HookExit;
  readonly stderr: string;
  /** Written to stdout only when there is something the agent should see. */
  readonly stdout: string;
}

/**
 * Turn a telemetry failure into a hook result.
 *
 * Never `2`, whatever went wrong. On `Stop` that code prevents the session from
 * stopping, so an unreachable Evidence Plane would hold a coding session open
 * -- telemetry deciding whether work may finish, which is the inversion D23
 * forbids in one sentence: coding continues.
 */
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

/** The session kinds this adapter may report, re-exported for the settings docs. */
export type { SessionKind };
