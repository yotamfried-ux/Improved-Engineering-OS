/**
 * Runtime and toolchain validation (research finding R4, ADR-0002).
 *
 * D18.1 reasons that "Node is present wherever the agents run" because the
 * agents are Node-based. Finding R4 shows that inference does not hold: Codex
 * ships standalone native binaries, and an installed AI coding tool is not
 * evidence that the required Node runtime exists.
 *
 * So the runtime is checked, explicitly, and the failure names what is missing
 * and what is required. This is the Stage 0 half of `ieos doctor`; Stage 1 adds
 * index digest, contract versions, session kind and ingest reachability.
 *
 * The check function is pure -- it takes the observed versions as arguments --
 * so its behaviour under a missing or mismatched toolchain is testable without
 * uninstalling anything.
 */

export interface RequiredToolchain {
  readonly nodeMajor: number;
  readonly pnpmVersion: string;
}

/** Kept in one place; `doctor.test.ts` asserts it matches the root package.json. */
export const REQUIRED_TOOLCHAIN: RequiredToolchain = {
  nodeMajor: 24,
  pnpmVersion: '11.25.0',
};

export interface ObservedToolchain {
  /** `process.version`, e.g. `v24.20.0`. Null when Node could not be identified. */
  readonly nodeVersion: string | null;
  /** Output of `pnpm --version`. Null when pnpm is absent. */
  readonly pnpmVersion: string | null;
}

export type CheckStatus = 'ok' | 'failed';

export interface CheckOutcome {
  readonly name: string;
  readonly status: CheckStatus;
  /** What was found, and -- when it failed -- what to do about it. */
  readonly detail: string;
}

export interface DoctorReport {
  readonly ok: boolean;
  readonly checks: readonly CheckOutcome[];
}

function parseMajor(version: string): number | null {
  const match = /^v?(\d+)\./u.exec(version.trim());
  if (match === null) return null;
  return Number.parseInt(match[1] as string, 10);
}

/**
 * Validate an observed toolchain against what this repository requires.
 *
 * Every failure message names both the observed value and the required one.
 * "Node version mismatch" without the numbers costs the reader a second round
 * trip, and this is the first thing a new contributor runs.
 */
export function checkToolchain(
  observed: ObservedToolchain,
  required: RequiredToolchain = REQUIRED_TOOLCHAIN,
): DoctorReport {
  const checks: CheckOutcome[] = [];

  if (observed.nodeVersion === null) {
    checks.push({
      name: 'node',
      status: 'failed',
      detail:
        `Node.js was not found. This repository requires Node ${String(required.nodeMajor)}.x. ` +
        'Installing an AI coding tool does not install Node: see docs/setup.md.',
    });
  } else {
    const major = parseMajor(observed.nodeVersion);
    if (major === null) {
      checks.push({
        name: 'node',
        status: 'failed',
        detail:
          `Could not parse the Node version ${JSON.stringify(observed.nodeVersion)}. ` +
          `Requires Node ${String(required.nodeMajor)}.x.`,
      });
    } else if (major !== required.nodeMajor) {
      checks.push({
        name: 'node',
        status: 'failed',
        detail:
          `Node ${observed.nodeVersion} is installed, but this repository requires ` +
          `Node ${String(required.nodeMajor)}.x (engines.node, engineStrict). See docs/setup.md.`,
      });
    } else {
      checks.push({ name: 'node', status: 'ok', detail: `Node ${observed.nodeVersion}` });
    }
  }

  if (observed.pnpmVersion === null) {
    checks.push({
      name: 'pnpm',
      status: 'failed',
      detail:
        `pnpm was not found. This repository requires pnpm ${required.pnpmVersion}. ` +
        `Enable it with \`corepack enable && corepack prepare pnpm@${required.pnpmVersion} --activate\`.`,
    });
  } else if (observed.pnpmVersion.trim() !== required.pnpmVersion) {
    checks.push({
      name: 'pnpm',
      status: 'failed',
      detail:
        `pnpm ${observed.pnpmVersion.trim()} is active, but this repository pins ` +
        `pnpm ${required.pnpmVersion} (packageManager, devEngines).`,
    });
  } else {
    checks.push({ name: 'pnpm', status: 'ok', detail: `pnpm ${observed.pnpmVersion.trim()}` });
  }

  return { ok: checks.every((check) => check.status === 'ok'), checks };
}

/** Render a report for a terminal. Failures carry their remedy inline. */
export function formatReport(report: DoctorReport): string {
  const lines = report.checks.map(
    (check) => `${check.status === 'ok' ? 'ok  ' : 'FAIL'}  ${check.name}: ${check.detail}`,
  );
  lines.push(report.ok ? '\ntoolchain ok' : '\ntoolchain check failed');
  return `${lines.join('\n')}\n`;
}
