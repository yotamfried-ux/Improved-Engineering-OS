/**
 * The hook executable (Q-09, D23, D26).
 *
 * The composition root: it reads the payload from stdin, opens the outbox, and
 * wires the pure pieces to real I/O. Every decision it makes is delegated to
 * `hooks.ts`, so what remains here is the part that has to touch the world.
 *
 * Three rules hold over everything below, and they are the reason the file
 * looks defensive:
 *
 *   It never exits 2. On `Stop` that code prevents stopping, which would let a
 *   failing network call hold a coding session open.
 *
 *   It never throws out of the process. An uncaught exception in a hook is an
 *   unhandled rejection with a nonzero exit and a stack trace in the user's
 *   terminal, for a telemetry problem.
 *
 *   It never blocks for long. Terminal boundaries flush with bounded retries;
 *   a session's teardown must not wait on an unreachable plane.
 */

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
import { openOutbox, SqliteOutbox, SqliteRunStateStore } from '@ieos/store-sqlite';
import {
  Emitter,
  Flusher,
  parseAttributeRegistry,
  runTelemetryState,
  type AttributeRegistry,
} from '@ieos/telemetry';
import { failed, parseHookInput, planHook, succeeded, type HookOutcome } from './hooks.ts';

const systemClock: Clock = {
  nowMs: () => Date.now(),
  nowIso: () => new Date().toISOString(),
};
const systemRandom: RandomSource = { bytes: (length) => new Uint8Array(randomBytes(length)) };

/**
 * No Evidence Plane is configured at Stage 2 unless one has been enrolled.
 *
 * An Ingest that reports itself unreachable is not a stub standing in for a
 * working one: it is the accurate description of a machine with no credential,
 * and it makes every run INCOMPLETE, which is the truthful state. A stub that
 * reported success would make an unconfigured machine look measured.
 */
const UNCONFIGURED_INGEST: Ingest = {
  sendEvents: () =>
    Promise.resolve({ status: 'unreachable', reason: 'no Evidence Plane is enrolled' }),
  sendObservations: () =>
    Promise.resolve({ status: 'unreachable', reason: 'no Evidence Plane is enrolled' }),
  readMinimal: () => Promise.resolve(null),
  isReachable: () => Promise.resolve(false),
};

/**
 * The launch-context variable by which a trusted host attests reachability.
 *
 * Exported so the harness sets the same name the hook reads. A second spelling
 * of this would fail open silently: the hook would fall back to its own probe,
 * which inside a trial is always false, and the run would look ineligible for a
 * reason nobody could see.
 */
export const REACHABILITY_ATTESTATION = 'IEOS_INGEST_REACHABLE_AT_START';

export interface ReachabilityDecision {
  readonly reachable: boolean;
  readonly source: 'host-attestation' | 'absent' | 'unreadable';
  /** Set whenever the answer was not a clean attestation. Printed, never silent. */
  readonly note: string | null;
}

/**
 * Decide `ingest_reachable_at_start` (D23).
 *
 * D23 requires eligibility *declared before work starts*; it does not require
 * that the component writing the declaration be the one that performed the
 * probe. That distinction is what makes this possible at all. When the plane's
 * credential deliberately lives outside the agent's namespace, a hook inside
 * that namespace cannot reach the plane to probe it -- by design -- so a hook
 * insisting on its own probe could never honestly declare `true`, and every
 * trial would be ineligible however well the machine was configured.
 *
 * So the authority splits: the trusted host that launches the run is the
 * authority on the fact, and states it in the same breath as it injects
 * `IEOS_RUN_ID`; the hook remains the sole author of the run's lifecycle. The
 * field means "at the declared start of this run, the trusted host verified the
 * configured ingest path was reachable" -- not "the hook checked".
 *
 * There is no fall back to the hook's own probe, and that is a correction rather
 * than a simplification. An earlier version of this function probed when no
 * attestation was present, which was safe only for as long as the hook's only
 * `Ingest` was the unconfigured one that always answered false. Once a hook
 * inside a trial could reach a host proxy, the same fallback would have let a
 * host that simply forgot to attest get `true` from the proxy -- a declaration
 * D23 requires up front, arrived at afterwards by the run's own machinery. So:
 *
 *   "true"   -> true
 *   "false"  -> false
 *   anything else, including absent -> false, with a note
 *
 * Nothing is lost: without a proxy the only implementation is the unconfigured
 * one, and with a proxy an explicit declaration is exactly what we want to
 * require. The gain is that a future `Ingest` cannot quietly change what D23
 * means here.
 *
 * This function can only ever remove eligibility. Granting it also requires the
 * run to end COMPLETE, which is decided by what the flushes actually did.
 */
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

/**
 * Run one hook invocation.
 *
 * Exported so the whole path is testable without spawning a process: the
 * exit-code rule is the property that matters most, and a test that could only
 * observe it through a real agent would not be run.
 */
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
    // No outbox means no telemetry at all. Reported, never fatal.
    return failed(`the telemetry outbox is unavailable: ${describe(error)}`);
  }

  try {
    const outbox = new SqliteOutbox(db);
    const runs = new SqliteRunStateStore(db);
    const sessionKey = input.session_id as string;
    // Declared before the run block, because opening a run can itself produce a
    // note worth printing (a launch context that attested nonsense).
    const notes: string[] = [];

    let state = runs.forSession(sessionKey);
    if (state === undefined) {
      if (!plan.startsRun) {
        // A hook arriving before SessionStart -- a session that began before
        // EOS was installed, say. Minting a run here would produce one that
        // never declared its eligibility, and D23 requires that declared up
        // front. Recorded as a skip rather than guessed at.
        return succeeded(
          `ieos telemetry: no run has begun for this session, so this ${plan.event} was not ` +
            'recorded. Start a new session to begin one.',
        );
      }
      // A pre-registered run id, when one was injected, and a fresh one otherwise.
      //
      // D36 has a service principal register `run_id -> origin_class` *before* the
      // run's first event, which is impossible if the emitter invents the id
      // afterwards: the registered run then produces no events and the emitting run
      // was never registered, so the plane correctly stamps `operational` and the
      // harness's registration describes a run that never happened. Stage 3 found
      // exactly that (S-7) -- the harness registered `run_s3_...` and the outbox
      // carried `run_01M28...`.
      //
      // Honouring the variable trusts whoever set the environment. For a trial that
      // is the harness, which is the service principal; for anyone else it is no
      // privilege escalation, because registering a class still needs the service
      // token and this only names a run.
      const injectedRunId = deps.env['IEOS_RUN_ID'];
      const runId =
        injectedRunId !== undefined && /^run_[A-Za-z0-9_]{1,64}$/u.test(injectedRunId)
          ? injectedRunId
          : mintId('run', deps.clock, deps.random);
      // Reachability is declared before any work, not inferred afterwards (D23).
      const decision = decideReachability(deps.env);
      if (decision.note !== null) notes.push(`ieos telemetry: ${decision.note}`);
      runs.begin(runId, decision.reachable, deps.clock.nowIso(), sessionKey);
      state = runs.forSession(sessionKey);
    }
    if (state === undefined) return failed('the run could not be recorded');

    const emitter = new Emitter({
      identity: {
        project_id: deps.projectId,
        work_id: sessionKey,
        run_id: state.runId,
        installation_id: deps.installationId,
        session_kind: classifySessionKind(readSessionMarkers(deps.env)),
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
      // One emitter per hook PROCESS, which is what each invocation is. The
      // sequence therefore restarts at zero every time -- correct, because
      // `emitter_id` is what distinguishes them, and it is exactly the case
      // R-11 added `emitter_id` for.
    });

    if (plan.emit !== null) {
      const { event, dropped } = emitter.emit({
        eventType: plan.emit.eventType,
        sourceType: 'agent',
        attributes: plan.emit.attributes,
      });
      await outbox.append(event);
      if (dropped.length > 0) {
        // Visible, because a dropped attribute is instrumentation drifting from
        // the contract and nothing else would report it.
        notes.push(
          `ieos telemetry: ${String(dropped.length)} attribute(s) not in the allowlist were ` +
            `dropped: ${dropped.map((d) => `${d.key} (${d.reason})`).join(', ')}`,
        );
      }
    }

    if (!plan.flush) return succeeded(notes.join('\n'));

    const flusher = new Flusher({
      outbox,
      ingest: deps.ingest,
      sessionKind: classifySessionKind(readSessionMarkers(deps.env)),
    });
    const result = await flusher.flush(plan.event === 'Stop' ? 'stop' : 'session_end');

    if (plan.finishesRun) {
      runs.finish(
        runTelemetryState({
          runId: state.runId,
          ingestReachableAtStart: state.ingestReachableAtStart,
          remaining: result.remaining,
          everFailed: flusher.everFailed,
        }),
        deps.clock.nowIso(),
      );
    }

    if (result.outcome !== 'drained') {
      return failed(
        `${String(result.remaining)} event(s) could not be delivered (${result.outcome})`,
      );
    }
    return succeeded(notes.join('\n'));
  } catch (error) {
    // The catch-all that keeps the third rule. Anything unanticipated becomes a
    // reported telemetry failure rather than a stack trace in someone's
    // terminal during their coding session.
    return failed(`unexpected telemetry failure: ${describe(error)}`);
  } finally {
    db.close();
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Read the whole of stdin. A hook payload arrives as one JSON document. */
export async function readStdin(stream: AsyncIterable<Uint8Array>): Promise<string> {
  const chunks: Uint8Array[] = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

/** Load the attribute allowlist from the EOS checkout the hook was installed from. */
export function loadRegistry(eosRoot: string): AttributeRegistry {
  return parseAttributeRegistry(
    readFileSync(join(eosRoot, 'contracts', 'telemetry-attributes.yaml'), 'utf8'),
  );
}

/** The installation this project was initialised with, or a placeholder. */
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
