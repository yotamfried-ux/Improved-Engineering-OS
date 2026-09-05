/**
 * Stage 0 exit-gate evaluation.
 *
 * The rows are the six the frozen guide lists for Stage 0, verbatim in intent:
 *
 *   1. F1-F12 green on Linux + Windows smoke
 *   2. the D35 cross-platform hashing fixture yields identical digests on both,
 *      including an asset tree with nested `files/` entries
 *   3. a property test proves a Solution Set with `champion_id: null` never
 *      yields a Champion in any resolver path
 *   4. the UNPROVEN bootstrap snapshot hashes identically on both
 *   5. `contracts/schemas/` regenerated with no diff
 *   6. ADRs exist for D18-D36
 *
 * Row 1 is read per the owner's approved interpretation (deviation C-10): every
 * rule enforceable at this stage is green, and every rule whose subject belongs
 * to a later stage is explicitly dormant *and* guarded, so dormancy cannot
 * become a silent pass.
 *
 * Two design rules, both load-bearing:
 *
 *   Nothing here trusts a document. Every row is decided from measurements
 *   passed in, and a row with no measurement is `unproven`, never `pass`.
 *
 *   The verdict is conjunctive and pessimistic. An empty row set is NOT a pass,
 *   because a report that inspected nothing is the failure this whole
 *   repository keeps guarding against.
 */

import type { PlatformEvidence } from './evidence.ts';
import { failures, totalPassed } from './evidence.ts';

export type RowStatus = 'pass' | 'fail' | 'unproven';

export interface GateRow {
  readonly id: string;
  readonly requirement: string;
  readonly status: RowStatus;
  /** What was measured. Never empty. */
  readonly evidence: string;
}

/**
 * The part of a gate input every stage shares: which platform records exist,
 * which are required, and how much a record must contain to count.
 *
 * Split out so Stage 1 reuses the Stage 0 platform arithmetic rather than
 * writing a second, subtly different version of "is this record usable".
 */
export interface PlatformSet {
  /** One record per platform observed. Keyed by nothing; duplicates are an error. */
  readonly platforms: readonly PlatformEvidence[];
  /** Platforms the stage requires. */
  readonly requiredPlatforms: readonly string[];
  /** Minimum tests a platform must have run for its record to count. */
  readonly minimumTestsPerPlatform: number;
}

/** The fitness half, shared by Stage 0 row G1 and Stage 1 row G9. */
export interface FitnessInput {
  readonly fitness: readonly {
    readonly id: string;
    readonly status: string;
    readonly dormantWhileAbsent: readonly string[];
  }[];
  readonly presentDormancySubjects: readonly string[];
  readonly fitnessSuitePassed: boolean;
}

export interface GateInput extends PlatformSet, FitnessInput {
  /** Did `contracts:check` report no diff? */
  readonly contractsUpToDate: boolean;
  /** Decisions D18-D36 with no ADR covering them. */
  readonly decisionsWithoutAdr: readonly string[];
  /** Did the champion/Solution-Set property test pass, and how many cases? */
  readonly championProperty: { readonly passed: boolean; readonly cases: number } | null;
}

export interface GateReport {
  readonly stage: number;
  readonly rows: readonly GateRow[];
  readonly verdict: 'PASS' | 'NOT PASSED';
  readonly summary: string;
}

export function row(id: string, requirement: string, status: RowStatus, evidence: string): GateRow {
  return { id, requirement, status, evidence };
}

/**
 * Platforms whose record is present, non-vacuous, and free of failures.
 *
 * Two conditions, and the difference between them matters:
 *
 *   enough tests actually PASSED -- counted on passes, not on the total, so a
 *   platform that skipped almost everything cannot satisfy a requirement by
 *   having discovered a lot of tests it then declined to run;
 *
 *   nothing FAILED. Skips are not failures. An earlier version required
 *   `passed === total`, which treated two legitimately skipped tests as
 *   disqualifying and made the report incapable of ever passing -- a check
 *   wrong in the safe direction is still wrong.
 */
export function usablePlatforms(input: PlatformSet): PlatformEvidence[] {
  return input.platforms.filter(
    (platform) =>
      totalPassed(platform) >= input.minimumTestsPerPlatform && failures(platform).length === 0,
  );
}

export function missingPlatforms(input: PlatformSet): string[] {
  const usable = new Set(usablePlatforms(input).map((platform) => platform.platform));
  return input.requiredPlatforms.filter((required) => !usable.has(required));
}

/** Row 2 and row 4: a named digest must agree across every required platform. */
export function digestRow(
  input: PlatformSet,
  id: string,
  requirement: string,
  pick: (evidence: PlatformEvidence) => string,
): GateRow {
  const missing = missingPlatforms(input);
  if (missing.length > 0) {
    return row(
      id,
      requirement,
      'unproven',
      `no usable record for ${missing.join(', ')}; a digest cannot be compared across ` +
        'platforms that were never observed',
    );
  }

  const observed = usablePlatforms(input)
    .filter((platform) => input.requiredPlatforms.includes(platform.platform))
    .map((platform) => [platform.platform, pick(platform)] as const);

  const distinct = new Set(observed.map(([, digest]) => digest));
  const rendered = observed.map(([name, digest]) => `${name}=${digest}`).join(', ');

  if (distinct.size !== 1) {
    return row(id, requirement, 'fail', `digests differ across platforms: ${rendered}`);
  }
  return row(
    id,
    requirement,
    'pass',
    `identical on ${String(observed.length)} platforms: ${rendered}`,
  );
}

/**
 * The F1-F12 row, under the owner's approved reading (deviation C-10).
 *
 * Shared by every stage that has this row, because "every enforceable rule is
 * green and every dormant rule is guarded" is the same judgement each time, and
 * two copies of it would eventually disagree.
 */
export function fitnessRow(
  input: FitnessInput & PlatformSet,
  id: string,
  requirement: string,
): GateRow {
  const enforced = input.fitness.filter((rule) => rule.status === 'enforced');
  const dormant = input.fitness.filter((rule) => rule.status !== 'enforced');
  const unguarded = dormant.filter((rule) => rule.dormantWhileAbsent.length === 0);
  const expired = dormant.filter((rule) =>
    rule.dormantWhileAbsent.some((subject) => input.presentDormancySubjects.includes(subject)),
  );
  const missing = missingPlatforms(input);

  if (input.fitness.length === 0) {
    return row(id, requirement, 'unproven', 'no fitness rules were supplied to evaluate');
  }
  if (!input.fitnessSuitePassed) {
    return row(id, requirement, 'fail', 'the fitness suite did not pass');
  }
  if (unguarded.length > 0) {
    return row(
      id,
      requirement,
      'fail',
      `dormant without a declared subject: ${unguarded.map((r) => r.id).join(', ')} — ` +
        'dormancy that names nothing cannot be shown to have ended',
    );
  }
  if (expired.length > 0) {
    return row(
      id,
      requirement,
      'fail',
      `dormancy has expired for ${expired.map((r) => r.id).join(', ')}: their subjects now exist`,
    );
  }
  if (missing.length > 0) {
    return row(
      id,
      requirement,
      'unproven',
      `the fitness suite passed, but ${missing.join(', ')} produced no usable record`,
    );
  }
  return row(
    id,
    requirement,
    'pass',
    `${String(enforced.length)} of ${String(input.fitness.length)} rules enforced and green; ` +
      `${String(dormant.length)} dormant, each naming an absent subject and guarded by ` +
      'fitness/checks/dormancy.test.ts (owner reading C-10)',
  );
}

export function evaluateStage0(input: GateInput): GateReport {
  const rows: GateRow[] = [];

  // --- Row 1: F1-F12, under the C-10 reading -------------------------------
  rows.push(fitnessRow(input, 'G1', 'F1-F12 green on Linux + Windows smoke'));

  // --- Row 2: the asset-tree fixture ---------------------------------------
  rows.push(
    digestRow(
      input,
      'G2',
      'D35 fixture identical on both platforms, including an asset tree with nested files/',
      (evidence) => evidence.digests.assetTreeWithNestedFiles,
    ),
  );

  // --- Row 3: champion_id: null never yields a Champion ---------------------
  {
    const property = input.championProperty;
    if (property === null) {
      rows.push(
        row(
          'G3',
          'champion_id: null never yields a Champion in any resolver path',
          'unproven',
          'the property test was not run',
        ),
      );
    } else if (!property.passed) {
      rows.push(
        row(
          'G3',
          'champion_id: null never yields a Champion in any resolver path',
          'fail',
          'the property test failed',
        ),
      );
    } else if (property.cases < 1) {
      rows.push(
        row(
          'G3',
          'champion_id: null never yields a Champion in any resolver path',
          'unproven',
          'the property test reported zero cases, so it proved nothing',
        ),
      );
    } else {
      rows.push(
        row(
          'G3',
          'champion_id: null never yields a Champion in any resolver path',
          'pass',
          `property held over ${String(property.cases)} generated cases; at Stage 0 the ` +
            'guarantee is contract-level, since no resolver exists yet (its code path is F11, dormant)',
        ),
      );
    }
  }

  // --- Row 4: the UNPROVEN bootstrap snapshot ------------------------------
  rows.push(
    digestRow(
      input,
      'G4',
      'the UNPROVEN bootstrap snapshot hashes identically on both platforms',
      (evidence) => evidence.digests.emptySnapshot,
    ),
  );

  // --- Row 5: contracts/schemas regenerated with no diff --------------------
  rows.push(
    row(
      'G5',
      'contracts/schemas/ regenerated with no diff',
      input.contractsUpToDate ? 'pass' : 'fail',
      input.contractsUpToDate
        ? 'contracts:check reported the emitted schemas match the committed ones'
        : 'contracts:check reported a diff',
    ),
  );

  // --- Row 6: ADRs for D18-D36 ---------------------------------------------
  rows.push(
    row(
      'G6',
      'ADRs exist for D18-D36',
      input.decisionsWithoutAdr.length === 0 ? 'pass' : 'fail',
      input.decisionsWithoutAdr.length === 0
        ? 'every decision D18-D36 is covered by an ADR'
        : `no ADR covers: ${input.decisionsWithoutAdr.join(', ')}`,
    ),
  );

  // A report that judged nothing must never read as a pass.
  const verdict: GateReport['verdict'] =
    rows.length > 0 && rows.every((entry) => entry.status === 'pass') ? 'PASS' : 'NOT PASSED';

  const counts = { pass: 0, fail: 0, unproven: 0 };
  for (const entry of rows) counts[entry.status] += 1;

  return {
    stage: 0,
    rows,
    verdict,
    summary:
      `${String(counts.pass)} pass, ${String(counts.fail)} fail, ` +
      `${String(counts.unproven)} unproven`,
  };
}
