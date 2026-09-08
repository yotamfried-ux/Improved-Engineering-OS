/**
 * Fitness rules F1-F12 (guide Stage 0 table, ADR-0004).
 *
 * Each rule declares an enforcement status, and `checks/status.test.ts` asserts
 * the declaration matches reality. That matters more than it looks: reporting
 * "F1-F12 green" when four rules have no subject yet would be exactly the false
 * completeness the constitution forbids and D17 names as a failure mode.
 *
 *   enforced             implemented, running against a real subject
 *   partial              implemented, but its subject is incomplete at this stage
 *   not-yet-enforceable  its subject does not exist yet
 */

export type FitnessStatus = 'enforced' | 'partial' | 'not-yet-enforceable';

export type FitnessMechanism = 'dependency-graph' | 'source-scan' | 'behavioural' | 'none';

export interface FitnessRule {
  readonly id: string;
  readonly invariant: string;
  readonly status: FitnessStatus;
  readonly mechanisms: readonly FitnessMechanism[];
  /** Why the status is what it is. Required for anything not fully enforced. */
  readonly note: string;
  /**
   * Repository paths whose **absence** is the reason this rule is not fully
   * enforced. Empty for an enforced rule.
   *
   * This is what stops a dormant rule from staying dormant after its reason has
   * gone. `checks/dormancy.test.ts` asserts every path here is genuinely
   * missing, so the commit that creates one of these directories fails the
   * suite until the rule is armed against it. Dormancy is therefore conditional
   * on absence rather than on someone remembering.
   *
   * Owner decision, 2026-09-05 (deviation C-10): this is the mechanism that
   * makes "F1-F12 green" a meetable Stage 0 gate without either deleting rules
   * or letting them pass over nothing.
   */
  readonly dormantWhileAbsent: readonly string[];
}

export const FITNESS_RULES: readonly FitnessRule[] = [
  {
    id: 'F1a',
    invariant: 'packages/core imports no other workspace package',
    status: 'enforced',
    mechanisms: ['dependency-graph'],
    note: 'Split from F1 by ADR-0004 (deviation C-1).',
    dormantWhileAbsent: [],
  },
  {
    id: 'F1b',
    invariant:
      'packages/core contains no vendor or agent identifier, and imports only allowlisted ' +
      'third-party packages',
    status: 'enforced',
    mechanisms: ['source-scan', 'behavioural'],
    note:
      'Split from F1 by ADR-0004: the literal wording cannot hold alongside D18.5, which ' +
      'requires Zod inside core. Owner-APPROVED on 2026-09-04 as deviation C-1; the allowlist ' +
      'holds exactly one entry, zod. Approval does not make F1 as originally worded satisfied, ' +
      'so C-1 stays recorded as a deviation.',
    dormantWhileAbsent: [],
  },
  {
    id: 'F2',
    invariant: 'adapters never own knowledge semantics',
    status: 'enforced',
    mechanisms: ['dependency-graph', 'source-scan'],
    note:
      'Armed at Stage 1, by the commit that created packages/adapters -- which is what the rule ' +
      'was waiting for. Both halves are now checked against a real subject: dependency-cruiser ' +
      'forbids importing knowledge/ or reaching past the composition set the guide fixes (core, ' +
      'resolver, telemetry, assurance, store-*), and a source scan catches what a module graph ' +
      'cannot see -- an adapter that opens the knowledge tree as files imports nothing at all -- ' +
      'plus any adapter that defines ranking rather than passing through a score the score view ' +
      'produced. Controls prove both scans fire, and that they do not fire on an adapter merely ' +
      'reporting a score. The composition set is enforced in two rules rather than one: ' +
      'evidence-derivation is barred from every adapter EXCEPT packages/adapters/cli, which the ' +
      "guide's own Stage 2 deliverable requires to derive attribution locally (deviation C-11).",
    dormantWhileAbsent: [],
  },
  {
    id: 'F3',
    invariant: 'runtime code never mutates canonical knowledge, and no tool pushes a branch',
    status: 'enforced',
    mechanisms: ['source-scan', 'behavioural'],
    note:
      'Armed before knowledge/ exists, which is the point: the commit that creates it meets an ' +
      'existing rule instead of negotiating with one. The C-04 bootstrap path (owner opens the ' +
      'PR, the tool never pushes) is what the push/branch scan enforces.',
    dormantWhileAbsent: [],
  },
  {
    id: 'F4',
    invariant: 'resolver, assurance and evidence-derivation import no store-* package',
    status: 'partial',
    mechanisms: ['dependency-graph'],
    note:
      'Enforced for packages/resolver, packages/evidence-derivation and packages/telemetry, ' +
      'which exist from Stage 2 and talk to the KnowledgeIndex, Outbox and Ingest ports rather ' +
      "than to store-sqlite. telemetry is not in F4's literal wording; the guide's " +
      'dependency-direction table puts it in the same class (telemetry -> core), and covering ' +
      'it here is narrower than writing a thirteenth rule for one package. assurance does not ' +
      'exist yet, so the rule stays partial and its guard stays armed.',
    dormantWhileAbsent: ['packages/assurance'],
  },
  {
    id: 'F5',
    invariant: 'launcher imports only Node built-ins and has zero dependencies',
    status: 'not-yet-enforceable',
    mechanisms: ['none'],
    note: 'packages/launcher is Stage 4 (D18.2). Nothing to check.',
    dormantWhileAbsent: ['packages/launcher'],
  },
  {
    id: 'F6',
    invariant: 'no real target-project names or absolute project paths in runtime paths',
    status: 'enforced',
    mechanisms: ['source-scan'],
    note: 'Scoped per the guide; docs/, root Markdown and qualification/ are excluded.',
    dormantWhileAbsent: [],
  },
  {
    id: 'F7',
    invariant:
      'runtime never resolves "latest"; release resolution needs an exact version + digest',
    status: 'partial',
    mechanisms: ['source-scan'],
    note:
      'Armed at Stage 1, when packages/releases gave the rule a subject. The prohibition half is ' +
      'enforced now: a source scan over every runtime package rejects "latest", @latest, dist-tags ' +
      'and releases/latest, with controls proving it fires. The positive half -- release resolution ' +
      'requiring an exact version + digest -- has nothing to check until the launcher performs that ' +
      'resolution at Stage 4, which is where the guide itself puts the test. The dependency half of ' +
      'the same idea is enforced by the exact-pin check in checks/dependencies.test.ts.',
    dormantWhileAbsent: ['packages/launcher'],
  },
  {
    id: 'F8',
    invariant: 'deterministic builds: the same inputs produce the same digests',
    status: 'enforced',
    mechanisms: ['behavioural'],
    note:
      'Proven for canonical hashing, deterministic identities and schema emission since Stage 0, ' +
      'and from Stage 2 for the knowledge index over a real corpus: two builds of the seeded ' +
      'tree agree, on both platforms, and the digest covers every field written to the index ' +
      'rather than content_hash alone.',
    dormantWhileAbsent: [],
  },
  {
    id: 'F9',
    invariant: 'no key-shaped secret values anywhere',
    status: 'enforced',
    mechanisms: ['source-scan'],
    note: 'Scans for secret-shaped values, not for identifier words, which are legitimate in docs.',
    dormantWhileAbsent: [],
  },
  {
    id: 'F10',
    invariant: 'every Simulation Manifest references an evaluator entry outside simulations/',
    status: 'partial',
    mechanisms: ['source-scan', 'behavioural'],
    note:
      'No simulations/ directory exists yet, so there is nothing to lint. The contract-level half ' +
      'is enforced: simulationManifestSchema rejects a hidden_conditions_ref that is not under ' +
      'the evaluator-only:// scheme.',
    dormantWhileAbsent: ['simulations'],
  },
  {
    id: 'F11',
    invariant: 'Champion selection reads only the release index, never the live score overlay',
    status: 'enforced',
    mechanisms: ['behavioural', 'source-scan'],
    note:
      'Enforced structurally from Stage 2: packages/resolver selects Champions in ' +
      '`championsOf`, whose signature takes Solution Sets and nothing else, so no code ' +
      'path inside it can consult a score without changing its arity -- which a fitness ' +
      'check asserts. The contract half also still holds: challenge_state is ' +
      'unrepresentable in a canonical Solution Set, and a null champion_id cannot coexist ' +
      'with canonical_state "pinned".',
    dormantWhileAbsent: [],
  },
  {
    id: 'F12',
    invariant:
      'no canonical serialization or domain-identity hashing outside packages/core/src/hashing.ts',
    status: 'enforced',
    mechanisms: ['source-scan'],
    note:
      'The two exceptions C-02 permits -- raw artifact integrity in the launcher, credential ' +
      'hashing in the auth path -- do not exist yet and are pre-registered in allowlist.yaml as ' +
      'forbidden until their stage, so a stray createHash( call fails today.',
    dormantWhileAbsent: [],
  },
];

/** Rules that may be reported as passing. Anything else must be reported by status. */
export const ENFORCED_RULES = FITNESS_RULES.filter((rule) => rule.status === 'enforced');

export function summarize(): string {
  const byStatus = new Map<FitnessStatus, number>();
  for (const rule of FITNESS_RULES) {
    byStatus.set(rule.status, (byStatus.get(rule.status) ?? 0) + 1);
  }
  return (
    `${String(byStatus.get('enforced') ?? 0)} enforced, ` +
    `${String(byStatus.get('partial') ?? 0)} partial, ` +
    `${String(byStatus.get('not-yet-enforceable') ?? 0)} not yet enforceable`
  );
}
