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
}

export interface CollectOptions {
  readonly commit: string;
  readonly runUrl?: string | null;
  readonly suites: readonly SuiteResult[];
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
  };
}

export function totalTests(evidence: PlatformEvidence): number {
  return evidence.suites.reduce((sum, suite) => sum + suite.tests, 0);
}

export function totalPassed(evidence: PlatformEvidence): number {
  return evidence.suites.reduce((sum, suite) => sum + suite.passed, 0);
}
