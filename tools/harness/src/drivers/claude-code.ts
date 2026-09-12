/**
 * The primary agent's driver (O-3, deviation C-5 discharged).
 *
 * O-3 asked which agent is primary. The frozen guide answers it three times over
 * -- Stage 0's deliverables name `drivers/claude-code.ts` with
 * `claude -p --output-format stream-json`, Stage 3 fixes the driver by naming
 * `setting_sources`, and Stage 8 is where the "second agent (Codex)" arrives --
 * so this file is the primary agent's driver and `drivers/codex.ts` stays
 * Stage 8's.
 *
 * Two design points are load-bearing.
 *
 * **`settingSources: ['project']`, not `[]` (C-12).** Measured, not assumed: with
 * `[]` the target repository's own `CLAUDE.md` never reaches the agent, so the
 * D18.4 bootstrap block that is Stage 3's hidden condition is invisible and
 * "did it call `resolve` unprompted" measures nothing. `['project']` admits
 * exactly the disposable repo's own files, which is what the guide's own
 * rationale for the parameter asks for.
 *
 * **The transcript never lands in the workspace.** It is the record graders read;
 * written next to the code under test it would become another file the agent can
 * see and edit, and the trial would be grading a document the subject could
 * rewrite.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type {
  AgentDriver,
  AgentRunUsage,
  DriverResult,
  ToolCallRecord,
  TrialTask,
} from '../driver.ts';
import type { Trial } from '../sandbox.ts';
import { ABORT_MULTIPLIER } from '../budget.ts';
import { namespaceFindings, runInNamespace, type NamespaceObservations } from '../ns-sandbox.ts';
import type { BoundaryFinding } from '../isolation.ts';

/** Where the agent's own transcript events live, outside every trial workspace. */
export interface ClaudeCodeDriverOptions {
  /** Directory for transcripts. Must not be inside any trial workspace. */
  readonly transcriptDir: string;
  /** The tools the agent may use. Explicit, per the guide's `allowed_tools`. */
  readonly allowedTools: readonly string[];
  /** `host:port` destinations the trial may reach. */
  readonly allowedHosts: readonly string[];
  /** Absolute paths that must not exist inside the trial. */
  readonly deniedRoots: readonly string[];
  readonly executable?: string;
  readonly model?: string;
  /** C-12. Overridable so the literal `[]` reading stays runnable as a control. */
  readonly settingSources?: readonly string[];
  readonly permissionMode?: string;
  /** Extra names the trial environment must carry, e.g. a CA bundle path. */
  readonly extraEnvironment?: Readonly<Record<string, string>>;
}

export interface ClaudeCodeRunRecord {
  readonly result: DriverResult;
  /** The agent's own terminal verdict, verbatim, when it did not complete. */
  readonly terminalReason: string | null;
  /**
   * Tools the agent tried to use and was refused.
   *
   * A trial where the agent was prevented from doing the work is not a measurement
   * of the agent. Stage 3 hit this: a task asked for a file under `.claude/`, the
   * Write tool refused because that is a settings directory, and the agent --
   * correctly -- reported the blocker instead of working around it. Every rule then
   * failed and the record would have read as a failure to do the task.
   */
  readonly permissionDenials: readonly string[];
  /** Findings from the namespace mechanism, for the trial's isolation report. */
  readonly boundaryFindings: readonly BoundaryFinding[];
  readonly observations: NamespaceObservations | null;
  readonly exitStatus: number | null;
  readonly mechanismUnavailable: string | null;
}

interface StreamEvent {
  readonly type?: string;
  readonly subtype?: string;
  readonly timestamp?: string;
  readonly message?: {
    readonly content?: readonly { readonly type?: string; readonly name?: string }[];
  };
  readonly result?: unknown;
  readonly permission_denials?: readonly { readonly tool_name?: string }[];
  readonly total_cost_usd?: number;
  readonly duration_ms?: number;
  readonly num_turns?: number;
  readonly is_error?: boolean;
  readonly usage?: {
    readonly input_tokens?: number;
    readonly output_tokens?: number;
    readonly cache_read_input_tokens?: number;
    readonly cache_creation_input_tokens?: number;
  };
}

export class ClaudeCodeDriver implements AgentDriver {
  /** Vendor-neutral in the record, and never branched on downstream (F1). */
  readonly kind = 'claude-code';
  readonly #options: ClaudeCodeDriverOptions;
  #lastRecord: ClaudeCodeRunRecord | null = null;

  constructor(options: ClaudeCodeDriverOptions) {
    this.#options = options;
  }

  /** Everything the last run established beyond the port's own result. */
  get lastRecord(): ClaudeCodeRunRecord | null {
    return this.#lastRecord;
  }

  run(trial: Trial, task: TrialTask): Promise<DriverResult> {
    const options = this.#options;
    mkdirSync(options.transcriptDir, { recursive: true });
    const transcriptPath = join(options.transcriptDir, `${trial.trialId}-${task.taskId}.ndjson`);

    const argv = [
      options.executable ?? 'claude',
      '-p',
      task.prompt,
      '--output-format',
      'stream-json',
      '--verbose',
      '--setting-sources',
      (options.settingSources ?? ['project']).join(','),
      '--allowedTools',
      ...options.allowedTools,
      '--permission-mode',
      options.permissionMode ?? 'acceptEdits',
      // The turn cap is the prospective half of the budget: nothing bills by the
      // call in advance, so bounding the work is how cost is bounded before the
      // fact rather than regretted after it.
      '--max-turns',
      String(task.budget.maxToolCalls * ABORT_MULTIPLIER),
      ...(options.model === undefined ? [] : ['--model', options.model]),
    ];

    const startedAt = Date.now();
    const run = runInNamespace({
      command: argv,
      cwd: trial.workspaceRoot,
      environment: { ...trial.environment, ...options.extraEnvironment },
      allowedHosts: options.allowedHosts,
      deniedRoots: options.deniedRoots,
      timeoutSeconds: task.budget.wallClockSeconds * ABORT_MULTIPLIER,
    });
    const wallClockSeconds = (Date.now() - startedAt) / 1000;

    // Written whatever happened, including a crash: a trial with no transcript
    // is ungradeable, and an empty file says "nothing was emitted" where a
    // missing one says nothing at all.
    writeFileSync(transcriptPath, run.stdout, 'utf8');

    const events = parseStream(run.stdout);
    const toolCalls = toolCallsOf(events);
    const final = events.findLast((event) => event.type === 'result');

    const usage: AgentRunUsage | null =
      final === undefined
        ? null
        : {
            wallClockSeconds,
            costUsd: final.total_cost_usd ?? 0,
            inputTokens: final.usage?.input_tokens ?? 0,
            outputTokens: final.usage?.output_tokens ?? 0,
            cacheReadInputTokens: final.usage?.cache_read_input_tokens ?? 0,
            cacheCreationInputTokens: final.usage?.cache_creation_input_tokens ?? 0,
            turns: final.num_turns ?? 0,
          };

    const result: DriverResult = {
      // Completion is the agent's own terminal verdict, not the exit status: a
      // zero exit with no result event means the process ended without finishing
      // the turn, and calling that "completed" is how a truncated trial passes.
      completed: final !== undefined && final.subtype === 'success' && final.is_error !== true,
      toolCalls,
      transcriptRef: transcriptPath,
      usage,
    };

    this.#lastRecord = {
      result,
      permissionDenials: (final?.permission_denials ?? []).map(
        (denial) => denial.tool_name ?? 'unnamed tool',
      ),
      terminalReason:
        result.completed || final === undefined
          ? final === undefined
            ? 'the run produced no result event at all, so it ended without finishing a turn'
            : null
          : String(final.result ?? '').slice(0, 400) || 'the run reported an error with no message',
      boundaryFindings: namespaceFindings(run.observations, {
        unavailableReason: run.unavailableReason,
      }),
      observations: run.observations,
      exitStatus: run.status,
      mechanismUnavailable: run.unavailableReason,
    };

    return Promise.resolve(result);
  }
}

/** Parse NDJSON, skipping unparseable lines rather than failing the trial. */
export function parseStream(ndjson: string): StreamEvent[] {
  const events: StreamEvent[] = [];
  for (const line of ndjson.split('\n')) {
    const trimmed = line.trim();
    if (trimmed === '') continue;
    try {
      events.push(JSON.parse(trimmed) as StreamEvent);
    } catch {
      // A partial final line is what a killed process leaves behind. Dropping it
      // loses one event; throwing would lose the whole transcript.
      continue;
    }
  }
  return events;
}

/**
 * The tool calls the agent made, in order, with the agent's own timestamps.
 *
 * MCP tools arrive with a transport-qualified name (`mcp__ieos__resolve`); the
 * bare name is what a grader asks about, so both are kept: the name is
 * normalized and the original stays visible in the transcript.
 */
export function toolCallsOf(events: readonly StreamEvent[]): ToolCallRecord[] {
  const calls: ToolCallRecord[] = [];
  for (const event of events) {
    if (event.type !== 'assistant') continue;
    for (const block of event.message?.content ?? []) {
      if (block.type !== 'tool_use' || block.name === undefined) continue;
      calls.push({ name: block.name, at: event.timestamp ?? '' });
    }
  }
  return calls;
}

/** `mcp__ieos__resolve` and `resolve` are the same call to a grader. */
export function bareToolName(name: string): string {
  const parts = name.split('__');
  return parts.length > 1 ? (parts.at(-1) as string) : name;
}

/** Read a transcript back for grading, e.g. in a later report run. */
export function readTranscript(path: string): StreamEvent[] {
  return parseStream(readFileSync(path, 'utf8'));
}
