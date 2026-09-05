/**
 * Session classification (D26, guide §5.3: `session_kind`).
 *
 * The guide requires each Run to be classified `local_persistent`,
 * `remote_ephemeral` or `ci`, "detected from environment markers and
 * overridable". Detection ultimately belongs to `packages/telemetry` at Stage 2;
 * what lives here is the part that must not: the classification itself.
 *
 * It is a pure function of markers passed in, so `packages/core` reads no
 * environment and the rule stays decidable in a test without setting variables
 * on the process. The caller looks the markers up; this decides what they mean.
 *
 * Getting this wrong is not cosmetic. `session_kind` is part of the telemetry
 * envelope's ordering key, and a CI run misreported as a developer's laptop
 * would put machine-generated evidence in the same bucket as hand-driven work.
 * So the order below is deliberate: CI is checked first, because a CI runner is
 * also ephemeral and also remote, and the most specific true answer wins.
 */

import type { SessionKind } from './contracts/telemetry.ts';

export interface SessionMarkers {
  /** `CI` and friends, as set by essentially every CI provider. */
  readonly ci: boolean;
  /**
   * The session runs in a container or sandbox that is discarded afterwards --
   * a cloud dev environment, an ephemeral agent container.
   */
  readonly ephemeral: boolean;
  /** An explicit override, when someone knows better than the markers. */
  readonly override?: SessionKind | undefined;
}

/**
 * Environment variable names that mark a CI run.
 *
 * Listed rather than sniffed, so adding one is a visible decision. `CI` alone
 * is the near-universal convention; the rest are here because they are set
 * even in configurations where `CI` is not.
 */
export const CI_MARKERS: readonly string[] = [
  'CI',
  'CONTINUOUS_INTEGRATION',
  'GITHUB_ACTIONS',
  'GITLAB_CI',
  'BUILDKITE',
  'CIRCLECI',
  'TF_BUILD',
];

/** Environment variable names that mark a discardable environment. */
export const EPHEMERAL_MARKERS: readonly string[] = [
  'CODESPACES',
  'GITPOD_WORKSPACE_ID',
  'DEVCONTAINER',
  'REMOTE_CONTAINERS',
];

/**
 * Classify a session.
 *
 * An override wins outright: the guide says the detection is overridable, and a
 * heuristic that could not be corrected would be a worse answer than no
 * heuristic, because it would be wrong silently.
 */
export function classifySessionKind(markers: SessionMarkers): SessionKind {
  if (markers.override !== undefined) return markers.override;
  // CI first: a CI runner is usually ephemeral and remote too, and reporting it
  // as `remote_ephemeral` would lose the one fact that distinguishes automated
  // evidence from a person's session.
  if (markers.ci) return 'ci';
  if (markers.ephemeral) return 'remote_ephemeral';
  return 'local_persistent';
}

/**
 * Read markers out of an environment map.
 *
 * Takes the map as an argument rather than reaching for `process.env`, so this
 * stays pure and `packages/core` keeps its no-I/O guarantee (F1b's behavioural
 * half). A marker set to the empty string counts as absent, because that is how
 * a shell unsets a variable it still exports.
 */
export function readSessionMarkers(
  env: Readonly<Record<string, string | undefined>>,
  override?: SessionKind,
): SessionMarkers {
  const present = (name: string): boolean => {
    const value = env[name];
    return value !== undefined && value !== '' && value !== '0' && value !== 'false';
  };
  return {
    ci: CI_MARKERS.some(present),
    ephemeral: EPHEMERAL_MARKERS.some(present),
    override,
  };
}
