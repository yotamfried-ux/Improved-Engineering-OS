/** Codex CLI driver for the parallel Stage 3 experiment. */

import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
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
import { outboxPathFor } from '../trial-telemetry.ts';
import {
  loadRegistry,
  readInstallation,
  runHook,
  socketIngest,
  systemClock,
  systemRandom,
} from '../../../../packages/adapters/claude-code/src/index.ts';

export interface CodexMcpServer {
  readonly command: string;
  readonly args: readonly string[];
}

export interface CodexDriverOptions {
  readonly eosRoot: string;
  readonly transcriptDir: string;
  readonly allowedHosts: readonly string[];
  readonly deniedRoots: readonly string[];
  readonly telemetrySocketPath: string;
  readonly authSourceDir: string;
  readonly mcpServer?: CodexMcpServer;
  readonly unixSocketMounts?: readonly UnixSocketMount[];
  readonly executable?: string;
  readonly model: string;
  readonly qualificationProfile?: QualificationProfile;
  readonly forbiddenCredentialValues?: readonly string[];
}

export interface CodexEvent {
  readonly type?: string;
  readonly timestamp?: string;
  readonly model?: string;
  readonly server_model?: string;
  readonly usage?: {
    readonly input_tokens?: number;
    readonly cached_input_tokens?: number;
    readonly cache_write_input_tokens?: number;
    readonly output_tokens?: number;
    readonly reasoning_output_tokens?: number;
  };
  readonly error?: unknown;
  readonly item?: {
    readonly type?: string;
    readonly command?: string;
    readonly aggregated_output?: string;
    readonly exit_code?: number;
    readonly status?: string;
    readonly changes?: unknown;
    readonly server?: string;
    readonly tool?: string;
    readonly arguments?: unknown;
    readonly result?: {
      readonly content?: unknown;
      readonly structured_content?: unknown;
    };
    readonly error?: unknown;
  };
}

export interface CodexRunRecord {
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isOptionalString(value: unknown): boolean {
  return value === undefined || typeof value === 'string';
}

function isTokenCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && Number.isInteger(value) && value >= 0;
}

function isCodexUsage(value: unknown): value is NonNullable<CodexEvent['usage']> {
  if (!isRecord(value)) return false;
  if (
    !isTokenCount(value['input_tokens']) ||
    !isTokenCount(value['cached_input_tokens']) ||
    !isTokenCount(value['cache_write_input_tokens']) ||
    !isTokenCount(value['output_tokens'])
  ) {
    return false;
  }
  return value['reasoning_output_tokens'] === undefined || isTokenCount(value['reasoning_output_tokens']);
}

function isCodexEvent(value: unknown): value is CodexEvent {
  if (!isRecord(value) || typeof value['type'] !== 'string' || value['type'] === '') return false;
  if (
    !isOptionalString(value['timestamp']) ||
    !isOptionalString(value['model']) ||
    !isOptionalString(value['server_model'])
  ) {
    return false;
  }
  if (value['usage'] !== undefined && !isCodexUsage(value['usage'])) return false;
  if (value['item'] !== undefined && !isRecord(value['item'])) return false;
  return true;
}

export function parseCodexEvents(ndjson: string): CodexEvent[] {
  const events: CodexEvent[] = [];
  for (const line of ndjson.split('\n')) {
    const trimmed = line.trim();
    if (trimmed === '') continue;
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (isCodexEvent(parsed)) events.push(parsed);
    } catch {
      // Diagnostics are not upgraded into structured evidence.
    }
  }
  return events;
}

export function codexCompleted(
  events: readonly CodexEvent[],
  status: number | null,
  timedOut = false,
): boolean {
  if (timedOut || status !== 0) return false;
  if (events.some((event) => event.type === 'turn.failed' || event.type === 'error')) return false;
  return events.some((event) => event.type === 'turn.completed');
}

export function codexModelOf(events: readonly CodexEvent[], requested: string): AgentModel {
  const reported = events
    .map((event) => event.server_model ?? event.model)
    .find((value): value is string => typeof value === 'string' && value !== '');
  return { requested, resolved: reported ?? null };
}

export function codexUsageOf(
  events: readonly CodexEvent[],
  wallClockSeconds: number,
): AgentRunUsage | null {
  const completed = events.filter((event) => event.type === 'turn.completed' && event.usage);
  if (completed.length === 0) return null;
  const totalInput = completed.reduce((sum, event) => sum + (event.usage?.input_tokens ?? 0), 0);
  const cached = completed.reduce((sum, event) => sum + (event.usage?.cached_input_tokens ?? 0), 0);
  const cacheWrite = completed.reduce(
    (sum, event) => sum + (event.usage?.cache_write_input_tokens ?? 0),
    0,
  );
  return {
    wallClockSeconds,
    costUsd: null,
    inputTokens: Math.max(0, totalInput - cached - cacheWrite),
    outputTokens: completed.reduce((sum, event) => sum + (event.usage?.output_tokens ?? 0), 0),
    cacheReadInputTokens: cached,
    cacheCreationInputTokens: cacheWrite,
    totalInputTokens: totalInput,
    turns: completed.length,
  };
}

function itemEvents(events: readonly CodexEvent[]): NonNullable<CodexEvent['item']>[] {
  return events
    .filter((event) => event.type === 'item.completed' && event.item !== undefined)
    .map((event) => event.item as NonNullable<CodexEvent['item']>);
}

export function codexToolCallsOf(events: readonly CodexEvent[]): ToolCallRecord[] {
  const calls: ToolCallRecord[] = [];
  for (const event of events) {
    if (event.type !== 'item.completed' || event.item === undefined) continue;
    const item = event.item;
    let name: string | null = null;
    if (item.type === 'command_execution') name = 'Bash';
    if (item.type === 'file_change') name = 'Edit';
    if (item.type === 'web_search') name = 'WebSearch';
    if (item.type === 'mcp_tool_call' && item.server && item.tool) {
      name = `mcp__${item.server}__${item.tool}`;
    }
    if (name !== null) calls.push({ name, at: event.timestamp ?? '' });
  }
  return calls;
}

export function unexpectedCodexToolCalls(
  calls: readonly ToolCallRecord[],
  ieosEnabled: boolean,
): string[] {
  const allowed = new Set([
    'Bash',
    'Edit',
    ...(ieosEnabled
      ? ['mcp__ieos__resolve', 'mcp__ieos__inspect', 'mcp__ieos__expand', 'mcp__ieos__observe']
      : []),
  ]);
  return [...new Set(calls.map((call) => call.name).filter((name) => !allowed.has(name)))];
}

function tomlString(value: string): string {
  return JSON.stringify(value);
}

export function codexMcpOverride(server?: CodexMcpServer): string {
  if (server === undefined) return 'mcp_servers={}';
  const args = server.args.map(tomlString).join(', ');
  return (
    'mcp_servers={ ieos={ ' +
    `command=${tomlString(server.command)}, args=[${args}], required=true, ` +
    'enabled_tools=["resolve","inspect","expand","observe"] } }'
  );
}

export function codexArgsFor(options: {
  readonly model: string;
  readonly prompt: string;
  readonly mcpServer?: CodexMcpServer;
}): string[] {
  return [
    '--ask-for-approval',
    'never',
    '-c',
    'cli_auth_credentials_store="file"',
    '-c',
    'check_for_update_on_startup=false',
    // Do not add --sandbox here. Codex permission profiles and the legacy
    // sandbox flags are mutually exclusive; a legacy flag would silently take
    // precedence and restore broad filesystem read access, including CODEX_HOME.
    '-c',
    'default_permissions="ieos-stage3"',
    '-c',
    'permissions.ieos-stage3.extends=":workspace"',
    '-c',
    'permissions.ieos-stage3.filesystem.":root"="deny"',
    '-c',
    'permissions.ieos-stage3.filesystem.":minimal"="read"',
    '-c',
    'permissions.ieos-stage3.filesystem.":tmpdir"="deny"',
    '-c',
    'permissions.ieos-stage3.filesystem.":slash_tmp"="deny"',
    '-c',
    'permissions.ieos-stage3.network.enabled=false',
    '-c',
    'web_search="disabled"',
    '-c',
    'features.multi_agent=false',
    '-c',
    'features.apps=false',
    '-c',
    'features.remote_plugin=false',
    '-c',
    codexMcpOverride(options.mcpServer),
    'exec',
    '--json',
    '--model',
    options.model,
    '--ephemeral',
    '--ignore-user-config',
    '--ignore-rules',
    '--skip-git-repo-check',
    options.prompt,
  ];
}

function describe(value: unknown): string {
  if (value instanceof Error) return value.message;
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function permissionDenialsOf(events: readonly CodexEvent[], stderr: string): string[] {
  const candidates = [
    stderr,
    ...events
      .filter((event) => event.type === 'turn.failed' || event.type === 'error')
      .map((event) => describe(event.error)),
    ...itemEvents(events)
      .filter((item) => item.status === 'failed' || item.error !== undefined)
      .map((item) => describe(item.error ?? item.aggregated_output ?? 'failed tool item')),
  ];
  return candidates.filter((message) => /permission|sandbox|denied|not allowed/iu.test(message));
}

function terminalReasonOf(
  events: readonly CodexEvent[],
  status: number | null,
  stderr: string,
  timedOut: boolean,
): string | null {
  if (timedOut) return 'the Codex run exceeded the trial wall-clock bound';
  const failed = events.find((event) => event.type === 'turn.failed' || event.type === 'error');
  if (failed !== undefined) return describe(failed.error).slice(0, 400);
  if (status !== 0) {
    return (stderr.trim() || `codex exited with status ${String(status)}`).slice(0, 400);
  }
  if (!events.some((event) => event.type === 'turn.completed')) {
    return 'the Codex run produced no turn.completed event';
  }
  return null;
}

export function prepareIsolatedCodexHome(sourceDir: string): string {
  const isolated = mkdtempSync(join(tmpdir(), 'ieos-codex-home-'));
  const auth = join(sourceDir, 'auth.json');
  if (!existsSync(auth)) {
    rmSync(isolated, { recursive: true, force: true });
    throw new Error(
      `Codex auth.json was not found at ${auth}; refusing to fall back to ambient user configuration`,
    );
  }
  copyFileSync(auth, join(isolated, 'auth.json'));
  return isolated;
}

/**
 * Codex may refresh ChatGPT-managed credentials while it runs. Persist only that
 * refreshed auth file back to the trusted host; everything else in the isolated
 * CODEX_HOME remains disposable so ambient config can never enter a later trial.
 */
export function persistIsolatedCodexAuth(isolatedDir: string, sourceDir: string): void {
  const refreshed = join(isolatedDir, 'auth.json');
  if (!existsSync(refreshed)) return;
  copyFileSync(refreshed, join(sourceDir, 'auth.json'));
}

function repoSha(workspaceRoot: string): string {
  return execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: workspaceRoot,
    encoding: 'utf8',
    windowsHide: true,
  }).trim();
}

export class CodexDriver implements AgentDriver {
  readonly kind = 'codex';
  readonly #options: CodexDriverOptions;
  #lastRecord: CodexRunRecord | null = null;

  constructor(options: CodexDriverOptions) {
    this.#options = options;
  }

  get lastRecord(): CodexRunRecord | null {
    return this.#lastRecord;
  }

  async run(trial: Trial, task: TrialTask): Promise<DriverResult> {
    const options = this.#options;
    const profile = options.qualificationProfile ?? qualificationProfileFor();
    mkdirSync(options.transcriptDir, { recursive: true });
    const transcriptPath = join(options.transcriptDir, `${trial.trialId}-${task.taskId}.ndjson`);
    const isolatedCodexHome = prepareIsolatedCodexHome(options.authSourceDir);
    try {
      const environment = { ...trial.environment, CODEX_HOME: isolatedCodexHome };
    const args = codexArgsFor({
      model: options.model,
      prompt: task.prompt,
      ...(options.mcpServer === undefined ? {} : { mcpServer: options.mcpServer }),
    });
    const executable = options.executable ?? 'codex';
    const sessionId = `codex-${trial.trialId}-${String(process.pid)}`;
    const installation = readInstallation(trial.workspaceRoot);
    const ingest = socketIngest({ socketPath: options.telemetrySocketPath });
    const hookDeps = {
      outboxPath: outboxPathFor(trial.workspaceRoot),
      registry: loadRegistry(options.eosRoot),
      ingest,
      clock: systemClock,
      random: systemRandom,
      repoSha: repoSha(trial.workspaceRoot),
      eosRelease: '0.1.0',
      installationId: installation.installationId,
      projectId: installation.projectId,
      env: environment,
      harnessAgent: 'codex',
    } as const;

    await runHook(
      JSON.stringify({
        hook_event_name: 'SessionStart',
        session_id: sessionId,
        startup_reason: 'stage3-codex',
        model: options.model,
      }),
      hookDeps,
    );

      const startedAt = Date.now();
      const run = await runQualificationProcess({
        command: [executable, ...args],
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
      const events = parseCodexEvents(run.stdout);

      for (const item of itemEvents(events)) {
        let toolName: string | null = null;
        let toolInput: unknown = {};
        let toolResponse: unknown = { success: item.status !== 'failed' };
        if (item.type === 'command_execution') {
          toolName = 'Bash';
          toolInput = { command: item.command ?? '' };
          toolResponse = { success: item.exit_code === 0, output: item.aggregated_output ?? '' };
        } else if (item.type === 'file_change') {
          toolName = 'Edit';
          toolInput = { changes: item.changes ?? null };
        } else if (item.type === 'mcp_tool_call' && item.server && item.tool) {
          toolName = `mcp__${item.server}__${item.tool}`;
          toolInput = item.arguments ?? {};
          toolResponse = {
            success: item.error === undefined && item.status !== 'failed',
            structuredContent: item.result?.structured_content,
            content: item.result?.content,
            error: item.error,
          };
        }
        if (toolName === null) continue;
        await runHook(
          JSON.stringify({
            hook_event_name: 'PostToolUse',
            session_id: sessionId,
            tool_name: toolName,
            tool_input: toolInput,
            tool_response: toolResponse,
            model: options.model,
          }),
          hookDeps,
        );
      }

      await runHook(
        JSON.stringify({ hook_event_name: 'Stop', session_id: sessionId, model: options.model }),
        hookDeps,
      );
      await runHook(
        JSON.stringify({
          hook_event_name: 'SessionEnd',
          session_id: sessionId,
          exit_reason: codexCompleted(events, run.status, run.timedOut) ? 'completed' : 'error',
          model: options.model,
        }),
        hookDeps,
      );

      const toolCalls = codexToolCallsOf(events);
      const usage = codexUsageOf(events, wallClockSeconds);
      const model = codexModelOf(events, options.model);
      const result: DriverResult = {
        completed: codexCompleted(events, run.status, run.timedOut),
        toolCalls,
        transcriptRef: transcriptPath,
        usage,
        model,
      };
      const rescue = { promptsSent: 1, interactiveStdin: false } as const;
      const baseIntegrity = buildTrialIntegrityReport({
        profile,
        workspaceRoot: trial.workspaceRoot,
        artifactPath: transcriptPath,
        environment,
        allowedEnvironment: trial.policy.environment.allowedNames,
        allowedTools: [
          'Bash',
          'Edit',
          ...(options.mcpServer === undefined
            ? []
            : [
                'mcp__ieos__resolve',
                'mcp__ieos__inspect',
                'mcp__ieos__expand',
                'mcp__ieos__observe',
              ]),
        ],
        settingSources: ['project'],
        expectedPrompts: 1,
        promptsSent: rescue.promptsSent,
        interactiveStdin: rescue.interactiveStdin,
        ipcTarget: trial.environment['IEOS_INGEST_SOCKET'] ?? '',
        ...(options.forbiddenCredentialValues === undefined
          ? {}
          : { forbiddenCredentialValues: options.forbiddenCredentialValues }),
      });
      const unexpectedTools = unexpectedCodexToolCalls(toolCalls, options.mcpServer !== undefined);
      const observedToolFinding = {
        check: 'observed-tool-allowlist',
        status: unexpectedTools.length === 0 ? ('PASS' as const) : ('FAIL' as const),
        evidence:
          unexpectedTools.length === 0
            ? 'every observed Codex tool call belongs to the trial arm allowlist'
            : `unexpected observed Codex tool calls: ${unexpectedTools.join(', ')}`,
      };
      const integrity: TrialIntegrityReport = {
        ...baseIntegrity,
        qualificationEligible: baseIntegrity.qualificationEligible && unexpectedTools.length === 0,
        findings: [...baseIntegrity.findings, observedToolFinding],
        reasons: [
          ...baseIntegrity.reasons,
          ...(unexpectedTools.length === 0
            ? []
            : [`observed-tool-allowlist: ${observedToolFinding.evidence}`]),
        ],
      };

      this.#lastRecord = {
        result,
        terminalReason: terminalReasonOf(events, run.status, run.stderr, run.timedOut),
        permissionDenials: permissionDenialsOf(events, run.stderr),
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
    } finally {
      try {
        persistIsolatedCodexAuth(isolatedCodexHome, options.authSourceDir);
      } finally {
        rmSync(isolatedCodexHome, { recursive: true, force: true });
      }
    }
  }
}
