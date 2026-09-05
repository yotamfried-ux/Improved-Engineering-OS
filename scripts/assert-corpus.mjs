/**
 * Vacuity guards.
 *
 * A check that inspects nothing and exits 0 is worse than no check: it reports
 * success and stops anyone looking. Two such failures have already occurred in
 * this repository, so both are asserted rather than assumed:
 *
 *   - dependency-cruiser degraded to "1 modules, 0 dependencies cruised" under
 *     an unsupported TypeScript version, exiting 0 while four fitness rules
 *     silently inspected nothing;
 *   - a test runner that discovers no files also exits 0.
 *
 * Thresholds are floors, not targets: they only have to be high enough that a
 * collapsed corpus cannot slip under them, and they are asserted as minimums so
 * that adding tests never breaks the build.
 *
 * Usage:
 *   node scripts/assert-corpus.mjs                    # full test corpus
 *   node scripts/assert-corpus.mjs --windows-smoke    # the Windows subset
 *   node scripts/assert-corpus.mjs --dependency-graph # the boundary analysis
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);

/**
 * The vitest projects the Windows smoke job runs.
 *
 * Exported in spirit: `fitness/checks/ci-workflows.test.ts` reads this list out
 * of this file and compares it with `.github/workflows/ci.yml`, so a project
 * added to one and not the other fails rather than silently narrowing whichever
 * side was forgotten.
 */
export const WINDOWS_SMOKE_PROJECTS = [
  'core',
  'snapshot-emit',
  'sqlite-qualification',
  'releases',
  'store-sqlite',
  'mcp',
];

/** Floors. Raise them when a whole area of the suite lands, never lower them to go green. */
const MINIMUMS = {
  fullTestFiles: 29,
  fullTests: 700,
  windowsTestFiles: 14,
  windowsTests: 340,
  cruisedModules: 60,
  cruisedDependencies: 150,
};

function fail(message) {
  process.stderr.write(`\nVACUITY GUARD FAILED\n  ${message}\n`);
  process.exit(1);
}

function ok(message) {
  process.stdout.write(`vacuity guard ok: ${message}\n`);
}

function runVitestJson(projects) {
  const dir = mkdtempSync(join(tmpdir(), 'ieos-corpus-'));
  const out = join(dir, 'result.json');
  try {
    const projectArgs = projects.flatMap((name) => ['--project', name]);
    execFileSync(
      'node',
      [
        join(repoRoot, 'node_modules/vitest/vitest.mjs'),
        'run',
        ...projectArgs,
        '--reporter=json',
        `--outputFile=${out}`,
      ],
      { cwd: repoRoot, stdio: ['ignore', 'ignore', 'inherit'], timeout: 900_000 },
    );
  } catch {
    // A failing suite is reported by the test step itself; this guard is only
    // about whether anything ran at all, so the JSON is still read below.
  }
  try {
    return JSON.parse(readFileSync(out, 'utf8'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function assertTestCorpus({ projects, minFiles, minTests, label }) {
  const report = runVitestJson(projects);
  const files = report.testResults?.length ?? 0;
  const tests = report.numTotalTests ?? 0;
  const passed = report.numPassedTests ?? 0;

  process.stdout.write(
    `${label}: ${String(files)} files, ${String(tests)} tests, ${String(passed)} passed\n`,
  );

  if (files < minFiles) {
    fail(
      `${label} discovered ${String(files)} test files, expected at least ${String(minFiles)}. ` +
        'A collapsed corpus exits 0 and reports success; that is what this guard exists to catch.',
    );
  }
  // Floored on tests that actually PASSED, not on tests discovered. A suite
  // that finds hundreds of tests and then skips them all would otherwise clear
  // this floor while proving nothing -- the same vacuity this guard exists for,
  // one level up.
  if (passed < minTests) {
    fail(
      `${label} passed ${String(passed)} tests (of ${String(tests)} discovered), expected at ` +
        `least ${String(minTests)} passing. Lower this floor only alongside an architectural ` +
        'justification, never to go green.',
    );
  }
  ok(
    `${label} corpus is non-vacuous (${String(files)} files, ${String(passed)} passing` +
      `${tests > passed ? `, ${String(tests - passed)} skipped` : ''})`,
  );
}

function assertDependencyGraph() {
  const output = execFileSync(
    'node',
    [
      join(repoRoot, 'node_modules/dependency-cruiser/bin/dependency-cruise.mjs'),
      '--config',
      'fitness/.dependency-cruiser.cjs',
      '--output-type',
      'json',
      'packages',
      'tools',
      'fitness',
    ],
    { cwd: repoRoot, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  );
  const summary = JSON.parse(output).summary;
  const modules = summary.totalCruised ?? 0;
  const dependencies = summary.totalDependenciesCruised ?? 0;

  process.stdout.write(
    `dependency graph: ${String(modules)} modules, ${String(dependencies)} dependencies\n`,
  );

  if (modules < MINIMUMS.cruisedModules || dependencies < MINIMUMS.cruisedDependencies) {
    fail(
      `the boundary analysis cruised ${String(modules)} modules and ${String(dependencies)} ` +
        `dependencies, expected at least ${String(MINIMUMS.cruisedModules)} and ` +
        `${String(MINIMUMS.cruisedDependencies)}. dependency-cruiser degrades to near-zero and ` +
        'exits 0 when it cannot parse the TypeScript in use, which silently disarms F1a, F2, ' +
        'F4 and F5. Check the TypeScript version against what dependency-cruiser supports.',
    );
  }
  ok(`dependency graph is non-vacuous (${String(modules)} modules)`);
}

if (args.includes('--dependency-graph')) {
  assertDependencyGraph();
} else if (args.includes('--windows-smoke')) {
  assertTestCorpus({
    // Must match the projects the Windows job actually runs, or this guards
    // less than runs and the gap is invisible. `ci-workflows.test.ts` asserts
    // the two lists agree.
    projects: WINDOWS_SMOKE_PROJECTS,
    minFiles: MINIMUMS.windowsTestFiles,
    minTests: MINIMUMS.windowsTests,
    label: 'windows smoke',
  });
} else {
  assertTestCorpus({
    projects: [],
    minFiles: MINIMUMS.fullTestFiles,
    minTests: MINIMUMS.fullTests,
    label: 'full suite',
  });
}
