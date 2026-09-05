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
    status: 'partial',
    mechanisms: ['dependency-graph'],
    note: 'No packages/adapters/ exists yet. The rule is armed for the commit that creates one.',
    dormantWhileAbsent: ['packages/adapters'],
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
    note: 'None of those packages exists yet. The rule is armed.',
    dormantWhileAbsent: ['packages/resolver', 'packages/assurance', 'packages/evidence-derivation'],
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
    status: 'not-yet-enforceable',
    mechanisms: ['none'],
    note:
      'Release resolution is Stage 4. The dependency half of the same idea is enforced today by ' +
      'the exact-pin check in checks/dependencies.test.ts.',
    dormantWhileAbsent: ['packages/releases'],
  },
  {
    id: 'F8',
    invariant: 'deterministic builds: the same inputs produce the same digests',
    status: 'partial',
    mechanisms: ['behavioural'],
    note:
      'Proven for canonical hashing, deterministic identities and schema emission. The knowledge ' +
      'index it ultimately covers is Stage 1.',
    dormantWhileAbsent: ['knowledge'],
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
    status: 'not-yet-enforceable',
    mechanisms: ['behavioural'],
    note:
      'No resolver exists. The contract-level half IS enforced today: challenge_state is ' +
      'unrepresentable in a canonical Solution Set, and a null champion_id cannot coexist with ' +
      'canonical_state "pinned". The code-path half needs a resolver, at Stage 2.',
    dormantWhileAbsent: ['packages/resolver'],
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
