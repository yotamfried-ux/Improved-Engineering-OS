/**
 * Reading a trial's telemetry state, including every way it can be unreadable.
 *
 * The failure cases carry the weight. A snapshot that quietly reported a clean
 * run for a trial it could not read would put T7 back where it started: a row
 * that says PASS without having read anything.
 */

import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import type { RunTelemetryState } from '@ieos/core';
import { openOutbox, SqliteOutbox, SqliteRunStateStore } from '@ieos/store-sqlite';
import { afterEach, describe, expect, it } from 'vitest';
import { outboxPathFor, readTrialTelemetry } from '../src/trial-telemetry.ts';

const scratch: string[] = [];
afterEach(() => {
  for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function workspace(): string {
  const dir = mkdtempSync(join(tmpdir(), 'ieos-trial-telemetry-'));
  scratch.push(dir);
  return dir;
}

/** Build an outbox in the state a real run would have left it in. */
async function withRun(options: {
  readonly workspaceRoot: string;
  readonly runId: string;
  readonly reachableAtStart: boolean;
  readonly queued?: number;
  readonly everFailed?: boolean;
  readonly finish?: boolean;
  /** Write a terminal state the contract would never produce, to test the re-check. */
  readonly forceTerminal?: RunTelemetryState;
}): Promise<void> {
  const path = outboxPathFor(options.workspaceRoot);
  mkdirSync(dirname(path), { recursive: true });
  const db = await openOutbox(path);
  try {
    const runs = new SqliteRunStateStore(db);
    // The table is created by the outbox's own constructor, then filled by hand.
    // `append` validates against the envelope contract, which is right for the
    // outbox and beside the point here: this test is about the reader, and a
    // valid envelope fixture would only add a second thing that can drift.
    new SqliteOutbox(db);
    runs.begin(options.runId, options.reachableAtStart, '2026-09-13T00:00:00.000Z', 'sess_1');
    for (let index = 0; index < (options.queued ?? 0); index += 1) {
      db.prepare(
        `insert into outbox (event_id, installation_id, emitter_id, sequence, queued_at,
                             envelope_json)
         values (?, 'inst_a', 'emit_a', ?, '2026-09-13T00:01:00.000Z', '{}')`,
      ).run(`evt_${String(index)}`, index);
    }
    if (options.finish !== false) {
      // The contract's own rule, restated here rather than imported: a test that
      // computed the expected state with the same function the code trusts could
      // not tell a broken rule from a correct one.
      const complete = (options.queued ?? 0) === 0 && options.everFailed !== true;
      runs.finish(
        options.forceTerminal ?? {
          run_id: options.runId,
          telemetry_state: complete ? 'COMPLETE' : 'INCOMPLETE',
          qualification_eligible: complete && options.reachableAtStart,
          ingest_reachable_at_start: options.reachableAtStart,
        },
        '2026-09-13T00:05:00.000Z',
        options.everFailed ?? false,
      );
    }
  } finally {
    db.close();
  }
}

describe('the telemetry state T7 has to read (D23)', () => {
  it('reads a clean run as complete and eligible', async () => {
    const workspaceRoot = workspace();
    await withRun({ workspaceRoot, runId: 'run_ok', reachableAtStart: true });
    expect(await readTrialTelemetry({ workspaceRoot, runId: 'run_ok' })).toEqual({
      ingest_reachable_at_start: true,
      flush_ever_failed: false,
      outbox_events_remaining: 0,
      evidence_documents_remaining: 0,
      telemetry_state: 'COMPLETE',
      qualification_eligible: true,
      run_id: 'run_ok',
      ended_at: '2026-09-13T00:05:00.000Z',
      unavailable_reason: null,
    });
  });

  it('carries flush_ever_failed as its own fact, not folded into the state', async () => {
    // The reason the column exists. INCOMPLETE alone cannot distinguish "events
    // left queued" from "a batch failed and something else re-sent it", and a
    // report that had to guess would be inferring what this removes.
    const workspaceRoot = workspace();
    await withRun({ workspaceRoot, runId: 'run_failed', reachableAtStart: true, everFailed: true });
    const snapshot = await readTrialTelemetry({ workspaceRoot, runId: 'run_failed' });
    expect(snapshot.flush_ever_failed).toBe(true);
    expect(snapshot.outbox_events_remaining).toBe(0);
    expect(snapshot.telemetry_state).toBe('INCOMPLETE');
    expect(snapshot.qualification_eligible).toBe(false);
  });

  it('reports events still queued, and refuses eligibility for them', async () => {
    const workspaceRoot = workspace();
    await withRun({ workspaceRoot, runId: 'run_queued', reachableAtStart: true, queued: 3 });
    const snapshot = await readTrialTelemetry({ workspaceRoot, runId: 'run_queued' });
    expect(snapshot.outbox_events_remaining).toBe(3);
    expect(snapshot.qualification_eligible).toBe(false);
  });

  it('refuses eligibility when the host never attested reachability', async () => {
    // A run can drain perfectly and still not be qualification evidence: D23
    // wants eligibility declared before the work, not earned by it.
    const workspaceRoot = workspace();
    await withRun({ workspaceRoot, runId: 'run_unattested', reachableAtStart: false });
    const snapshot = await readTrialTelemetry({ workspaceRoot, runId: 'run_unattested' });
    expect(snapshot.telemetry_state).toBe('COMPLETE');
    expect(snapshot.ingest_reachable_at_start).toBe(false);
    expect(snapshot.qualification_eligible).toBe(false);
  });

  it('says so when no outbox exists at all', async () => {
    const snapshot = await readTrialTelemetry({ workspaceRoot: workspace(), runId: 'run_x' });
    expect(snapshot.qualification_eligible).toBe(false);
    expect(snapshot.unavailable_reason).toContain('no telemetry outbox');
  });

  it('says so when the outbox cannot be opened', async () => {
    const workspaceRoot = workspace();
    const path = outboxPathFor(workspaceRoot);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, 'not a database', 'utf8');
    const snapshot = await readTrialTelemetry({ workspaceRoot, runId: 'run_x' });
    expect(snapshot.qualification_eligible).toBe(false);
    expect(snapshot.unavailable_reason).not.toBeNull();
  });

  it('says so when the run that was registered is not the run that ran (S-7)', async () => {
    // Addressed by id rather than "the newest run" on purpose. Taking the newest
    // would attribute one run's completeness to another, which is the mistake
    // S-7 was: a registered run and an emitting run, each internally consistent.
    const workspaceRoot = workspace();
    await withRun({ workspaceRoot, runId: 'run_that_ran', reachableAtStart: true });
    const snapshot = await readTrialTelemetry({ workspaceRoot, runId: 'run_registered' });
    expect(snapshot.qualification_eligible).toBe(false);
    expect(snapshot.unavailable_reason).toContain('run_registered');
  });

  it('refuses eligibility a stored row claims but the facts beside it deny', async () => {
    // The re-check. The store derives eligibility under the contract's invariant
    // and cannot be wrong about it -- but a snapshot that simply agreed with the
    // store would be one nobody could audit, and this row is exactly what a
    // hand-edited or corrupted database looks like.
    const workspaceRoot = workspace();
    await withRun({
      workspaceRoot,
      runId: 'run_lying',
      reachableAtStart: false,
      forceTerminal: {
        run_id: 'run_lying',
        telemetry_state: 'COMPLETE',
        qualification_eligible: true,
        ingest_reachable_at_start: false,
      },
    });
    const snapshot = await readTrialTelemetry({ workspaceRoot, runId: 'run_lying' });
    expect(snapshot.ingest_reachable_at_start).toBe(false);
    expect(snapshot.qualification_eligible).toBe(false);
  });

  it('refuses eligibility for a run that never wrote a terminal state', async () => {
    // A process killed mid-run leaves the INCOMPLETE row `begin` wrote, which is
    // true. It must not read as a run that finished quietly.
    const workspaceRoot = workspace();
    await withRun({
      workspaceRoot,
      runId: 'run_killed',
      reachableAtStart: true,
      finish: false,
    });
    const snapshot = await readTrialTelemetry({ workspaceRoot, runId: 'run_killed' });
    expect(snapshot.telemetry_state).toBe('INCOMPLETE');
    expect(snapshot.ended_at).toBeNull();
    expect(snapshot.qualification_eligible).toBe(false);
  });
});

describe('a healed schema cannot manufacture eligibility', () => {
  it('re-adds a dropped column, and the conjunction stops it counting as clean', async () => {
    // Worth pinning, because it is the one place the additive migration could
    // have re-opened what the fail-closed read just shut. Reopening a database
    // whose `flush_ever_failed` was dropped recreates it with a default of 0, so
    // every historical row reads as "no flush failed" -- a fact nobody knows.
    //
    // It cannot turn into eligibility, and the reason is the conjunction in
    // `readTrialTelemetry` rather than the column: eligibility also requires
    // COMPLETE, which was written at the time from the same `everFailed` the
    // column records. A row whose flushes failed is INCOMPLETE, and stays
    // ineligible however the resurrected column reads.
    const workspaceRoot = workspace();
    await withRun({
      workspaceRoot,
      runId: 'run_lossy',
      reachableAtStart: true,
      everFailed: true,
    });
    const path = outboxPathFor(workspaceRoot);
    const db = await openOutbox(path);
    try {
      db.exec('alter table run_state drop column flush_ever_failed');
    } finally {
      db.close();
    }

    const snapshot = await readTrialTelemetry({ workspaceRoot, runId: 'run_lossy' });
    // The column is back, and now says something untrue about this run.
    expect(snapshot.flush_ever_failed).toBe(false);
    // Which changes nothing, because the run was recorded INCOMPLETE when it ended.
    expect(snapshot.telemetry_state).toBe('INCOMPLETE');
    expect(snapshot.qualification_eligible).toBe(false);
  });
});
