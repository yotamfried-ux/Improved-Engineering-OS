/**
 * The process that runs *inside* the Stage 3 namespace canary.
 *
 * No model is invoked. The canary drives the real MCP stdio server and the real
 * Claude hook entry so it proves the runtime chain itself:
 *
 *   resolve -> durable snapshot -> restart -> inspect -> observe -> attribution
 *   -> terminal flush -> explicit Evidence Plane acknowledgements.
 */

import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { join, resolve } from 'node:path';

const args = process.argv.slice(2);
const flag = (name: string): string | undefined => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};

const eosRootArg = flag('--eos-root') ?? '';
const projectRootArg = flag('--project') ?? '';
const repoSha = flag('--repo-sha') ?? '';
const sessionId = flag('--session') ?? 'sess_stage3_canary';
const runId = process.env['IEOS_RUN_ID'] ?? '';
if (eosRootArg === '' || projectRootArg === '' || repoSha === '' || runId === '') {
  process.stderr.write(
    'usage: stage3-canary-child.ts --eos-root DIR --project DIR --repo-sha SHA [--session ID]\n' +
      'IEOS_RUN_ID must be injected by the trusted canary host.\n',
  );
  process.exit(64);
}
const eosRoot = resolve(eosRootArg);
const projectRoot = resolve(projectRootArg);
const hook = join(eosRoot, 'packages', 'adapters', 'claude-code', 'src', 'hook.ts');
const mcp = join(eosRoot, 'packages', 'adapters', 'mcp', 'src', 'server-cli.ts');
const knownAssetId = 'asset_01K4V8Q2R7N3X5M9B2T6W1Y405';

const base = {
  session_id: sessionId,
  cwd: projectRoot,
  model: 'stage3-canary-no-model',
};

function invokeHook(payload: Record<string, unknown>): void {
  const run = spawnSync(
    process.execPath,
    [hook, '--eos-root', eosRoot, '--project', projectRoot, '--repo-sha', repoSha],
    {
      input: JSON.stringify(payload),
      encoding: 'utf8',
      env: process.env,
      maxBuffer: 8 * 1024 * 1024,
    },
  );
  if (run.stdout !== '') process.stdout.write(run.stdout);
  if (run.stderr !== '') process.stderr.write(run.stderr);
  if (run.status !== 0) {
    throw new Error(
      `Stage 3 canary hook ${String(payload['hook_event_name'])} exited ${String(run.status)}`,
    );
  }
}

interface JsonRpcReply {
  readonly id?: number;
  readonly result?: Record<string, unknown>;
  readonly error?: { readonly code: number; readonly message: string };
}

class StdioMcpClient {
  readonly #child: ChildProcessWithoutNullStreams;
  readonly #replies = new Map<number, JsonRpcReply>();
  readonly #waiters = new Map<number, (reply: JsonRpcReply) => void>();
  #nextId = 1;
  #buffer = '';
  #stderr = '';

  constructor() {
    this.#child = spawn(process.execPath, [mcp, '--eos-root', eosRoot, '--project', projectRoot], {
      cwd: projectRoot,
      env: process.env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    this.#child.stdout.setEncoding('utf8');
    this.#child.stderr.setEncoding('utf8');
    this.#child.stdout.on('data', (chunk: string) => this.#accept(chunk));
    this.#child.stderr.on('data', (chunk: string) => {
      this.#stderr += chunk;
    });
  }

  async initialize(): Promise<void> {
    const reply = await this.request('initialize', {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'ieos-stage3-canary', version: '0.1.0' },
    });
    if (reply.error !== undefined) {
      throw new Error(`MCP initialize failed: ${reply.error.code} ${reply.error.message}`);
    }
  }

  async callTool(
    name: string,
    toolArgs: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const reply = await this.request('tools/call', { name, arguments: toolArgs });
    if (reply.error !== undefined) {
      throw new Error(`MCP ${name} protocol error: ${reply.error.code} ${reply.error.message}`);
    }
    const result = reply.result;
    if (result === undefined || result['isError'] === true) {
      throw new Error(`MCP ${name} refused: ${JSON.stringify(result)}`);
    }
    return result;
  }

  async request(method: string, params: Record<string, unknown>): Promise<JsonRpcReply> {
    const id = this.#nextId++;
    const existing = this.#replies.get(id);
    if (existing !== undefined) return existing;
    const answer = new Promise<JsonRpcReply>((resolveReply, rejectReply) => {
      const timer = setTimeout(() => {
        this.#waiters.delete(id);
        rejectReply(
          new Error(
            `no MCP reply to ${method} within 5s` +
              (this.#stderr === '' ? '' : `; stderr: ${this.#stderr.slice(0, 1000)}`),
          ),
        );
      }, 5_000);
      this.#waiters.set(id, (reply) => {
        clearTimeout(timer);
        resolveReply(reply);
      });
    });
    this.#child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
    return await answer;
  }

  async close(): Promise<void> {
    if (this.#child.exitCode !== null) return;
    this.#child.stdin.end();
    await new Promise<void>((done) => {
      const timer = setTimeout(() => {
        this.#child.kill('SIGKILL');
        done();
      }, 2_000);
      this.#child.once('exit', () => {
        clearTimeout(timer);
        done();
      });
    });
  }

  #accept(chunk: string): void {
    this.#buffer += chunk;
    for (;;) {
      const newline = this.#buffer.indexOf('\n');
      if (newline < 0) return;
      const line = this.#buffer.slice(0, newline).trim();
      this.#buffer = this.#buffer.slice(newline + 1);
      if (line === '') continue;
      let reply: JsonRpcReply;
      try {
        reply = JSON.parse(line) as JsonRpcReply;
      } catch {
        throw new Error(`MCP stdout was not JSON-RPC: ${line.slice(0, 300)}`);
      }
      if (typeof reply.id !== 'number') continue;
      const waiter = this.#waiters.get(reply.id);
      if (waiter === undefined) this.#replies.set(reply.id, reply);
      else {
        this.#waiters.delete(reply.id);
        waiter(reply);
      }
    }
  }
}

function toolValue(result: Record<string, unknown>): Record<string, unknown> {
  const content = result['content'];
  if (!Array.isArray(content)) throw new Error('MCP tool result has no content array');
  for (const block of content) {
    if (block !== null && typeof block === 'object') {
      const text = (block as Record<string, unknown>)['text'];
      if (typeof text !== 'string') continue;
      try {
        const parsed = JSON.parse(text) as unknown;
        if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
          return parsed as Record<string, unknown>;
        }
      } catch {
        // Continue to a later text block if this one is diagnostic text.
      }
    }
  }
  throw new Error('MCP tool result has no JSON object text block');
}

async function main(): Promise<void> {
  invokeHook({ ...base, hook_event_name: 'SessionStart' });

  const resolveArgs = {
    task_hint: 'add a regression test for a bug fix',
    project_id: 'proj_stage3_canary',
    run_id: runId,
  };
  const first = new StdioMcpClient();
  let resolveResult: Record<string, unknown>;
  let resolved: Record<string, unknown>;
  try {
    await first.initialize();
    resolveResult = await first.callTool('resolve', resolveArgs);
    resolved = toolValue(resolveResult);
  } finally {
    await first.close();
  }

  const snapshotId = resolved['context_snapshot_id'];
  const items = resolved['items'];
  if (typeof snapshotId !== 'string' || !snapshotId.startsWith('ctx_')) {
    throw new Error('resolve did not return a context_snapshot_id');
  }
  if (
    !Array.isArray(items) ||
    !items.some((item) => (item as { id?: unknown }).id === knownAssetId)
  ) {
    throw new Error(`resolve did not expose the known regression-test asset ${knownAssetId}`);
  }
  invokeHook({
    ...base,
    hook_event_name: 'PostToolUse',
    tool_name: 'mcp__ieos__resolve',
    tool_input: resolveArgs,
    tool_response: resolveResult,
  });

  // New process: success here proves the snapshot came from durable SQLite, not
  // from the Map held by the resolve server process above.
  const second = new StdioMcpClient();
  try {
    await second.initialize();
    const snapshotInspectArgs = {
      handle: { kind: 'snapshot', id: snapshotId },
      run_id: runId,
    };
    const snapshotResult = await second.callTool('inspect', snapshotInspectArgs);
    const snapshotValue = toolValue(snapshotResult);
    if (snapshotValue['repo_sha'] !== repoSha) {
      throw new Error('restart-safe snapshot inspection returned the wrong repo_sha');
    }

    const assetInspectArgs = {
      handle: { kind: 'asset', id: knownAssetId },
      run_id: runId,
    };
    const assetResult = await second.callTool('inspect', assetInspectArgs);
    invokeHook({
      ...base,
      hook_event_name: 'PostToolUse',
      tool_name: 'mcp__ieos__inspect',
      tool_input: assetInspectArgs,
      tool_response: assetResult,
    });

    const observeArgs = {
      observation_id: `obs_${runId.replace(/^run_/u, '')}`,
      run_id: runId,
      kind: 'outcome',
      subject: { kind: 'asset', id: knownAssetId },
      note: 'Stage 3 no-model canary: runtime plumbing only; not evidence of agent benefit.',
    };
    const observationResult = await second.callTool('observe', observeArgs);
    const observed = toolValue(observationResult);
    if (observed['status'] !== 'recorded' && observed['status'] !== 'duplicate') {
      throw new Error('observe was not persisted to local staging');
    }
    invokeHook({
      ...base,
      hook_event_name: 'PostToolUse',
      tool_name: 'mcp__ieos__observe',
      tool_input: observeArgs,
      tool_response: observationResult,
    });
  } finally {
    await second.close();
  }

  invokeHook({ ...base, hook_event_name: 'SessionEnd' });
}

try {
  await main();
} catch (error) {
  process.stderr.write(
    `Stage 3 no-model evidence-chain canary failed: ${
      error instanceof Error ? error.message : String(error)
    }\n`,
  );
  process.exit(1);
}
