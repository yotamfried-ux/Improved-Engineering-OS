/**
 * The bootstrap `UNPROVEN` score snapshot -- CLI-facing re-export.
 *
 * The implementation moved to `packages/releases/src/scores-snapshot.ts` at
 * Stage 1, which is where the guide names it (`releases/scores-snapshot.ts`).
 * This module stays as the entry point the repo script and CI already use, and
 * re-exports rather than reimplementing, so `EMPTY_SNAPSHOT_DIGEST` is produced
 * by exactly one piece of code.
 *
 * That matters more than a tidy import path: this digest is the cross-platform
 * fixture the Stage 0 exit gate pinned and CI compares between Linux and
 * Windows. A second implementation of it, however faithful, would be a place for
 * the two to drift, and the drift would look like a canonicalization defect.
 */

export { EMPTY_SNAPSHOT_DIGEST, emitUnprovenSnapshot, type EmittedSnapshot } from '@ieos/releases';
