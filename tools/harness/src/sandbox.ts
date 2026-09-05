/**
 * Trial sandbox: what a directory-based mechanism can and cannot establish.
 *
 * This is deliberately honest about its own limits. `probe` reports
 * `filesystem` and `environment` as proven or violated because it actually
 * tests them; it reports `process` and `network` as `unproven` because a
 * temporary directory cannot constrain either, and saying otherwise would be the
 * exact failure research finding R5 warns about.
 */

import { mkdtempSync, mkdirSync, readdirSync, rmSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve, isAbsolute, sep } from 'node:path';
import {
  buildIsolationReport,
  type BoundaryFinding,
  type IsolationPolicy,
  type IsolationReport,
} from './isolation.ts';

export interface Trial {
  /** Stable identifier for this trial; appears in the run record. */
  readonly trialId: string;
  /** The only directory the trial is meant to touch. */
  readonly workspaceRoot: string;
  /** The environment the trial process would receive. Built, never inherited. */
  readonly environment: Readonly<Record<string, string>>;
  readonly policy: IsolationPolicy;
  /** Remove the workspace. Safe to call twice. */
  dispose(): void;
}

export interface CreateTrialOptions {
  readonly trialId: string;
  readonly policy: IsolationPolicy;
  /**
   * The environment to draw allowed names from.
   *
   * Passed in rather than read from `process.env`, so a test can prove the
   * filtering without mutating the process it runs in.
   */
  readonly sourceEnvironment?: Readonly<Record<string, string | undefined>>;
  /** Parent directory for the workspace. Defaults to the OS temp directory. */
  readonly parentDir?: string;
}

/**
 * Create a trial workspace.
 *
 * The environment is *built* from the policy's allowlist, never filtered down
 * from the ambient one. The difference matters: filtering leaves whatever the
 * filter forgot, building leaves only what was named.
 */
export function createTrial(options: CreateTrialOptions): Trial {
  const parent = options.parentDir ?? tmpdir();
  mkdirSync(parent, { recursive: true });
  const workspaceRoot = realpathSync(mkdtempSync(join(parent, `ieos-trial-${options.trialId}-`)));

  const source = options.sourceEnvironment ?? {};
  const environment: Record<string, string> = {};
  for (const name of options.policy.environment.allowedNames) {
    const value = source[name];
    if (value !== undefined) environment[name] = value;
  }

  let disposed = false;
  return {
    trialId: options.trialId,
    workspaceRoot,
    environment: Object.freeze(environment),
    policy: options.policy,
    dispose(): void {
      if (disposed) return;
      disposed = true;
      rmSync(workspaceRoot, { recursive: true, force: true });
    },
  };
}

/** True when `candidate` is inside `root` (or is `root`), after symlink resolution. */
export function isContainedBy(root: string, candidate: string): boolean {
  const resolvedRoot = resolve(root);
  const resolvedCandidate = resolve(candidate);
  if (resolvedRoot === resolvedCandidate) return true;
  const rel = relative(resolvedRoot, resolvedCandidate);
  return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel);
}

/**
 * Probe a prepared trial and report what was actually established.
 *
 * Filesystem and environment are tested. Process and network are reported
 * `unproven` with the reason, because this mechanism cannot test them -- and an
 * unproven required boundary makes the trial ineligible for qualification.
 */
export function probe(trial: Trial): IsolationReport {
  const findings: BoundaryFinding[] = [];

  // --- filesystem -----------------------------------------------------------
  const denied = trial.policy.filesystem.deniedRoots.filter((deniedRoot) =>
    isContainedBy(trial.workspaceRoot, deniedRoot),
  );
  if (denied.length > 0) {
    findings.push({
      boundary: 'filesystem',
      verdict: 'violated',
      evidence: `denied root(s) ${denied.join(', ')} lie inside the workspace ${trial.workspaceRoot}`,
    });
  } else {
    const escapes = leakedPaths(trial);
    findings.push(
      escapes.length === 0
        ? {
            boundary: 'filesystem',
            verdict: 'proven',
            evidence:
              `workspace ${trial.workspaceRoot} contains no path resolving outside its ` +
              'allowed roots, and no denied root is reachable from it',
          }
        : {
            boundary: 'filesystem',
            verdict: 'violated',
            evidence: `path(s) escaping the workspace: ${escapes.join(', ')}`,
          },
    );
  }

  // --- environment ----------------------------------------------------------
  const allowed = new Set(trial.policy.environment.allowedNames);
  const unexpected = Object.keys(trial.environment).filter((name) => !allowed.has(name));
  findings.push(
    unexpected.length === 0
      ? {
          boundary: 'environment',
          verdict: 'proven',
          evidence:
            `trial environment contains only the ${String(Object.keys(trial.environment).length)} ` +
            'explicitly granted name(s); nothing was inherited',
        }
      : {
          boundary: 'environment',
          verdict: 'violated',
          evidence: `ungranted variable(s) present: ${unexpected.join(', ')}`,
        },
  );

  // --- process --------------------------------------------------------------
  findings.push({
    boundary: 'process',
    verdict: 'unproven',
    evidence:
      'a temporary directory cannot constrain process creation. Proving this boundary needs a ' +
      'container, namespace or equivalent mechanism, which is a Stage 3 precondition (ADR-0005).',
  });

  // --- network --------------------------------------------------------------
  findings.push({
    boundary: 'network',
    verdict: 'unproven',
    evidence:
      'a temporary directory cannot constrain network egress, and SDK settings isolation says ' +
      'nothing about what a spawned process can reach (research finding R5). Proving this ' +
      'boundary needs a container, namespace or equivalent mechanism (ADR-0005).',
  });

  return buildIsolationReport(trial.policy, findings);
}

/**
 * Paths inside the workspace that resolve outside it -- symlinks, mostly.
 *
 * A symlink into `evaluator/` is the concrete way hidden fixtures reach an
 * agent checkout, so it is checked rather than assumed absent.
 */
function leakedPaths(trial: Trial): string[] {
  const leaks: string[] = [];
  const walk = (dir: string, depth: number): void => {
    if (depth > 8) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      let target: string;
      try {
        target = realpathSync(full);
      } catch {
        // A broken link points nowhere and cannot leak anything.
        continue;
      }
      if (!isContainedBy(trial.workspaceRoot, target)) {
        leaks.push(`${relative(trial.workspaceRoot, full)} -> ${target}`);
        continue;
      }
      if (entry.isDirectory() && !entry.isSymbolicLink()) walk(full, depth + 1);
    }
  };
  walk(trial.workspaceRoot, 0);
  return leaks;
}

/** Write a file into a trial workspace, refusing anything that escapes it. */
export function writeIntoTrial(trial: Trial, relativePath: string, content: string): string {
  const target = resolve(trial.workspaceRoot, relativePath);
  if (!isContainedBy(trial.workspaceRoot, target)) {
    throw new Error(
      `refusing to write ${relativePath}: it resolves to ${target}, outside the trial workspace`,
    );
  }
  mkdirSync(target.slice(0, target.lastIndexOf(sep)), { recursive: true });
  writeFileSync(target, content, 'utf8');
  return target;
}
