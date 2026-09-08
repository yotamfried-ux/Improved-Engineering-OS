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
  /**
   * D18.4 bootstrap integrity for the target project. An installation that
   * exists but whose generated block no longer matches its recorded template is
   * a fault: agents consume those files as live project instructions.
   */
  readonly bootstrap:
    | { readonly state: 'uninstalled' }
    | { readonly state: 'healthy'; readonly detail: string }
    | { readonly state: 'drifted'; readonly detail: string };
  /**
   * Whether the primary agent's telemetry hooks are registered (Q-09).
   *
   * `ieos init` leaves them off by default, because D18.4 fixes the footprint
   * and a hook runs on every tool call. That makes "not registered" a normal
   * state rather than a fault -- but a silent one, and a run nobody observed
   * looks exactly like a run in which nothing happened. Reported so an owner
   * who meant to have telemetry finds out here rather than from an empty
   * investigation.
   */
  readonly hooks:
    | { readonly state: 'unregistered' }
    | { readonly state: 'registered'; readonly events: readonly string[] }
    | { readonly state: 'partial'; readonly events: readonly string[] };
  /**
   * The most recent runs this machine recorded, newest first (D23).
   *
   * The Stage 2 exit gate requires INCOMPLETE runs to be visible here. A run
   * that lost telemetry must be findable without querying the Evidence Plane,
   * which is precisely the plane a lossy run may not have reached.
   */
  readonly lastRuns: readonly {
    readonly runId: string;
    readonly telemetryState: 'COMPLETE' | 'INCOMPLETE';
    readonly startedAt: string;
  }[];
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
          'no Evidence Plane is configured. Enrol one with `ieos auth enroll` and set ' +
          'IEOS_INGEST_URL; until then every run is INCOMPLETE and none is qualification ' +
          'evidence (D22, D23).',
        blocking: false,
      });
  }

  // --- generated bootstrap integrity (D18.4) -------------------------------
  switch (observed.bootstrap.state) {
    case 'healthy':
      findings.push({
        name: 'bootstrap',
        level: 'ok',
        detail: observed.bootstrap.detail,
        blocking: false,
      });
      break;
    case 'drifted':
      findings.push({
        name: 'bootstrap',
        level: 'failed',
        detail: `generated IEOS instructions drifted: ${observed.bootstrap.detail}`,
        blocking: true,
      });
      break;
    default:
      findings.push({
        name: 'bootstrap',
        level: 'unknown',
        detail:
          'target project has no .ieos/installation.json, so no generated block can be verified',
        blocking: false,
      });
  }

  // --- telemetry hooks (Q-09) ----------------------------------------------
  switch (observed.hooks.state) {
    case 'registered':
      findings.push({
        name: 'hooks',
        level: 'ok',
        detail: `primary agent hooks registered: ${observed.hooks.events.join(', ')}`,
        blocking: false,
      });
      break;
    case 'partial':
      findings.push({
        name: 'hooks',
        level: 'failed',
        // Blocking, unlike "none registered". Some of four means a run's
        // timeline has holes at known points -- the terminal flush may never
        // fire -- and a partial timeline read as whole is the failure D23 names.
        detail:
          `only ${observed.hooks.events.join(', ')} are registered; a run needs all four, ` +
          'or its telemetry ends where the missing hook was',
        blocking: true,
      });
      break;
    default:
      findings.push({
        name: 'hooks',
        level: 'unknown',
        detail:
          'no telemetry hooks are registered. Run `ieos init --with-hooks` to add them; ' +
          'without them nothing observes a run',
        blocking: false,
      });
  }

  // --- last runs (D23, Stage 2 exit gate) ----------------------------------
  const incomplete = observed.lastRuns.filter((run) => run.telemetryState === 'INCOMPLETE');
  if (observed.lastRuns.length === 0) {
    findings.push({
      name: 'last-run',
      level: 'unknown',
      detail: 'no run has been recorded on this machine yet',
      blocking: false,
    });
  } else if (incomplete.length > 0) {
    findings.push({
      name: 'last-run',
      level: 'failed',
      // Not blocking: an INCOMPLETE run is a true record, not a broken
      // installation. Reported at `failed` because it is the one thing about a
      // run that must never be quiet.
      detail:
        `${String(incomplete.length)} of the last ${String(observed.lastRuns.length)} run(s) are ` +
        `INCOMPLETE: ${incomplete.map((run) => run.runId).join(', ')}. ` +
        'Their telemetry was lost, so they are not qualification evidence (D23)',
      blocking: false,
    });
  } else {
    findings.push({
      name: 'last-run',
      level: 'ok',
      detail: `${String(observed.lastRuns.length)} recent run(s), all COMPLETE`,
      blocking: false,
    });
  }

  return { findings, ok: findings.every((finding) => !finding.blocking) };
}

/** Read hook registration out of a project's `.claude/settings.json` content. */
export function observeHooks(
  settingsJson: string | null,
  hookEntry: string,
  required: readonly string[],
): RuntimeObservations['hooks'] {
  if (settingsJson === null) return { state: 'unregistered' };
  let parsed: { hooks?: Record<string, unknown> };
  try {
    parsed = JSON.parse(settingsJson) as typeof parsed;
  } catch {
    // Unreadable settings are not evidence of registration. Claiming
    // `registered` here would be the most expensive kind of wrong answer.
    return { state: 'unregistered' };
  }
  const hooks = parsed.hooks ?? {};
  const found = required.filter((event) => {
    const entries = hooks[event];
    if (!Array.isArray(entries)) return false;
    return entries.some((entry) => {
      const inner = (entry as { hooks?: unknown }).hooks;
      return (
        Array.isArray(inner) &&
        inner.some((hook) =>
          String((hook as { command?: unknown }).command ?? '').includes(hookEntry),
        )
      );
    });
  });
  if (found.length === 0) return { state: 'unregistered' };
  if (found.length === required.length) return { state: 'registered', events: found };
  return { state: 'partial', events: found };
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
