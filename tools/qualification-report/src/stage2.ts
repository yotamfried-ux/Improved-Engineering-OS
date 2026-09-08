/**
 * Stage 2 exit-gate evaluation.
 *
 * Eleven rows: the guide's Stage 2 deliverables plus the three the exit gate
 * adds ("No Supabase key with authority on the client; coding never blocked by
 * ingest outage; `INCOMPLETE` runs visible in `ieos doctor --last-run`").
 *
 * Two things about how the rows get their answers.
 *
 * Almost every row rests on individually **named** tests, so renaming or
 * deleting one breaks the report rather than quietly emptying it. H1 is the
 * exception: the seeded corpus is measured from the committed tree, because
 * "13 assets with this mix" is a fact about the repository and no test asserts
 * the count.
 *
 * H5 is the other exception, and a more interesting one. The Evidence Plane
 * tests execute SQL against a real PostgreSQL, which CI provides on Linux and
 * not on Windows. Requiring both platforms would make the row permanently
 * unproven; ignoring the difference would let it pass over a platform that
 * never ran it. So H5 passes on ANY required platform and the evidence names
 * which one -- and a `failed` anywhere still fails it. SQL behaviour is not
 * platform-dependent in the way a filesystem is; asserting it on one engine and
 * saying which is the honest reading, not a relaxation.
 */

import type { NamedTestStatus } from './evidence.ts';
import type { FitnessInput, GateReport, GateRow, PlatformSet } from './gate.ts';
import { describeProblems, fitnessRow, missingPlatforms, row, usablePlatforms } from './gate.ts';

/** The guide's Stage 2 corpus requirement: 10-20 hand-selected assets. */
export const SEED_CORPUS = { min: 10, max: 20 } as const;

/**
 * The asset types the guide requires the seed to include.
 *
 * "Include at least one `lesson`, one `failed_solution`, two assets in the same
 * Solution Set, one `control_guidance`." Listed as data so the row can say
 * which one is missing rather than that something is.
 */
export const REQUIRED_ASSET_TYPES = ['lesson', 'failed_solution', 'control_guidance'] as const;

/**
 * The tests each row rests on, by the runner's full name.
 *
 * Full names rather than counts or project names: "the telemetry project
 * passed" would stay true if its suite were deleted and one trivial test left.
 */
export const STAGE_2_TESTS: Readonly<Record<string, readonly string[]>> = {
  H1: [
    'the committed knowledge tree leaves every Solution Set unresolved, because no importer picks a Champion',
    'what the importer refuses to do never chooses a Champion (D34, P-01)',
    'what the importer refuses to do imports assets as active and unproven, claiming no evidence (R-04)',
  ],
  H2: [
    'resolve ranks a real corpus now that the resolver exists',
    'resolve gives the same snapshot id for the same inputs, and a different one when the index moves',
    'Champion selection reads the release index and nothing else (F11) returns no Champion for an unresolved set, whatever its members score',
    'Champion selection reads the release index and nothing else (F11) reports an unresolved set as coverage rather than promoting a member',
  ],
  H3: [
    'the outbox is configured the way D26 requires, not the way SQLite defaults runs in WAL mode',
    'loading a registry refuses an empty allowlist rather than silently dropping everything',
    'the Stage 2 mandatory scenario: the container is killed after the last tool call ...or the run is INCOMPLETE — never silently complete',
    'the run state a lossy run must produce (D23) is INCOMPLETE when a flush failed even though the outbox later drained',
  ],
  H4: [
    'the D32 replay property reruns to the same evidence_id and the same payload apart from derived_at',
    'the D32 replay property changes the id when the consumed events change',
    'classification comes from the Run record, never from events (D36) ignores an origin_class an event tries to carry in its attributes',
    'the timeline keeps events that produced no evidence',
    'ieos investigate prints the raw timeline and the attribution derived from it',
  ],
  H5: [
    'the Evidence Plane run classification authority (D36) ignores an origin_class an event tries to carry, and does not store it',
    'the Evidence Plane run classification authority (D36) rejects late registration, so a run cannot be measured then labelled',
    'the Evidence Plane run classification authority (D36) cannot be written around: an unregistered run rejects a stronger class',
    'the Evidence Plane the credential boundary (D22) refuses a revoked token with its own distinct error',
    'the Evidence Plane the credential boundary (D22) does not expose the resolver as a callable oracle',
  ],
  H6: [
    'ieos auth enroll writes a 0600 credential and prints the statement, not the token',
    'ieos auth rotate replaces the token but keeps the installation identity',
    'ieos auth revoke removes the local credential and says the revocation is not done yet',
  ],
  H7: [
    'the exit-code rule (D23) never returns the blocking code, on any event, on any path',
    'attributes leaving the hook passes only allowlisted keys, and says what it dropped',
  ],
  H8: [
    'F9 -- no key-shaped secret values anywhere no privileged client is constructed outside supabase/functions',
    'F9 -- no key-shaped secret values anywhere finds no value matching secret shape 0',
    'the allowlist and exclusions are real files with reasons F9 has no allowlist entries -- a secret-shaped value has no legitimate home',
    'how a database refusal reaches the client never writes an upstream message into the response body',
  ],
  H9: [
    'a hostile or broken environment survives an ingest that throws rather than answering',
    'the run one session produces ends INCOMPLETE and keeps the events when the plane was unreachable',
    'a flush that fails turns a thrown transport error into an outcome, never an exception',
    'registering a run treats a thrown transport error as a refusal, not as a success',
  ],
  H10: [
    'the last runs doctor reports (D23, Stage 2 exit gate) makes an INCOMPLETE run visible',
    'a run that ended reads a corrupted state as INCOMPLETE rather than as measured',
  ],
};

/**
 * Rows provable on one platform, with the reason each is.
 *
 * Not a convenience list. Every entry has to answer "why is one platform
 * enough here, when Stage 0 and Stage 1 required both?", and the answer has to
 * be about the subject rather than about the inconvenience.
 */
const ANY_PLATFORM_ROWS: Readonly<Record<string, string>> = {
  H5:
    "this row's subject is the database, which CI provides on one platform; SQL behaviour is " +
    'not platform-dependent in the way a filesystem is, and a failure anywhere would still fail it',
  H8:
    "this row's subject is the repository's own source text, which is byte-identical on both " +
    'platforms; the scanner runs in the fitness job, and a failure anywhere would still fail it',
};

export interface Stage2GateInput extends PlatformSet, FitnessInput {}

function verdictsFor(
  input: Stage2GateInput,
  name: string,
): { platform: string; status: NamedTestStatus }[] {
  return usablePlatforms(input)
    .filter((platform) => input.requiredPlatforms.includes(platform.platform))
    .map((platform) => ({
      platform: platform.platform,
      status:
        platform.stage2?.namedTests.find((test) => test.name === name)?.status ??
        ('missing' as NamedTestStatus),
    }));
}

/**
 * A row backed by named tests.
 *
 * `all` requires every named test to pass on every required platform. `any`
 * requires each to pass somewhere and to have failed nowhere -- for a subject
 * that is not platform-dependent and whose runner exists on one platform only.
 * Neither mode lets `missing` become a pass: not observing something is not the
 * same as observing it work, and the report says which.
 */
function namedTestRow(input: Stage2GateInput, id: string, requirement: string): GateRow {
  const missing = missingPlatforms(input);
  if (missing.length > 0) {
    return row(id, requirement, 'unproven', `no usable record for ${describeProblems(input)}`);
  }
  const names = STAGE_2_TESTS[id] ?? [];
  if (names.length === 0) return row(id, requirement, 'unproven', 'no test was named for this row');

  const anyPlatformReason = ANY_PLATFORM_ROWS[id];
  const mode = anyPlatformReason === undefined ? 'all' : 'any';
  const failed: string[] = [];
  const absent: string[] = [];
  const provenOn = new Set<string>();

  for (const name of names) {
    const verdicts = verdictsFor(input, name);
    for (const verdict of verdicts) {
      if (verdict.status === 'failed') failed.push(`${verdict.platform}: ${name}`);
      else if (verdict.status === 'passed') provenOn.add(verdict.platform);
    }
    const passedSomewhere = verdicts.some((verdict) => verdict.status === 'passed');
    if (mode === 'any') {
      if (!passedSomewhere) absent.push(name);
    } else {
      for (const verdict of verdicts) {
        if (verdict.status !== 'passed' && verdict.status !== 'failed') {
          absent.push(`${verdict.platform}: ${name}`);
        }
      }
    }
  }

  // A failure anywhere fails the row, in both modes. "Proven somewhere" is a
  // reading of absence, never of a contradiction.
  if (failed.length > 0) return row(id, requirement, 'fail', `failed — ${failed.join('; ')}`);
  if (absent.length > 0) {
    return row(
      id,
      requirement,
      'unproven',
      `not observed — ${absent.join('; ')}. A named test the record does not mention has been ` +
        'renamed or removed; the row is not passing on a test nobody ran.',
    );
  }
  const where = [...provenOn].sort().join(', ');
  return row(
    id,
    requirement,
    'pass',
    mode === 'any'
      ? // "between them", precisely: in this mode each named test had to pass
        // somewhere, not every test on every platform, and saying "passed on
        // linux, win32" would read as the stronger claim.
        `${String(names.length)} named test(s) each passed on at least one required platform ` +
          `(${where} between them) — ${anyPlatformReason ?? ''}`
      : `${String(names.length)} named test(s) passed on ${where}`,
  );
}

/**
 * Row H1: the seeded corpus, measured rather than asserted.
 *
 * The guide fixes a size range and a required mix. Both are facts about the
 * repository at this commit, so they are counted from the committed tree; a
 * test could assert them, but then the report would be quoting a test that
 * quotes the tree, and the extra hop buys nothing.
 */
function seedRow(input: Stage2GateInput): GateRow {
  const requirement =
    '10-20 hand-selected assets through the C-04 bootstrap path, with the required mix';
  const missing = missingPlatforms(input);
  if (missing.length > 0) {
    return row('H1', requirement, 'unproven', `no usable record for ${describeProblems(input)}`);
  }

  const problems: string[] = [];
  const observed: string[] = [];
  for (const platform of usablePlatforms(input).filter((p) =>
    input.requiredPlatforms.includes(p.platform),
  )) {
    const knowledge = platform.stage2?.knowledge;
    if (knowledge === undefined) {
      problems.push(`${platform.platform}: no knowledge measurement was recorded`);
      continue;
    }
    if (knowledge.assetCount < SEED_CORPUS.min || knowledge.assetCount > SEED_CORPUS.max) {
      problems.push(
        `${platform.platform}: ${String(knowledge.assetCount)} assets, outside the ` +
          `${String(SEED_CORPUS.min)}-${String(SEED_CORPUS.max)} the guide fixes`,
      );
    }
    for (const type of REQUIRED_ASSET_TYPES) {
      if ((knowledge.byType[type] ?? 0) < 1) {
        problems.push(`${platform.platform}: no asset of type ${type}`);
      }
    }
    if (knowledge.setsWithAlternatives < 1) {
      problems.push(`${platform.platform}: no Solution Set holds two alternatives`);
    }
    if (knowledge.withProvenance < knowledge.assetCount) {
      problems.push(
        `${platform.platform}: ${String(knowledge.assetCount - knowledge.withProvenance)} ` +
          'asset(s) carry no provenance',
      );
    }
    observed.push(
      `${platform.platform}=${String(knowledge.assetCount)} assets ` +
        `(${Object.entries(knowledge.byType)
          .sort()
          .map(([type, count]) => `${type}:${String(count)}`)
          .join(', ')}), ${String(knowledge.solutionSetCount)} solution set(s), ` +
        `${String(knowledge.unresolvedSets)} unresolved`,
    );
  }

  if (problems.length > 0) return row('H1', requirement, 'fail', problems.join('; '));
  const tested = namedTestRow(input, 'H1', requirement);
  if (tested.status !== 'pass') {
    return row(
      'H1',
      requirement,
      tested.status,
      `the corpus measures correctly (${observed.join('; ')}) but ${tested.evidence}`,
    );
  }
  return row('H1', requirement, 'pass', observed.join('; '));
}

export function evaluateStage2(input: Stage2GateInput): GateReport {
  const rows: GateRow[] = [
    seedRow(input),
    namedTestRow(
      input,
      'H2',
      'resolver v1 ranks the real corpus; the Champion comes from the release index, ' +
        'including the unresolved path (D20.3, D34, P-01)',
    ),
    namedTestRow(
      input,
      'H3',
      'telemetry v1: envelope, allowlist sanitizer, WAL outbox and boundary flush (D23, D26)',
    ),
    namedTestRow(
      input,
      'H4',
      'evidence-derivation v0 replays deterministically and `ieos investigate` shows the raw ' +
        'timeline (T-03, D32)',
    ),
    namedTestRow(
      input,
      'H5',
      'the Evidence Plane enforces D36 classification authority and the D22 credential boundary',
    ),
    namedTestRow(input, 'H6', '`ieos auth enroll|rotate|revoke` mint, replace and revoke (D22.1)'),
    namedTestRow(
      input,
      'H7',
      'the primary agent’s hooks never return the blocking exit code and emit only ' +
        'allowlisted attributes (Q-09, D23)',
    ),
    namedTestRow(
      input,
      'H8',
      'exit gate: no Supabase key with authority on the client, and no upstream text in a response',
    ),
    namedTestRow(input, 'H9', 'exit gate: coding is never blocked by an ingest outage'),
    namedTestRow(input, 'H10', 'exit gate: INCOMPLETE runs are visible in `ieos doctor`'),
    fitnessRow(
      input,
      'H11',
      'F1-F12 under the C-10 reading: enforceable rules green, dormant ones guarded',
    ),
  ];

  const verdict: GateReport['verdict'] =
    rows.length > 0 && rows.every((entry) => entry.status === 'pass') ? 'PASS' : 'NOT PASSED';
  const counts = { pass: 0, fail: 0, unproven: 0 };
  for (const entry of rows) counts[entry.status] += 1;

  return {
    stage: 2,
    rows,
    verdict,
    summary:
      `${String(counts.pass)} pass, ${String(counts.fail)} fail, ` +
      `${String(counts.unproven)} unproven`,
  };
}
