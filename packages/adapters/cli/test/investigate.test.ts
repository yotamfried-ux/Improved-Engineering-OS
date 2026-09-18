/**
 * `ieos investigate <run_id>` end to end (guide Stage 2, T-03).
 *
 * The real binary, against a real SQLite outbox, because the pieces are already
 * unit-tested and the thing that is not is the wiring: whether the command that
 * a person actually types reads the file it claims to read, and whether what it
 * prints is the truth about the run rather than about the parts.
 *
 * The two negative cases matter most. "There is no outbox here" and "that run
 * is not in it" are different answers, and neither of them is an empty success
 * -- a command that exits 0 having found nothing is indistinguishable from one
 * that found a quiet run.
 */

import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { openOutbox, SqliteOutbox, SqliteRunStateStore } from '@ieos/store-sqlite';
import { runTelemetryStateSchema, type TelemetryEvent } from '@ieos/core';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const CLI = join(REPO_ROOT, 'packages/adapters/cli/src/cli.ts');

const scratch: string[] = [];
afterEach(() => {
  for (const dir of scratch.splice(0)) {
    rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
});

function run(...argv: string[]): { code: number; stdout: string; stderr: string } {
  const result = spawnSync(process.execPath, [CLI, ...argv], { cwd: REPO_ROOT, encoding: 'utf8' });
  return { code: result.status ?? -1, stdout: result.stdout, stderr: result.stderr };
}

const anEvent = (over: Partial<TelemetryEvent> = {}): TelemetryEvent =>
  ({
    schema_version: '1',
    stability: 'development',
    introduced_in: '0.1.0',
    deprecated_in: null,
    replacement: null,
    migration_path: null,
    event_id: 'evt_1',
    event_type: 'resolve.response',
    project_id: 'proj_a',
    work_id: 'work_a',
    run_id: 'run_investigated',
    installation_id: 'inst_a',
    emitter_id: 'emt_a',
    session_kind: 'ci',
    trace: { trace_id: 'trace_a', span_id: 's', parent_span_id: null, links: [] },
    time: {
      occurred_at: '2026-09-06T00:00:00.000Z',
      observed_at: '2026-09-06T00:00:00.000Z',
      ingested_at: null,
    },
    source: { type: 'agent', sequence: 0 },
    revision: { repo_sha: 'a'.repeat(40), eos_release: '0.1.0' },
    harness: {
      agent: 'claude-code',
      model: 'test',
      adapter_version: '0.1.0',
      available_capabilities_hash: 'sha256:0',
    },
    attributes: { 'asset.id': 'asset_alpha' },
    ...over,
  }) as TelemetryEvent;

/** A real outbox on disk, holding one run that resolved and inspected an asset. */
async function anOutbox(options: { complete: boolean }): Promise<string> {
  const dir = mkdtempSync(join(tmpdir(), 'ieos-investigate-'));
  scratch.push(dir);
  mkdirSync(join(dir, '.ieos'), { recursive: true });
  const path = join(dir, '.ieos', 'outbox.sqlite');
  const db = await openOutbox(path);
  const outbox = new SqliteOutbox(db);
  await outbox.append(
    anEvent({ event_id: 'evt_start', event_type: 'session.start', attributes: {} }),
  );
  await outbox.append(anEvent({ event_id: 'evt_resolve', source: { type: 'agent', sequence: 1 } }));
  await outbox.append(
    anEvent({
      event_id: 'evt_inspect',
      event_type: 'inspect.request',
      source: { type: 'agent', sequence: 2 },
    }),
  );
  const runs = new SqliteRunStateStore(db);
  runs.begin('run_investigated', true, '2026-09-06T00:00:00.000Z');
  runs.finish(
    runTelemetryStateSchema.parse({
      run_id: 'run_investigated',
      telemetry_state: options.complete ? 'COMPLETE' : 'INCOMPLETE',
      qualification_eligible: false,
      ingest_reachable_at_start: true,
    }),
    '2026-09-06T00:05:00.000Z',
  );
  db.close();
  return path;
}

async function acknowledgeEveryEvent(path: string): Promise<void> {
  const db = await openOutbox(path);
  try {
    const outbox = new SqliteOutbox(db);
    const events = await outbox.pending(Number.MAX_SAFE_INTEGER);
    await outbox.acknowledge(events.map((event) => event.event_id));
  } finally {
    db.close();
  }
}

describe('ieos investigate', () => {
  it('prints the raw timeline and the attribution derived from it', async () => {
    const outbox = await anOutbox({ complete: true });
    const result = run('investigate', 'run_investigated', '--outbox', outbox);
    expect(result.code).toBe(0);
    // The event that produced no evidence is still in the timeline: hiding it
    // would show the derivation's input rather than the run.
    expect(result.stdout).toContain('evt_start');
    expect(result.stdout).toContain('evt_resolve');
    expect(result.stdout).toContain('asset_alpha  inspected');
    expect(result.stdout).toContain('evd_');
  });

  it('says the run is INCOMPLETE, so the timeline is not read as whole', async () => {
    const outbox = await anOutbox({ complete: false });
    const result = run('investigate', 'run_investigated', '--outbox', outbox);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('did not report complete telemetry');
  });

  it('shows origin_class as the D36 default and says why', async () => {
    // A client cannot classify its own run. Printing a guess would be the exact
    // claim D36 makes impossible everywhere else.
    const outbox = await anOutbox({ complete: true });
    const result = run('investigate', 'run_investigated', '--outbox', outbox);
    expect(result.stdout).toContain('origin_class:          operational');
    expect(result.stdout).toContain('cannot classify its own run');
  });

  it('retains an acknowledged timeline for local investigation', async () => {
    const outbox = await anOutbox({ complete: true });
    await acknowledgeEveryEvent(outbox);

    const result = run('investigate', 'run_investigated', '--outbox', outbox);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('evt_resolve');
    expect(result.stdout).toContain('retained local event history');
    expect(result.stdout).toContain('does not prove Evidence Plane acceptance');
  });

  it('says so when a different run is absent from local history', async () => {
    const outbox = await anOutbox({ complete: true });
    const result = run('investigate', 'run_elsewhere', '--outbox', outbox);
    expect(result.code).toBe(4);
    expect(result.stderr).toContain('not in the local event history');
  });

  it('distinguishes "no outbox on this machine" from "no such run"', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ieos-investigate-none-'));
    scratch.push(dir);
    const result = run('investigate', 'run_a', '--outbox', join(dir, 'missing.sqlite'));
    expect(result.code).toBe(4);
    expect(result.stderr).toContain('Nothing has been recorded on this machine yet');
  });

  it('refuses without a run id rather than investigating something arbitrary', () => {
    const result = run('investigate');
    expect(result.code).toBe(2);
    expect(result.stderr).toContain('usage: ieos investigate');
  });
});
