/**
 * The bootstrap `UNPROVEN` score snapshot (D24, Q-02).
 *
 * Q-02's point: in Stages 0-1 there is no Evidence Plane, so a snapshot cannot
 * be derived from evidence. Rather than shipping no snapshot -- which would make
 * `resolve` fail offline -- the source build emits one that says, in the data
 * itself, that nothing has been proven: every asset at the uniform prior,
 * `evidence_count: 0`, `computed_at: null`, `scoring_policy_version: "0"`.
 *
 * The Stage 0 exit gate requires this snapshot to hash identically across
 * platforms, which is why emission and digesting live together here and why the
 * serialization is byte-explicit rather than left to a formatter.
 *
 * This is not the Stage 1 `packages/releases` builder. It emits the bootstrap
 * snapshot and nothing else; the release builder will produce the derived
 * snapshot from the Evidence Plane at Stage 2.
 */

import { buildUnprovenSnapshot, sha256Canonical, type ScoreSnapshot } from '@ieos/core';

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
