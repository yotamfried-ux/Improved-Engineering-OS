/**
 * `ieos doctor` (Stage 1 exit gate).
 *
 * The gate names four things it must report: index digest, contract versions,
 * session kind and ingest reachability. Stage 0's doctor checked the toolchain;
 * this adds the runtime picture on top of it.
 *
 * Two rules shape the whole file:
 *
 * A check that cannot run reports `unknown`, never `ok`. Doctor exists to be
 * believed when someone is confused, and a doctor that reports health it did
 * not observe is worse than no doctor -- it sends the reader somewhere else.
 *
 * Not every `unknown` is a failure. At Stage 1 there is deliberately no Evidence
 * Plane and often no index, and reporting those as broken would train the reader
 * to ignore the output. Each finding carries its own severity, and the exit code
 * comes only from the ones that are genuinely wrong.
 */

import type { SessionKind } from '@ieos/core';

export type FindingLevel = 'ok' | 'unknown' | 'failed';

export interface Finding {
  readonly name: string;
  readonly level: FindingLevel;
  /** What was observed, or why nothing was. Never empty. */
  readonly detail: string;
  /**
   * True when this finding, at this level, means something is actually wrong.
   *
   * The separation matters: "no index yet" and "the index is corrupt" are both
   * not-ok, and only one of them is a problem.
   */
  readonly blocking: boolean;
}

export interface RuntimeObservations {
  /** Digest of the compiled index, or null when there is no readable index. */
  readonly indexDigest: string | null;
  /** Why the index could not be read, when it could not. */
  readonly indexProblem: string | null;
  /** True when the index file exists but could not be opened or validated. */
  readonly indexPresentButUnusable: boolean;
  /** Contract name → declared schema version, from the registry. */
  readonly contracts: readonly { readonly name: string; readonly version: string }[];
  readonly sessionKind: SessionKind;
  /** Whether the Evidence Plane ingest endpoint is configured and reachable. */
  readonly ingest:
    | { readonly state: 'unconfigured' }
    | { readonly state: 'reachable'; readonly endpoint: string }
    | { readonly state: 'unreachable'; readonly endpoint: string; readonly reason: string };
  /** Whether `node:sqlite` could be loaded at all. */
  readonly sqliteAvailable: boolean;
}

export interface DoctorReport {
  readonly findings: readonly Finding[];
  /** True when nothing blocking was found. */
  readonly ok: boolean;
}

/**
 * Turn observations into findings.
 *
 * Pure, so every branch -- including the ones that need a corrupt index or an
 * unreachable Evidence Plane -- is testable without arranging the world into
 * that state.
 */
export function buildRuntimeReport(observed: RuntimeObservations): DoctorReport {
  const findings: Finding[] = [];

  // --- node:sqlite ---------------------------------------------------------
  findings.push(
    observed.sqliteAvailable
      ? { name: 'sqlite', level: 'ok', detail: 'node:sqlite is available', blocking: false }
      : {
          name: 'sqlite',
          level: 'failed',
          detail:
            'node:sqlite could not be loaded. It is experimental in Node 24 and is disabled by ' +
            '--no-experimental-sqlite; without it the knowledge index cannot be read at all.',
          blocking: true,
        },
  );

  // --- index digest --------------------------------------------------------
  if (observed.indexDigest !== null) {
    findings.push({
      name: 'index',
      level: 'ok',
      detail: `index_digest ${observed.indexDigest}`,
      blocking: false,
    });
  } else if (observed.indexPresentButUnusable) {
    // An index that exists and cannot be read is a real fault: something built
    // it, so something is wrong with what it built or with this runtime.
    findings.push({
      name: 'index',
      level: 'failed',
      detail: observed.indexProblem ?? 'the index exists but could not be read',
      blocking: true,
    });
  } else {
    findings.push({
      name: 'index',
      level: 'unknown',
      detail:
        'no knowledge index has been built yet. Run `pnpm build:index`. ' +
        'At Stage 1 an empty knowledge tree is expected, so this is not a fault.',
      blocking: false,
    });
  }

  // --- contract versions ---------------------------------------------------
  findings.push(
    observed.contracts.length === 0
      ? {
          name: 'contracts',
          level: 'failed',
          detail: 'no contracts are registered, so nothing could be validated',
          blocking: true,
        }
      : {
          name: 'contracts',
          level: 'ok',
          detail: `${String(observed.contracts.length)} contracts, all at schema_version ${uniqueVersions(observed.contracts)}`,
          blocking: false,
        },
  );

  // --- session kind --------------------------------------------------------
  findings.push({
    name: 'session',
    level: 'ok',
    detail: `session_kind ${observed.sessionKind}`,
    blocking: false,
  });

  // --- ingest reachability -------------------------------------------------
  switch (observed.ingest.state) {
    case 'reachable':
      findings.push({
        name: 'ingest',
        level: 'ok',
        detail: `Evidence Plane reachable at ${observed.ingest.endpoint}`,
        blocking: false,
      });
      break;
    case 'unreachable':
      // Not blocking by design: D23 says telemetry loss must never look like a
      // measured run, and the runtime is required to work offline. An
      // unreachable plane is a fact to report, not a reason to refuse to run.
      findings.push({
        name: 'ingest',
        level: 'failed',
        detail:
          `Evidence Plane configured at ${observed.ingest.endpoint} but unreachable: ` +
          `${observed.ingest.reason}. Runs will be marked INCOMPLETE rather than measured (D23).`,
        blocking: false,
      });
      break;
    default:
      findings.push({
        name: 'ingest',
        level: 'unknown',
        detail:
          'no Evidence Plane is configured. Expected at Stage 1: the installation credential ' +
          'and ingest arrive at Stage 2 (D22).',
        blocking: false,
      });
  }

  return { findings, ok: findings.every((finding) => !finding.blocking) };
}

function uniqueVersions(
  contracts: readonly { readonly name: string; readonly version: string }[],
): string {
  const versions = [...new Set(contracts.map((c) => c.version))].sort();
  return versions.length === 1 ? (versions[0] as string) : versions.join(', ');
}

/** Render findings for a terminal, worst first so the problem is the first line. */
export function formatRuntimeReport(report: DoctorReport): string {
  const badge: Record<FindingLevel, string> = {
    ok: 'ok   ',
    unknown: '?    ',
    failed: 'FAIL ',
  };
  const order: Record<FindingLevel, number> = { failed: 0, unknown: 1, ok: 2 };
  const lines = [...report.findings]
    .sort((a, b) => order[a.level] - order[b.level])
    .map((finding) => `${badge[finding.level]} ${finding.name}: ${finding.detail}`);
  lines.push(report.ok ? '\nruntime ok' : '\nruntime check failed');
  return `${lines.join('\n')}\n`;
}
