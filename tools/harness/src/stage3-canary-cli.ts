/**
 * A no-model end-to-end canary for the two Stage 3 rows that previously failed.
 *
 * This command is the gate before any paid trial bank. It proves, with the real
 * production hook composition root and the real Linux namespace mechanism:
 *
 *  1. authenticated Evidence Plane ingest is reachable from the trusted host;
 *  2. the service principal can pre-register a fresh qualification Run;
 *  3. the trial receives no plane credential, only one declared AF_UNIX socket;
 *  4. the production hooks deliver through that socket and receive durable ids;
 *  5. the local run ends COMPLETE, eligible, with an empty outbox; and
 *  6. all four ADR-0005 isolation boundaries remain proven.
 *
 * Claude is never launched, so a failed canary costs no model trial.
 *
 * Usage:
 *   node tools/harness/src/stage3-canary-cli.ts [--credentials FILE] [--out FILE]
 */

import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { buildIsolationReport } from './isolation.ts';
import { namespaceFindings, runInNamespace } from './ns-sandbox.ts';
import { httpRegisterRun, registerWithPlane } from './plane-registrar.ts';
import {
  INGEST_SOCKET_ENV,
  REACHABILITY_ATTESTATION_ENV,
  loadQualificationPlaneConfig,
  openQualificationProxy,
} from './qualification-plane.ts';
import { RunRegistry } from './run-registry.ts';
import { namespaceTrialPolicy } from './isolation.ts';
import { readTrialTelemetry } from './trial-telemetry.ts';

const args = process.argv.slice(2);
const flag = (name: string): string | undefined => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};

if (process.platform !== 'linux') {
  process.stderr.write('Stage 3 qualification canary requires Linux namespaces\n');
  process.exit(69);
}

const eosRoot = resolve(import.meta.dirname, '..', '..', '..');
const runId = `run_s3_canary_${String(Date.now())}`;
const sessionId = `sess_s3_canary_${String(Date.now())}`;
const outPath = resolve(
  flag('--out') ?? join(eosRoot, 'qualification', 'evidence', 'stage-3-canary', `${runId}.json`),
);
const credentialsPath = flag('--credentials');

function run(command: string, commandArgs: readonly string[], cwd: string): void {
  const result = spawnSync(command, [...commandArgs], { cwd, encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(
      `${command} ${commandArgs.join(' ')} failed (${String(result.status)}): ${result.stderr ?? ''}`,
    );
  }
}

const planeConfig = loadQualificationPlaneConfig({
  eosRoot,
  ...(credentialsPath === undefined ? {} : { credentialsPath }),
});
const proxy = await openQualificationProxy({ config: planeConfig, runId });
const workspaceRoot = mkdtempSync(join(tmpdir(), 'ieos-stage3-canary-workspace-'));

let evidence: Record<string, unknown> = {
  run_id: runId,
  recorded_at: new Date().toISOString(),
  verdict: 'NOT PASSED',
};

try {
  // A real initialized target project: the canary calls the same hook.ts that an
  // installed Claude session calls, including installation identity and registry
  // loading. No test double sits in the telemetry path.
  writeFileSync(join(workspaceRoot, 'README.md'), '# Stage 3 telemetry canary\n', 'utf8');
  run('git', ['init', '-q', '.'], workspaceRoot);
  run('git', ['add', '-A'], workspaceRoot);
  run(
    'git',
    [
      '-c',
      'user.email=harness@ieos.invalid',
      '-c',
      'user.name=ieos harness',
      'commit',
      '-q',
      '-m',
      'canary fixture',
    ],
    workspaceRoot,
  );
  run(
    process.execPath,
    [
      join(eosRoot, 'packages', 'adapters', 'cli', 'src', 'cli.ts'),
      'init',
      '--with-hooks',
      '--project',
      workspaceRoot,
    ],
    eosRoot,
  );
  const repoSha = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: workspaceRoot,
    encoding: 'utf8',
  }).trim();

  // D36, immediately before the first real hook event.
  const registry = new RunRegistry();
  const registration = await registerWithPlane(
    registry,
    {
      run_id: runId,
      origin_class: 'qualification',
      eval_set_version: null,
      holdout_state: null,
      simulation_id: 'stage-3-canary',
    },
    httpRegisterRun({
      endpoint: planeConfig.endpoint,
      serviceToken: planeConfig.serviceToken,
      fetch: globalThis.fetch,
    }),
  );
  if (!registration.confirmed) {
    throw new Error(
      `canary pre-registration was not confirmed: ${registration.reason ?? 'no reason given'}`,
    );
  }

  const allowedEnvironment = [
    'PATH',
    'TMPDIR',
    'IEOS_RUN_ID',
    INGEST_SOCKET_ENV,
    REACHABILITY_ATTESTATION_ENV,
  ] as const;
  const policy = namespaceTrialPolicy({
    workspaceRoot,
    evaluatorRoot: join(eosRoot, 'evaluator'),
    // The canary needs no inference network at all. Its only delivery path is
    // the declared socket, which makes successful telemetry stronger evidence
    // that the IPC grant did not accidentally become an egress exception.
    allowedHosts: [],
    allowedExecutables: ['node'],
    allowedEnvironment,
    declaredUnixSockets: [proxy.targetPath],
  });

  const namespaceRun = runInNamespace({
    command: [
      process.execPath,
      join(eosRoot, 'tools', 'harness', 'src', 'stage3-canary-child.ts'),
      '--eos-root',
      eosRoot,
      '--project',
      workspaceRoot,
      '--repo-sha',
      repoSha,
      '--session',
      sessionId,
    ],
    cwd: workspaceRoot,
    environment: {
      PATH: process.env['PATH'] ?? '',
      TMPDIR: process.env['TMPDIR'] ?? '/tmp',
      IEOS_RUN_ID: runId,
      [INGEST_SOCKET_ENV]: proxy.targetPath,
      [REACHABILITY_ATTESTATION_ENV]: 'true',
    },
    allowedHosts: [],
    deniedRoots: [join(eosRoot, 'evaluator'), join(eosRoot, 'simulations')],
    declaredUnixSockets: [proxy.targetPath],
    unixSocketMounts: [{ sourcePath: proxy.sourcePath, targetPath: proxy.targetPath }],
    timeoutSeconds: 120,
  });

  const findings = namespaceFindings(namespaceRun.observations, {
    unavailableReason: namespaceRun.unavailableReason,
  });
  const isolation = buildIsolationReport(policy, findings);
  const telemetry = await readTrialTelemetry({ workspaceRoot, runId });

  const hookPathPassed = namespaceRun.status === 0 && !namespaceRun.timedOut;
  const telemetryPassed =
    telemetry.run_id === runId &&
    telemetry.ingest_reachable_at_start &&
    !telemetry.flush_ever_failed &&
    telemetry.outbox_events_remaining === 0 &&
    telemetry.telemetry_state === 'COMPLETE' &&
    telemetry.qualification_eligible;
  const passed = hookPathPassed && isolation.qualificationEligible && telemetryPassed;

  evidence = {
    run_id: runId,
    recorded_at: new Date().toISOString(),
    eos_revision: execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: eosRoot,
      encoding: 'utf8',
    }).trim(),
    registration: {
      confirmed: registration.confirmed,
      origin_class: registry.originClassFor(runId),
    },
    namespace: {
      status: namespaceRun.status,
      timed_out: namespaceRun.timedOut,
      unavailable_reason: namespaceRun.unavailableReason,
      observations: namespaceRun.observations,
      isolation,
      stderr: namespaceRun.stderr.slice(0, 2_000),
    },
    telemetry,
    credential_boundary: {
      service_token_in_trial_environment: false,
      installation_token_in_trial_environment: false,
      declared_socket_target: proxy.targetPath,
    },
    verdict: passed ? 'PASSED' : 'NOT PASSED',
  };

  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');

  process.stdout.write(
    [
      `Stage 3 canary: ${passed ? 'PASSED' : 'NOT PASSED'}`,
      `  registration: ${registration.confirmed ? 'confirmed' : 'not confirmed'}`,
      `  isolation: ${isolation.qualificationEligible ? 'eligible' : 'not eligible'}`,
      `  telemetry: ${telemetry.telemetry_state}, eligible=${String(telemetry.qualification_eligible)}`,
      `  outbox remaining: ${String(telemetry.outbox_events_remaining)}`,
      `  evidence: ${outPath}`,
      '',
    ].join('\n'),
  );

  if (!passed) process.exitCode = 3;
} catch (error) {
  evidence = {
    ...evidence,
    failed_at: new Date().toISOString(),
    error: error instanceof Error ? error.message : String(error),
  };
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
  process.stderr.write(
    `Stage 3 canary: NOT PASSED -- ${error instanceof Error ? error.message : String(error)}\n` +
      `evidence: ${outPath}\n`,
  );
  process.exitCode = 3;
} finally {
  await proxy.close();
  rmSync(workspaceRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
}
