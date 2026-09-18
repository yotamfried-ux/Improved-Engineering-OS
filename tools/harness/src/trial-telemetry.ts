/**
 * Reading a trial's local evidence-delivery state out of the trial (D23, T7).
 *
 * COMPLETE means every runtime write path has drained, not merely raw telemetry.
 * The reader therefore reports the event queue and the observation/snapshot queue
 * separately and makes qualification fail closed if either still contains data.
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  openOutbox,
  SqliteEvidenceDocuments,
  SqliteOutbox,
  SqliteRunStateStore,
} from '@ieos/store-sqlite';

export interface TrialTelemetrySnapshot {
  readonly ingest_reachable_at_start: boolean;
  readonly flush_ever_failed: boolean;
  readonly outbox_events_remaining: number;
  readonly evidence_documents_remaining: number;
  readonly telemetry_state: 'COMPLETE' | 'INCOMPLETE';
  readonly qualification_eligible: boolean;
  readonly run_id: string | null;
  readonly ended_at: string | null;
  readonly unavailable_reason: string | null;
}

function unreadable(reason: string): TrialTelemetrySnapshot {
  return {
    ingest_reachable_at_start: false,
    flush_ever_failed: false,
    outbox_events_remaining: 0,
    evidence_documents_remaining: 0,
    telemetry_state: 'INCOMPLETE',
    qualification_eligible: false,
    run_id: null,
    ended_at: null,
    unavailable_reason: reason,
  };
}

export const outboxPathFor = (workspaceRoot: string): string =>
  join(workspaceRoot, '.ieos', 'outbox.sqlite');

export async function readTrialTelemetry(options: {
  readonly workspaceRoot: string;
  readonly runId: string;
}): Promise<TrialTelemetrySnapshot> {
  const path = outboxPathFor(options.workspaceRoot);
  if (!existsSync(path)) return unreadable(`no telemetry outbox exists at ${path}`);

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
    let state;
    try {
      state = new SqliteRunStateStore(db).get(options.runId);
    } catch (error) {
      return unreadable(
        `the run state could not be read: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
    if (state === undefined) {
      return unreadable(`the outbox holds no run state for ${options.runId}`);
    }

    const eventsRemaining = new SqliteOutbox(db).depth();
    const evidenceRemaining = await new SqliteEvidenceDocuments(db).pendingEvidenceCount();
    const allDrained = eventsRemaining === 0 && evidenceRemaining === 0;
    return {
      ingest_reachable_at_start: state.ingestReachableAtStart,
      flush_ever_failed: state.flushEverFailed,
      outbox_events_remaining: eventsRemaining,
      evidence_documents_remaining: evidenceRemaining,
      telemetry_state: state.telemetryState,
      qualification_eligible:
        state.qualificationEligible &&
        state.telemetryState === 'COMPLETE' &&
        state.ingestReachableAtStart &&
        !state.flushEverFailed &&
        allDrained,
      run_id: state.runId,
      ended_at: state.endedAt,
      unavailable_reason: null,
    };
  } finally {
    db.close();
  }
}
