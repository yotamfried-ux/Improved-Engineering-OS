/** Run one Stage 3 qualification trial and record what it produced. */

import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { buildTrialReport, formatTrialReport } from './collect.ts';
import { ClaudeCodeDriver, bareToolName } from './drivers/claude-code.ts';
import { gradeDeterministic, gradeTrace } from './graders.ts';
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
} from './qualification-profile.ts';
import { windowsBashDirectory } from './git-bash.ts';
import { formatStage3HostPreflight, inspectStage3Host } from './stage3-host-preflight.ts';
import { inspectKnowledgeIndex } from './stage3-index-preflight.ts';
import {
  assertCampaignRevisionCompatible,
  assertFreshTrialArtifacts,
} from './stage3-trial-artifacts.ts';
import { RunRegistry } from './run-registry.ts';
import { createTrial } from './sandbox.ts';
import { MAX_COST_USD_PER_TRIAL, runCheck, taskById } from './task-bank.ts';
import { writeTargetRepo } from './target-repo.ts';
import { readTrialTelemetry } from './trial-telemetry.ts';
import { runTrial } from './trial.ts';

const args = process.argv.slice(2);
const flag = (name: string): string | undefined => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};

let profile: ReturnType<typeof qualificationProfileFor>;
try {
  profile = qualificationProfileFor();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(69);
}

const host = inspectStage3Host();
process.stdout.write(formatStage3HostPreflight(host));
if (!host.ready) {
  process.stderr.write('Stage 3 paid trial refused: the owner host preflight is not ready\n');
  process.exit(69);
}

const taskId = flag('--task');
const rawCampaign = flag('--campaign');
if (taskId === undefined || rawCampaign === undefined) {
  process.stderr.write(
    'usage: stage3-cli.ts --task <id> --trial <n> --campaign <id> [--arm eos|native] [--out DIR]\n',
  );
  process.exit(64);
}
if (!/^[A-Za-z0-9_]{1,12}$/u.test(rawCampaign)) {
  process.stderr.write('--campaign must be 1-12 ASCII letters, digits or underscores\n');
  process.exit(64);
}

const campaign = rawCampaign;
const task = taskById(taskId);
const trialNumber = Number(flag('--trial') ?? '1');
if (!Number.isSafeInteger(trialNumber) || trialNumber < 1) {
  process.stderr.write('--trial must be a positive integer\n');
  process.exit(64);
}
const eosRoot = resolve(import.meta.dirname, '..', '..', '..');
const currentRevision = execFileSync('git', ['rev-parse', 'HEAD'], {
  cwd: eosRoot,
  encoding: 'utf8',
}).trim();
const index = await inspectKnowledgeIndex(join(eosRoot, 'knowledge.sqlite'));
if (!index.ok) {
  process.stderr.write(`Stage 3 paid trial refused: ${index.reason}\n`);
  process.exit(4);
}
const agentCliVersion = execFileSync('claude', ['--version'], {
  cwd: eosRoot,
  encoding: 'utf8',
  windowsHide: true,
  env: { ...process.env, DISABLE_AUTOUPDATER: '1' },
}).trim();
const bashDirectory = windowsBashDirectory();
if (profile === 'windows-personal-v1' && bashDirectory === undefined) {
  process.stderr.write(
    'Stage 3 paid trial refused: Git Bash could not be located from git --exec-path\n',
  );
  process.exit(69);
}
const gitBashPath =
  profile === 'windows-personal-v1' && bashDirectory !== undefined
    ? join(bashDirectory, 'bash.exe')
    : undefined;

const outDir = resolve(
  flag('--out') ?? join(eosRoot, 'qualification', 'evidence', 'stage-3', campaign),
);
const settingSources = flag('--setting-sources');
const credentialsPath = flag('--credentials');
const serviceCredentialsPath = flag('--service-credentials');
const arm = flag('--arm') ?? 'eos';
if (arm !== 'eos' && arm !== 'native') {
  process.stderr.write(`--arm must be "eos" or "native", not "${arm}"\n`);
  process.exit(64);
}

const trialId = `${taskId}-${arm}-t${String(trialNumber)}`;
const runId = `run_s3_${campaign}_${taskId.replace(/-/gu, '_')}_${arm}_t${String(trialNumber)}`;
const transcriptDir = join(outDir, 'transcripts');
const recordPath = join(outDir, `${trialId}.json`);
const transcriptPath = join(transcriptDir, `${trialId}-${task.taskId}.ndjson`);

assertCampaignRevisionCompatible({ outDir, campaign, currentRevision });
assertFreshTrialArtifacts({ recordPath, transcriptPath });
mkdirSync(outDir, { recursive: true });

const planeConfig = loadQualificationPlaneConfig({
  eosRoot,
  ...(credentialsPath === undefined ? {} : { credentialsPath }),
  ...(serviceCredentialsPath === undefined ? {} : { serviceCredentialsPath }),
});
const proxy = await openPlatformQualificationProxy({ config: planeConfig, runId });

try {
  const grantedEnvironment = [
    ...qualificationEnvironmentNames(),
    'IEOS_RUN_ID',
    INGEST_SOCKET_ENV,
    REACHABILITY_ATTESTATION_ENV,
    'DISABLE_AUTOUPDATER',
    ...(gitBashPath === undefined ? [] : ['CLAUDE_CODE_GIT_BASH_PATH']),
  ];
  const policyFor = (workspaceRoot: string) =>
    qualificationTrialPolicy({
      workspaceRoot,
      evaluatorRoot: join(eosRoot, 'evaluator'),
      allowedHosts: ['api.anthropic.com:443'],
      allowedExecutables: ['node', 'bash', 'git', 'claude'],
      allowedEnvironment: grantedEnvironment,
      ipcTarget: proxy.targetPath,
    });

  const trial = createTrial({
    trialId,
    policy: policyFor('(assigned below)'),
    sourceEnvironment: qualificationEnvironmentSource({
      // Git's bash, not the WSL launcher that shadows it on PATH.
      // Keep the resolver at the call site: a structural regression test pins
      // every real trial launcher to this host-aware helper.
      bashDirectory: windowsBashDirectory(),
      trusted: {
        IEOS_RUN_ID: runId,
        [INGEST_SOCKET_ENV]: proxy.targetPath,
        [REACHABILITY_ATTESTATION_ENV]: proxy.hostReachableAtStart ? 'true' : 'false',
        DISABLE_AUTOUPDATER: '1',
        ...(gitBashPath === undefined ? {} : { CLAUDE_CODE_GIT_BASH_PATH: gitBashPath }),
      },
    }),
  });
  const preparedTrial = { ...trial, policy: policyFor(trial.workspaceRoot) };

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

  process.stdout.write(`qualification profile: ${profile}\n`);
  process.stdout.write(`preparing ${trialId} in ${trial.workspaceRoot}\n`);
  writeTargetRepo(trial.workspaceRoot, task.repo());
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
      'fixture',
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

  const mcpConfigPath = join(trial.workspaceRoot, '.mcp.json');
  const mcpConfig = JSON.parse(readFileSync(mcpConfigPath, 'utf8')) as {
    mcpServers: Record<string, { args?: string[] }>;
  };
  const ieosServer = mcpConfig.mcpServers['ieos'];
  if (ieosServer === undefined) {
    throw new Error('`ieos init` did not register an ieos MCP server');
  }
  if (arm === 'native') {
    delete mcpConfig.mcpServers['ieos'];
    writeFileSync(mcpConfigPath, `${JSON.stringify(mcpConfig, null, 2)}\n`, 'utf8');
    for (const file of ['CLAUDE.md', 'AGENTS.md']) {
      const path = join(trial.workspaceRoot, file);
      const before = readFileSync(path, 'utf8');
      const stripped = before.replace(/<!-- ieos:begin -->[\s\S]*?<!-- ieos:end -->\n?/gu, '');
      if (stripped === before) {
        throw new Error(`the native arm could not strip the EOS block from ${file}`);
      }
      writeFileSync(path, stripped, 'utf8');
    }
  } else {
    ieosServer.args = [...(ieosServer.args ?? []), '--ranking-mode', 'recorded'];
    writeFileSync(mcpConfigPath, `${JSON.stringify(mcpConfig, null, 2)}\n`, 'utf8');
  }

  const registry = new RunRegistry();
  const registration = await registerWithPlane(
    registry,
    {
      run_id: runId,
      origin_class: 'qualification',
      eval_set_version: null,
      holdout_state: null,
      simulation_id: `stage-3-${taskId}`,
    },
    httpRegisterRun({
      endpoint: planeConfig.endpoint,
      serviceToken: planeConfig.serviceToken,
      fetch: globalThis.fetch,
    }),
  );
  if (!registration.confirmed) {
    throw new Error(
      `the Evidence Plane did not confirm pre-registration for ${runId}: ${registration.reason ?? 'no reason given'}`,
    );
  }
  process.stdout.write('registration: confirmed by the plane\n');

  const allowedTools = [
    'Read',
    'Write',
    'Edit',
    'Bash',
    'Glob',
    'Grep',
    ...(arm === 'native'
      ? []
      : ['mcp__ieos__resolve', 'mcp__ieos__inspect', 'mcp__ieos__expand', 'mcp__ieos__observe']),
  ];
  const driver = new ClaudeCodeDriver({
    transcriptDir,
    allowedTools,
    allowedHosts: ['api.anthropic.com:443'],
    deniedRoots: [join(eosRoot, 'evaluator'), join(eosRoot, 'simulations')],
    unixSocketMounts:
      profile === 'linux-namespace-v1'
        ? [{ sourcePath: proxy.sourcePath, targetPath: proxy.targetPath }]
        : [],
    executable: 'claude',
    model: 'claude-sonnet-5',
    qualificationProfile: profile,
    forbiddenCredentialValues: [planeConfig.serviceToken, planeConfig.installationToken],
    ...(settingSources === undefined
      ? {}
      : { settingSources: settingSources.split(',').filter(Boolean) }),
  });

  const finalOutcome = await runTrial({
    trial: preparedTrial,
    task: task.task,
    driver,
    registry,
    runId,
    mechanismFindings: () => driver.lastRecord?.boundaryFindings ?? [],
    integrityReport: () => driver.lastRecord?.integrity ?? null,
  });
  const record = driver.lastRecord;

  const check = runCheck(task, trial.workspaceRoot);
  const toolCalls = finalOutcome.result.toolCalls.map((call) => ({
    name: bareToolName(call.name),
    at: call.at,
  }));
  const subject = {
    outcomes: check.outcomes,
    toolCalls,
    transcript: finalOutcome.result.transcriptRef,
  };
  const denials = record?.permissionDenials ?? [];
  const obstructed = denials.length > 0;
  const ranToCompletion = finalOutcome.result.completed && !obstructed;
  const verdicts = ranToCompletion
    ? [
        ...task.deterministicRules.map((rule) => gradeDeterministic(rule, subject)),
        ...task.traceRules.map((rule) => gradeTrace(rule, subject)),
      ]
    : [];
  const usage = finalOutcome.result.usage;
  const report = buildTrialReport({
    outcome: finalOutcome,
    verdicts: ranToCompletion
      ? task.deterministicRules.map((rule) => gradeDeterministic(rule, subject))
      : [],
    budget: { ...task.task.budget, maxCostUsd: MAX_COST_USD_PER_TRIAL },
    usage: {
      wallClockSeconds: usage?.wallClockSeconds ?? 0,
      toolCalls: finalOutcome.result.toolCalls.length,
      ...(usage === null ? {} : { costUsd: usage.costUsd }),
    },
    artifacts:
      finalOutcome.result.transcriptRef === null
        ? []
        : [{ name: 'transcript', ref: finalOutcome.result.transcriptRef, bytes: 0 }],
  });
  const resolveCalled = toolCalls.some((call) => call.name === 'resolve');
  const telemetry = await readTrialTelemetry({ workspaceRoot: trial.workspaceRoot, runId });

  const trialRecord = {
    campaign,
    trial_id: trialId,
    run_id: runId,
    simulation_id: `stage-3-${taskId}`,
    task_id: taskId,
    arm,
    recorded_at: new Date().toISOString(),
    eos_revision: currentRevision,
    qualification_profile: profile,
    ipc_transport: proxy.transport,
    knowledge_index_digest: index.indexDigest,
    agent: {
      driver: 'claude-code',
      cli_version: agentCliVersion,
    },
    runtime: {
      node: process.version,
      platform: process.platform,
    },
    setting_sources: settingSources ?? 'project',
    ranking_mode: 'recorded',
    registration: { confirmed: registration.confirmed, reason: registration.reason },
    status: report.status,
    ran_to_completion: ranToCompletion,
    obstructed,
    permission_denials: denials,
    terminal_reason: record?.terminalReason ?? null,
    qualification_eligible: report.qualificationEligible,
    origin_class_the_plane_would_stamp: registry.originClassFor(runId),
    budget: report.budget,
    usage,
    // Recorded per trial rather than taken from the configuration, so a run
    // that silently used another model cannot be compared as though it had not.
    model: finalOutcome.result.model ?? { requested: null, resolved: null },
    tool_calls: toolCalls,
    resolve_called_unprompted: resolveCalled,
    eos_tools_used: [...new Set(toolCalls.map((call) => call.name))].filter((name) =>
      ['resolve', 'inspect', 'expand', 'observe'].includes(name),
    ),
    telemetry,
    rescue: {
      human_interventions: 0,
      prompts_sent: record?.rescue.promptsSent ?? null,
      interactive_stdin: record?.rescue.interactiveStdin ?? null,
    },
    isolation: finalOutcome.isolation,
    trial_integrity: record?.integrity ?? null,
    namespace_observations: record?.observations ?? null,
    mechanism_unavailable: record?.mechanismUnavailable ?? null,
    check: { failure: check.failure, outcomes: check.outcomes },
    verdicts,
    grading: report.grading,
    reasons: report.reasons,
    transcript_ref: finalOutcome.result.transcriptRef,
  };

  writeFileSync(recordPath, `${JSON.stringify(trialRecord, null, 2)}\n`, 'utf8');
  process.stdout.write(`\n${formatTrialReport(report)}`);
  process.stdout.write(`  qualification profile: ${profile}\n`);
  process.stdout.write(`  IPC transport: ${proxy.transport}\n`);
  process.stdout.write(`  campaign: ${campaign}\n`);
  process.stdout.write(`  arm: ${arm}\n`);
  process.stdout.write(`  resolve called unprompted: ${String(resolveCalled)}\n`);
  process.stdout.write(
    `  cost: $${String(usage?.costUsd ?? 0)}  tool calls: ${String(toolCalls.length)}\n`,
  );
  process.stdout.write(`  record: ${recordPath}\n`);
  process.stdout.write(`  workspace kept for inspection: ${trial.workspaceRoot}\n`);
} finally {
  await proxy.close();
}
