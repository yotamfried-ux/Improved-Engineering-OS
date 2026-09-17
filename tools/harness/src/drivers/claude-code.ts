/** Claude Code driver for Stage 3 qualification. */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type {
  AgentDriver,
  AgentModel,
  AgentRunUsage,
  DriverResult,
  ToolCallRecord,
  TrialTask,
} from '../driver.ts';
import type { Trial } from '../sandbox.ts';
import { ABORT_MULTIPLIER } from '../budget.ts';
import {
  namespaceFindings,
  type NamespaceObservations,
  type UnixSocketMount,
} from '../ns-sandbox.ts';
import type { BoundaryFinding } from '../isolation.ts';
import {
  qualificationProfileFor,
  runQualificationProcess,
  type QualificationProfile,
} from '../qualification-profile.ts';
import { buildTrialIntegrityReport, type TrialIntegrityReport } from '../trial-integrity.ts';

export interface ClaudeCodeDriverOptions {
  readonly transcriptDir: string;
  readonly allowedTools: readonly string[];
  readonly allowedHosts: readonly string[];
  readonly deniedRoots: readonly string[];
  readonly unixSocketMounts?: readonly UnixSocketMount[];
  readonly executable?: string;
  readonly model?: string;
  readonly settingSources?: readonly string[];
  readonly permissionMode?: string;
  readonly extraEnvironment?: Readonly<Record<string, string>>;
  readonly qualificationProfile?: QualificationProfile;
  /** Host-only values checked for propagation, never written into evidence. */
  readonly forbiddenCredentialValues?: readonly string[];
}

export interface ClaudeCodeRunRecord {
  readonly result: DriverResult;
  readonly terminalReason: string | null;
  readonly permissionDenials: readonly string[];
  readonly boundaryFindings: readonly BoundaryFinding[];
  readonly observations: NamespaceObservations | null;
  readonly exitStatus: number | null;
  readonly mechanismUnavailable: string | null;
  readonly integrity: TrialIntegrityReport;
  readonly rescue: {
    readonly promptsSent: number;
    readonly interactiveStdin: boolean;
  };
}

export interface StreamEvent {
  readonly type?: string;
  readonly subtype?: string;
  readonly timestamp?: string;
  readonly message?: {
    readonly content?: readonly { readonly type?: string; readonly name?: string }[];
  };
  readonly result?: unknown;
  /** Present on the agent's `system`/`init` event: the model it actually ran. */
  readonly model?: string;
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

/**
 * The consumption a finished run reported, or `null` when it reported none.
 *
 * `totalInputTokens` is the sum the three input fields are meaningless apart
 * from: a real trial reports 36 uncached input tokens beside 879,130 cache
 * reads, so reading `inputTokens` alone understates the run by four orders of
 * magnitude. The parts are kept because they price differently.
 */
export function usageOf(
  final: StreamEvent | undefined,
  wallClockSeconds: number,
): AgentRunUsage | null {
  if (final === undefined) return null;
  const inputTokens = final.usage?.input_tokens ?? 0;
  const cacheReadInputTokens = final.usage?.cache_read_input_tokens ?? 0;
  const cacheCreationInputTokens = final.usage?.cache_creation_input_tokens ?? 0;
  return {
    wallClockSeconds,
    costUsd: final.total_cost_usd ?? 0,
    inputTokens,
    outputTokens: final.usage?.output_tokens ?? 0,
    cacheReadInputTokens,
    cacheCreationInputTokens,
    totalInputTokens: inputTokens + cacheReadInputTokens + cacheCreationInputTokens,
    turns: final.num_turns ?? 0,
  };
}

/**
 * What was asked for beside what the agent said it ran.
 *
 * Read from the run's own start-up event rather than assumed from the flag: a
 * model substituted underneath the harness and one that was never reported
 * look identical in the configuration, and only one of them invalidates a
 * comparison between arms.
 */
export function modelOf(events: readonly StreamEvent[], requested: string | null): AgentModel {
  const init = events.find((event) => event.type === 'system' && event.subtype === 'init');
  return { requested, resolved: init?.model ?? null };
}

export class ClaudeCodeDriver implements AgentDriver {
  readonly kind = 'claude-code';
  readonly #options: ClaudeCodeDriverOptions;
  #lastRecord: ClaudeCodeRunRecord | null = null;

  constructor(options: ClaudeCodeDriverOptions) {
    this.#options = options;
  }

  get lastRecord(): ClaudeCodeRunRecord | null {
    return this.#lastRecord;
  }

  async run(trial: Trial, task: TrialTask): Promise<DriverResult> {
    const options = this.#options;
    const profile = options.qualificationProfile ?? qualificationProfileFor();
    const settingSources = options.settingSources ?? ['project'];
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
      settingSources.join(','),
      '--allowedTools',
      ...options.allowedTools,
      '--permission-mode',
      options.permissionMode ?? 'acceptEdits',
      '--max-turns',
      String(task.budget.maxToolCalls * ABORT_MULTIPLIER),
      ...(options.model === undefined ? [] : ['--model', options.model]),
    ];
    const environment = { ...trial.environment, ...options.extraEnvironment };

    const startedAt = Date.now();
    const run = await runQualificationProcess({
      command: argv,
      cwd: trial.workspaceRoot,
      environment,
      allowedHosts: options.allowedHosts,
      deniedRoots: options.deniedRoots,
      declaredUnixSockets: trial.policy.filesystem.declaredUnixSockets ?? [],
      unixSocketMounts: options.unixSocketMounts ?? [],
      timeoutSeconds: task.budget.wallClockSeconds * ABORT_MULTIPLIER,
    });
    const wallClockSeconds = (Date.now() - startedAt) / 1000;

    writeFileSync(transcriptPath, run.stdout, 'utf8');
    const events = parseStream(run.stdout);
    const toolCalls = toolCallsOf(events);
    const final = events.findLast((event) => event.type === 'result');
    const usage = usageOf(final, wallClockSeconds);
    const model = modelOf(events, options.model ?? null);

    const result: DriverResult = {
      completed: final !== undefined && final.subtype === 'success' && final.is_error !== true,
      toolCalls,
      transcriptRef: transcriptPath,
      usage,
      model,
    };
    const rescue = {
      promptsSent: argv.filter((argument) => argument === '-p').length,
      interactiveStdin: false,
    } as const;
    const integrity = buildTrialIntegrityReport({
      profile,
      workspaceRoot: trial.workspaceRoot,
      artifactPath: transcriptPath,
      environment,
      allowedEnvironment: trial.policy.environment.allowedNames,
      allowedTools: options.allowedTools,
      settingSources,
      expectedPrompts: 1,
      promptsSent: rescue.promptsSent,
      interactiveStdin: rescue.interactiveStdin,
      ipcTarget: trial.environment['IEOS_INGEST_SOCKET'] ?? '',
      ...(options.forbiddenCredentialValues === undefined
        ? {}
        : { forbiddenCredentialValues: options.forbiddenCredentialValues }),
    });

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
      boundaryFindings:
        profile === 'linux-namespace-v1'
          ? namespaceFindings(run.observations, { unavailableReason: run.unavailableReason })
          : [],
      observations: run.observations,
      exitStatus: run.status,
      mechanismUnavailable: run.unavailableReason,
      integrity,
      rescue,
    };
    return result;
  }
}

export function parseStream(ndjson: string): StreamEvent[] {
  const events: StreamEvent[] = [];
  for (const line of ndjson.split('\n')) {
    const trimmed = line.trim();
    if (trimmed === '') continue;
    try {
      events.push(JSON.parse(trimmed) as StreamEvent);
    } catch {
      continue;
    }
  }
  return events;
}

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

export function bareToolName(name: string): string {
  const parts = name.split('__');
  return parts.length > 1 ? (parts.at(-1) as string) : name;
}

export function readTranscript(path: string): StreamEvent[] {
  return parseStream(readFileSync(path, 'utf8'));
}
