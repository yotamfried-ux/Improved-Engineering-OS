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
 * A boundary the policy requires but the probe never examined counts as
 * `unproven`, which is a failure. Silence never counts as isolation.
 */
export function deriveQualificationEligibility(
  policy: IsolationPolicy,
  findings: readonly BoundaryFinding[],
): { readonly eligible: boolean; readonly reasons: readonly string[] } {
  const reasons: string[] = [];

  for (const boundary of policy.requiredBoundaries) {
    const finding = findings.find((candidate) => candidate.boundary === boundary);
    if (finding === undefined) {
      reasons.push(
        `${boundary}: required by the policy but never probed, so it is unproven; ` +
          'a boundary that was not checked is not a boundary',
      );
      continue;
    }
    if (finding.verdict === 'unproven') {
      reasons.push(`${boundary}: unproven -- ${finding.evidence}`);
      continue;
    }
    if (finding.verdict === 'violated') {
      reasons.push(`${boundary}: violated -- ${finding.evidence}`);
    }
  }

  return { eligible: reasons.length === 0, reasons };
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
export function defaultTrialPolicy(options: {
  readonly workspaceRoot: string;
  readonly evaluatorRoot: string;
}): IsolationPolicy {
  return {
    filesystem: {
      allowedRoots: [options.workspaceRoot],
      deniedRoots: [options.evaluatorRoot],
    },
    environment: { allowedNames: ['PATH', 'HOME', 'TMPDIR'] },
    process: { allowedExecutables: [] },
    network: { mode: 'deny', allowedHosts: [] },
    requiredBoundaries: ['filesystem', 'environment', 'process', 'network'],
  };
}
