/** No-model Stage 3 canary for the active qualification platform. */

import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { buildIsolationReport, strictestOf } from './isolation.ts';
import { namespaceFindings } from './ns-sandbox.ts';
import { httpRegisterRun, registerWithPlane } from './plane-registrar.ts';
import {
  INGEST_SOCKET_ENV,
  REACHABILITY_ATTESTATION_ENV,
  loadQualificationPlaneConfig,
} from './qualification-plane.ts';
import {
  openPlatformQualificationProxy,
  qualificationEnvironmentNames,
  qualificationEnvironmentSource,
  qualificationProfileFor,
  qualificationTrialPolicy,
  runQualificationProcess,
} from './qualification-profile.ts';
import { RunRegistry } from './run-registry.ts';
import { createTrial, probe } from './sandbox.ts';
import { inspectStage3Host } from './stage3-host-preflight.ts';
import { readTrialTelemetry } from './trial-telemetry.ts';
import { buildTrialIntegrityReport } from './trial-integrity.ts';

const args = process.argv.slice(2);
const flag = (name: string): string | undefined => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};

const profile = qualificationProfileFor();
const host = inspectStage3Host();
if (!host.ready) {
  process.stderr.write(
    'Stage 3 canary refused: the active qualification host preflight is not ready\n',
  );
  process.exit(69);
}

const eosRoot = resolve(import.meta.dirname, '..', '..', '..');
const runId = `run_s3_canary_${String(Date.now())}`;
const sessionId = `sess_s3_canary_${String(Date.now())}`;
const outPath = resolve(
  flag('--out') ?? join(eosRoot, 'qualification', 'evidence', 'stage-3-canary', `${runId}.json`),
);
const credentialsPath = flag('--credentials');
const serviceCredentialsPath = flag('--service-credentials');

function run(command: string, commandArgs: readonly string[], cwd: string): void {
  const result = spawnSync(command, [...commandArgs], {
    cwd,
    encoding: 'utf8',
    windowsHide: true,
  });
  if (result.status !== 0) {
    throw new Error(
      `${command} ${commandArgs.join(' ')} failed (${String(result.status)}): ${result.stderr ?? ''}`,
    );
  }
}

const planeConfig = loadQualificationPlaneConfig({
  eosRoot,
  ...(credentialsPath === undefined ? {} : { credentialsPath }),
  ...(serviceCredentialsPath === undefined ? {} : { serviceCredentialsPath }),
});
const proxy = await openPlatformQualificationProxy({ config: planeConfig, runId });
const allowedEnvironment = [
  ...qualificationEnvironmentNames(),
  'IEOS_RUN_ID',
  INGEST_SOCKET_ENV,
  REACHABILITY_ATTESTATION_ENV,
];
const policyFor = (workspaceRoot: string) =>
  qualificationTrialPolicy({
    workspaceRoot,
    evaluatorRoot: join(eosRoot, 'evaluator'),
    allowedHosts: [],
    allowedExecutables: ['node'],
    allowedEnvironment,
    ipcTarget: proxy.targetPath,
  });
const trial = createTrial({
  trialId: 'stage3-canary',
  policy: policyFor('(assigned below)'),
  sourceEnvironment: qualificationEnvironmentSource({
    trusted: {
      IEOS_RUN_ID: runId,
      [INGEST_SOCKET_ENV]: proxy.targetPath,
      [REACHABILITY_ATTESTATION_ENV]: 'true',
    },
  }),
});
const preparedTrial = { ...trial, policy: policyFor(trial.workspaceRoot) };
let evidence: Record<string, unknown> = {
  run_id: runId,
  qualification_profile: profile,
  recorded_at: new Date().toISOString(),
  verdict: 'NOT PASSED',
};

try {
  writeFileSync(join(trial.workspaceRoot, 'README.md'), '# Stage 3 telemetry canary\n', 'utf8');
  run('git', ['init', '-q', '.'], trial.workspaceRoot);
  run('git', ['add', '-A'], trial.workspaceRoot);
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
    trial.workspaceRoot,
  );
  run(
    process.execPath,
    [
      join(eosRoot, 'packages', 'adapters', 'cli', 'src', 'cli.ts'),
      'init',
      '--with-hooks',
      '--project',
      trial.workspaceRoot,
    ],
    eosRoot,
  );
  const repoSha = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: trial.workspaceRoot,
    encoding: 'utf8',
  }).trim();

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

  const before = probe(preparedTrial);
  const execution = runQualificationProcess({
    command: [
      process.execPath,
      join(eosRoot, 'tools', 'harness', 'src', 'stage3-canary-child.ts'),
      '--eos-root',
      eosRoot,
      '--project',
      trial.workspaceRoot,
      '--repo-sha',
      repoSha,
      '--session',
      sessionId,
    ],
    cwd: trial.workspaceRoot,
    environment: preparedTrial.environment,
    allowedHosts: [],
    deniedRoots: [join(eosRoot, 'evaluator'), join(eosRoot, 'simulations')],
    declaredUnixSockets: profile === 'linux-namespace-v1' ? [proxy.targetPath] : [],
    unixSocketMounts:
      profile === 'linux-namespace-v1'
        ? [{ sourcePath: proxy.sourcePath, targetPath: proxy.targetPath }]
        : [],
    timeoutSeconds: 120,
  });
  const probed = strictestOf(preparedTrial.policy, before.findings, probe(preparedTrial).findings);
  const mechanism =
    profile === 'linux-namespace-v1'
      ? namespaceFindings(execution.observations, {
          unavailableReason: execution.unavailableReason,
        })
      : [];
  const isolation =
    mechanism.length === 0
      ? probed
      : buildIsolationReport(preparedTrial.policy, [...probed.findings, ...mechanism]);
  const integrity = buildTrialIntegrityReport({
    profile,
    workspaceRoot: trial.workspaceRoot,
    artifactPath: outPath,
    environment: preparedTrial.environment,
    allowedEnvironment,
    expectedPrompts: 0,
    promptsSent: 0,
    interactiveStdin: false,
    ipcTarget: proxy.targetPath,
    forbiddenCredentialValues: [planeConfig.serviceToken, planeConfig.installationToken],
  });
  const telemetry = await readTrialTelemetry({ workspaceRoot: trial.workspaceRoot, runId });

  const hookPathPassed = execution.status === 0 && !execution.timedOut;
  const telemetryPassed =
    telemetry.run_id === runId &&
    telemetry.ingest_reachable_at_start &&
    !telemetry.flush_ever_failed &&
    telemetry.outbox_events_remaining === 0 &&
    telemetry.telemetry_state === 'COMPLETE' &&
    telemetry.qualification_eligible;
  const passed =
    hookPathPassed &&
    isolation.qualificationEligible &&
    integrity.qualificationEligible &&
    telemetryPassed;

  evidence = {
    run_id: runId,
    recorded_at: new Date().toISOString(),
    eos_revision: execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: eosRoot,
      encoding: 'utf8',
    }).trim(),
    qualification_profile: profile,
    ipc_transport: proxy.transport,
    registration: {
      confirmed: registration.confirmed,
      origin_class: registry.originClassFor(runId),
    },
    execution: {
      status: execution.status,
      timed_out: execution.timedOut,
      namespace_observations: execution.observations,
      mechanism_unavailable: execution.unavailableReason,
      stderr: execution.stderr.slice(0, 2_000),
    },
    isolation,
    trial_integrity: integrity,
    telemetry,
    credential_boundary: {
      service_token_in_trial_environment: Object.values(preparedTrial.environment).includes(
        planeConfig.serviceToken,
      ),
      installation_token_in_trial_environment: Object.values(preparedTrial.environment).includes(
        planeConfig.installationToken,
      ),
      service_credential_source:
        planeConfig.serviceCredentialSource === 'environment' ? 'environment' : 'local-file',
      installation_credential_source:
        planeConfig.credentialSource === 'environment' ? 'environment' : 'local-file',
      ipc_target: proxy.targetPath,
      ipc_transport: proxy.transport,
    },
    verdict: passed ? 'PASSED' : 'NOT PASSED',
  };

  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
  process.stdout.write(
    [
      `Stage 3 canary: ${passed ? 'PASSED' : 'NOT PASSED'}`,
      `  qualification profile: ${profile}`,
      `  IPC: ${proxy.transport}`,
      `  registration: ${registration.confirmed ? 'confirmed' : 'not confirmed'}`,
      `  required isolation: ${isolation.qualificationEligible ? 'eligible' : 'not eligible'}`,
      `  trial integrity: ${integrity.qualificationEligible ? 'eligible' : 'not eligible'}`,
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
  trial.dispose();
}
