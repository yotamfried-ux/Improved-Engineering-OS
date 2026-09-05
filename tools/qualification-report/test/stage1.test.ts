/**
 * The Stage 1 gate, and above all the ways it must decline to pass.
 *
 * Stage 1's rows rest on named tests and on commands that ran, which introduces
 * a failure mode Stage 0 did not have: a row can stop being checked without
 * anything failing. Rename the conformance test and the count stays high, the
 * suite stays green, and the row would report PASS over nothing at all. Most of
 * what follows is about that.
 */

import { describe, expect, it } from 'vitest';
import {
  collectPlatformEvidence,
  evaluateStage1,
  REQUIRED_COMMANDS,
  REQUIRED_TESTS,
  STAGE_0_EMPTY_SNAPSHOT_DIGEST,
  type PlatformEvidence,
  type Stage1GateInput,
} from '../src/index.ts';

const FIXED_CLOCK = () => new Date('2026-09-05T00:00:00.000Z');
const DIGEST = 'sha256:1111111111111111111111111111111111111111111111111111111111111111';

const allNamedTests = () =>
  Object.values(REQUIRED_TESTS)
    .flat()
    .map((name) => ({ name, status: 'passed' as const }));

const platform = (name: string, over: Partial<PlatformEvidence> = {}): PlatformEvidence => ({
  ...collectPlatformEvidence({
    commit: 'abc1234',
    suites: [{ project: 'all', files: 30, tests: 700, passed: 700, failed: [], skipped: 0 }],
    stage1: {
      commands: REQUIRED_COMMANDS.map((command) => ({
        name: command,
        argv: ['cli.ts', command],
        exitCode: 0,
      })),
      indexDigests: [DIGEST, DIGEST],
      namedTests: allNamedTests(),
    },
    now: FIXED_CLOCK,
  }),
  platform: name,
  ...over,
});

const healthy = (over: Partial<Stage1GateInput> = {}): Stage1GateInput => ({
  platforms: [platform('linux'), platform('win32')],
  requiredPlatforms: ['linux', 'win32'],
  fitness: [
    { id: 'F1a', status: 'enforced', dormantWhileAbsent: [] },
    { id: 'F5', status: 'not-yet-enforceable', dormantWhileAbsent: ['packages/launcher'] },
  ],
  presentDormancySubjects: [],
  fitnessSuitePassed: true,
  minimumTestsPerPlatform: 200,
  ...over,
});

/** The status of one row, so a test can name the row it is about. */
const rowStatus = (input: Stage1GateInput, id: string): string =>
  evaluateStage1(input).rows.find((row) => row.id === id)?.status ?? '(no such row)';

/** Every platform record, with one named test removed. */
const withoutTest = (name: string): PlatformEvidence[] =>
  ['linux', 'win32'].map((os) =>
    platform(os, {
      stage1: {
        commands: REQUIRED_COMMANDS.map((command) => ({
          name: command,
          argv: [],
          exitCode: 0,
        })),
        indexDigests: [DIGEST, DIGEST],
        namedTests: allNamedTests().filter((test) => test.name !== name),
      },
    }),
  );

describe('a healthy Stage 1 passes, so the negative controls below mean something', () => {
  it('returns PASS with nine rows when every row is satisfied', () => {
    const report = evaluateStage1(healthy());
    expect(report.stage).toBe(1);
    expect(report.rows).toHaveLength(9);
    expect(report.verdict).toBe('PASS');
    expect(report.summary).toBe('9 pass, 0 fail, 0 unproven');
  });
});

describe('a row never passes on a test nobody ran', () => {
  it('is unproven when a named conformance test is missing from the record', () => {
    // This is the failure mode the whole named-test design exists for: rename
    // the test and the suite is still green, the count is still high, and the
    // row is checking nothing.
    const missing = REQUIRED_TESTS['G6']?.[0] as string;
    expect(rowStatus(healthy({ platforms: withoutTest(missing) }), 'G6')).toBe('unproven');
  });

  it('says which platform and which test, so the report is actionable', () => {
    const missing = REQUIRED_TESTS['G3']?.[0] as string;
    const row = evaluateStage1(healthy({ platforms: withoutTest(missing) })).rows.find(
      (entry) => entry.id === 'G3',
    );
    expect(row?.evidence).toContain('linux');
    expect(row?.evidence).toContain(missing);
  });

  it('fails, rather than merely doubting, when a named test actually failed', () => {
    const failing = REQUIRED_TESTS['G5']?.[0] as string;
    const platforms = ['linux', 'win32'].map((os) =>
      platform(os, {
        stage1: {
          commands: REQUIRED_COMMANDS.map((c) => ({ name: c, argv: [], exitCode: 0 })),
          indexDigests: [DIGEST, DIGEST],
          namedTests: allNamedTests().map((test) =>
            test.name === failing ? { ...test, status: 'failed' as const } : test,
          ),
        },
      }),
    );
    expect(rowStatus(healthy({ platforms }), 'G5')).toBe('fail');
  });

  it('every behavioural row names at least one test', () => {
    // A row with an empty list would pass vacuously in an earlier draft of this
    // design; it now reports unproven, and this asserts none is empty anyway.
    for (const [id, names] of Object.entries(REQUIRED_TESTS)) {
      expect(names.length, `${id} names no test`).toBeGreaterThan(0);
    }
  });
});

describe('G1: the commands must actually have run', () => {
  it('fails when a command exited non-zero', () => {
    const platforms = ['linux', 'win32'].map((os) =>
      platform(os, {
        stage1: {
          commands: REQUIRED_COMMANDS.map((c) => ({
            name: c,
            argv: [],
            exitCode: c === 'ieos doctor' ? 1 : 0,
          })),
          indexDigests: [DIGEST, DIGEST],
          namedTests: allNamedTests(),
        },
      }),
    );
    expect(rowStatus(healthy({ platforms }), 'G1')).toBe('fail');
  });

  it('is unproven, not passing, when a command was never run at all', () => {
    const platforms = ['linux', 'win32'].map((os) =>
      platform(os, {
        stage1: {
          commands: [{ name: 'ieos doctor', argv: [], exitCode: 0 }],
          indexDigests: [DIGEST, DIGEST],
          namedTests: allNamedTests(),
        },
      }),
    );
    expect(rowStatus(healthy({ platforms }), 'G1')).toBe('unproven');
  });
});

describe('G7: two builds of one tree', () => {
  it('fails when the two builds disagree', () => {
    const platforms = ['linux', 'win32'].map((os) =>
      platform(os, {
        stage1: {
          commands: REQUIRED_COMMANDS.map((c) => ({ name: c, argv: [], exitCode: 0 })),
          indexDigests: [DIGEST, `${DIGEST.slice(0, -1)}2`],
          namedTests: allNamedTests(),
        },
      }),
    );
    expect(rowStatus(healthy({ platforms }), 'G7')).toBe('fail');
  });

  it('is unproven when only one build was recorded', () => {
    const platforms = ['linux', 'win32'].map((os) =>
      platform(os, {
        stage1: {
          commands: REQUIRED_COMMANDS.map((c) => ({ name: c, argv: [], exitCode: 0 })),
          indexDigests: [DIGEST],
          namedTests: allNamedTests(),
        },
      }),
    );
    expect(rowStatus(healthy({ platforms }), 'G7')).toBe('unproven');
  });
});

describe('G8: the snapshot is compared against Stage 0, not only across platforms', () => {
  it('passes when the measured digest is the one Stage 0 pinned', () => {
    // The fixture computes the digest rather than declaring it, so this also
    // asserts the pinned constant still describes the code.
    expect(platform('linux').digests.emptySnapshot).toBe(STAGE_0_EMPTY_SNAPSHOT_DIGEST);
    expect(rowStatus(healthy(), 'G8')).toBe('pass');
  });

  it('fails on a drift that is consistent across platforms', () => {
    // The dangerous case: a canonicalization change is identical everywhere, so
    // a cross-platform comparison alone would wave it through.
    const drifted = `sha256:${'9'.repeat(64)}`;
    const platforms = ['linux', 'win32'].map((os) =>
      platform(os, { digests: { emptySnapshot: drifted, assetTreeWithNestedFiles: DIGEST } }),
    );
    expect(rowStatus(healthy({ platforms }), 'G8')).toBe('fail');
  });
});

describe('missing evidence is never a pass', () => {
  it('is all unproven when only one platform reported', () => {
    const report = evaluateStage1(healthy({ platforms: [platform('linux')] }));
    expect(report.verdict).toBe('NOT PASSED');
    expect(report.rows.every((row) => row.status === 'unproven')).toBe(true);
  });

  it('is not a pass when no platform reported at all', () => {
    expect(evaluateStage1(healthy({ platforms: [] })).verdict).toBe('NOT PASSED');
  });

  it('is not a pass when a platform ran almost nothing', () => {
    // A record that discovered two tests must not stand in for a platform.
    const thin = platform('win32', {
      suites: [{ project: 'all', files: 1, tests: 2, passed: 2, failed: [], skipped: 0 }],
    });
    expect(evaluateStage1(healthy({ platforms: [platform('linux'), thin] })).verdict).toBe(
      'NOT PASSED',
    );
  });

  it('is not a pass when two platform records describe different commits', () => {
    const report = evaluateStage1(
      healthy({
        expectedCommit: 'abc1234',
        platforms: [
          platform('linux', { commit: 'abc1234' }),
          platform('win32', { commit: 'def5678' }),
        ],
      }),
    );
    expect(report.verdict).toBe('NOT PASSED');
    expect(report.rows.find((row) => row.id === 'G1')?.evidence).toContain('def5678');
  });

  it('is a pass when both records describe the report commit (control)', () => {
    expect(
      evaluateStage1(
        healthy({
          expectedCommit: 'abc1234',
          platforms: [
            platform('linux', { commit: 'abc1234' }),
            platform('win32', { commit: 'abc1234' }),
          ],
        }),
      ).verdict,
    ).toBe('PASS');
  });

  it('is not a pass when the fitness suite did not pass', () => {
    expect(evaluateStage1(healthy({ fitnessSuitePassed: false })).verdict).toBe('NOT PASSED');
  });

  it('is not a pass when a dormant rule’s subject has appeared', () => {
    expect(rowStatus(healthy({ presentDormancySubjects: ['packages/launcher'] }), 'G9')).toBe(
      'fail',
    );
  });
});
