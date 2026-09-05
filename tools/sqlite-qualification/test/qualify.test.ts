/**
 * The SQLite qualification checks, and the guarantee that they can fail.
 *
 * `node:sqlite` needs no dependency, so its checks run in the ordinary suite.
 * `better-sqlite3` is deliberately not a dependency of this repository -- adding
 * it would be adopting a candidate in order to qualify it -- so its results are
 * measured out of tree and recorded in `qualification/evidence/`.
 *
 * The most important assertions here are the negative controls. A check suite
 * that always passes would select a binding on no evidence at all.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { platform } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  compareVersions,
  loadNodeSqlite,
  MINIMUM_ENGINE_VERSION,
  qualify,
  REQUIRED_PLATFORMS,
  type CandidateQualification,
} from '../src/index.ts';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

describe('version comparison (check 2 depends on it)', () => {
  it.each([
    ['3.53.4', '3.51.3', 1],
    ['3.51.3', '3.51.3', 0],
    ['3.51.2', '3.51.3', -1],
    ['3.9.0', '3.51.3', -1],
    ['4.0.0', '3.51.3', 1],
    ['3.51', '3.51.3', -1],
  ])('compares %s to %s', (a, b, expected) => {
    expect(Math.sign(compareVersions(a, b))).toBe(expected);
  });

  it('does not compare lexically, which would rank 3.9 above 3.51', () => {
    // The bug this guards: '3.9.0' > '3.51.3' as strings, but 3.9 is older.
    expect('3.9.0' > '3.51.3').toBe(true);
    expect(compareVersions('3.9.0', '3.51.3')).toBeLessThan(0);
  });
});

// Top-level await: the checks spawn processes and hold real locks, so running
// them once for the whole file keeps the suite honest and fast.
const result: CandidateQualification = await qualify(await loadNodeSqlite());

describe('node:sqlite against the seven recorded checks', () => {
  it('runs all seven checks, with none silently missing', () => {
    expect(result.checks.map((check) => check.id).sort((a, b) => a - b)).toEqual([
      1, 2, 3, 4, 5, 6, 7,
    ]);
  });

  it('measures the engine version through the binding, not from a package version', () => {
    expect(result.engineVersion).toMatch(/^\d+\.\d+\.\d+$/u);
    expect(result.engineSourceId).toBeTruthy();
  });

  it('meets the R3 minimum engine version', () => {
    expect(
      compareVersions(result.engineVersion ?? '0', MINIMUM_ENGINE_VERSION),
    ).toBeGreaterThanOrEqual(0);
  });

  it('passes every check on this platform', () => {
    const failures = result.checks
      .filter((check) => check.outcome !== 'pass')
      .map((check) => `${String(check.id)}. ${check.name}: ${check.outcome} -- ${check.evidence}`);
    expect(failures, failures.join('\n')).toEqual([]);
  });

  it('every check reports evidence, not just an outcome', () => {
    for (const check of result.checks) {
      expect(check.evidence.length, `check ${String(check.id)} has no evidence`).toBeGreaterThan(
        20,
      );
    }
  });

  it('is NOT qualified, because one run observes only one platform', () => {
    // The whole point of the criterion. Passing everything on one platform is
    // not qualification when the recorded checks name two.
    //
    // Stated without naming which platform this is. The earlier wording
    // asserted `not.toContain('win32')`, which quietly encoded "this suite
    // never runs on Windows" -- an assumption that is false the moment the
    // cross-platform gate does its job, and that failed on the first Windows
    // run. The invariant that actually matters is that a single run always
    // leaves at least one required platform unobserved.
    expect(result.allChecksPassedOnThisPlatform).toBe(true);
    expect(result.qualified).toBe(false);
    expect(result.platformsRequired).toEqual(REQUIRED_PLATFORMS);
    expect(result.platformsObserved).toEqual([platform()]);

    const unobserved = REQUIRED_PLATFORMS.filter(
      (required) => !result.platformsObserved.includes(required),
    );
    expect(unobserved.length).toBeGreaterThan(0);
  });
});

describe('negative controls: the checks can actually fail', () => {
  it('a binding that cannot open a database fails check 1 rather than passing', async () => {
    const broken = {
      id: 'broken-candidate',
      bindingVersion: '0.0.0',
      subprocessSpecifier: 'node:sqlite',
      nativeAddon: false,
      experimental: false,
      open(): never {
        throw new Error('simulated: binding cannot open a database');
      },
    };
    const result = await qualify(broken);

    expect(result.checks.find((c) => c.id === 1)?.outcome).toBe('fail');
    expect(result.allChecksPassedOnThisPlatform).toBe(false);
    expect(result.qualified).toBe(false);
  });

  it('an engine below the R3 minimum fails check 2', async () => {
    const node = await loadNodeSqlite();
    const stale = {
      ...node,
      id: 'stale-engine-candidate',
      open(path: string, options?: { readonly timeoutMs?: number }) {
        const handle = node.open(path, options);
        return {
          ...handle,
          get(sql: string) {
            // Report an engine predating the WAL corruption fix.
            if (sql.includes('sqlite_version')) return { v: '3.50.0' };
            return handle.get(sql);
          },
        };
      },
    };
    const result = await qualify(stale);

    expect(result.engineVersion).toBe('3.50.0');
    expect(result.checks.find((c) => c.id === 2)?.outcome).toBe('fail');
    expect(result.qualified).toBe(false);
  });

  it('qualification is conjunctive: one failing check sinks the candidate', async () => {
    const node = await loadNodeSqlite();
    const stale = {
      ...node,
      id: 'stale-engine-candidate',
      open(path: string, options?: { readonly timeoutMs?: number }) {
        const handle = node.open(path, options);
        return {
          ...handle,
          get(sql: string) {
            if (sql.includes('sqlite_version')) return { v: '3.50.0' };
            return handle.get(sql);
          },
        };
      },
    };
    const result = await qualify(stale);
    const passed = result.checks.filter((c) => c.outcome === 'pass').length;

    // Six of seven passing is still not qualification.
    expect(passed).toBeGreaterThan(4);
    expect(result.allChecksPassedOnThisPlatform).toBe(false);
  });
});

describe('the recorded evidence file', () => {
  const evidence = JSON.parse(
    readFileSync(join(repoRoot, 'qualification/evidence/sqlite-qualification.json'), 'utf8'),
  ) as { results: CandidateQualification[] };

  it('covers both candidates named in the decision log', () => {
    expect(evidence.results.map((r) => r.candidate).sort()).toEqual([
      'better-sqlite3',
      'node:sqlite',
    ]);
  });

  it("records better-sqlite3's OWN bundled engine, measured through it", () => {
    // Explicitly forbidden by the brief: substituting Node's bundled SQLite as
    // evidence about a third-party binding.
    const better = evidence.results.find((r) => r.candidate === 'better-sqlite3');
    expect(better?.nativeAddon).toBe(true);
    expect(better?.engineVersion).toMatch(/^\d+\.\d+\.\d+$/u);
    expect(better?.engineSourceId).toBeTruthy();
    expect(better?.bindingVersion).toMatch(/^\d+\.\d+\.\d+$/u);
  });

  it('records neither candidate as qualified', () => {
    for (const result of evidence.results) {
      expect(result.qualified, `${result.candidate} must not claim qualification`).toBe(false);
      expect(result.platformsObserved).not.toContain('win32');
    }
  });

  it('records seven checks per candidate', () => {
    for (const result of evidence.results) {
      expect(result.checks).toHaveLength(7);
    }
  });
});

// ---------------------------------------------------------------------------
// The writer refuses to lose evidence
// ---------------------------------------------------------------------------

describe('writing evidence never silently drops a candidate', () => {
  const cli = join(repoRoot, 'tools/sqlite-qualification/src/cli.ts');

  const runCli = (args: readonly string[]): { code: number; stderr: string } => {
    try {
      execFileSync(process.execPath, [cli, ...args], {
        cwd: repoRoot,
        encoding: 'utf8',
        stdio: ['ignore', 'ignore', 'pipe'],
        timeout: 120_000,
      });
      return { code: 0, stderr: '' };
    } catch (error) {
      const failure = error as { status?: number; stderr?: string };
      return { code: failure.status ?? -1, stderr: failure.stderr ?? '' };
    }
  };

  it('refuses to overwrite a two-candidate record with a one-candidate one', () => {
    // The hazard, in the exact shape it took twice: `better-sqlite3` is not a
    // dependency, so on most machines a plain run measures one candidate. If
    // that overwrote the committed record, evidence would vanish -- and lost
    // evidence is indistinguishable from evidence never gathered.
    const dir = mkdtempSync(join(tmpdir(), 'ieos-evidence-'));
    const target = join(dir, 'record.json');
    writeFileSync(
      target,
      JSON.stringify({ results: [{ candidate: 'node:sqlite' }, { candidate: 'better-sqlite3' }] }),
      'utf8',
    );
    try {
      const result = runCli(['--out', target]);
      expect(result.code, 'the CLI must exit non-zero when it refuses').toBe(1);
      expect(result.stderr).toMatch(/Refusing to write/u);
      expect(result.stderr).toMatch(/better-sqlite3/u);

      // The file is untouched, which is the whole point.
      const after = JSON.parse(readFileSync(target, 'utf8')) as {
        results: { candidate: string }[];
      };
      expect(after.results.map((r) => r.candidate)).toEqual(['node:sqlite', 'better-sqlite3']);
    } finally {
      rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
    }
  });

  it('writes freely when nothing would be lost', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ieos-evidence-'));
    const target = join(dir, 'fresh.json');
    try {
      expect(runCli(['--out', target]).code).toBe(0);
      const written = JSON.parse(readFileSync(target, 'utf8')) as {
        results: { candidate: string }[];
      };
      expect(written.results.length).toBeGreaterThan(0);
    } finally {
      rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
    }
  });

  it('--force is the deliberate escape, and it really writes', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ieos-evidence-'));
    const target = join(dir, 'record.json');
    writeFileSync(
      target,
      JSON.stringify({ results: [{ candidate: 'node:sqlite' }, { candidate: 'better-sqlite3' }] }),
      'utf8',
    );
    try {
      expect(runCli(['--out', target, '--force']).code).toBe(0);
      const after = JSON.parse(readFileSync(target, 'utf8')) as {
        results: { candidate: string }[];
      };
      expect(after.results.map((r) => r.candidate)).not.toContain('better-sqlite3');
    } finally {
      rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
    }
  });
});
