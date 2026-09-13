/**
 * Reading a trial's telemetry state out of the trial (D23, T7).
 *
 * T7 asks whether every trial's telemetry was complete. Until now the Stage 3
 * report answered that with a constant, and the evidence records carried nothing
 * it could have read instead -- `registration` and a trial-level
 * `qualification_eligible`, but none of the four facts the rule is actually
 * about. So this exists to put the reading in the evidence, where a report can
 * only report it.
 *
 * Every field here is read, not inferred. `flush_ever_failed` in particular:
 * `telemetry_state` already folds it in, but the fold is lossy -- INCOMPLETE
 * cannot say whether events were left queued or a batch failed and was re-sent
 * by another process -- and a report forced to guess which would be doing exactly
 * the inference this exists to remove.
 *
 * Fail closed throughout. A trial whose outbox is missing, unreadable, or holds
 * no row for the run is not a trial whose telemetry was fine; it is one we cannot
 * say anything about, and `qualification_eligible` is false with the reason
 * recorded.
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { openOutbox, SqliteOutbox, SqliteRunStateStore } from '@ieos/store-sqlite';

/** Exactly what T7 needs to be derivable, and nothing the report has to interpret. */
export interface TrialTelemetrySnapshot {
  readonly ingest_reachable_at_start: boolean;
  readonly flush_ever_failed: boolean;
  readonly outbox_events_remaining: number;
  readonly telemetry_state: 'COMPLETE' | 'INCOMPLETE';
  readonly qualification_eligible: boolean;
  readonly run_id: string | null;
  readonly ended_at: string | null;
  /** Why this snapshot says nothing useful, when it says nothing useful. */
  readonly unavailable_reason: string | null;
}

/** The state a trial we cannot read is in: ineligible, and honest about why. */
function unreadable(reason: string): TrialTelemetrySnapshot {
  return {
    ingest_reachable_at_start: false,
    flush_ever_failed: false,
    outbox_events_remaining: 0,
    telemetry_state: 'INCOMPLETE',
    qualification_eligible: false,
    run_id: null,
    ended_at: null,
    unavailable_reason: reason,
  };
}

/** Where `ieos init --with-hooks` puts a project's outbox. */
export const outboxPathFor = (workspaceRoot: string): string =>
  join(workspaceRoot, '.ieos', 'outbox.sqlite');

/**
 * Read the telemetry state a trial's run ended in.
 *
 * Addressed by run id rather than "the most recent run", deliberately. A trial
 * workspace should hold exactly one run, but if it ever held two, taking the
 * newest would silently attribute one run's completeness to another -- the same
 * class of mistake as S-7, where a registered run and an emitting run were
 * different runs that each looked internally consistent.
 */
export async function readTrialTelemetry(options: {
  readonly workspaceRoot: string;
  readonly runId: string;
}): Promise<TrialTelemetrySnapshot> {
  const path = outboxPathFor(options.workspaceRoot);
  if (!existsSync(path)) {
    return unreadable(`no telemetry outbox exists at ${path}`);
  }

  let db;
  try {
    db = await openOutbox(path);
  } catch (error) {
    return unreadable(
      `the telemetry outbox could not be opened: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  try {
    const state = new SqliteRunStateStore(db).get(options.runId);
    if (state === undefined) {
      // The run the harness registered produced no run state, which is the S-7
      // shape again: the id that was registered is not the id that ran.
      return unreadable(`the outbox holds no run state for ${options.runId}`);
    }
    const remaining = new SqliteOutbox(db).depth();
    return {
      ingest_reachable_at_start: state.ingestReachableAtStart,
      flush_ever_failed: state.flushEverFailed,
      outbox_events_remaining: remaining,
      telemetry_state: state.telemetryState,
      // Read from the store, which derives it under the contract's own
      // invariant, and then re-checked against the facts beside it. The store
      // cannot be wrong about this, but a snapshot that agreed with a store that
      // was would be a snapshot nobody could audit.
      qualification_eligible:
        state.qualificationEligible &&
        state.telemetryState === 'COMPLETE' &&
        state.ingestReachableAtStart &&
        !state.flushEverFailed &&
        remaining === 0,
      run_id: state.runId,
      ended_at: state.endedAt,
      unavailable_reason: null,
    };
  } finally {
    db.close();
  }
}
