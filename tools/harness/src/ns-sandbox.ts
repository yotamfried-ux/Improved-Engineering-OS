/**
 * The namespace mechanism, as the harness sees it (ADR-0005, Stage 3).
 *
 * Stage 0 wrote down that a temporary directory cannot constrain a process or
 * its egress, and that proving either "needs a container, namespace or
 * equivalent mechanism, which is a Stage 3 precondition". This module is the
 * TypeScript half of that mechanism: it runs a command under
 * `scripts/ns-trial.sh` and turns what the script *observed from inside* the
 * namespaces into boundary findings.
 *
 * The division of labour matters. The script builds the boundaries and then
 * tests them -- it counts the entries visible where a denied root sits on the
 * host, it tries a destination the allowlist does not contain, it asks whether
 * the trial is pid 1. This module never upgrades a missing observation into a
 * proof: an absent report yields `unproven` for every boundary, with the reason.
 */

import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { BoundaryFinding } from './isolation.ts';

/** Exit status the script uses for "this machine cannot isolate a trial". */
export const MECHANISM_UNAVAILABLE = 69;

export const NS_TRIAL_SCRIPT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'scripts',
  'ns-trial.sh',
);

/** A host socket deliberately exposed at one exact path inside the trial. */
export interface UnixSocketMount {
  readonly sourcePath: string;
  readonly targetPath: string;
}

/** What the script saw from inside the namespaces. Raw, not yet interpreted. */
export interface NamespaceObservations {
  readonly denied_roots: string;
  readonly denied_entries_visible: number;
  readonly allowlist: string;
  readonly control_host: string;
  readonly control_result: string;
  readonly interfaces: string;
  readonly pid_namespace_self: number;
  readonly pid_namespace_visible_processes: number;
  /** Whether the IPC socket path was named by policy before the namespace was built. */
  readonly ipc_socket_declared: boolean;
  /** The exact policy path, empty when no socket was declared. */
  readonly ipc_socket_declared_path: string;
  /** The exact path the namespace mounted, empty when no socket was mounted. */
  readonly ipc_socket_mounted_path: string;
  /** Whether the mounted path and the policy path were identical. */
  readonly ipc_socket_path_matches: boolean;
  /** Whether the declared path was observed as an AF_UNIX socket from inside. */
  readonly ipc_socket_is_unix: boolean;
}

export interface NamespaceRunOptions {
  readonly command: readonly string[];
  readonly cwd: string;
  readonly environment: Readonly<Record<string, string>>;
  /** `host:port` destinations the trial may reach. Everything else is dropped. */
  readonly allowedHosts: readonly string[];
  /** Absolute paths mounted over with an empty directory inside the namespace. */
  readonly deniedRoots: readonly string[];
  /** Unix socket paths the isolation policy explicitly grants. */
  readonly declaredUnixSockets?: readonly string[];
  /** Host sockets to bind at exact trial-visible paths. */
  readonly unixSocketMounts?: readonly UnixSocketMount[];
  /** Seconds after which the trial is killed. The abort half of the budget. */
  readonly timeoutSeconds: number;
  /** A destination the allowlist does not contain, used as the negative control. */
  readonly controlHost?: string;
  readonly scriptPath?: string;
  readonly nodeBin?: string;
}

export interface NamespaceRunResult {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly timedOut: boolean;
  readonly observations: NamespaceObservations | null;
  /** Set when the machine lacks the tooling, so the caller reports it rather than guessing. */
  readonly unavailableReason: string | null;
}

export function runInNamespace(options: NamespaceRunOptions): NamespaceRunResult {
  const reportDir = mkdtempSync(join(tmpdir(), 'ieos-ns-report-'));
  const reportPath = join(reportDir, 'boundaries.json');
  const args = [
    '--report',
    reportPath,
    '--node-bin',
    options.nodeBin ?? process.execPath,
    ...options.allowedHosts.flatMap((host) => ['--allow-host', host]),
    ...options.deniedRoots.flatMap((root) => ['--deny-root', root]),
    ...(options.declaredUnixSockets ?? []).flatMap((path) => ['--declare-unix-socket', path]),
    ...(options.unixSocketMounts ?? []).flatMap((mount) => [
      '--mount-unix-socket',
      mount.sourcePath,
      mount.targetPath,
    ]),
    ...(options.controlHost === undefined ? [] : ['--control-host', options.controlHost]),
    '--',
    ...options.command,
  ];

  try {
    const run = spawnSync(options.scriptPath ?? NS_TRIAL_SCRIPT, args, {
      cwd: options.cwd,
      // Built, not inherited: `env` replaces the environment outright, so the
      // only names present are the ones the policy granted.
      env: { ...options.environment },
      // No `input`, and no option by which a caller could supply one. This is
      // what T6 -- "no rescue: no human intervention inside any trial" -- rests
      // on, and it rests on the absence of a channel rather than on a promise
      // not to use one. `spawnSync` without `input` closes the child's stdin
      // immediately, so there is nothing to write to even from inside this
      // process. A test asserts this option is not accepted.
      encoding: 'utf8',
      timeout: options.timeoutSeconds * 1000,
      maxBuffer: 64 * 1024 * 1024,
    });

    let observations: NamespaceObservations | null = null;
    try {
      observations = JSON.parse(readFileSync(reportPath, 'utf8')) as NamespaceObservations;
    } catch {
      // No report means the setup never reached the point of writing one. That
      // is reported as such; it is never treated as a clean run.
    }

    const timedOut = run.signal !== null && observations !== null;
    return {
      status: run.status,
      stdout: run.stdout ?? '',
      stderr: run.stderr ?? '',
      timedOut,
      observations,
      unavailableReason:
        run.status === MECHANISM_UNAVAILABLE
          ? (run.stderr ?? '').trim() || 'the namespace mechanism reported itself unavailable'
          : null,
    };
  } finally {
    rmSync(reportDir, { recursive: true, force: true });
  }
}

/**
 * Turn observations into findings for the boundaries the namespaces establish.
 *
 * Each finding cites the observation that decided it, so a reader can disagree
 * with the conclusion without having to trust the mechanism. A missing report
 * produces `unproven` for all four, which is what fail-closed means here.
 *
 * IPC is part of the filesystem finding, not a fifth boundary. When a host proxy
 * socket is present or declared, three independent facts must all hold: policy
 * declared it, the mount landed at that exact path, and the thing at that path is
 * really a Unix socket. A missing mount is therefore a violation too; declaration
 * is not evidence that the capability existed.
 */
export function namespaceFindings(
  observations: NamespaceObservations | null,
  context: { readonly unavailableReason?: string | null } = {},
): BoundaryFinding[] {
  if (observations === null) {
    const evidence =
      context.unavailableReason ??
      'the namespace mechanism produced no observation report, so nothing about this ' +
        'trial was established by it';
    return (['filesystem', 'environment', 'process', 'network'] as const).map((boundary) => ({
      boundary,
      verdict: 'unproven' as const,
      evidence,
    }));
  }

  const findings: BoundaryFinding[] = [];
  const deniedRoots = observations.denied_roots.trim();
  const socketRelevant =
    observations.ipc_socket_declared || observations.ipc_socket_mounted_path !== '';
  const socketOk =
    !socketRelevant ||
    (observations.ipc_socket_declared &&
      observations.ipc_socket_mounted_path !== '' &&
      observations.ipc_socket_path_matches &&
      observations.ipc_socket_is_unix);
  const filesystemOk = observations.denied_entries_visible === 0 && socketOk;

  if (filesystemOk) {
    const ipcEvidence = socketRelevant
      ? `; the IPC grant was policy-declared at ${observations.ipc_socket_declared_path}, ` +
        'mounted at that exact path, and observed there as a Unix socket'
      : '; no IPC socket was declared or mounted into the namespace';
    findings.push({
      boundary: 'filesystem',
      verdict: 'proven',
      evidence:
        `inside the namespace, ${deniedRoots || '(no denied root was named)'} showed 0 ` +
        'entries: an empty directory is mounted over every denied root, so the evaluator ' +
        `tree is absent rather than merely unreferenced${ipcEvidence}`,
    });
  } else {
    const reasons: string[] = [];
    if (observations.denied_entries_visible !== 0) {
      reasons.push(
        `${String(observations.denied_entries_visible)} entr(ies) were visible under a denied root (${deniedRoots})`,
      );
    }
    if (observations.ipc_socket_mounted_path !== '' && !observations.ipc_socket_declared) {
      reasons.push('a Unix-socket IPC mount was present without a policy declaration');
    }
    if (observations.ipc_socket_declared && observations.ipc_socket_mounted_path === '') {
      reasons.push('the policy declared a Unix-socket IPC grant but no socket was mounted');
    }
    if (socketRelevant && !observations.ipc_socket_path_matches) {
      reasons.push(
        `the IPC mount appeared at ${observations.ipc_socket_mounted_path || '(no path)'} instead of ` +
          `${observations.ipc_socket_declared_path || '(no declared path)'}`,
      );
    }
    if (socketRelevant && !observations.ipc_socket_is_unix) {
      reasons.push(
        `the declared IPC path ${observations.ipc_socket_declared_path || '(none)'} was not a Unix socket`,
      );
    }
    findings.push({
      boundary: 'filesystem',
      verdict: 'violated',
      evidence: reasons.join('; '),
    });
  }

  findings.push({
    boundary: 'environment',
    verdict: 'proven',
    evidence:
      'the trial process was started with a replaced environment rather than a filtered one, ' +
      'so only the names the policy granted exist inside it',
  });

  findings.push(
    observations.pid_namespace_self === 1
      ? {
          boundary: 'process',
          verdict: 'proven',
          evidence:
            'the trial is pid 1 in its own PID namespace and sees ' +
            `${String(observations.pid_namespace_visible_processes)} process(es): its own tree ` +
            'and nothing of the host',
        }
      : {
          boundary: 'process',
          verdict: 'violated',
          evidence:
            `the trial reported pid ${String(observations.pid_namespace_self)}, so it is not in ` +
            'a PID namespace of its own',
        },
  );

  const refused = observations.control_result.startsWith('refused');
  const ipcEvidence = socketRelevant
    ? '; the Evidence Plane path is AF_UNIX IPC and added no OUTPUT allow rule'
    : '';
  findings.push(
    refused
      ? {
          boundary: 'network',
          verdict: 'proven',
          evidence:
            `egress is ${observations.interfaces} with OUTPUT dropped by default and ` +
            `${observations.allowlist.trim()} allowed; the control destination ` +
            `${observations.control_host} was ${observations.control_result}${ipcEvidence}`,
        }
      : {
          boundary: 'network',
          verdict: 'violated',
          evidence:
            `the control destination ${observations.control_host} was reachable ` +
            `(${observations.control_result}), so the egress allowlist is not enforced`,
        },
  );

  return findings;
}
