/**
 * `ieos doctor`'s runtime half (Stage 1 exit gate).
 *
 * The gate names four things doctor must report. What these tests actually
 * defend is the distinction underneath them: `ok` means observed, `unknown`
 * means not observed, and only some not-ok findings are faults. A doctor that
 * blurred those would either report health it never saw, or cry wolf about
 * things Stage 1 deliberately does not have -- and both train the reader to
 * stop reading it.
 */

import { describe, expect, it } from 'vitest';
import {
  buildRuntimeReport,
  formatRuntimeReport,
  observeHooks,
  type RuntimeObservations,
} from '../src/doctor.ts';

const healthy = (over: Partial<RuntimeObservations> = {}): RuntimeObservations => ({
  indexDigest: `sha256:${'a'.repeat(64)}`,
  indexProblem: null,
  indexPresentButUnusable: false,
  contracts: [
    { name: 'asset', version: '1' },
    { name: 'evidence', version: '1' },
  ],
  sessionKind: 'local_persistent',
  ingest: { state: 'unconfigured' },
  sqliteAvailable: true,
  hooks: { state: 'registered', events: ['SessionStart', 'PostToolUse', 'Stop', 'SessionEnd'] },
  lastRuns: [{ runId: 'run_a', telemetryState: 'COMPLETE', startedAt: '2026-09-08T00:00:00.000Z' }],
  bootstrap: {
    state: 'healthy',
    detail: `AGENTS.md and CLAUDE.md match sha256:${'b'.repeat(64)}`,
  },
  ...over,
});

const finding = (observed: RuntimeObservations, name: string) =>
  buildRuntimeReport(observed).findings.find((f) => f.name === name);

describe('the four things the gate names are reported', () => {
  it('reports the index digest', () => {
    expect(finding(healthy(), 'index')?.detail).toContain('index_digest sha256:');
  });

  it('reports contract versions', () => {
    expect(finding(healthy(), 'contracts')?.detail).toMatch(/2 contracts.*schema_version 1/u);
  });

  it('reports session kind', () => {
    expect(finding(healthy({ sessionKind: 'ci' }), 'session')?.detail).toBe('session_kind ci');
  });

  it('reports ingest reachability', () => {
    expect(
      finding(healthy({ ingest: { state: 'reachable', endpoint: 'https://x' } }), 'ingest')?.level,
    ).toBe('ok');
  });

  it('every finding carries detail, not just a level', () => {
    for (const f of buildRuntimeReport(healthy()).findings) {
      expect(f.detail.length, `${f.name} has no detail`).toBeGreaterThan(10);
    }
  });
});

describe('absent is reported as unknown, never as ok', () => {
  it('no index yet is unknown and not a fault', () => {
    const f = finding(healthy({ indexDigest: null }), 'index');
    expect(f?.level).toBe('unknown');
    expect(f?.blocking).toBe(false);
    expect(buildRuntimeReport(healthy({ indexDigest: null })).ok).toBe(true);
  });

  it('no Evidence Plane configured is unknown and not a fault', () => {
    const f = finding(healthy(), 'ingest');
    expect(f?.level).toBe('unknown');
    expect(f?.blocking).toBe(false);
  });

  it('no target installation is unknown and not a fault', () => {
    const observed = healthy({ bootstrap: { state: 'uninstalled' } });
    expect(finding(observed, 'bootstrap')?.level).toBe('unknown');
    expect(buildRuntimeReport(observed).ok).toBe(true);
  });
});

describe('what actually counts as a fault', () => {
  it('an index that exists but cannot be read is a fault', () => {
    const observed = healthy({
      indexDigest: null,
      indexPresentButUnusable: true,
      indexProblem: 'schema version 999 is not readable here',
    });
    expect(finding(observed, 'index')?.level).toBe('failed');
    expect(buildRuntimeReport(observed).ok).toBe(false);
  });

  it('node:sqlite being unavailable is a fault, and says why', () => {
    const observed = healthy({ sqliteAvailable: false });
    const f = finding(observed, 'sqlite');
    expect(f?.level).toBe('failed');
    expect(f?.detail).toMatch(/--no-experimental-sqlite/u);
    expect(buildRuntimeReport(observed).ok).toBe(false);
  });

  it('an empty contract registry is a fault, because nothing could be validated', () => {
    const observed = healthy({ contracts: [] });
    expect(finding(observed, 'contracts')?.level).toBe('failed');
    expect(buildRuntimeReport(observed).ok).toBe(false);
  });

  it('an unreachable Evidence Plane is reported but does NOT block', () => {
    const observed = healthy({
      ingest: { state: 'unreachable', endpoint: 'https://x', reason: 'timeout' },
    });
    const f = finding(observed, 'ingest');
    expect(f?.level).toBe('failed');
    expect(f?.blocking).toBe(false);
    expect(f?.detail).toMatch(/INCOMPLETE/u);
    expect(buildRuntimeReport(observed).ok).toBe(true);
  });

  it('a generated bootstrap block that drifted is a blocking fault', () => {
    const observed = healthy({
      bootstrap: { state: 'drifted', detail: 'AGENTS.md hash changed' },
    });
    const f = finding(observed, 'bootstrap');
    expect(f?.level).toBe('failed');
    expect(f?.blocking).toBe(true);
    expect(f?.detail).toMatch(/drifted/u);
    expect(buildRuntimeReport(observed).ok).toBe(false);
  });
});

describe('the rendered report', () => {
  it('puts failures first, so the problem is the first line', () => {
    const text = formatRuntimeReport(
      buildRuntimeReport(healthy({ sqliteAvailable: false, indexDigest: null })),
    );
    const lines = text.split('\n').filter((l) => l.trim().length > 0);
    expect(lines[0]).toMatch(/^FAIL/u);
    expect(text).toContain('runtime check failed');
  });

  it('says so plainly when everything checked out', () => {
    const text = formatRuntimeReport(buildRuntimeReport(healthy()));
    expect(text).toContain('runtime ok');
    expect(text).not.toContain('FAIL');
  });
});

describe('telemetry hooks (Q-09)', () => {
  const finding = (observations: RuntimeObservations, name: string) =>
    buildRuntimeReport(observations).findings.find((f) => f.name === name);

  it('says nothing is observing a run when no hook is registered', () => {
    // Not a fault -- `ieos init` leaves hooks off by default -- but not silent
    // either. A run nobody observed looks exactly like a run in which nothing
    // happened.
    const report = finding(healthy({ hooks: { state: 'unregistered' } }), 'hooks');
    expect(report?.level).toBe('unknown');
    expect(report?.blocking).toBe(false);
    expect(report?.detail).toContain('ieos init --with-hooks');
  });

  it('BLOCKS on a partial registration, unlike none at all', () => {
    // Some of four means a run's timeline has holes at known points: the
    // terminal flush may never fire, and a partial timeline read as whole is
    // the failure D23 names. "None" is a choice; "some" is a broken install.
    const report = finding(
      healthy({ hooks: { state: 'partial', events: ['SessionStart'] } }),
      'hooks',
    );
    expect(report?.level).toBe('failed');
    expect(report?.blocking).toBe(true);
  });

  it('reads registration out of a project’s settings by the hook entry path', () => {
    const settings = JSON.stringify({
      hooks: {
        SessionStart: [{ hooks: [{ command: 'node /eos/src/hook.ts' }] }],
        Stop: [{ hooks: [{ command: 'node /eos/src/hook.ts' }] }],
      },
    });
    expect(observeHooks(settings, 'src/hook.ts', ['SessionStart', 'Stop'])).toEqual({
      state: 'registered',
      events: ['SessionStart', 'Stop'],
    });
    expect(observeHooks(settings, 'src/hook.ts', ['SessionStart', 'Stop', 'SessionEnd'])).toEqual({
      state: 'partial',
      events: ['SessionStart', 'Stop'],
    });
  });

  it('does not count someone else’s hook as ours', () => {
    const settings = JSON.stringify({
      hooks: { Stop: [{ hooks: [{ command: 'prettier --write' }] }] },
    });
    expect(observeHooks(settings, 'src/hook.ts', ['Stop'])).toEqual({ state: 'unregistered' });
  });

  it('reads unreadable settings as unregistered, never as registered', () => {
    // Claiming `registered` from a file it could not parse is the most
    // expensive wrong answer available here.
    expect(observeHooks('{ not json', 'src/hook.ts', ['Stop'])).toEqual({ state: 'unregistered' });
    expect(observeHooks(null, 'src/hook.ts', ['Stop'])).toEqual({ state: 'unregistered' });
  });
});

describe('the last runs doctor reports (D23, Stage 2 exit gate)', () => {
  const finding = (observations: RuntimeObservations) =>
    buildRuntimeReport(observations).findings.find((f) => f.name === 'last-run');

  it('makes an INCOMPLETE run visible', () => {
    // The Stage 2 exit gate names this: INCOMPLETE runs must be visible in
    // `ieos doctor --last-run`. A lossy run may never have reached the Evidence
    // Plane, so the plane is the one place that cannot be asked.
    const report = finding(
      healthy({
        lastRuns: [
          { runId: 'run_bad', telemetryState: 'INCOMPLETE', startedAt: '2026-09-08T00:00:00.000Z' },
          { runId: 'run_ok', telemetryState: 'COMPLETE', startedAt: '2026-09-07T00:00:00.000Z' },
        ],
      }),
    );
    expect(report?.level).toBe('failed');
    expect(report?.detail).toContain('run_bad');
    expect(report?.detail).toContain('not qualification evidence');
    // Not blocking: an INCOMPLETE run is a true record, not a broken install.
    expect(report?.blocking).toBe(false);
  });

  it('distinguishes "no runs yet" from "all complete"', () => {
    expect(finding(healthy({ lastRuns: [] }))?.level).toBe('unknown');
    expect(finding(healthy())?.level).toBe('ok');
  });
});
