/**
 * D32 derivation reproducibility: the replay rule, as executable code.
 *
 * D32 states the invariant precisely:
 *
 *   "Replay test: rerun the same deriver over the same snapshot -> identical
 *    `evidence_id` and identical payload after stripping `derived_at`."
 *
 * Two halves, and both matter. Comparing only the id would pass for a deriver
 * that changed its payload while keeping its inputs; comparing the whole record
 * verbatim would fail for the one field D32 says to ignore. So the comparison is
 * defined once, here, rather than being re-improvised per test.
 *
 * `derived_at` is excluded because it records when a derivation ran, which is
 * not part of what it derived. Nothing else is excluded: an exclusion list that
 * grows quietly is how a replay test stops proving reproducibility.
 */

import { canonicalizeJson, sha256Canonical, type JsonValue } from './hashing.ts';
import type { EvidenceRecord } from './contracts/evidence.ts';

/**
 * The only fields a replay comparison ignores.
 *
 * Exported so a test can assert the list has not grown. D32 names exactly one.
 */
export const REPLAY_EXCLUDED_FIELDS: readonly string[] = ['derivation.derived_at'];

/**
 * The comparable projection of an Evidence record: everything except the fields
 * D32 excludes.
 */
export function projectForReplay(evidence: EvidenceRecord): JsonValue {
  const { derivation, ...rest } = evidence;
  const { derived_at: _ignored, ...comparableDerivation } = derivation;
  return { ...rest, derivation: comparableDerivation } as unknown as JsonValue;
}

export interface ReplayDifference {
  readonly field: string;
  readonly first: string;
  readonly second: string;
}

export interface ReplayComparison {
  readonly identical: boolean;
  /** True when the two derivations agree on `evidence_id`. */
  readonly sameEvidenceId: boolean;
  /** True when the payloads agree once `derived_at` is stripped. */
  readonly samePayload: boolean;
  readonly differences: readonly ReplayDifference[];
}

/**
 * Compare two runs of the same deriver over the same input snapshot.
 *
 * `identical` requires both halves of the D32 invariant. The per-field
 * differences exist so a failing replay says what drifted rather than only that
 * something did.
 */
export function compareReplay(first: EvidenceRecord, second: EvidenceRecord): ReplayComparison {
  const sameEvidenceId = first.evidence_id === second.evidence_id;

  const firstPayload = projectForReplay(first);
  const secondPayload = projectForReplay(second);
  const samePayload = canonicalizeJson(firstPayload) === canonicalizeJson(secondPayload);

  const differences: ReplayDifference[] = [];
  if (!sameEvidenceId) {
    differences.push({
      field: 'evidence_id',
      first: first.evidence_id,
      second: second.evidence_id,
    });
  }
  if (!samePayload) {
    collectDifferences(firstPayload, secondPayload, '', differences);
  }

  return {
    identical: sameEvidenceId && samePayload,
    sameEvidenceId,
    samePayload,
    differences,
  };
}

function collectDifferences(
  first: JsonValue,
  second: JsonValue,
  path: string,
  into: ReplayDifference[],
): void {
  const bothRecords =
    first !== null &&
    second !== null &&
    typeof first === 'object' &&
    typeof second === 'object' &&
    !Array.isArray(first) &&
    !Array.isArray(second);

  if (bothRecords) {
    const keys = new Set([...Object.keys(first), ...Object.keys(second)]);
    for (const key of [...keys].sort()) {
      const child = path === '' ? key : `${path}.${key}`;
      collectDifferences(
        (first as Record<string, JsonValue>)[key] ?? null,
        (second as Record<string, JsonValue>)[key] ?? null,
        child,
        into,
      );
    }
    return;
  }

  const a = canonicalizeJson(first);
  const b = canonicalizeJson(second);
  if (a !== b) into.push({ field: path === '' ? '$' : path, first: a, second: b });
}

// ---------------------------------------------------------------------------
// Input snapshots
// ---------------------------------------------------------------------------

/**
 * The inputs a derivation consumed (D32).
 *
 * `sourceEventIds` is "the ordered set of source event ids"; `externalInputs`
 * covers the CI conclusions and review states D32 names alongside them.
 */
export interface DerivationInputs {
  readonly sourceEventIds: readonly string[];
  readonly externalInputs: readonly {
    readonly kind: string;
    readonly id: string;
    readonly value: string;
  }[];
}

/**
 * `input_snapshot_hash` over a derivation's inputs.
 *
 * Event ids are sorted, so two runs that consumed the same events in a
 * different order produce the same snapshot: the *set* consumed is the input,
 * not the order it happened to be read in. External inputs are sorted by
 * `(kind, id)` for the same reason.
 *
 * A duplicate event id is an error rather than being silently de-duplicated —
 * the same event counted twice is a different derivation from the same event
 * counted once, and quietly collapsing them would make an incorrect derivation
 * hash identically to a correct one.
 */
export function inputSnapshotHash(inputs: DerivationInputs): string {
  const seen = new Set<string>();
  for (const id of inputs.sourceEventIds) {
    if (seen.has(id)) {
      throw new Error(
        `duplicate source event id ${JSON.stringify(id)} in a derivation input snapshot; ` +
          'the same event consumed twice is not the same input as consuming it once',
      );
    }
    seen.add(id);
  }

  return sha256Canonical({
    external_inputs: [...inputs.externalInputs]
      .sort((a, b) => (a.kind === b.kind ? compare(a.id, b.id) : compare(a.kind, b.kind)))
      .map((input) => ({ id: input.id, kind: input.kind, value: input.value })),
    source_event_ids: [...inputs.sourceEventIds].sort(compare),
  });
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

// ---------------------------------------------------------------------------
// Supersession
// ---------------------------------------------------------------------------

export interface SupersessionCheck {
  readonly valid: boolean;
  readonly reasons: readonly string[];
}

/**
 * Validate that `next` legitimately supersedes `previous` (D32).
 *
 * D32's rule: late input produces a **new** derivation with a **new**
 * `input_snapshot_hash` that supersedes the previous one, and nothing is
 * deleted. So a supersession is only valid when the inputs actually changed —
 * otherwise it is a replay claiming to be a new finding, which is exactly how a
 * derivation could quietly overwrite itself.
 */
export function validateSupersession(
  previous: EvidenceRecord,
  next: EvidenceRecord,
): SupersessionCheck {
  const reasons: string[] = [];

  if (next.derivation.supersedes_derivation_id !== previous.evidence_id) {
    reasons.push(
      `next.derivation.supersedes_derivation_id must name the previous evidence_id ` +
        `${previous.evidence_id}, but names ${String(next.derivation.supersedes_derivation_id)}`,
    );
  }
  if (next.derivation.input_snapshot_hash === previous.derivation.input_snapshot_hash) {
    reasons.push(
      'a supersession requires a new input_snapshot_hash; identical inputs are a replay, ' +
        'not a new derivation (D32)',
    );
  }
  if (next.evidence_id === previous.evidence_id) {
    reasons.push(
      'a supersession must have a different evidence_id; an identical id would overwrite ' +
        'rather than supersede, and nothing is ever deleted (D32)',
    );
  }
  if (next.subject.type !== previous.subject.type || next.subject.id !== previous.subject.id) {
    reasons.push('a supersession must concern the same subject');
  }

  return { valid: reasons.length === 0, reasons };
}
