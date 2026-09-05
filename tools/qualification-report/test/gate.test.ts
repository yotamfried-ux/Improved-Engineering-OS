/**
 * The report generator, and above all its ability to withhold a pass.
 *
 * A qualification report is the only artifact permitted to claim a gate passed.
 * That makes its failure modes more important than its success mode: a
 * generator that cannot say NOT PASSED is a rubber stamp, and one that says
 * PASS over missing evidence is worse than no report at all.
 *
 * So most of what follows is negative controls.
 */

import { describe, expect, it } from 'vitest';
import {
  ASSET_TREE_FIXTURE,
  CHAMPION_PROPERTY_TESTS,
  collectPlatformEvidence,
  evaluateStage0,
  renderReport,
  type GateInput,
  type PlatformEvidence,
} from '../src/index.ts';

const FIXED_CLOCK = () => new Date('2026-09-05T00:00:00.000Z');

const platform = (over: Partial<PlatformEvidence> = {}): PlatformEvidence => ({
  ...collectPlatformEvidence({
    commit: 'abc1234',
    suites: [{ project: 'core', files: 10, tests: 300, passed: 300, failed: [], skipped: 0 }],
    now: FIXED_CLOCK,
  }),
  ...over,
});

const healthyInput = (over: Partial<GateInput> = {}): GateInput => ({
  platforms: [
    platform({ platform: 'linux' }),
    platform({ platform: 'win32', nodeVersion: '24.20.0' }),
  ],
  requiredPlatforms: ['linux', 'win32'],
  fitness: [
    { id: 'F1a', status: 'enforced', dormantWhileAbsent: [] },
    { id: 'F5', status: 'not-yet-enforceable', dormantWhileAbsent: ['packages/launcher'] },
  ],
  presentDormancySubjects: [],
  fitnessSuitePassed: true,
  contractsUpToDate: true,
  decisionsWithoutAdr: [],
  championProperty: CHAMPION_PROPERTY_TESTS.map((name: string) => ({
    name,
    status: 'passed' as const,
  })),
  minimumTestsPerPlatform: 200,
  ...over,
});

describe('the fixture the gate names is the one that is measured', () => {
  it('includes an asset tree with nested files/ entries', () => {
    // Row G2 is specifically about nested `files/`. A fixture without them
    // would make the row pass while testing the thing it does not name.
    const paths = ASSET_TREE_FIXTURE.map((entry) => entry.path);
    expect(paths.some((path) => path.startsWith('files/nested/'))).toBe(true);
    expect(paths.some((path) => !path.includes('/'))).toBe(true);
  });

  it('computes digests rather than reading them from a constant', () => {
    const evidence = platform();
    expect(evidence.digests.assetTreeWithNestedFiles).toMatch(/^sha256:[0-9a-f]{64}$/u);
    expect(evidence.digests.emptySnapshot).toMatch(/^sha256:[0-9a-f]{64}$/u);
    expect(evidence.digests.assetTreeWithNestedFiles).not.toBe(evidence.digests.emptySnapshot);
  });
});

describe('a healthy stage passes', () => {
  it('returns PASS when every row is satisfied', () => {
    const report = evaluateStage0(healthyInput());
    const failures = report.rows.filter((row) => row.status !== 'pass');
    expect(failures.map((row) => `${row.id}: ${row.evidence}`)).toEqual([]);
    expect(report.verdict).toBe('PASS');
  });

  it('evaluates all six Stage 0 gate rows, with none silently missing', () => {
    expect(evaluateStage0(healthyInput()).rows.map((row) => row.id)).toEqual([
      'G1',
      'G2',
      'G3',
      'G4',
      'G5',
      'G6',
    ]);
  });

  it('gives every row evidence, not just a status', () => {
    for (const row of evaluateStage0(healthyInput()).rows) {
      expect(row.evidence.length, `${row.id} has no evidence`).toBeGreaterThan(20);
    }
  });
});

describe('negative controls: the report can withhold a pass', () => {
  it('is NOT PASSED when a required platform never reported', () => {
    const report = evaluateStage0(healthyInput({ platforms: [platform({ platform: 'linux' })] }));
    expect(report.verdict).toBe('NOT PASSED');
    // Absent, not wrong: the distinction the whole status model exists for.
    expect(report.rows.find((row) => row.id === 'G2')?.status).toBe('unproven');
    expect(report.rows.find((row) => row.id === 'G4')?.status).toBe('unproven');
  });

  it('is NOT PASSED, and says FAIL, when the two platforms disagree on a digest', () => {
    const drifted = platform({ platform: 'win32' });
    const report = evaluateStage0(
      healthyInput({
        platforms: [
          platform({ platform: 'linux' }),
          {
            ...drifted,
            digests: { ...drifted.digests, emptySnapshot: 'sha256:' + 'f'.repeat(64) },
          },
        ],
      }),
    );
    expect(report.rows.find((row) => row.id === 'G4')?.status).toBe('fail');
    expect(report.rows.find((row) => row.id === 'G4')?.evidence).toMatch(/differ/u);
    expect(report.verdict).toBe('NOT PASSED');
  });

  it('does not count a platform whose suite ran almost nothing', () => {
    // The vacuity failure, at the platform level: a record that technically
    // exists but observed nothing must not satisfy a platform requirement.
    const report = evaluateStage0(
      healthyInput({
        platforms: [
          platform({ platform: 'linux' }),
          platform({
            platform: 'win32',
            suites: [{ project: 'core', files: 1, tests: 2, passed: 2, failed: [], skipped: 0 }],
          }),
        ],
      }),
    );
    expect(report.rows.find((row) => row.id === 'G4')?.status).toBe('unproven');
    expect(report.verdict).toBe('NOT PASSED');
  });

  it('does not count a platform whose suite had failures', () => {
    const report = evaluateStage0(
      healthyInput({
        platforms: [
          platform({ platform: 'linux' }),
          platform({
            platform: 'win32',
            suites: [
              {
                project: 'core',
                files: 10,
                tests: 300,
                passed: 299,
                failed: ['core > a broken test'],
                skipped: 0,
              },
            ],
          }),
        ],
      }),
    );
    expect(report.verdict).toBe('NOT PASSED');
  });

  it('DOES count a platform that skipped tests but failed none', () => {
    // Skipped is not failed. Two legitimately skipped tests -- a fixture that
    // exists on one machine and not on a runner -- must not disqualify a whole
    // platform. The first version of this gate required passed === total and so
    // could never pass at all, which is a check wrong in the safe direction and
    // still wrong.
    const report = evaluateStage0(
      healthyInput({
        platforms: [
          platform({ platform: 'linux' }),
          platform({
            platform: 'win32',
            suites: [
              { project: 'core', files: 10, tests: 300, passed: 298, failed: [], skipped: 2 },
            ],
          }),
        ],
      }),
    );
    expect(report.rows.find((row) => row.id === 'G4')?.status).toBe('pass');
    expect(report.verdict).toBe('PASS');
  });

  it('does not count a platform that reached the floor only by skipping', () => {
    // The other half: a platform must clear the floor on tests that actually
    // PASSED, so discovering many tests and then declining to run them cannot
    // satisfy a requirement.
    const report = evaluateStage0(
      healthyInput({
        platforms: [
          platform({ platform: 'linux' }),
          platform({
            platform: 'win32',
            suites: [
              { project: 'core', files: 10, tests: 300, passed: 10, failed: [], skipped: 290 },
            ],
          }),
        ],
      }),
    );
    expect(report.rows.find((row) => row.id === 'G4')?.status).toBe('unproven');
    expect(report.verdict).toBe('NOT PASSED');
  });

  it('is NOT PASSED when a dormant fitness rule names no subject', () => {
    const report = evaluateStage0(
      healthyInput({
        fitness: [{ id: 'F5', status: 'not-yet-enforceable', dormantWhileAbsent: [] }],
      }),
    );
    expect(report.rows.find((row) => row.id === 'G1')?.status).toBe('fail');
    expect(report.verdict).toBe('NOT PASSED');
  });

  it("is NOT PASSED when a dormant rule's subject has appeared", () => {
    // The owner's C-10 reading, enforced in the report itself: dormancy that
    // has outlived its reason is not a pass.
    const report = evaluateStage0(healthyInput({ presentDormancySubjects: ['packages/launcher'] }));
    expect(report.rows.find((row) => row.id === 'G1')?.status).toBe('fail');
    expect(report.rows.find((row) => row.id === 'G1')?.evidence).toMatch(/expired/u);
    expect(report.verdict).toBe('NOT PASSED');
  });

  it('is NOT PASSED when the fitness suite did not pass', () => {
    expect(evaluateStage0(healthyInput({ fitnessSuitePassed: false })).verdict).toBe('NOT PASSED');
  });

  it('is NOT PASSED when contracts/schemas has a diff', () => {
    const report = evaluateStage0(healthyInput({ contractsUpToDate: false }));
    expect(report.rows.find((row) => row.id === 'G5')?.status).toBe('fail');
    expect(report.verdict).toBe('NOT PASSED');
  });

  it('is NOT PASSED when a decision has no ADR', () => {
    const report = evaluateStage0(healthyInput({ decisionsWithoutAdr: ['D29'] }));
    expect(report.rows.find((row) => row.id === 'G6')?.evidence).toMatch(/D29/u);
    expect(report.verdict).toBe('NOT PASSED');
  });

  it('is NOT PASSED when the champion property test never ran', () => {
    const report = evaluateStage0(healthyInput({ championProperty: null }));
    expect(report.rows.find((row) => row.id === 'G3')?.status).toBe('unproven');
    expect(report.verdict).toBe('NOT PASSED');
  });

  it('is NOT PASSED when a named champion property test is missing from the run', () => {
    // The failure this design exists for: rename or delete
    // `champion.property.test.ts` and the `core` project stays green. A row
    // that read "core passed, so the property held over 2000 cases" would keep
    // saying so about a property nobody checked.
    const [dropped, ...rest] = CHAMPION_PROPERTY_TESTS;
    const report = evaluateStage0(
      healthyInput({
        championProperty: rest.map((name: string) => ({ name, status: 'passed' as const })),
      }),
    );
    const g3 = report.rows.find((row) => row.id === 'G3');
    expect(g3?.status).toBe('unproven');
    expect(g3?.evidence).toContain(dropped);
    expect(report.verdict).toBe('NOT PASSED');
  });

  it('is NOT PASSED when a named champion property test failed', () => {
    const report = evaluateStage0(
      healthyInput({
        championProperty: CHAMPION_PROPERTY_TESTS.map((name: string, index: number) => ({
          name,
          status: index === 0 ? ('failed' as const) : ('passed' as const),
        })),
      }),
    );
    expect(report.rows.find((row) => row.id === 'G3')?.status).toBe('fail');
    expect(report.verdict).toBe('NOT PASSED');
  });

  it('is NOT PASSED when two platform records describe different commits', () => {
    // Both green, both non-vacuous, and comparing them proves nothing: a digest
    // "identical on 2 platforms" would be comparing two different trees.
    const report = evaluateStage0(
      healthyInput({
        expectedCommit: 'abc1234',
        platforms: [
          platform({ platform: 'linux', commit: 'abc1234' }),
          platform({ platform: 'win32', commit: 'def5678' }),
        ],
      }),
    );
    expect(report.verdict).toBe('NOT PASSED');
    expect(report.rows.find((row) => row.id === 'G2')?.evidence).toContain('def5678');
  });

  it('passes when both records describe the commit the report is about (control)', () => {
    const report = evaluateStage0(
      healthyInput({
        expectedCommit: 'abc1234',
        platforms: [
          platform({ platform: 'linux', commit: 'abc1234' }),
          platform({ platform: 'win32', commit: 'abc1234' }),
        ],
      }),
    );
    expect(report.verdict).toBe('PASS');
  });

  it('is NOT PASSED when no fitness rules were supplied at all', () => {
    const report = evaluateStage0(healthyInput({ fitness: [] }));
    expect(report.rows.find((row) => row.id === 'G1')?.status).toBe('unproven');
    expect(report.verdict).toBe('NOT PASSED');
  });

  it('is NOT PASSED with no platform evidence whatsoever', () => {
    // The rubber-stamp case. A generator handed nothing must not bless a stage.
    const report = evaluateStage0(healthyInput({ platforms: [] }));
    expect(report.verdict).toBe('NOT PASSED');
    expect(report.rows.filter((row) => row.status === 'unproven').length).toBeGreaterThan(0);
  });
});

describe('the rendered report tells the reader what it rests on', () => {
  const render = (gateInput: GateInput): string =>
    renderReport({
      gate: evaluateStage0(gateInput),
      platforms: gateInput.platforms,
      generatedAt: '2026-09-05T00:00:00.000Z',
      commit: 'abc1234',
      generator: 'tools/qualification-report',
    });

  it('states the verdict prominently and names every row', () => {
    const text = render(healthyInput());
    expect(text).toContain('**Verdict: PASS**');
    for (const id of ['G1', 'G2', 'G3', 'G4', 'G5', 'G6']) expect(text).toContain(id);
  });

  it('explains itself when it is not a pass', () => {
    const text = render(healthyInput({ platforms: [platform({ platform: 'linux' })] }));
    expect(text).toContain('**Verdict: NOT PASSED**');
    expect(text).toContain('Why this is not a pass');
    expect(text).toContain('UNPROVEN');
  });

  it('shows the digests each platform actually produced', () => {
    const text = render(healthyInput());
    expect(text).toContain('Asset-tree digest');
    expect(text).toContain('Empty-snapshot digest');
    expect(text).toContain('`linux`');
    expect(text).toContain('`win32`');
  });

  it('names the failing tests when a platform record carries failures', () => {
    // Otherwise "287 of 290" is an answer nobody can act on, and the log that
    // held the names has expired.
    const text = render(
      healthyInput({
        platforms: [
          platform({ platform: 'linux' }),
          platform({
            platform: 'win32',
            suites: [
              {
                project: 'core',
                files: 10,
                tests: 300,
                passed: 299,
                failed: ['core > hashing > pins a digest'],
                skipped: 0,
              },
            ],
          }),
        ],
      }),
    );
    expect(text).toContain('Failing tests on `win32`');
    expect(text).toContain('core > hashing > pins a digest');
  });

  it('says plainly when it rests on nothing', () => {
    const text = render(healthyInput({ platforms: [] }));
    expect(text).toContain('No platform records were supplied');
  });
});
