/**
 * CI workflows (Stage 0 criterion B1), checked structurally.
 *
 * These tests prove the workflows are present and say what they must say. They
 * prove NOTHING about whether GitHub has ever run them: configuration presence
 * is not evidence of execution. A real Windows runner reported on 2026-09-05,
 * so the D35 cross-platform gate is no longer unproven -- but that fact comes
 * from the run, never from this file, and the last block below exists to keep
 * that distinction enforced rather than merely written down.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { exists, REPO_ROOT } from './scan.ts';

interface Step {
  readonly name?: string;
  readonly uses?: string;
  readonly run?: string;
  readonly shell?: string;
  readonly with?: Record<string, unknown>;
}
interface Job {
  readonly 'runs-on': string;
  readonly needs?: string | string[];
  readonly 'timeout-minutes'?: number;
  readonly steps: readonly Step[];
}
interface Workflow {
  readonly name: string;
  readonly env?: Record<string, string>;
  readonly jobs: Record<string, Job>;
}

function workflow(file: string): Workflow {
  return parse(readFileSync(join(REPO_ROOT, '.github/workflows', file), 'utf8')) as Workflow;
}

const ci = workflow('ci.yml');
const fitness = workflow('fitness.yml');

const runScript = (job: Job): string =>
  job.steps.map((step) => `${step.name ?? ''}\n${step.run ?? ''}\n${step.uses ?? ''}`).join('\n');

describe('the workflows exist', () => {
  it.each(['.github/workflows/ci.yml', '.github/workflows/fitness.yml'])('%s', (path) => {
    expect(exists(path)).toBe(true);
  });
});

describe('Linux is the primary job (D18.3, R-12)', () => {
  const linux = ci.jobs['linux'];

  it('runs on Linux', () => {
    expect(linux?.['runs-on']).toBe('ubuntu-latest');
  });

  it('runs every canonical Stage 0 check', () => {
    const script = runScript(linux as Job);
    for (const command of [
      'pnpm ieos-doctor',
      'pnpm install --frozen-lockfile',
      'pnpm typecheck',
      'pnpm contracts:check',
      'pnpm format:check',
      'pnpm test',
    ]) {
      expect(script, `the Linux job must run ${command}`).toContain(command);
    }
  });

  it('guards against a vacuous test run', () => {
    expect(runScript(linux as Job)).toContain('scripts/assert-corpus.mjs');
  });

  it('has a timeout, so a hung job fails rather than hanging forever', () => {
    expect(linux?.['timeout-minutes']).toBeGreaterThan(0);
  });
});

describe('the Windows smoke job exercises the D35 cross-platform contract', () => {
  const win = ci.jobs['windows-smoke'];

  it('runs on Windows', () => {
    expect(win?.['runs-on']).toBe('windows-latest');
  });

  it('depends on the Linux job, so there is a digest to compare against', () => {
    expect(win?.needs).toBe('linux');
  });

  it('runs the smallest set that genuinely exercises the contract', () => {
    const script = runScript(win as Job);
    // Canonical hashing and deterministic identities, the bootstrap snapshot,
    // and the SQLite check that names Windows explicitly.
    expect(script).toContain('--project core');
    expect(script).toContain('--project snapshot-emit');
    expect(script).toContain('--project sqlite-qualification');
  });

  it('compares its digest against the Linux one and fails on any difference', () => {
    const script = runScript(win as Job);
    expect(script).toContain('snapshot:emit');
    expect(script).toContain('digests/linux.txt');
    expect(script).toMatch(/if \[ "\$WINDOWS" != "\$LINUX" \]/u);
    expect(script).toContain('exit 1');
  });

  it('guards against a vacuous run of its own subset', () => {
    expect(runScript(win as Job)).toContain('assert-corpus.mjs --windows-smoke');
  });
});

describe('the fitness workflow guards its own analyzer', () => {
  const job = fitness.jobs['fitness'];

  it('asserts the boundary analysis is non-empty before trusting it', () => {
    // dependency-cruiser exits 0 having analysed nothing when it cannot parse
    // the TypeScript in use. That happened here and silently disarmed four
    // rules, so the corpus is asserted first.
    expect(runScript(job as Job)).toContain('assert-corpus.mjs --dependency-graph');
  });

  it('runs the fitness rules', () => {
    expect(runScript(job as Job)).toContain('pnpm fitness');
  });

  it('reports the honest rule split rather than a single tick', () => {
    expect(runScript(job as Job)).toContain('fitness-summary.mjs');
  });
});

describe('the workflows pin the same toolchain the repository does', () => {
  const pkg = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8')) as {
    packageManager: string;
    engines: { node: string };
  };
  const pinnedPnpm = pkg.packageManager.replace('pnpm@', '');

  it.each([
    ['ci.yml', ci],
    ['fitness.yml', fitness],
  ])('%s pins pnpm and a Node 24 version', (_file, wf) => {
    expect(wf.env?.['PNPM_VERSION']).toBe(pinnedPnpm);
    expect(wf.env?.['NODE_VERSION']).toMatch(/^24\./u);
    expect(pkg.engines.node).toBe('24.x');
  });

  it('installs with a frozen lockfile everywhere, so CI cannot drift off the pins', () => {
    for (const wf of [ci, fitness]) {
      for (const job of Object.values(wf.jobs)) {
        expect(runScript(job)).toContain('--frozen-lockfile');
      }
    }
  });
});

describe('a cross-platform claim has to name the evidence it rests on', () => {
  // This block used to assert the opposite: that the plan said Windows had
  // never been observed. That observation has since happened (GitHub Actions,
  // 2026-09-05), so the guard changed shape rather than being deleted. What
  // needs protecting now is not the absence of the claim but its anchoring --
  // a cross-platform PASS must carry the commit it was observed on and the
  // digest that was actually compared, so a reader can go and re-check it
  // instead of taking this repository's word for it.

  const plan = readFileSync(join(REPO_ROOT, 'docs/plan/stage-0-plan.md'), 'utf8');

  it('names the commit the Windows run was observed on', () => {
    expect(plan).toMatch(/6d8c27b/u);
  });

  it('quotes a digest that still matches the fixture the repository pins', () => {
    // Read as text on both sides, so this stays a consistency check between two
    // documents and adds no dependency from fitness onto a tool it inspects.
    // The point: if the pinned fixture ever changes, the digest quoted in the
    // plan is stale and "identical on both platforms" no longer refers to
    // anything this repository produces.
    const pinnedSource = readFileSync(
      join(REPO_ROOT, 'tools/snapshot-emit/test/snapshot.test.ts'),
      'utf8',
    );
    const pinned = /'(sha256:[0-9a-f]{64})'/u.exec(pinnedSource)?.[1];
    expect(pinned, 'no pinned cross-platform digest found in the snapshot suite').toBeTruthy();

    // The plan elides the middle of the hash for readability, so compare on the
    // prefix it actually shows.
    const quoted = /sha256:[0-9a-f]{8}/u.exec(plan)?.[0];
    expect(quoted, 'the plan quotes no digest for its cross-platform claim').toBeTruthy();
    expect(pinned).toMatch(new RegExp(`^${quoted as string}`, 'u'));
  });

  it('lets no evidence file claim a qualification that was never made', () => {
    // A cheap, permanent guard against a fabricated cross-platform PASS. It
    // covers every file in the directory, so adding win32 evidence later
    // cannot slip past it.
    const evidenceDir = join(REPO_ROOT, 'qualification/evidence');
    const files = readdirSync(evidenceDir).filter((name) => name.endsWith('.json'));
    expect(files.length, 'the evidence directory is empty').toBeGreaterThan(0);

    let inspected = 0;
    for (const name of files) {
      const parsed = JSON.parse(readFileSync(join(evidenceDir, name), 'utf8')) as {
        results?: { platform?: string; platformsObserved?: string[]; qualified?: boolean }[];
      };
      for (const result of parsed.results ?? []) {
        // No single run observes every required platform, so no single run may
        // report itself qualified. Selection is a decision recorded in the
        // decision log, never a field a measurement sets for itself.
        expect(result.qualified, `${name} claims a qualification`).toBe(false);
        expect(result.platformsObserved).toEqual([result.platform]);
        inspected += 1;
      }
    }
    expect(inspected, 'no qualification results were inspected').toBeGreaterThan(0);
  });
});
