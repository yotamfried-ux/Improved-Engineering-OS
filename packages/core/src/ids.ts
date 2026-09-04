/**
 * D19 identity, and the deterministic identifiers of D25, D24 and D32.
 *
 * Two kinds of identifier live here and must not be confused:
 *
 *   Minted (D19)        opaque ULID with a type prefix, e.g. `asset_01J9Z...`.
 *                       Immutable. Carries a timestamp and randomness, so it is
 *                       NOT reproducible -- which is the point: renames never
 *                       change an id.
 *
 *   Deterministic (D35) `<prefix>_<base32(sha256(JCS(inputs)))>`, e.g.
 *                       `evd_...`, `ctx_...`, `esv_...`. Fully reproducible from
 *                       its inputs, which is what makes replay and
 *                       cross-machine comparison possible.
 *
 * ULIDs use Crockford base32; deterministic ids use RFC 4648 base32
 * (`hashing.ts`). Different alphabets, implemented separately so neither can
 * drift into the other.
 *
 * The clock and the random source are injected. Nothing here reads `Date.now()`
 * or `crypto.getRandomValues()` on its own, so identifier minting is
 * deterministic under test -- see `ports/index.ts`.
 */

import { deterministicId } from './hashing.ts';
import { InvalidIdentifierError } from './errors.ts';
import type { Clock, RandomSource } from './ports/index.ts';

/** Crockford base32: no I, L, O or U, so ids resist transcription errors. */
const CROCKFORD_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

const ULID_TIME_LENGTH = 10;
const ULID_RANDOM_LENGTH = 16;
/** ULID timestamps are 48-bit; beyond this a ULID cannot be encoded. */
const ULID_MAX_TIME = 281_474_976_710_655;

/** Type prefixes for minted ULID identities (D19). */
export const MINTED_ID_PREFIXES = [
  'asset',
  'solset',
  'ctl',
  'proj',
  'work',
  'run',
  'evt',
  'obs',
  'inst',
  'svc',
  'emt',
  'ig',
] as const;
export type MintedIdPrefix = (typeof MINTED_ID_PREFIXES)[number];

/** Type prefixes for deterministic, content-derived identities (D35). */
export const DETERMINISTIC_ID_PREFIXES = ['evd', 'ctx', 'esv', 'sv'] as const;
export type DeterministicIdPrefix = (typeof DETERMINISTIC_ID_PREFIXES)[number];

/**
 * Encode a 48-bit millisecond timestamp as 10 Crockford base32 characters.
 */
function encodeUlidTime(timestampMs: number): string {
  if (!Number.isInteger(timestampMs) || timestampMs < 0 || timestampMs > ULID_MAX_TIME) {
    throw new InvalidIdentifierError(
      `ULID timestamp must be an integer in [0, ${ULID_MAX_TIME}], received ${String(timestampMs)}`,
    );
  }
  let remaining = timestampMs;
  let out = '';
  for (let i = 0; i < ULID_TIME_LENGTH; i += 1) {
    out = (CROCKFORD_ALPHABET[remaining % 32] as string) + out;
    remaining = Math.floor(remaining / 32);
  }
  return out;
}

/**
 * Encode 10 random bytes as 16 Crockford base32 characters.
 *
 * 80 bits is the ULID specification's randomness budget.
 */
function encodeUlidRandom(bytes: Uint8Array): string {
  if (bytes.length !== 10) {
    throw new InvalidIdentifierError(
      `ULID randomness must be exactly 10 bytes, received ${String(bytes.length)}`,
    );
  }
  let buffer = 0n;
  for (const byte of bytes) {
    buffer = (buffer << 8n) | BigInt(byte);
  }
  let out = '';
  for (let i = 0; i < ULID_RANDOM_LENGTH; i += 1) {
    out = (CROCKFORD_ALPHABET[Number(buffer & 31n)] as string) + out;
    buffer >>= 5n;
  }
  return out;
}

/** A bare 26-character ULID, without a type prefix. */
export function mintUlid(clock: Clock, random: RandomSource): string {
  return encodeUlidTime(clock.nowMs()) + encodeUlidRandom(random.bytes(10));
}

/**
 * Mint an opaque, immutable, prefixed identity (D19).
 *
 * `mintId('asset', clock, random)` -> `asset_01J9Z6Q0K3N6X4R8V2T7M5B1WQ`.
 */
export function mintId(prefix: MintedIdPrefix, clock: Clock, random: RandomSource): string {
  return `${prefix}_${mintUlid(clock, random)}`;
}

const ULID_PATTERN = new RegExp(`^[${CROCKFORD_ALPHABET}]{26}$`, 'u');

/** True when `value` is `<prefix>_<26 Crockford base32 characters>`. */
export function isMintedId(value: string, prefix?: MintedIdPrefix): boolean {
  const separator = value.indexOf('_');
  if (separator <= 0) return false;
  const actualPrefix = value.slice(0, separator);
  if (prefix !== undefined && actualPrefix !== prefix) return false;
  if (!(MINTED_ID_PREFIXES as readonly string[]).includes(actualPrefix)) return false;
  return ULID_PATTERN.test(value.slice(separator + 1));
}

const DETERMINISTIC_BODY_PATTERN = /^[A-Z2-7]{52}$/u;

/** True when `value` is `<prefix>_<base32 of a SHA-256 digest>`. */
export function isDeterministicId(value: string, prefix?: DeterministicIdPrefix): boolean {
  const separator = value.indexOf('_');
  if (separator <= 0) return false;
  const actualPrefix = value.slice(0, separator);
  if (prefix !== undefined && actualPrefix !== prefix) return false;
  if (!(DETERMINISTIC_ID_PREFIXES as readonly string[]).includes(actualPrefix)) return false;
  return DETERMINISTIC_BODY_PATTERN.test(value.slice(separator + 1));
}

// ---------------------------------------------------------------------------
// Deterministic identities
// ---------------------------------------------------------------------------

/** Inputs of `evidence_id` (D32, corrected to canonical form by C-03). */
export interface EvidenceIdInputs {
  readonly run_id: string;
  readonly deriver_id: string;
  readonly deriver_version: string;
  readonly input_snapshot_hash: string;
}

/**
 * `evd_` + base32(sha256(JCS({run_id, deriver_id, deriver_version, input_snapshot_hash}))).
 *
 * C-03 replaced the earlier pipe-concatenated form. Rerunning the same deriver
 * over the same input snapshot must yield this same id -- that is the D32 replay
 * property.
 */
export function evidenceId(inputs: EvidenceIdInputs): string {
  return deterministicId('evd', {
    deriver_id: inputs.deriver_id,
    deriver_version: inputs.deriver_version,
    input_snapshot_hash: inputs.input_snapshot_hash,
    run_id: inputs.run_id,
  });
}

/** Inputs of `context_snapshot_id` (D25, T-05, extended by P-03). */
export interface ContextSnapshotIdInputs {
  readonly repo_sha: string;
  readonly profile_status_digest: string;
  readonly change_scope: readonly string[];
  readonly capability_snapshot_hash: string;
  readonly index_digest: string;
  readonly ranking_mode: 'live_overlay' | 'recorded';
  readonly effective_score_view_id: string;
  readonly eos_release: string;
}

/**
 * `ctx_` + base32(sha256(JCS(inputs))).
 *
 * Stable across machines because every input is either a digest or a declared
 * enum -- no timestamps, no paths, no host state. That stability is what lets a
 * `resolve` be explained a month later.
 */
export function contextSnapshotId(inputs: ContextSnapshotIdInputs): string {
  return deterministicId('ctx', {
    capability_snapshot_hash: inputs.capability_snapshot_hash,
    change_scope: [...inputs.change_scope],
    effective_score_view_id: inputs.effective_score_view_id,
    eos_release: inputs.eos_release,
    index_digest: inputs.index_digest,
    profile_status_digest: inputs.profile_status_digest,
    ranking_mode: inputs.ranking_mode,
    repo_sha: inputs.repo_sha,
  });
}

/** One asset's contribution to an Effective Score View (D24, P-03). */
export interface ScoreViewAsset {
  readonly id: string;
  readonly effective_score: number;
  readonly evidence_count: number;
  readonly source: 'overlay' | 'snapshot';
}

/** Inputs of `effective_score_view_id` (D24, P-03). */
export interface EffectiveScoreViewIdInputs {
  readonly mode: 'live_overlay' | 'recorded';
  readonly parent_score_view_id: string | null;
  readonly scoring_policy_version: string;
  readonly evidence_watermark: string | null;
  readonly computed_at: string | null;
  readonly assets: readonly ScoreViewAsset[];
}

/**
 * `esv_` + base32(sha256(JCS(view))).
 *
 * The asset list is sorted by asset id before hashing so that two callers who
 * considered the same assets in a different order produce the same view id. The
 * order assets were considered in is not part of the decision's identity.
 */
export function effectiveScoreViewId(inputs: EffectiveScoreViewIdInputs): string {
  const assets = [...inputs.assets]
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map((asset) => ({
      effective_score: asset.effective_score,
      evidence_count: asset.evidence_count,
      id: asset.id,
      source: asset.source,
    }));

  return deterministicId('esv', {
    assets,
    computed_at: inputs.computed_at,
    evidence_watermark: inputs.evidence_watermark,
    mode: inputs.mode,
    parent_score_view_id: inputs.parent_score_view_id,
    scoring_policy_version: inputs.scoring_policy_version,
  });
}

/**
 * `content_hash` for an asset (D19): the D35 file-set digest over `body.md` plus
 * anything under `files/`.
 *
 * D19 is emphatic that this is an addressing key, not a merge rule: equal
 * `content_hash` with different recommendation-relevant metadata yields a
 * `related_to` relationship and a report entry, never a merge. Nothing in this
 * module merges anything.
 */
export { hashFileSet as contentHash } from './hashing.ts';
