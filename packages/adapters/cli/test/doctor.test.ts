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
    // Stage 1 has an empty knowledge tree by design. Reporting that as broken
    // would teach the reader to ignore doctor's output.
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
});

describe('what actually counts as a fault', () => {
  it('an index that exists but cannot be read is a fault', () => {
    // Something built it, so either what it built or this runtime is wrong.
    // That is categorically different from never having built one.
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
    // D23: telemetry loss must never look like a measured run, and the runtime
    // is required to work offline. So it is a loud finding and not a refusal.
    const observed = healthy({
      ingest: { state: 'unreachable', endpoint: 'https://x', reason: 'timeout' },
    });
    const f = finding(observed, 'ingest');
    expect(f?.level).toBe('failed');
    expect(f?.blocking).toBe(false);
    expect(f?.detail).toMatch(/INCOMPLETE/u);
    expect(buildRuntimeReport(observed).ok).toBe(true);
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
