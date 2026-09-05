/**
 * `pnpm report:stage0` / `pnpm report:stage1` -- generate a qualification report.
 *
 * Two modes, because a report about two platforms cannot be produced by one:
 *
 *   --collect <file>   run this platform's suites and write its evidence record
 *   --report           judge every collected record and write the report
 *
 * `--stage 1` adds the Stage 1 half: the three `ieos` commands are actually
 * executed and their exit codes recorded, the knowledge tree is built twice into
 * throwaway paths so the digests can be compared, and the individually named
 * tests the Stage 1 rows rest on are carried by name. A row whose named test is
 * absent from the record reads `unproven`, so deleting a conformance test breaks
 * the report rather than emptying it.
 *
 * The generator never reads the plan, the decision log or the status record.
 * Those are the documents the report exists to check, so trusting them would
 * make it a mirror rather than a check.
 */

import { execFileSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FITNESS_RULES } from '@ieos/fitness';
import {
  collectPlatformEvidence,
  type CommandResult,
  type NamedTestResult,
  type NamedTestStatus,
  type PlatformEvidence,
  type Stage1Evidence,
  type SuiteResult,
} from './evidence.ts';
import { evaluateStage0, type GateInput } from './gate.ts';
import { evaluateStage1, REQUIRED_TESTS, type Stage1GateInput } from './stage1.ts';
import { renderReport } from './render.ts';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const args = process.argv.slice(2);

/** Platforms Stage 0 requires, per the guide: Linux primary + one Windows smoke. */
const REQUIRED_PLATFORMS = ['linux', 'win32'];

/** A platform record below this is treated as having observed nothing. */
const MINIMUM_TESTS_PER_PLATFORM = 200;

/** Which stage is being collected or judged. Stage 0 remains the default. */
function stage(): number {
  const value = flag('--stage');
  return value === undefined ? 0 : Number.parseInt(value, 10);
}

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
function runSuites(projects: readonly string[]): {
  suites: SuiteResult[];
  allPassed: boolean;
  assertions: NamedTestResult[];
} {
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
      // stdout is inherited so a failure is visible in the log at the moment it
      // happens. Discarding it, as the first version of this did, hid the names
      // of failing tests from the only place anyone would look for them.
      { cwd: repoRoot, stdio: ['ignore', 'inherit', 'inherit'], timeout: 900_000 },
    );
  } catch {
    allPassed = false;
  }
  try {
    const report = JSON.parse(readFileSync(out, 'utf8')) as {
      numTotalTests?: number;
      numPassedTests?: number;
      testResults?: {
        name?: string;
        assertionResults?: { status?: string; fullName?: string }[];
      }[];
    };
    const tests = report.numTotalTests ?? 0;
    const passed = report.numPassedTests ?? 0;

    const failed = (report.testResults ?? []).flatMap((file) =>
      (file.assertionResults ?? [])
        .filter((assertion) => assertion.status === 'failed')
        .map((assertion) => assertion.fullName ?? '(unnamed test)'),
    );
    if (failed.length > 0) {
      allPassed = false;
      process.stderr.write(`\nfailing tests in this run:\n  ${failed.join('\n  ')}\n\n`);
    }
    // Whatever is neither passed nor failed was skipped. Kept as its own number
    // rather than folded into either: skipped is unproven, not failed.
    const skipped = Math.max(0, tests - passed - failed.length);

    // Every assertion by full name, so a row can rest on a specific test rather
    // than on a count that would survive that test's deletion.
    const assertions: NamedTestResult[] = (report.testResults ?? []).flatMap((file) =>
      (file.assertionResults ?? []).map((assertion) => ({
        name: assertion.fullName ?? '(unnamed test)',
        status: (assertion.status === 'passed'
          ? 'passed'
          : assertion.status === 'failed'
            ? 'failed'
            : 'skipped') as NamedTestStatus,
      })),
    );

    return {
      suites: [
        {
          project: projects.length === 0 ? 'all' : projects.join('+'),
          files: report.testResults?.length ?? 0,
          tests,
          passed,
          failed,
          skipped,
        },
      ],
      allPassed,
      assertions,
    };
  } finally {
    rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
}

/**
 * Run one command and record its exit code.
 *
 * The command genuinely runs: G1 asks whether `pnpm ieos` works from a source
 * checkout, and no test of the pieces answers that. Output goes to the log so a
 * non-zero code has a cause on the same page as the number.
 */
function runCommand(name: string, argv: readonly string[]): CommandResult {
  try {
    execFileSync(process.execPath, [...argv], {
      cwd: repoRoot,
      stdio: ['ignore', 'inherit', 'inherit'],
      timeout: 300_000,
    });
    return { name, argv: [...argv], exitCode: 0 };
  } catch (error) {
    const status = (error as { status?: number }).status;
    // A signal or a spawn failure has no exit code. Recording 1 rather than 0
    // is the safe direction: an unrecorded failure must not read as success.
    return { name, argv: [...argv], exitCode: typeof status === 'number' ? status : 1 };
  }
}

/**
 * The Stage 1 half of this platform's record.
 *
 * `ieos init` is pointed at a throwaway directory: it writes a footprint into
 * whatever project it is given, and the repository is not a target project --
 * the CLI refuses that case, which is itself the behaviour being relied on here.
 */
function collectStage1(assertions: readonly NamedTestResult[]): Stage1Evidence {
  const scratch = mkdtempSync(join(tmpdir(), 'ieos-stage1-'));
  try {
    const commands: CommandResult[] = [
      runCommand('ieos doctor', [join(repoRoot, 'packages/adapters/cli/src/cli.ts'), 'doctor']),
      runCommand('ieos init', [
        join(repoRoot, 'packages/adapters/cli/src/cli.ts'),
        'init',
        '--project',
        join(scratch, 'project'),
      ]),
      runCommand('build:index', [join(repoRoot, 'packages/releases/src/build-index-cli.ts')]),
    ];

    // Two builds of the same tree into two throwaway paths (F8). Built here as
    // well as in the unit test, because this measures the machine and
    // filesystem the report is actually speaking about.
    const digests: string[] = [];
    for (const nth of ['first', 'second']) {
      const out = join(scratch, `${nth}.sqlite`);
      const result = runCommand(`build:index (${nth})`, [
        join(repoRoot, 'packages/releases/src/build-index-cli.ts'),
        '--out',
        out,
      ]);
      if (result.exitCode !== 0) continue;
      digests.push(indexDigestOf(out));
    }

    // Only the tests the gate names are carried, and only as the runner
    // reported them. One that did not run simply does not appear, which the
    // gate reads as `missing` rather than as a pass.
    const wanted = new Set(Object.values(REQUIRED_TESTS).flat());
    const namedTests = assertions.filter((assertion) => wanted.has(assertion.name));

    return { commands, indexDigests: digests, namedTests };
  } finally {
    rmSync(scratch, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
}

/**
 * Read an index's recorded digest back out of the file that was just written.
 *
 * Read from the artifact rather than parsed from the builder's stdout: the
 * point of the row is that two builds produced the same *index*, and stdout is
 * a description of one.
 */
function indexDigestOf(path: string): string {
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    const digestRow = db.prepare('select value from meta where key = ?').get('index_digest') as
      Record<string, unknown> | undefined;
    return digestRow === undefined ? 'unreadable' : String(digestRow['value']);
  } finally {
    db.close();
  }
}

function collect(target: string): void {
  // The projects this platform is asked to run. On Windows CI that is the smoke
  // subset; locally and on Linux CI it is everything.
  const projects = flag('--projects')?.split(',').filter(Boolean) ?? [];
  const { suites, assertions } = runSuites(projects);

  const evidence = collectPlatformEvidence({
    commit: flag('--commit') ?? git('rev-parse', 'HEAD'),
    runUrl: flag('--run-url') ?? null,
    suites,
    stage1: stage() >= 1 ? collectStage1(assertions) : null,
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

  // The fitness suite is measured here, in this run, rather than taken on trust
  // from a platform record.
  const fitness = runSuites(['fitness']);

  const shared = {
    platforms,
    requiredPlatforms: REQUIRED_PLATFORMS,
    fitness: FITNESS_RULES.map((rule) => ({
      id: rule.id,
      status: rule.status,
      dormantWhileAbsent: rule.dormantWhileAbsent,
    })),
    presentDormancySubjects: presentDormancySubjects(),
    fitnessSuitePassed: fitness.allPassed,
    minimumTestsPerPlatform: MINIMUM_TESTS_PER_PLATFORM,
    // Every platform record must describe the tree this report is about.
    expectedCommit: flag('--commit') ?? git('rev-parse', 'HEAD'),
  };

  const gate =
    stage() >= 1
      ? evaluateStage1(shared satisfies Stage1GateInput)
      : evaluateStage0(stage0(shared));

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

/** The Stage 0 rows need three measurements Stage 1's do not. */
function stage0(shared: Stage1GateInput): GateInput {
  // The named property tests as this run observed them, not "the core project
  // was green, so presumably". See `CHAMPION_PROPERTY_TESTS`.
  const champion = runSuites(['core']);
  return {
    ...shared,
    contractsUpToDate: contractsUpToDate(),
    decisionsWithoutAdr: decisionsWithoutAdr(),
    championProperty: champion.assertions.map((assertion) => ({
      name: assertion.name,
      status: assertion.status === 'missing' ? 'skipped' : assertion.status,
    })),
  };
}

if (args.includes('--collect')) {
  collect(flag('--collect') ?? join(repoRoot, 'qualification/evidence/platforms/local.json'));
} else if (args.includes('--report')) {
  report(
    flag('--evidence-dir') ?? join(repoRoot, 'qualification/evidence/platforms'),
    flag('--out') ?? join(repoRoot, `qualification/reports/stage-0${String(stage())}-report.md`),
  );
} else {
  process.stderr.write(
    'usage:\n  --collect <file> [--stage n] [--projects a,b] [--commit sha] [--run-url url]\n' +
      '  --report [--stage n] [--evidence-dir dir] [--out file]\n',
  );
  process.exit(2);
}
