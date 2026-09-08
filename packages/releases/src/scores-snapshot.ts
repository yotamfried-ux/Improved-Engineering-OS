/**
 * The bootstrap `UNPROVEN` score snapshot (D24, Q-02) -- the guide's
 * `releases/scores-snapshot.ts`, in bootstrap mode.
 *
 * Q-02's point: in Stages 0-1 there is no Evidence Plane, so a snapshot cannot
 * be derived from evidence. Rather than shipping no snapshot -- which would make
 * `resolve` fail offline -- the source build emits one that says, in the data
 * itself, that nothing has been proven: every asset at the uniform prior,
 * `evidence_count: 0`, `computed_at: null`, `scoring_policy_version: "0"`.
 *
 * This is bootstrap mode and only bootstrap mode. The derived snapshot, computed
 * from the Evidence Plane, arrives at Stage 2; nothing here may ever produce a
 * `DERIVED` state, and the contract makes that unrepresentable rather than
 * merely discouraged.
 *
 * The Stage 0 exit gate requires this snapshot to hash identically across
 * platforms, so emission and digesting live together and the serialization is
 * byte-explicit rather than left to a formatter. `tools/snapshot-emit` is the
 * CLI over this module and re-exports it, so the digest Stage 0 pinned and CI
 * compares is produced by exactly this code.
 */

import {
  buildUnprovenSnapshot,
  scoreSnapshotSchema,
  sha256Canonical,
  UNIFORM_PRIOR,
  type ScoreSnapshot,
} from '@ieos/core';

export interface EmittedSnapshot {
  readonly snapshot: ScoreSnapshot;
  /** Exactly the bytes written to disk. */
  readonly content: string;
  /** D35 digest over the snapshot's canonical form, not over the file bytes. */
  readonly digest: string;
}

/**
 * Build the bootstrap snapshot for a set of asset ids.
 *
 * Deterministic for a given set: `buildUnprovenSnapshot` sorts by id, and the
 * serialization below is fixed, so the same knowledge tree yields the same bytes
 * and the same digest on every platform.
 */
export function emitUnprovenSnapshot(assetIds: readonly string[]): EmittedSnapshot {
  const snapshot = buildUnprovenSnapshot(assetIds);
  return {
    snapshot,
    // Two-space JSON with a trailing LF. The file is committed and diffed in
    // a release, so its bytes are part of the artefact.
    content: `${JSON.stringify(snapshot, null, 2)}\n`,
    // The digest is over the canonical form (D35), never over the file bytes:
    // a formatting change must not look like a content change, and a content
    // change must not be hidden by formatting.
    digest: sha256Canonical(snapshot as unknown as Parameters<typeof sha256Canonical>[0]),
  };
}

/**
 * The digest of the empty bootstrap snapshot.
 *
 * Pinned as the cross-platform fixture the Stage 0 exit gate names: the same
 * value must come out on Linux and on Windows. It depends on no filesystem, no
 * clock and no locale, so any difference is a real defect in canonicalization
 * rather than an environment artefact.
 */
export const EMPTY_SNAPSHOT_DIGEST = emitUnprovenSnapshot([]).digest;

// ---------------------------------------------------------------------------
// From Stage 2: the Evidence Plane read (D24)
// ---------------------------------------------------------------------------

/**
 * The overlay `read_minimal('score_overlay')` returns.
 *
 * Typed loosely on purpose. It arrives from a server this build does not
 * control, and pretending otherwise here would move the validation boundary to
 * whoever called this instead of keeping it in the one place that checks.
 */
export interface ScoreOverlay {
  readonly state?: unknown;
  readonly scores?: unknown;
  readonly computed_at?: unknown;
  readonly scoring_policy_version?: unknown;
  readonly score_view_id?: unknown;
}

/** Where a snapshot's numbers came from. Recorded, never inferred. */
export type SnapshotSource = 'bootstrap' | 'evidence_plane';

export interface SnapshotBuild extends EmittedSnapshot {
  readonly source: SnapshotSource;
  /** Why the Evidence Plane was not used, when it was not. */
  readonly fallbackReason: string | null;
}

/**
 * Build the score snapshot the release ships (D24).
 *
 * From Stage 2 the build queries the Evidence Plane through `read.minimal` and
 * writes what it returns. Two properties matter more than the query:
 *
 *   **A failed read falls back to the bootstrap snapshot rather than failing
 *   the build.** D24's whole reason for a snapshot is that `resolve` must work
 *   offline; a build that could not run without the plane would have inverted
 *   that. The fallback is UNPROVEN, so nothing claims to be measured.
 *
 *   **The source is recorded either way.** A bootstrap snapshot and a derived
 *   one that happens to contain the same numbers are different facts, and at
 *   Stage 2 they contain exactly the same numbers -- the plane answers UNPROVEN
 *   because scoring is Stage 10. Without `source`, the day the plane starts
 *   returning real scores would be indistinguishable from the day before it,
 *   and a silent fallback would look like a working read forever.
 *
 * The Champion is deliberately absent from all of this. It is part of the
 * release index (D34, C-01), and a snapshot that carried one would let a live
 * score move a canonical answer that only a promotion may move.
 */
export async function buildScoreSnapshot(options: {
  readonly assetIds: readonly string[];
  /** Null when no Evidence Plane is configured for this build. */
  readonly readOverlay: (() => Promise<unknown>) | null;
}): Promise<SnapshotBuild> {
  const bootstrap = emitUnprovenSnapshot(options.assetIds);
  if (options.readOverlay === null) {
    return {
      ...bootstrap,
      source: 'bootstrap',
      fallbackReason: 'no Evidence Plane is configured for this build',
    };
  }

  let overlay: unknown;
  try {
    overlay = await options.readOverlay();
  } catch (error) {
    return {
      ...bootstrap,
      source: 'bootstrap',
      fallbackReason: `the Evidence Plane read failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    };
  }

  const derived = snapshotFromOverlay(overlay, options.assetIds);
  if (derived === null) {
    return {
      ...bootstrap,
      source: 'bootstrap',
      fallbackReason: 'the Evidence Plane returned an overlay this build could not read',
    };
  }
  return { ...derived, source: 'evidence_plane', fallbackReason: null };
}

/**
 * Turn an overlay into a snapshot, or null when it cannot be trusted.
 *
 * Assets the overlay does not mention keep the uniform prior with
 * `evidence_count: 0`. Dropping them would shrink the corpus `resolve` can see
 * because the scorer had nothing to say about them, which is the opposite of
 * what "no evidence yet" should mean.
 */
export function snapshotFromOverlay(
  overlay: unknown,
  assetIds: readonly string[],
): EmittedSnapshot | null {
  if (overlay === null || typeof overlay !== 'object') return null;
  const value = overlay as ScoreOverlay;
  const state = value.state;
  if (state !== 'UNPROVEN' && state !== 'DERIVED') return null;

  const byId = new Map<string, { score: number; evidence_count: number }>();
  if (Array.isArray(value.scores)) {
    for (const entry of value.scores) {
      if (entry === null || typeof entry !== 'object') continue;
      const row = entry as { id?: unknown; score?: unknown; evidence_count?: unknown };
      if (typeof row.id !== 'string') continue;
      const score = typeof row.score === 'number' ? row.score : UNIFORM_PRIOR;
      const count = typeof row.evidence_count === 'number' ? Math.trunc(row.evidence_count) : 0;
      // A score outside [0,1] is not a score. Refusing the whole overlay rather
      // than clamping: a clamp would silently accept a scorer that had gone
      // wrong, and the release would ship its output.
      if (!Number.isFinite(score) || score < 0 || score > 1 || count < 0) return null;
      byId.set(row.id, { score, evidence_count: count });
    }
  }

  const snapshot = scoreSnapshotSchema.parse({
    schema_version: '1',
    stability: 'development',
    introduced_in: '0.1.0',
    deprecated_in: null,
    replacement: null,
    migration_path: null,
    state,
    score_view_id: typeof value.score_view_id === 'string' ? value.score_view_id : null,
    scoring_policy_version:
      typeof value.scoring_policy_version === 'string' ? value.scoring_policy_version : '0',
    computed_at: typeof value.computed_at === 'string' ? value.computed_at : null,
    assets: [...assetIds]
      .sort()
      .map((id) => ({ id, ...(byId.get(id) ?? { score: UNIFORM_PRIOR, evidence_count: 0 }) })),
  }) as ScoreSnapshot;

  return {
    snapshot,
    content: `${JSON.stringify(snapshot, null, 2)}\n`,
    digest: sha256Canonical(snapshot as unknown as Parameters<typeof sha256Canonical>[0]),
  };
}
