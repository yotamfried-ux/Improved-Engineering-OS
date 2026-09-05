/**
 * Per-platform evidence collection.
 *
 * A stage report that only ever runs on one machine cannot honestly speak about
 * two platforms. So collection and judgement are separated: this module records
 * what one platform actually observed, `gate.ts` judges a set of such records,
 * and neither can invent the other's half.
 *
 * Everything here is measured at runtime. Nothing is copied from a document,
 * because a document is what the report is supposed to be checking.
 */

import { hashFileSet } from '@ieos/core';
import { EMPTY_SNAPSHOT_DIGEST } from '@ieos/snapshot-emit';

/** The D35 fixture the Stage 0 gate names: an asset tree with nested `files/`. */
export const ASSET_TREE_FIXTURE: readonly { path: string; bytes: Uint8Array }[] = [
  { path: 'files/nested/b.md', bytes: new TextEncoder().encode('b') },
  { path: 'body.md', bytes: new TextEncoder().encode('body') },
  { path: 'files/a.md', bytes: new TextEncoder().encode('a') },
];

export interface SuiteResult {
  readonly project: string;
  readonly files: number;
  readonly tests: number;
  readonly passed: number;
  /**
   * Full names of the tests that failed, if any.
   *
   * Carried in the record rather than left in a log, because the log expires
   * and because a platform record that says "287 of 290" without saying which
   * three is an answer nobody can act on. The first version of this tool made
   * exactly that mistake, and it also discarded the runner's stdout, so the
   * names were nowhere at all.
   */
  readonly failed: readonly string[];
  /**
   * Tests the runner skipped, typically because their precondition is absent
   * (a checkout that only exists on one machine, say).
   *
   * Counted separately and never folded into either side. A skipped test is
   * unproven, not failed and not passed -- the same three-way distinction the
   * claim model makes everywhere else. Conflating "skipped" with "failed" is
   * what made the first version of this report unable to pass at all: it
   * required `passed === tests`, and two legitimately skipped tests silently
   * disqualified an entire platform.
   */
  readonly skipped: number;
}

/**
 * What a runner said about one specific test, by full name.
 *
 * `missing` is its own value, and it is the important one: a gate row that
 * rests on a named test must fail when that test is renamed or deleted, not
 * quietly stop being checked. "Absent" and "passed" are the two answers a
 * report must never conflate.
 */
export type NamedTestStatus = 'passed' | 'failed' | 'skipped' | 'missing';

export interface NamedTestResult {
  readonly name: string;
  readonly status: NamedTestStatus;
}

/** One command actually executed on this platform, and what it returned. */
export interface CommandResult {
  readonly name: string;
  readonly argv: readonly string[];
  readonly exitCode: number;
}

/**
 * The Stage 1 half of a platform record.
 *
 * Stage 1's gate is mostly about behaviour -- a command that runs, a protocol
 * exchange that conforms, a build that repeats -- so counting tests is not
 * enough. This block records the individual observations those rows rest on.
 */
export interface Stage1Evidence {
  readonly commands: readonly CommandResult[];
  /** Two independent builds of the same tree, in order (F8). */
  readonly indexDigests: readonly string[];
  readonly namedTests: readonly NamedTestResult[];
}

export interface PlatformEvidence {
  /** `process.platform` of the machine that produced this record. */
  readonly platform: string;
  readonly nodeVersion: string;
  /** Repository commit the record was produced at. */
  readonly commit: string;
  /** ISO 8601. Excluded from every comparison; see `gate.ts`. */
  readonly collectedAt: string;
  /** Where it ran, when that is knowable (a CI run URL). */
  readonly runUrl: string | null;
  /**
   * The two D35 fixtures the Stage 0 exit gate names, computed here rather than
   * read from a test file, so the record cannot agree with a stale constant.
   */
  readonly digests: {
    readonly emptySnapshot: string;
    readonly assetTreeWithNestedFiles: string;
  };
  readonly suites: readonly SuiteResult[];
  /** Absent in a Stage 0 record, which is why it is nullable rather than assumed. */
  readonly stage1?: Stage1Evidence | null;
}

export interface CollectOptions {
  readonly commit: string;
  readonly runUrl?: string | null;
  readonly suites: readonly SuiteResult[];
  readonly stage1?: Stage1Evidence | null;
  readonly now?: () => Date;
}

/** Measure this platform. Pure apart from the clock, which is injected. */
export function collectPlatformEvidence(options: CollectOptions): PlatformEvidence {
  const now = options.now ?? (() => new Date());
  return {
    platform: process.platform,
    nodeVersion: process.versions.node,
    commit: options.commit,
    collectedAt: now().toISOString(),
    runUrl: options.runUrl ?? null,
    digests: {
      emptySnapshot: EMPTY_SNAPSHOT_DIGEST,
      assetTreeWithNestedFiles: hashFileSet(ASSET_TREE_FIXTURE),
    },
    suites: options.suites,
    stage1: options.stage1 ?? null,
  };
}

export function totalTests(evidence: PlatformEvidence): number {
  return evidence.suites.reduce((sum, suite) => sum + suite.tests, 0);
}

export function totalPassed(evidence: PlatformEvidence): number {
  return evidence.suites.reduce((sum, suite) => sum + suite.passed, 0);
}

export function totalSkipped(evidence: PlatformEvidence): number {
  return evidence.suites.reduce((sum, suite) => sum + suite.skipped, 0);
}

/** Every test that actually failed on this platform, by full name. */
export function failures(evidence: PlatformEvidence): string[] {
  return evidence.suites.flatMap((suite) => [...suite.failed]);
}
