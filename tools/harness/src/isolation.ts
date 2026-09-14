/**
 * Evaluation isolation: the contract (ADR-0005).
 *
 * TD-16 proposed closing "evaluator isolation is a principle without a
 * mechanism" with "Stage 0 layout + harness setting_sources=[]". Research
 * finding R5 rejects that: Inspect's own sandboxing documentation separates
 * container network restrictions from host-side tools and graders, and a fresh
 * temporary directory constrains nothing about network egress, spawned
 * processes, or inherited environment variables.
 *
 * So Stage 0 does not claim isolation. It builds the shape that makes isolation
 * *falsifiable*, and proves the subset a directory-based sandbox genuinely can
 * prove.
 *
 * The central design choice: there is no boolean `isolated: true`. Every
 * boundary is `proven | violated | unproven`, so "we did not check" cannot be
 * recorded as "we checked and it passed". An unproven boundary is louder than a
 * violated one is quiet.
 */

export type BoundaryKind = 'filesystem' | 'environment' | 'process' | 'network';

export const BOUNDARY_KINDS: readonly BoundaryKind[] = [
  'filesystem',
  'environment',
  'process',
  'network',
];

export interface FilesystemPolicy {
  /** Absolute paths the trial may read and write. */
  readonly allowedRoots: readonly string[];
  /**
   * Absolute paths the trial must not reach, at all.
   *
   * `evaluator/` always belongs here: hidden conditions and expected outputs
   * reaching an agent workspace invalidate every trial that used them.
   */
  readonly deniedRoots: readonly string[];
  /**
   * Unix sockets deliberately exposed to the trial as IPC capabilities.
   *
   * A socket is not a network route, but it is still a new filesystem-visible
   * capability. Stage 3's Evidence Plane proxy therefore has to be named here
   * before it can appear in the namespace. A mount that exists without a matching
   * declaration is a filesystem violation, not an undocumented convenience.
   */
  readonly declaredUnixSockets?: readonly string[];
}

export interface EnvironmentPolicy {
  /**
   * The only variable names the trial may see.
   *
   * Deny by default. A policy of inheritance would fail open, and the values a
   * developer happens to have exported are exactly the ones that leak.
   */
  readonly allowedNames: readonly string[];
}

export interface ProcessPolicy {
  /** Executables the trial may spawn. Empty means none. */
  readonly allowedExecutables: readonly string[];
}

export interface NetworkPolicy {
  readonly mode: 'deny' | 'allowlist' | 'unrestricted';
  /** Hosts reachable under `allowlist`. Ignored otherwise. */
  readonly allowedHosts: readonly string[];
}

export interface IsolationPolicy {
  readonly filesystem: FilesystemPolicy;
  readonly environment: EnvironmentPolicy;
  readonly process: ProcessPolicy;
  readonly network: NetworkPolicy;
  /**
   * Boundaries this trial's result depends on.
   *
   * A trial that requires `network` but runs under a mechanism that cannot
   * enforce it is not qualification-eligible, and says so.
   */
  readonly requiredBoundaries: readonly BoundaryKind[];
}

/**
 * `unproven` is a first-class outcome, not an absence.
 *
 * The failure mode this guards against is a harness reporting success for a
 * check it never ran.
 */
export type BoundaryVerdict = 'proven' | 'violated' | 'unproven';

export interface BoundaryFinding {
  readonly boundary: BoundaryKind;
  readonly verdict: BoundaryVerdict;
  /** What was actually done to reach this verdict, or why nothing was. */
  readonly evidence: string;
}

export interface IsolationReport {
  readonly findings: readonly BoundaryFinding[];
  /**
   * False whenever any required boundary is `unproven` or `violated`.
   *
   * Derived, never set: `deriveQualificationEligibility` is the only way to
   * produce it, so a caller cannot assert eligibility it did not establish.
   */
  readonly qualificationEligible: boolean;
  readonly reasons: readonly string[];
}

export function findingFor(
  report: Pick<IsolationReport, 'findings'>,
  boundary: BoundaryKind,
): BoundaryFinding | undefined {
  return report.findings.find((finding) => finding.boundary === boundary);
}

/**
 * Compute eligibility from probe findings.
 *
 * A boundary the policy requires but nothing ever examined counts as
 * `unproven`, which is a failure. Silence never counts as isolation.
 *
 * Several probers may report on the same boundary, and they are aggregated
 * differently from two probes by the *same* prober (for which see
 * {@link strictestOf}). Across probers: a violation anywhere wins, otherwise one
 * prover is enough. That is not a softening. `unproven` is not a negative
 * result, it is the absence of one -- the directory sandbox's network finding
 * says "a temporary directory cannot constrain egress", which is a fact about
 * the prober. Letting it outrank a mechanism that built the boundary and then
 * watched a control destination be refused would discard the only real evidence
 * in favour of an admission of ignorance.
 *
 * The ordering stays fail-closed where it matters: nothing at all is
 * `unproven`, and anything `violated` stays violated however many other probers
 * were happy.
 */
export function deriveQualificationEligibility(
  policy: IsolationPolicy,
  findings: readonly BoundaryFinding[],
): { readonly eligible: boolean; readonly reasons: readonly string[] } {
  const reasons: string[] = [];

  for (const boundary of policy.requiredBoundaries) {
    const forBoundary = findings.filter((candidate) => candidate.boundary === boundary);
    if (forBoundary.length === 0) {
      reasons.push(
        `${boundary}: required by the policy but never probed, so it is unproven; ` +
          'a boundary that was not checked is not a boundary',
      );
      continue;
    }

    const violations = forBoundary.filter((finding) => finding.verdict === 'violated');
    if (violations.length > 0) {
      for (const violation of violations) {
        reasons.push(`${boundary}: violated -- ${violation.evidence}`);
      }
      continue;
    }

    if (!forBoundary.some((finding) => finding.verdict === 'proven')) {
      for (const finding of forBoundary) {
        reasons.push(`${boundary}: unproven -- ${finding.evidence}`);
      }
    }
  }

  return { eligible: reasons.length === 0, reasons };
}

/**
 * The stricter of two probes of the same trial, boundary by boundary.
 *
 * A boundary is `proven` only if it was proven both before the agent ran and
 * after. That is not belt and braces: the earlier harness probed once, before
 * the driver, and reported that verdict as the trial's isolation -- so a driver
 * could be handed a clean workspace, link its way out of it, and the outcome
 * would still read `filesystem: proven`. The probe was answering a question
 * about a moment that had passed.
 *
 * `violated` beats `unproven` beats `proven`, and the evidence carried is the
 * evidence for the verdict that won, so the report says which probe saw it.
 */
export function strictestOf(
  policy: IsolationPolicy,
  before: readonly BoundaryFinding[],
  after: readonly BoundaryFinding[],
): IsolationReport {
  const rank: Record<BoundaryVerdict, number> = { proven: 0, unproven: 1, violated: 2 };
  const findings: BoundaryFinding[] = [];

  for (const boundary of BOUNDARY_KINDS) {
    const first = before.find((finding) => finding.boundary === boundary);
    const second = after.find((finding) => finding.boundary === boundary);
    if (first === undefined && second === undefined) continue;
    if (first === undefined) {
      findings.push(second as BoundaryFinding);
      continue;
    }
    if (second === undefined) {
      findings.push(first);
      continue;
    }
    if (rank[second.verdict] > rank[first.verdict]) {
      findings.push({
        ...second,
        evidence: `after the trial ran: ${second.evidence}`,
      });
    } else if (rank[first.verdict] > rank[second.verdict]) {
      findings.push({ ...first, evidence: `before the trial ran: ${first.evidence}` });
    } else {
      findings.push({
        ...second,
        evidence:
          first.evidence === second.evidence
            ? `before and after the trial ran: ${second.evidence}`
            : `before: ${first.evidence}; after: ${second.evidence}`,
      });
    }
  }

  return buildIsolationReport(policy, findings);
}

export function buildIsolationReport(
  policy: IsolationPolicy,
  findings: readonly BoundaryFinding[],
): IsolationReport {
  const { eligible, reasons } = deriveQualificationEligibility(policy, findings);
  return { findings, qualificationEligible: eligible, reasons };
}

/**
 * The default policy for a Stage 3 trial.
 *
 * `network` and `process` are required, and the directory-based sandbox this
 * repository has today cannot prove either. That is the point: a trial run under
 * this policy today reports `qualificationEligible: false` with the reason, and
 * will report true only once a mechanism that can enforce them exists. Nothing
 * about that has to be remembered by a person.
 */
/**
 * The policy for a Stage 3 real-agent trial under the namespace mechanism.
 *
 * Two things differ from {@link defaultTrialPolicy}, and neither is a
 * convenience.
 *
 * `network` is `allowlist` rather than `deny` because the inference channel is
 * the agent: a trial with no egress is not an isolated real-agent trial, it is
 * no trial. The allowlist names that one destination, and the same rule that
 * proves the boundary drops package registries, code search and the rest of the
 * internet -- so a trial cannot fetch its own answer.
 *
 * `process` lists the executables the trial legitimately needs. The PID
 * namespace is what makes the boundary provable; the list is what makes a
 * surprise in the process tree legible as a surprise.
 *
 * A host-side ingest proxy, when present, is named as a declared unix socket.
 * That is an IPC grant under the filesystem boundary, not an extra network
 * destination: the network allowlist remains unchanged and is proved separately.
 */
export function namespaceTrialPolicy(options: {
  readonly workspaceRoot: string;
  readonly evaluatorRoot: string;
  readonly allowedHosts: readonly string[];
  readonly allowedExecutables?: readonly string[];
  readonly allowedEnvironment?: readonly string[];
  readonly declaredUnixSockets?: readonly string[];
}): IsolationPolicy {
  return {
    filesystem: {
      allowedRoots: [options.workspaceRoot],
      deniedRoots: [options.evaluatorRoot],
      declaredUnixSockets: options.declaredUnixSockets ?? [],
    },
    environment: {
      // HOME is granted deliberately: the agent's credential store lives there
      // and a trial that cannot authenticate cannot run. It is a grant, recorded
      // as one, not an oversight -- and the evaluator tree is absent inside the
      // namespace regardless of what HOME reaches.
      allowedNames: options.allowedEnvironment ?? ['PATH', 'HOME', 'TMPDIR', 'NODE_EXTRA_CA_CERTS'],
    },
    process: { allowedExecutables: options.allowedExecutables ?? [] },
    network: { mode: 'allowlist', allowedHosts: options.allowedHosts },
    requiredBoundaries: ['filesystem', 'environment', 'process', 'network'],
  };
}

export function defaultTrialPolicy(options: {
  readonly workspaceRoot: string;
  readonly evaluatorRoot: string;
}): IsolationPolicy {
  return {
    filesystem: {
      allowedRoots: [options.workspaceRoot],
      deniedRoots: [options.evaluatorRoot],
      declaredUnixSockets: [],
    },
    environment: { allowedNames: ['PATH', 'HOME', 'TMPDIR'] },
    process: { allowedExecutables: [] },
    network: { mode: 'deny', allowedHosts: [] },
    requiredBoundaries: ['filesystem', 'environment', 'process', 'network'],
  };
}
