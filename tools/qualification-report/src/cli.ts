/**
 * `pnpm report:stage0` -- generate the Stage 0 qualification report.
 *
 * Two modes, because a report about two platforms cannot be produced by one:
 *
 *   --collect <file>   run this platform's suites and write its evidence record
 *   --report           judge every collected record and write the report
 *
 * The generator never reads the plan, the decision log or the status record.
 * Those are the documents the report exists to check, so trusting them would
 * make it a mirror rather than a check.
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FITNESS_RULES } from '@ieos/fitness';
import { collectPlatformEvidence, type PlatformEvidence, type SuiteResult } from './evidence.ts';
import { evaluateStage0, type GateInput } from './gate.ts';
import { renderReport } from './render.ts';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const args = process.argv.slice(2);

/** Platforms Stage 0 requires, per the guide: Linux primary + one Windows smoke. */
const REQUIRED_PLATFORMS = ['linux', 'win32'];

/** A platform record below this is treated as having observed nothing. */
const MINIMUM_TESTS_PER_PLATFORM = 200;

function flag(name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function git(...argv: string[]): string {
  try {
    return execFileSync('git', argv, { cwd: repoRoot, encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}

/** Run vitest and read the machine-readable result, rather than parsing prose. */
function runSuites(projects: readonly string[]): { suites: SuiteResult[]; allPassed: boolean } {
  const dir = mkdtempSync(join(tmpdir(), 'ieos-report-'));
  const out = join(dir, 'result.json');
  let allPassed = true;
  try {
    execFileSync(
      process.execPath,
      [
        join(repoRoot, 'node_modules/vitest/vitest.mjs'),
        'run',
        ...projects.flatMap((name) => ['--project', name]),
        '--reporter=json',
        `--outputFile=${out}`,
      ],
      { cwd: repoRoot, stdio: ['ignore', 'ignore', 'inherit'], timeout: 900_000 },
    );
  } catch {
    allPassed = false;
  }
  try {
    const report = JSON.parse(readFileSync(out, 'utf8')) as {
      numTotalTests?: number;
      numPassedTests?: number;
      testResults?: { name?: string }[];
    };
    const tests = report.numTotalTests ?? 0;
    const passed = report.numPassedTests ?? 0;
    if (passed !== tests) allPassed = false;
    return {
      suites: [
        {
          project: projects.length === 0 ? 'all' : projects.join('+'),
          files: report.testResults?.length ?? 0,
          tests,
          passed,
        },
      ],
      allPassed,
    };
  } finally {
    rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
}

function collect(target: string): void {
  // The projects this platform is asked to run. On Windows CI that is the smoke
  // subset; locally and on Linux CI it is everything.
  const projects = flag('--projects')?.split(',').filter(Boolean) ?? [];
  const { suites } = runSuites(projects);

  const evidence = collectPlatformEvidence({
    commit: flag('--commit') ?? git('rev-parse', 'HEAD'),
    runUrl: flag('--run-url') ?? null,
    suites,
  });

  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
  process.stdout.write(
    `collected ${evidence.platform} evidence: ${String(suites[0]?.tests ?? 0)} tests, ` +
      `snapshot ${evidence.digests.emptySnapshot}, tree ${evidence.digests.assetTreeWithNestedFiles}\n` +
      `written to ${target}\n`,
  );
}

/** Dormancy subjects that exist in the tree right now. */
function presentDormancySubjects(): string[] {
  const declared = new Set(FITNESS_RULES.flatMap((rule) => rule.dormantWhileAbsent));
  const present: string[] = [];
  for (const subject of declared) {
    try {
      readdirSync(join(repoRoot, subject));
      present.push(subject);
    } catch {
      // Absent, which is the expected state at Stage 0.
    }
  }
  return present;
}

/**
 * Decisions D18-D36 that no ADR mentions.
 *
 * Scanned rather than assumed. An earlier draft of this file passed an empty
 * array here, which made row G6 report PASS while inspecting nothing -- the
 * exact vacuous success this report exists to refuse.
 */
function decisionsWithoutAdr(): string[] {
  const adrDir = join(repoRoot, 'docs/adr');
  let adrText: string;
  try {
    adrText = readdirSync(adrDir)
      .filter((name) => name.endsWith('.md'))
      .map((name) => readFileSync(join(adrDir, name), 'utf8'))
      .join('\n');
  } catch {
    // No ADR directory at all: every decision is uncovered, which is a FAIL and
    // must not be reported as a pass.
    adrText = '';
  }

  const required = Array.from({ length: 19 }, (_unused, index) => `D${String(index + 18)}`);
  return required.filter((decision) => !new RegExp(`\\b${decision}\\b`, 'u').test(adrText));
}

function contractsUpToDate(): boolean {
  try {
    execFileSync(process.execPath, [join(repoRoot, 'tools/contracts-gen/src/cli.ts'), '--check'], {
      cwd: repoRoot,
      stdio: ['ignore', 'ignore', 'inherit'],
    });
    return true;
  } catch {
    return false;
  }
}

function report(evidenceDir: string, target: string): void {
  const platforms: PlatformEvidence[] = [];
  let files: string[] = [];
  try {
    files = readdirSync(evidenceDir).filter((name) => name.endsWith('.json'));
  } catch {
    files = [];
  }
  for (const name of files) {
    platforms.push(JSON.parse(readFileSync(join(evidenceDir, name), 'utf8')) as PlatformEvidence);
  }

  // The fitness suite and the champion property are measured here, in this run,
  // rather than taken on trust from a platform record.
  const fitness = runSuites(['fitness']);
  const champion = runSuites(['core']);

  const input: GateInput = {
    platforms,
    requiredPlatforms: REQUIRED_PLATFORMS,
    fitness: FITNESS_RULES.map((rule) => ({
      id: rule.id,
      status: rule.status,
      dormantWhileAbsent: rule.dormantWhileAbsent,
    })),
    presentDormancySubjects: presentDormancySubjects(),
    fitnessSuitePassed: fitness.allPassed,
    contractsUpToDate: contractsUpToDate(),
    decisionsWithoutAdr: decisionsWithoutAdr(),
    championProperty: champion.allPassed
      ? { passed: true, cases: 2000 }
      : { passed: false, cases: 0 },
    minimumTestsPerPlatform: MINIMUM_TESTS_PER_PLATFORM,
  };

  const gate = evaluateStage0(input);
  const text = renderReport({
    gate,
    platforms,
    generatedAt: new Date().toISOString(),
    commit: git('rev-parse', 'HEAD'),
    generator: 'tools/qualification-report',
  });

  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, text, 'utf8');
  process.stdout.write(`${text}\nwritten to ${target}\n`);

  // Exit code carries the verdict, so a caller cannot mistake "a report was
  // produced" for "the stage passed".
  process.exit(gate.verdict === 'PASS' ? 0 : 1);
}

if (args.includes('--collect')) {
  collect(flag('--collect') ?? join(repoRoot, 'qualification/evidence/platforms/local.json'));
} else if (args.includes('--report')) {
  report(
    flag('--evidence-dir') ?? join(repoRoot, 'qualification/evidence/platforms'),
    flag('--out') ?? join(repoRoot, 'qualification/reports/stage-00-report.md'),
  );
} else {
  process.stderr.write(
    'usage:\n  --collect <file> [--projects a,b] [--commit sha] [--run-url url]\n' +
      '  --report [--evidence-dir dir] [--out file]\n',
  );
  process.exit(2);
}
