/**
 * `stage3` -- run one Stage 3 trial and record what it produced.
 *
 * The order of operations is the part worth reading. Registration comes before
 * the agent's first event, because D36 says a run's class is fixed before its
 * evidence exists and a harness that registered afterwards would be classifying
 * evidence it had already seen. The footprint is written by `ieos init
 * --with-hooks` rather than by a fixture, so the bootstrap block and the four
 * telemetry hooks are the pinned templates' own output. The workspace is probed
 * before and after the agent runs, and the namespace mechanism reports separately
 * on what it enforced.
 *
 * Nothing here decides a verdict. It collects observations and hands them to the
 * graders, and `buildTrialReport` is conjunctive and pessimistic: a trial with
 * passing graders that was not qualification-eligible is `unproven`, not
 * `proven`.
 *
 * Usage:
 *   node tools/harness/src/stage3-cli.ts --task <id> --trial <n> [--out DIR]
 *                                        [--setting-sources project|'']
 */

import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { buildTrialReport, formatTrialReport } from './collect.ts';
import { ClaudeCodeDriver } from './drivers/claude-code.ts';
import { gradeDeterministic, gradeTrace } from './graders.ts';
import { namespaceTrialPolicy } from './isolation.ts';
import { httpRegisterRun, registerWithPlane } from './plane-registrar.ts';
import { RunRegistry } from './run-registry.ts';
import { createTrial } from './sandbox.ts';
import { MAX_COST_USD_PER_TRIAL, runCheck, taskById } from './task-bank.ts';
import { writeTargetRepo } from './target-repo.ts';
import { runTrial } from './trial.ts';
import { bareToolName } from './drivers/claude-code.ts';

const args = process.argv.slice(2);
const flag = (name: string): string | undefined => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};

const taskId = flag('--task');
if (taskId === undefined) {
  process.stderr.write('usage: stage3-cli.ts --task <id> --trial <n> [--out DIR]\n');
  process.exit(64);
}

const task = taskById(taskId);
const trialNumber = Number(flag('--trial') ?? '1');
const eosRoot = resolve(import.meta.dirname, '..', '..', '..');
const outDir = resolve(flag('--out') ?? join(eosRoot, 'qualification', 'evidence', 'stage-3'));
const settingSources = flag('--setting-sources');

const trialId = `${taskId}-t${String(trialNumber)}`;
// A run id the plane can carry, and one a reader can trace back to a manifest.
const runId = `run_s3_${taskId.replace(/-/gu, '_')}_t${String(trialNumber)}`;

mkdirSync(outDir, { recursive: true });
const transcriptDir = join(outDir, 'transcripts');

const policy = namespaceTrialPolicy({
  workspaceRoot: '(assigned below)',
  evaluatorRoot: join(eosRoot, 'evaluator'),
  allowedHosts: ['api.anthropic.com:443'],
  allowedExecutables: ['node', 'bash', 'git', 'claude'],
  allowedEnvironment: ['PATH', 'HOME', 'TMPDIR', 'NODE_EXTRA_CA_CERTS', 'IEOS_RUN_ID'],
});

const trial = createTrial({
  trialId,
  policy,
  // Built from a named list, never inherited: HOME carries the agent's credential
  // store, PATH reaches node and the agent, and the CA bundle is named because a
  // TLS failure inside a namespace is indistinguishable from a blocked boundary.
  sourceEnvironment: {
    PATH: process.env['PATH'],
    HOME: process.env['HOME'],
    TMPDIR: process.env['TMPDIR'],
    NODE_EXTRA_CA_CERTS: process.env['NODE_EXTRA_CA_CERTS'],
    // The run the harness registered, so the hooks emit under it rather than
    // minting their own (S-7). Without this the registered run produces no events
    // and the emitting run was never registered.
    IEOS_RUN_ID: runId,
  },
});

// The policy's roots have to name the workspace that now exists.
const effectivePolicy = namespaceTrialPolicy({
  workspaceRoot: trial.workspaceRoot,
  evaluatorRoot: join(eosRoot, 'evaluator'),
  allowedHosts: ['api.anthropic.com:443'],
  allowedExecutables: ['node', 'bash', 'git', 'claude'],
  allowedEnvironment: ['PATH', 'HOME', 'TMPDIR', 'NODE_EXTRA_CA_CERTS', 'IEOS_RUN_ID'],
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

// A git repository, because the MCP server reads `repo_sha` from git and refuses
// to invent one. A fixture without history would make the server fail for a
// reason that has nothing to do with the trial.
run('git', ['init', '-q', '.'], trial.workspaceRoot);
run('git', ['add', '-A'], trial.workspaceRoot);
run(
  'git',
  ['-c', 'user.email=harness@ieos.invalid', '-c', 'user.name=ieos harness', 'commit', '-q', '-m', 'fixture'],
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
// Done here rather than in `init` because it is a property of a measurement, not
// of a project: an ordinary installation should get the live overlay.
const mcpConfigPath = join(trial.workspaceRoot, '.mcp.json');
const mcpConfig = JSON.parse(readFileSync(mcpConfigPath, 'utf8')) as {
  mcpServers: Record<string, { args?: string[] }>;
};
const ieosServer = mcpConfig.mcpServers['ieos'];
if (ieosServer === undefined) {
  throw new Error('`ieos init` did not register an ieos MCP server, so no trial could call resolve');
}
ieosServer.args = [...(ieosServer.args ?? []), '--ranking-mode', 'recorded'];
writeFileSync(mcpConfigPath, `${JSON.stringify(mcpConfig, null, 2)}\n`, 'utf8');

// --- registration, before the first event (D36) ----------------------------
const registry = new RunRegistry();
const endpoint = process.env['IEOS_INGEST_ENDPOINT'];
const serviceToken = process.env['IEOS_SERVICE_TOKEN'];
const transport =
  endpoint !== undefined && serviceToken !== undefined
    ? httpRegisterRun({ endpoint, serviceToken, fetch: globalThis.fetch })
    : null;

const registration = await registerWithPlane(
  registry,
  {
    run_id: runId,
    origin_class: 'qualification',
    eval_set_version: null,
    holdout_state: null,
    simulation_id: `stage-3-${taskId}`,
  },
  transport,
);
process.stdout.write(
  `registration: ${registration.confirmed ? 'confirmed by the plane' : `NOT confirmed -- ${registration.reason ?? 'no reason given'}`}\n`,
);

// --- the trial --------------------------------------------------------------
// Recorded ranking is pinned on the MCP server the trial talks to, not asked for
// in the request: D24's comparability guarantee is worth nothing if the subject
// can opt out of it (Q-06).
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
    'mcp__ieos__resolve',
    'mcp__ieos__inspect',
    'mcp__ieos__expand',
    'mcp__ieos__observe',
  ],
  allowedHosts: ['api.anthropic.com:443'],
  deniedRoots: [join(eosRoot, 'evaluator'), join(eosRoot, 'simulations')],
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

// --- grading ---------------------------------------------------------------
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

const verdicts = [
  ...task.deterministicRules.map((rule) => gradeDeterministic(rule, subject)),
  ...task.traceRules.map((rule) => gradeTrace(rule, subject)),
];

const usage = finalOutcome.result.usage;
const report = buildTrialReport({
  outcome: finalOutcome,
  // Trace verdicts are reported, not gating: the exit gate allows a task solved
  // correctly without EOS, so a trace rule must not be able to fail a trial.
  verdicts: task.deterministicRules.map((rule) => gradeDeterministic(rule, subject)),
  budget: { ...task.task.budget, maxCostUsd: MAX_COST_USD_PER_TRIAL },
  usage: {
    wallClockSeconds: usage?.wallClockSeconds ?? 0,
    toolCalls: finalOutcome.result.toolCalls.length,
    // Omitted rather than zeroed when the driver could not report it: a cost of
    // zero would read as a free trial instead of an unmeasured one.
    ...(usage === null ? {} : { costUsd: usage.costUsd }),
  },
  artifacts:
    finalOutcome.result.transcriptRef === null
      ? []
      : [{ name: 'transcript', ref: finalOutcome.result.transcriptRef, bytes: 0 }],
});

const resolveCalled = toolCalls.some((call) => call.name === 'resolve');
const trialRecord = {
  trial_id: trialId,
  run_id: runId,
  simulation_id: `stage-3-${taskId}`,
  task_id: taskId,
  recorded_at: new Date().toISOString(),
  eos_revision: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: eosRoot, encoding: 'utf8' }).trim(),
  setting_sources: settingSources ?? 'project',
  ranking_mode: RANKING_MODE,
  registration: { confirmed: registration.confirmed, reason: registration.reason },
  status: report.status,
  qualification_eligible: report.qualificationEligible,
  origin_class_the_plane_would_stamp: registry.originClassFor(runId),
  budget: report.budget,
  usage,
  tool_calls: toolCalls,
  resolve_called_unprompted: resolveCalled,
  eos_tools_used: [...new Set(toolCalls.map((call) => call.name))].filter((name) =>
    ['resolve', 'inspect', 'expand', 'observe'].includes(name),
  ),
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
process.stdout.write(`  resolve called unprompted: ${String(resolveCalled)}\n`);
process.stdout.write(`  cost: $${String(usage?.costUsd ?? 0)}  tool calls: ${String(toolCalls.length)}\n`);
process.stdout.write(`  record: ${recordPath}\n`);
process.stdout.write(`  workspace kept for inspection: ${trial.workspaceRoot}\n`);
