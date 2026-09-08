/**
 * The Stage 2 gate, and above all its ability to withhold a pass.
 *
 * The same discipline as Stage 0's and Stage 1's tests: a generator that cannot
 * say NOT PASSED is a rubber stamp. So most of what follows is negative
 * controls, and two of them are specific to Stage 2's own additions -- the
 * corpus measurement, which no test asserts, and the `any-platform` rows, which
 * are the one place this stage relaxes a rule Stage 0 and Stage 1 held.
 */

import { describe, expect, it } from 'vitest';
import {
  collectPlatformEvidence,
  evaluateStage2,
  REQUIRED_ASSET_TYPES,
  SEED_CORPUS,
  STAGE_2_TESTS,
  type KnowledgeEvidence,
  type PlatformEvidence,
  type Stage2GateInput,
} from '../src/index.ts';

const FIXED_CLOCK = () => new Date('2026-09-08T00:00:00.000Z');

const healthyKnowledge: KnowledgeEvidence = {
  assetCount: 13,
  byType: { pattern: 6, lesson: 5, failed_solution: 1, control_guidance: 1 },
  solutionSetCount: 1,
  setsWithAlternatives: 1,
  unresolvedSets: 1,
  withProvenance: 13,
};

/** Every named test the gate asks for, all passing. */
const allPassing = () =>
  Object.values(STAGE_2_TESTS)
    .flat()
    .map((name) => ({ name, status: 'passed' as const }));

const platform = (over: Partial<PlatformEvidence> = {}): PlatformEvidence => ({
  ...collectPlatformEvidence({
    commit: 'abc1234',
    suites: [{ project: 'all', files: 40, tests: 900, passed: 900, failed: [], skipped: 0 }],
    stage2: { knowledge: healthyKnowledge, namedTests: allPassing() },
    now: FIXED_CLOCK,
  }),
  ...over,
});

const healthy = (over: Partial<Stage2GateInput> = {}): Stage2GateInput => ({
  platforms: [platform({ platform: 'linux' }), platform({ platform: 'win32' })],
  requiredPlatforms: ['linux', 'win32'],
  fitness: [
    { id: 'F1a', status: 'enforced', dormantWhileAbsent: [] },
    { id: 'F5', status: 'not-yet-enforceable', dormantWhileAbsent: ['packages/launcher'] },
  ],
  presentDormancySubjects: [],
  fitnessSuitePassed: true,
  minimumTestsPerPlatform: 200,
  expectedCommit: 'abc1234',
  ...over,
});

const rowOf = (input: Stage2GateInput, id: string) =>
  evaluateStage2(input).rows.find((row) => row.id === id);

describe('the gate passes only over complete evidence', () => {
  it('is PASS when both platforms reported everything', () => {
    expect(evaluateStage2(healthy()).verdict).toBe('PASS');
  });

  it('is NOT PASSED when a platform is missing entirely', () => {
    const input = healthy({ platforms: [platform({ platform: 'linux' })] });
    expect(evaluateStage2(input).verdict).toBe('NOT PASSED');
    expect(rowOf(input, 'H2')?.status).toBe('unproven');
  });
});

describe('negative controls: a named test the record does not mention', () => {
  it('is unproven, not passing, when a test was renamed or deleted', () => {
    // The whole reason rows rest on names rather than counts: deleting the
    // conformance file and leaving one trivial test behind must not pass.
    const thinned = platform({
      platform: 'win32',
      stage2: {
        knowledge: healthyKnowledge,
        namedTests: allPassing().filter((test) => test.name !== STAGE_2_TESTS['H7']?.[0]),
      },
    });
    const input = healthy({ platforms: [platform({ platform: 'linux' }), thinned] });
    expect(rowOf(input, 'H7')?.status).toBe('unproven');
    expect(rowOf(input, 'H7')?.evidence).toContain('renamed or removed');
  });

  it('is FAIL, not unproven, when a named test actually failed', () => {
    const failing = platform({
      platform: 'linux',
      stage2: {
        knowledge: healthyKnowledge,
        namedTests: allPassing().map((test) =>
          test.name === STAGE_2_TESTS['H7']?.[0] ? { ...test, status: 'failed' as const } : test,
        ),
      },
    });
    const input = healthy({ platforms: [failing, platform({ platform: 'win32' })] });
    expect(rowOf(input, 'H7')?.status).toBe('fail');
  });
});

describe('the any-platform rows relax one thing and not another', () => {
  it('passes H5 when the plane suite ran on linux and skipped on win32', () => {
    // The intended case: CI provides PostgreSQL on one platform.
    const skipped = platform({
      platform: 'win32',
      stage2: {
        knowledge: healthyKnowledge,
        namedTests: allPassing().map((test) =>
          (STAGE_2_TESTS['H5'] ?? []).includes(test.name)
            ? { ...test, status: 'skipped' as const }
            : test,
        ),
      },
    });
    const input = healthy({ platforms: [platform({ platform: 'linux' }), skipped] });
    expect(rowOf(input, 'H5')?.status).toBe('pass');
    expect(rowOf(input, 'H5')?.evidence).toContain('at least one required platform');
  });

  it('still FAILS H5 when the plane suite failed on the platform that ran it', () => {
    // "Proven somewhere" is a reading of absence, never of a contradiction.
    const failing = platform({
      platform: 'linux',
      stage2: {
        knowledge: healthyKnowledge,
        namedTests: allPassing().map((test) =>
          test.name === STAGE_2_TESTS['H5']?.[0] ? { ...test, status: 'failed' as const } : test,
        ),
      },
    });
    const input = healthy({ platforms: [failing, platform({ platform: 'win32' })] });
    expect(rowOf(input, 'H5')?.status).toBe('fail');
  });

  it('is unproven when NO platform ran the plane suite', () => {
    // A row that passed because nobody anywhere ran its tests would be the
    // vacuous success this repository has already hit once.
    const without = (name: string) =>
      platform({
        platform: name,
        stage2: {
          knowledge: healthyKnowledge,
          namedTests: allPassing().filter(
            (test) => !(STAGE_2_TESTS['H5'] ?? []).includes(test.name),
          ),
        },
      });
    const input = healthy({ platforms: [without('linux'), without('win32')] });
    expect(rowOf(input, 'H5')?.status).toBe('unproven');
  });

  it('does not relax the rows that are not on the list', () => {
    // H7 is platform behaviour: the hook adapter runs wherever the agent does.
    const skipped = platform({
      platform: 'win32',
      stage2: {
        knowledge: healthyKnowledge,
        namedTests: allPassing().map((test) =>
          (STAGE_2_TESTS['H7'] ?? []).includes(test.name)
            ? { ...test, status: 'skipped' as const }
            : test,
        ),
      },
    });
    const input = healthy({ platforms: [platform({ platform: 'linux' }), skipped] });
    expect(rowOf(input, 'H7')?.status).toBe('unproven');
  });
});

describe('the seeded corpus is measured, not asserted', () => {
  const withKnowledge = (knowledge: KnowledgeEvidence): Stage2GateInput => ({
    ...healthy(),
    platforms: [
      platform({ platform: 'linux', stage2: { knowledge, namedTests: allPassing() } }),
      platform({ platform: 'win32', stage2: { knowledge, namedTests: allPassing() } }),
    ],
  });

  it('fails a corpus below the range the guide fixes', () => {
    const input = withKnowledge({ ...healthyKnowledge, assetCount: SEED_CORPUS.min - 1 });
    expect(rowOf(input, 'H1')?.status).toBe('fail');
    expect(rowOf(input, 'H1')?.evidence).toContain('outside the');
  });

  it('fails a corpus above it, because "10-20" is a range and not a floor', () => {
    expect(rowOf(withKnowledge({ ...healthyKnowledge, assetCount: 21 }), 'H1')?.status).toBe(
      'fail',
    );
  });

  it.each(REQUIRED_ASSET_TYPES)('fails when the seed carries no %s', (type) => {
    const byType = { ...healthyKnowledge.byType, [type]: 0 };
    const input = withKnowledge({ ...healthyKnowledge, byType });
    expect(rowOf(input, 'H1')?.status).toBe('fail');
    expect(rowOf(input, 'H1')?.evidence).toContain(type);
  });

  it('fails when no Solution Set holds two alternatives', () => {
    const input = withKnowledge({ ...healthyKnowledge, setsWithAlternatives: 0 });
    expect(rowOf(input, 'H1')?.status).toBe('fail');
  });

  it('fails when an asset carries no provenance', () => {
    // Provenance that cannot name its source is not provenance (D6, D16).
    const input = withKnowledge({ ...healthyKnowledge, withProvenance: 12 });
    expect(rowOf(input, 'H1')?.status).toBe('fail');
    expect(rowOf(input, 'H1')?.evidence).toContain('provenance');
  });

  it('is unproven, not passing, when no measurement was recorded at all', () => {
    const input = healthy({
      platforms: [
        platform({ platform: 'linux', stage2: null }),
        platform({ platform: 'win32', stage2: null }),
      ],
    });
    expect(rowOf(input, 'H1')?.status).toBe('fail');
    expect(rowOf(input, 'H1')?.evidence).toContain('no knowledge measurement');
  });
});

describe('every row rests on something', () => {
  it('names at least one test for every row except the measured and fitness ones', () => {
    // A row with no named test would pass by having nothing to check, which is
    // exactly the failure mode this file exists to prevent.
    const rows = evaluateStage2(healthy()).rows.map((row) => row.id);
    for (const id of rows) {
      if (id === 'H11') continue; // the shared fitness judgement
      expect((STAGE_2_TESTS[id] ?? []).length, `${id} names no test`).toBeGreaterThan(0);
    }
  });
});
