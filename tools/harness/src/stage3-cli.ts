/**
 * `stage3` -- run one Stage 3 trial and record what it produced.
 *
 * Qualification is deliberately stricter than ordinary product operation. The
 * trusted host proves the Evidence Plane ingest path is authenticated and
 * reachable, pre-registers the run, and only then launches the agent. The agent
 * receives neither plane credential: its hooks reach a host proxy over one
 * policy-declared AF_UNIX socket bind-mounted into the namespace.
 *
 * Nothing here decides a task verdict. It collects observations and hands them
 * to the graders, and `buildTrialReport` is conjunctive and pessimistic: a trial
 * with passing graders that was not qualification-eligible is `unproven`, not
 * `proven`.
 *
 * Usage:
 *   node tools/harness/src/stage3-cli.ts --task <id> --trial <n> --campaign <id>
 *                                        [--arm eos|native] [--out DIR]
 *                                        [--credentials FILE]
 *                                        [--setting-sources project|'']
 */

import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { buildTrialReport, formatTrialReport } from './collect.ts';
import { ClaudeCodeDriver } from './drivers/claude-code.ts';
import { bareToolName } from './drivers/claude-code.ts';
import { gradeDeterministic, gradeTrace } from './graders.ts';
import { namespaceTrialPolicy } from './isolation.ts';
import { httpRegisterRun, registerWithPlane } from './plane-registrar.ts';
import {
  INGEST_SOCKET_ENV,
  REACHABILITY_ATTESTATION_ENV,
  loadQualificationPlaneConfig,
  openQualificationProxy,
} from './qualification-plane.ts';
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

const taskId = flag('--task');
const rawCampaign = flag('--campaign');
if (taskId === undefined || rawCampaign === undefined) {
  process.stderr.write(
    'usage: stage3-cli.ts --task <id> --trial <n> --campaign <id> [--arm eos|native] [--out DIR]\n',
  );
  process.exit(64);
}
if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,31}$/u.test(rawCampaign)) {
  process.stderr.write(
    '--campaign must be 1-32 characters: ASCII letters, digits, underscore or hyphen\n',
  );
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
const outDir = resolve(
  flag('--out') ?? join(eosRoot, 'qualification', 'evidence', 'stage-3', campaign),
);
const settingSources = flag('--setting-sources');

/**
 * Which arm of the pair this trial is.
 *
 * `eos` offers the agent the four EOS tools; `native` is the same trial with the
 * `ieos` MCP server removed and its tools withheld. Everything else is held
 * constant -- same fixture, same namespace, same budget, same prompt, same model,
 * same telemetry hooks -- because the guide's measurement method is paired trials
 * and anything else measures the harness.
 */
const arm = flag('--arm') ?? 'eos';
if (arm !== 'eos' && arm !== 'native') {
  process.stderr.write(`--arm must be "eos" or "native", not "${arm}"\n`);
  process.exit(64);
}

const trialId = `${taskId}-${arm}-t${String(trialNumber)}`;
// Campaign is part of the plane identity, so historical failed runs can never be
// re-used and accidentally inherit their old registration/event state.
const runId = `run_s3_${campaign}_${taskId.replace(/-/gu, '_')}_${arm}_t${String(trialNumber)}`;

mkdirSync(outDir, { recursive: true });
const transcriptDir = join(outDir, 'transcripts');

// ---------------------------------------------------------------------------
// Trusted-host preflight. Nothing below can incur agent cost until both the
// installation ingest path and service registration have been proven live.
// ---------------------------------------------------------------------------
const planeConfig = loadQualificationPlaneConfig({
  eosRoot,
  ...(flag('--credentials') === undefined ? {} : { credentialsPath: flag('--credentials') }),
});
const proxy = await openQualificationProxy({ config: planeConfig, runId });

try {
  const grantedEnvironment = [
    'PATH',
    'HOME',
    'TMPDIR',
    'NODE_EXTRA_CA_CERTS',
    'IEOS_RUN_ID',
    INGEST_SOCKET_ENV,
    REACHABILITY_ATTESTATION_ENV,
  ] as const;

  const policy = namespaceTrialPolicy({
    workspaceRoot: '(assigned below)',
    evaluatorRoot: join(eosRoot, 'evaluator'),
    allowedHosts: ['api.anthropic.com:443'],
    allowedExecutables: ['node', 'bash', 'git', 'claude'],
    allowedEnvironment: grantedEnvironment,
    declaredUnixSockets: [proxy.targetPath],
  });

  const trial = createTrial({
    trialId,
    policy,
    // Built from a named list, never inherited. The host's service and
    // installation credentials are intentionally absent. Only the declared IPC
    // target and the preflight attestation cross into the namespace.
    sourceEnvironment: {
      PATH: process.env['PATH'],
      HOME: process.env['HOME'],
      TMPDIR: process.env['TMPDIR'],
      NODE_EXTRA_CA_CERTS: process.env['NODE_EXTRA_CA_CERTS'],
      IEOS_RUN_ID: runId,
      [INGEST_SOCKET_ENV]: proxy.targetPath,
      [REACHABILITY_ATTESTATION_ENV]: proxy.hostReachableAtStart ? 'true' : 'false',
    },
  });

  // The policy's roots have to name the workspace that now exists.
  const effectivePolicy = namespaceTrialPolicy({
    workspaceRoot: trial.workspaceRoot,
    evaluatorRoot: join(eosRoot, 'evaluator'),
    allowedHosts: ['api.anthropic.com:443'],
    allowedExecutables: ['node', 'bash', 'git', 'claude'],
    allowedEnvironment: grantedEnvironment,
    declaredUnixSockets: [proxy.targetPath],
  });
  const preparedTrial = { ...trial, policy: effectivePolicy };

  function run(command: string, commandArgs: readonly string[], cwd: string): void {
    const result = spawnSync(command, [...commandArgs], { cwd, encoding: 'utf8' });
    if (result.status !== 0) {
      throw new Error(
        `${command} ${commandArgs.join(' ')} failed (${String(result.status)}): ${result.stderr ?? ''}`,
      );
    }
  }

  process.stdout.write(`preparing ${trialId} in ${trial.workspaceRoot}\n`);
  writeTargetRepo(trial.workspaceRoot, task.repo());

  // A git repository, because the MCP server reads `repo_sha` from git and
  // refuses to invent one.
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

  // The real footprint, from the real code path.
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

  // The harness pins the trial's ranking mode on the server `ieos init` wired up.
  const mcpConfigPath = join(trial.workspaceRoot, '.mcp.json');
  const mcpConfig = JSON.parse(readFileSync(mcpConfigPath, 'utf8')) as {
    mcpServers: Record<string, { args?: string[] }>;
  };
  const ieosServer = mcpConfig.mcpServers['ieos'];
  if (ieosServer === undefined) {
    throw new Error(
      '`ieos init` did not register an ieos MCP server, so no trial could call resolve',
    );
  }
  if (arm === 'native') {
    // Native means absent, not merely connected-and-refused. Remove both the
    // server and the bootstrap block that advertises it.
    delete mcpConfig.mcpServers['ieos'];
    writeFileSync(mcpConfigPath, `${JSON.stringify(mcpConfig, null, 2)}\n`, 'utf8');
    for (const file of ['CLAUDE.md', 'AGENTS.md']) {
      const path = join(trial.workspaceRoot, file);
      const before = readFileSync(path, 'utf8');
      const stripped = before.replace(/<!-- ieos:begin -->[\s\S]*?<!-- ieos:end -->\n?/gu, '');
      if (stripped === before) {
        throw new Error(
          `the native arm could not strip the EOS block from ${file}: its markers were absent, ` +
            'so this trial would have advertised tools it does not have',
        );
      }
      writeFileSync(path, stripped, 'utf8');
    }
  } else {
    ieosServer.args = [...(ieosServer.args ?? []), '--ranking-mode', 'recorded'];
    writeFileSync(mcpConfigPath, `${JSON.stringify(mcpConfig, null, 2)}\n`, 'utf8');
  }

  // --- registration, before the first event (D36) --------------------------
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
      `the Evidence Plane did not confirm pre-registration for ${runId}: ` +
        `${registration.reason ?? 'no reason given'}. Refusing to launch the agent.`,
    );
  }
  process.stdout.write('registration: confirmed by the plane\n');

  // --- the trial ------------------------------------------------------------
  // Recorded ranking is pinned on the MCP server the trial talks to, not asked
  // for in the request: the subject cannot opt out of comparability.
  const RANKING_MODE = 'recorded';

  const driver = new ClaudeCodeDriver({
    transcriptDir,
    allowedTools: [
      'Read',
      'Write',
      'Edit',
      'Bash',
      'Glob',
      'Grep',
      ...(arm === 'native'
        ? []
        : ['mcp__ieos__resolve', 'mcp__ieos__inspect', 'mcp__ieos__expand', 'mcp__ieos__observe']),
    ],
    allowedHosts: ['api.anthropic.com:443'],
    deniedRoots: [join(eosRoot, 'evaluator'), join(eosRoot, 'simulations')],
    unixSocketMounts: [{ sourcePath: proxy.sourcePath, targetPath: proxy.targetPath }],
    executable: 'claude',
    model: 'claude-sonnet-5',
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
  });
  const record = driver.lastRecord;

  // --- grading -------------------------------------------------------------
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

  const denials = driver.lastRecord?.permissionDenials ?? [];
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
    // Trace verdicts are reported, not gating: the exit gate allows a task solved
    // correctly without EOS, so a trace rule must not be able to fail a trial.
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

  /**
   * Read after the agent has stopped, while the proxy is still alive, what this
   * exact registered run's hooks recorded locally.
   */
  const telemetry = await readTrialTelemetry({
    workspaceRoot: trial.workspaceRoot,
    runId,
  });

  const trialRecord = {
    campaign,
    trial_id: trialId,
    run_id: runId,
    simulation_id: `stage-3-${taskId}`,
    task_id: taskId,
    arm,
    recorded_at: new Date().toISOString(),
    eos_revision: execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: eosRoot,
      encoding: 'utf8',
    }).trim(),
    setting_sources: settingSources ?? 'project',
    ranking_mode: RANKING_MODE,
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
    namespace_observations: record?.observations ?? null,
    mechanism_unavailable: record?.mechanismUnavailable ?? null,
    check: { failure: check.failure, outcomes: check.outcomes },
    verdicts,
    grading: report.grading,
    reasons: report.reasons,
    transcript_ref: finalOutcome.result.transcriptRef,
  };

  const recordPath = join(outDir, `${trialId}.json`);
  writeFileSync(recordPath, `${JSON.stringify(trialRecord, null, 2)}\n`, 'utf8');

  process.stdout.write(`\n${formatTrialReport(report)}`);
  if (obstructed) {
    process.stdout.write(
      `  NOT GRADED -- the agent was refused ${String(denials.length)} tool call(s) ` +
        `(${[...new Set(denials)].join(', ')}), so the workspace does not reflect what it did\n`,
    );
  } else if (!ranToCompletion) {
    process.stdout.write(
      `  NOT GRADED -- the run did not complete: ${record?.terminalReason ?? 'no reason recorded'}\n`,
    );
  }
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
