/** The Claude Code hook composition root (Q-09, D23, D26). */

import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import {
  mintId,
  classifySessionKind,
  readSessionMarkers,
  type Clock,
  type Ingest,
  type RandomSource,
} from '@ieos/core';
import {
  openOutbox,
  SqliteEvidenceDocuments,
  SqliteOutbox,
  SqliteRunStateStore,
} from '@ieos/store-sqlite';
import {
  Emitter,
  Flusher,
  parseAttributeRegistry,
  runTelemetryState,
  type AttributeRegistry,
} from '@ieos/telemetry';
import {
  attributionEvents,
  failed,
  parseHookInput,
  planHook,
  succeeded,
  type HookEmission,
  type HookOutcome,
} from './hooks.ts';

const systemClock: Clock = {
  nowMs: () => Date.now(),
  nowIso: () => new Date().toISOString(),
};
const systemRandom: RandomSource = { bytes: (length) => new Uint8Array(randomBytes(length)) };

const UNCONFIGURED_INGEST: Ingest = {
  sendEvents: () =>
    Promise.resolve({ status: 'unreachable', reason: 'no Evidence Plane is enrolled' }),
  sendObservations: () =>
    Promise.resolve({ status: 'unreachable', reason: 'no Evidence Plane is enrolled' }),
  readMinimal: () => Promise.resolve(null),
  isReachable: () => Promise.resolve(false),
};

export const REACHABILITY_ATTESTATION = 'IEOS_INGEST_REACHABLE_AT_START';

export interface ReachabilityDecision {
  readonly reachable: boolean;
  readonly source: 'host-attestation' | 'absent' | 'unreadable';
  readonly note: string | null;
}

export function decideReachability(env: Record<string, string | undefined>): ReachabilityDecision {
  const declared = env[REACHABILITY_ATTESTATION];
  if (declared === 'true' || declared === 'false') {
    return { reachable: declared === 'true', source: 'host-attestation', note: null };
  }
  if (declared === undefined) {
    return {
      reachable: false,
      source: 'absent',
      note:
        `no ${REACHABILITY_ATTESTATION} was declared for this run, so it is not qualification ` +
        'eligible. A qualification run is launched by a host that attests this before any work.',
    };
  }
  return {
    reachable: false,
    source: 'unreadable',
    note:
      `${REACHABILITY_ATTESTATION} was set to something other than true or false, so this run ` +
      'is not qualification eligible',
  };
}

export interface HookDeps {
  readonly outboxPath: string;
  readonly registry: AttributeRegistry;
  readonly ingest: Ingest;
  readonly clock: Clock;
  readonly random: RandomSource;
  readonly repoSha: string;
  readonly eosRelease: string;
  readonly installationId: string;
  readonly projectId: string;
  readonly env: Record<string, string | undefined>;
}

export async function runHook(raw: string, deps: HookDeps): Promise<HookOutcome> {
  let input;
  try {
    input = parseHookInput(raw);
  } catch (error) {
    return failed(error instanceof Error ? error.message : String(error));
  }
  const plan = planHook(input);

  let db;
  try {
    mkdirSync(dirname(deps.outboxPath), { recursive: true });
    db = await openOutbox(deps.outboxPath);
  } catch (error) {
    return failed(`the telemetry outbox is unavailable: ${describe(error)}`);
  }

  try {
    const outbox = new SqliteOutbox(db);
    const evidence = new SqliteEvidenceDocuments(db);
    const runs = new SqliteRunStateStore(db);
    const sessionKey = input.session_id as string;
    const notes: string[] = [];

    let state = runs.forSession(sessionKey);
    if (state === undefined) {
      if (!plan.startsRun) {
        return succeeded(
          `ieos telemetry: no run has begun for this session, so this ${plan.event} was not ` +
            'recorded. Start a new session to begin one.',
        );
      }
      const injectedRunId = deps.env['IEOS_RUN_ID'];
      const runId =
        injectedRunId !== undefined && /^run_[A-Za-z0-9_]{1,64}$/u.test(injectedRunId)
          ? injectedRunId
          : mintId('run', deps.clock, deps.random);
      const decision = decideReachability(deps.env);
      if (decision.note !== null) notes.push(`ieos telemetry: ${decision.note}`);
      runs.begin(runId, decision.reachable, deps.clock.nowIso(), sessionKey);
      state = runs.forSession(sessionKey);
    }
    if (state === undefined) return failed('the run could not be recorded');

    const sessionKind = classifySessionKind(readSessionMarkers(deps.env));
    const emitter = new Emitter({
      identity: {
        project_id: deps.projectId,
        work_id: sessionKey,
        run_id: state.runId,
        installation_id: deps.installationId,
        session_kind: sessionKind,
        repo_sha: deps.repoSha,
        eos_release: deps.eosRelease,
        harness: {
          agent: 'claude-code',
          model: input.model ?? 'unknown',
          adapter_version: '0.1.0',
          available_capabilities_hash: 'sha256:0',
        },
      },
      registry: deps.registry,
      clock: deps.clock,
      random: deps.random,
    });

    const appendEmission = async (emission: HookEmission): Promise<void> => {
      const { event, dropped } = emitter.emit({
        eventType: emission.eventType,
        sourceType: 'agent',
        attributes: emission.attributes,
      });
      await outbox.append(event);
      if (dropped.length > 0) {
        notes.push(
          `ieos telemetry: ${String(dropped.length)} attribute(s) not in the allowlist were ` +
            `dropped: ${dropped.map((d) => `${d.key} (${d.reason})`).join(', ')}`,
        );
      }
    };

    if (plan.emit !== null) await appendEmission(plan.emit);
    for (const emission of attributionEvents(input)) await appendEmission(emission);

    if (!plan.flush) return succeeded(notes.join('\n'));

    const flusher = new Flusher({
      outbox,
      evidence,
      ingest: deps.ingest,
      sessionKind,
    });
    const result = await flusher.flush(plan.event === 'Stop' ? 'stop' : 'session_end');
    if (result.outcome !== 'drained') runs.markFlushFailed(state.runId);

    if (plan.finishesRun) {
      const everFailed = state.flushEverFailed || flusher.everFailed;
      runs.finish(
        runTelemetryState({
          runId: state.runId,
          ingestReachableAtStart: state.ingestReachableAtStart,
          remaining: result.remaining,
          everFailed,
        }),
        deps.clock.nowIso(),
        everFailed,
      );
    }

    if (result.outcome !== 'drained') {
      return failed(
        `${String(result.remaining)} telemetry/evidence item(s) could not be delivered (${result.outcome})`,
      );
    }
    if (plan.finishesRun && state.flushEverFailed) {
      return failed('an earlier boundary flush failed, so this run remains INCOMPLETE');
    }
    return succeeded(notes.join('\n'));
  } catch (error) {
    return failed(`unexpected telemetry failure: ${describe(error)}`);
  } finally {
    db.close();
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function readStdin(stream: AsyncIterable<Uint8Array>): Promise<string> {
  const chunks: Uint8Array[] = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

export function loadRegistry(eosRoot: string): AttributeRegistry {
  return parseAttributeRegistry(
    readFileSync(join(eosRoot, 'contracts', 'telemetry-attributes.yaml'), 'utf8'),
  );
}

export function readInstallation(projectRoot: string): {
  installationId: string;
  projectId: string;
} {
  const path = join(projectRoot, '.ieos', 'installation.json');
  if (!existsSync(path)) return { installationId: 'inst_unenrolled', projectId: 'proj_unknown' };
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as {
      installation_id?: unknown;
      project_id?: unknown;
    };
    return {
      installationId:
        typeof parsed.installation_id === 'string' ? parsed.installation_id : 'inst_unenrolled',
      projectId: typeof parsed.project_id === 'string' ? parsed.project_id : 'proj_unknown',
    };
  } catch {
    return { installationId: 'inst_unenrolled', projectId: 'proj_unknown' };
  }
}

export { UNCONFIGURED_INGEST, systemClock, systemRandom };
