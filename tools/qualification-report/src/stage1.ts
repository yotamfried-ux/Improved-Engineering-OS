/**
 * Stage 1 exit-gate evaluation.
 *
 * The nine rows are the guide's Stage 1 additions plus the two the plan carried
 * forward. What makes this file different from a checklist is where each row
 * gets its answer:
 *
 *   G1 and G7 rest on things this harness *did* -- commands it ran, builds it
 *   repeated -- recorded per platform with their exit codes and digests.
 *   G2-G6 rest on individually **named** tests. A row whose test is missing
 *   from the record is `unproven`, never `pass`, so renaming or deleting a
 *   conformance test breaks the report rather than quietly emptying it.
 *   G8 compares a digest across platforms *and* against the value the Stage 0
 *   report pinned, so a change that is consistent everywhere is still caught.
 *   G9 is the shared F1-F12 judgement.
 *
 * The naming is deliberate and slightly uncomfortable: these row ids are the
 * plan's, and the plan is a document this report is meant to be able to
 * contradict. It can. Every status here comes from `Stage1GateInput`, which is
 * assembled from measurements in `cli.ts`; nothing is read from the plan.
 */

import type { NamedTestStatus, PlatformEvidence } from './evidence.ts';
import type { FitnessInput, GateReport, GateRow, PlatformSet, RowStatus } from './gate.ts';
import { digestRow, fitnessRow, missingPlatforms, row, usablePlatforms } from './gate.ts';

/**
 * The empty bootstrap snapshot's digest, as the Stage 0 report recorded it on
 * both platforms.
 *
 * Transcribed from `qualification/reports/stage-00-2026-09-05.md`, which is
 * itself harness-generated evidence rather than a plan. It is pinned here so
 * that a change to canonicalization which happens to be *consistent* across
 * platforms -- and would therefore satisfy a cross-platform comparison alone --
 * still fails this stage.
 */
export const STAGE_0_EMPTY_SNAPSHOT_DIGEST =
  'sha256:e8c450ac1ae5c1a2c33cb466346cfef6da3cb4f520b9675800f5aa85ee6febbe';

/** Commands row G1 requires each platform to have actually executed. */
export const REQUIRED_COMMANDS = ['ieos doctor', 'ieos init', 'build:index'] as const;

/**
 * The tests each behavioural row rests on, by the runner's full name.
 *
 * Full names rather than counts: "the mcp project passed" would stay true if
 * the conformance file were deleted and one trivial test left behind.
 */
export const REQUIRED_TESTS: Readonly<Record<string, readonly string[]>> = {
  G2: [
    'the four things the gate names are reported reports the index digest',
    'the four things the gate names are reported reports contract versions',
    'the four things the gate names are reported reports session kind',
    'the four things the gate names are reported reports ingest reachability',
  ],
  G3: [
    'MCP 2026-07-28 conformance smoke implements server/discover with the revision, capabilities and identity',
  ],
  G4: [
    'MCP 2026-07-28 conformance smoke the envelope is required, not merely tolerated rejects an unsupported protocol version with -32022 and the supported list',
    'MCP 2026-07-28 conformance smoke the envelope is required, not merely tolerated rejects a request that names no protocol version at all',
    'MCP 2026-07-28 conformance smoke the envelope is required, not merely tolerated rejects a malformed envelope with invalid params',
    'MCP 2026-07-28 conformance smoke per-request classification, where each request is its own serving unit re-reads the envelope on every request, accepting and rejecting each on its own',
  ],
  G5: [
    'MCP 2026-07-28 conformance smoke carries ttlMs and cacheScope on the cacheable results',
    'MCP 2026-07-28 conformance smoke lists exactly the Agent Contract, in a deterministic order, with its hints',
    'MCP 2026-07-28 conformance smoke answers tools/call for every tool in the contract',
    'observe refuses when there is no sink, rather than reporting a write that reached nothing',
  ],
  G6: ['MCP 2026-07-28 conformance smoke passes without the client ever calling server/discover'],
  G7: ['determinism (fitness F8) produces the same digest when built twice'],
};

export interface Stage1GateInput extends PlatformSet, FitnessInput {}

/** What every required platform said about one named test. */
function testVerdicts(
  input: Stage1GateInput,
  name: string,
): { platform: string; status: NamedTestStatus }[] {
  return usablePlatforms(input)
    .filter((platform) => input.requiredPlatforms.includes(platform.platform))
    .map((platform) => ({
      platform: platform.platform,
      status:
        platform.stage1?.namedTests.find((test) => test.name === name)?.status ??
        ('missing' as NamedTestStatus),
    }));
}

/**
 * A row backed by named tests.
 *
 * Passing requires every named test to have passed on every required platform.
 * A platform that did not run the test at all is `missing`, and `missing`
 * yields `unproven` rather than `fail`: not observing something is not the same
 * as observing it broken, and the report says which.
 */
function namedTestRow(input: Stage1GateInput, id: string, requirement: string): GateRow {
  const missing = missingPlatforms(input);
  if (missing.length > 0) {
    return row(id, requirement, 'unproven', `no usable record for ${missing.join(', ')}`);
  }

  const names = REQUIRED_TESTS[id] ?? [];
  if (names.length === 0) {
    return row(id, requirement, 'unproven', 'no test was named for this row');
  }

  const failed: string[] = [];
  const absent: string[] = [];
  for (const name of names) {
    for (const verdict of testVerdicts(input, name)) {
      if (verdict.status === 'failed') failed.push(`${verdict.platform}: ${name}`);
      else if (verdict.status !== 'passed') absent.push(`${verdict.platform}: ${name}`);
    }
  }

  if (failed.length > 0) {
    return row(id, requirement, 'fail', `failed — ${failed.join('; ')}`);
  }
  if (absent.length > 0) {
    return row(
      id,
      requirement,
      'unproven',
      `not observed — ${absent.join('; ')}. A named test the record does not mention ` +
        'has been renamed or removed; the row is not passing on a test nobody ran.',
    );
  }
  const platforms = usablePlatforms(input)
    .filter((platform) => input.requiredPlatforms.includes(platform.platform))
    .map((platform) => platform.platform);
  return row(
    id,
    requirement,
    'pass',
    `${String(names.length)} named test(s) passed on ${platforms.join(', ')}`,
  );
}

/** Row G1: the three commands the guide says must run from a source checkout. */
function commandsRow(input: Stage1GateInput): GateRow {
  const requirement = '`pnpm ieos` runs from a source checkout: doctor, init and build:index';
  const missing = missingPlatforms(input);
  if (missing.length > 0) {
    return row('G1', requirement, 'unproven', `no usable record for ${missing.join(', ')}`);
  }

  const problems: string[] = [];
  const observed: string[] = [];
  for (const platform of usablePlatforms(input).filter((p) =>
    input.requiredPlatforms.includes(p.platform),
  )) {
    for (const name of REQUIRED_COMMANDS) {
      const result = platform.stage1?.commands.find((command) => command.name === name);
      if (result === undefined) {
        problems.push(`${platform.platform}: ${name} was not run`);
      } else if (result.exitCode !== 0) {
        problems.push(`${platform.platform}: ${name} exited ${String(result.exitCode)}`);
      } else {
        observed.push(`${platform.platform}:${name}`);
      }
    }
  }

  if (problems.length > 0) {
    const status: RowStatus = problems.some((problem) => problem.includes('exited'))
      ? 'fail'
      : 'unproven';
    return row('G1', requirement, status, problems.join('; '));
  }
  return row('G1', requirement, 'pass', `exit 0 for ${observed.join(', ')}`);
}

/**
 * Row G7: the same tree, built twice, digests identical.
 *
 * Measured here as well as tested, because the test proves the builder is
 * deterministic in the builder's own process and this proves it on the machine
 * and filesystem the report is speaking about.
 */
function determinismRow(input: Stage1GateInput): GateRow {
  const requirement = 'the index build is deterministic: two builds of one tree agree (F8)';
  const missing = missingPlatforms(input);
  if (missing.length > 0) {
    return row('G7', requirement, 'unproven', `no usable record for ${missing.join(', ')}`);
  }

  const problems: string[] = [];
  const observed: string[] = [];
  for (const platform of usablePlatforms(input).filter((p) =>
    input.requiredPlatforms.includes(p.platform),
  )) {
    const digests = platform.stage1?.indexDigests ?? [];
    if (digests.length < 2) {
      problems.push(`${platform.platform}: fewer than two builds were recorded`);
      continue;
    }
    if (new Set(digests).size !== 1) {
      problems.push(`${platform.platform}: builds disagreed (${digests.join(' vs ')})`);
      continue;
    }
    observed.push(`${platform.platform}=${digests[0] ?? ''}`);
  }

  if (problems.length > 0) {
    const status: RowStatus = problems.some((problem) => problem.includes('disagreed'))
      ? 'fail'
      : 'unproven';
    return row('G7', requirement, status, problems.join('; '));
  }
  const tested = namedTestRow(input, 'G7', requirement);
  if (tested.status !== 'pass') {
    return row(
      'G7',
      requirement,
      tested.status,
      `two builds agreed (${observed.join(', ')}), but the determinism test did not: ${tested.evidence}`,
    );
  }
  return row(
    'G7',
    requirement,
    'pass',
    `two builds agreed on every platform: ${observed.join(', ')}`,
  );
}

/** Row G8: the bootstrap snapshot, across platforms and against Stage 0. */
function snapshotRow(input: Stage1GateInput): GateRow {
  const requirement =
    'the UNPROVEN bootstrap snapshot is identical across platforms and unchanged from Stage 0';
  const across = digestRow(
    input,
    'G8',
    requirement,
    (evidence: PlatformEvidence) => evidence.digests.emptySnapshot,
  );
  if (across.status !== 'pass') return across;

  const observed = usablePlatforms(input)
    .filter((platform) => input.requiredPlatforms.includes(platform.platform))
    .map((platform) => platform.digests.emptySnapshot);
  const drifted = observed.filter((digest) => digest !== STAGE_0_EMPTY_SNAPSHOT_DIGEST);
  if (drifted.length > 0) {
    return row(
      'G8',
      requirement,
      'fail',
      `consistent across platforms but changed since Stage 0: now ${drifted[0] ?? ''}, ` +
        `pinned ${STAGE_0_EMPTY_SNAPSHOT_DIGEST}`,
    );
  }
  return row('G8', requirement, 'pass', `${across.evidence}; unchanged from the Stage 0 report`);
}

export function evaluateStage1(input: Stage1GateInput): GateReport {
  const rows: GateRow[] = [
    commandsRow(input),
    namedTestRow(
      input,
      'G2',
      '`ieos doctor` reports index digest, contract versions, session kind and ingest reachability',
    ),
    namedTestRow(
      input,
      'G3',
      'MCP `server/discover` is implemented and returns versions, capabilities and identity',
    ),
    namedTestRow(
      input,
      'G4',
      'self-describing `_meta` is judged on every request; a version mismatch yields `-32022`',
    ),
    namedTestRow(
      input,
      'G5',
      '`tools/list` carries `ttlMs`; `tools/call` reaches all four tools, `observe` refusing explicitly',
    ),
    namedTestRow(input, 'G6', 'the smoke passes without the client ever calling `server/discover`'),
    determinismRow(input),
    snapshotRow(input),
    fitnessRow(
      input,
      'G9',
      'F1-F12 under the C-10 reading: enforceable rules green, dormant ones guarded',
    ),
  ];

  const verdict: GateReport['verdict'] =
    rows.length > 0 && rows.every((entry) => entry.status === 'pass') ? 'PASS' : 'NOT PASSED';
  const counts = { pass: 0, fail: 0, unproven: 0 };
  for (const entry of rows) counts[entry.status] += 1;

  return {
    stage: 1,
    rows,
    verdict,
    summary:
      `${String(counts.pass)} pass, ${String(counts.fail)} fail, ` +
      `${String(counts.unproven)} unproven`,
  };
}
