/**
 * Deterministic ranking (D20.3), as a pure function.
 *
 * The pipeline the guide fixes:
 *
 *   capability/problem match → FTS5 BM25 → Project Fit → Champion per
 *   Solution Set → Asset Score tie-break
 *
 * Nothing here touches a database, a clock or a network. Everything it ranks
 * is handed to it, which is what lets the ordering be tested exhaustively
 * without arranging a SQLite file into each shape first -- the separation the
 * `KnowledgeIndex` port documentation asks for in so many words.
 *
 * **The load-bearing structural choice is `championsOf`.** Fitness rule F11
 * says Champion selection reads only the release index, never the live score
 * overlay, and that no path substitutes a highest-scoring member for a null
 * `champion_id`. That is not enforced here by being careful. It is enforced by
 * `championsOf` taking solution sets and *nothing else*: the scores are not a
 * parameter, so no amount of later editing inside it can consult them without
 * changing its signature, which the tests and the reviewer would both see.
 */

import { championOf } from '@ieos/core';
import type { AssetRecord, ResolveItem, ScoreSnapshot, SolutionSetRecord } from '@ieos/core';

/** One asset the index matched, with the index's own relevance number. */
export interface RankCandidate {
  readonly asset: AssetRecord;
  /**
   * SQLite FTS5 `rank`: **more negative is more relevant**. Carried through
   * unchanged from the port and never treated as a score (D24 scores come from
   * the Effective Score View; conflating the two is how a retrieval detail
   * quietly becomes evidence).
   */
  readonly rank: number;
}

/**
 * How an asset's declared applicability compares with what is known about the
 * project.
 *
 * Three outcomes, not two. `unknown` exists because the Project Profile
 * contract is designed at Stage 6: until then most facts are simply not
 * observed, and treating "not observed" as "does not apply" would hide almost
 * all knowledge, while treating it as "applies" would claim a fit nobody
 * established.
 */
export type FitVerdict = 'fits' | 'unknown' | 'contradicted';

export interface ProjectFit {
  readonly verdict: FitVerdict;
  /** Fraction of declared conditions confirmed against a known fact, 0..1. */
  readonly confirmed: number;
}

/**
 * Evaluate `applicability.conditions` against the facts known about a project.
 *
 * An asset that declares no conditions fits everything: there is nothing that
 * could fail. A condition whose fact is known and whose value is not in the
 * allowed set contradicts the project, and that asset is dropped. A condition
 * whose fact is not known yet is neither.
 */
export function projectFitOf(
  asset: AssetRecord,
  facts: Readonly<Record<string, string>>,
): ProjectFit {
  const conditions = asset.applicability.conditions;
  if (conditions.length === 0) return { verdict: 'fits', confirmed: 1 };

  let confirmed = 0;
  for (const condition of conditions) {
    const observed = facts[condition.fact];
    if (observed === undefined) continue;
    if (!condition.in.includes(observed)) return { verdict: 'contradicted', confirmed: 0 };
    confirmed += 1;
  }

  const fraction = confirmed / conditions.length;
  return { verdict: fraction === 1 ? 'fits' : 'unknown', confirmed: fraction };
}

/**
 * The Champion of each resolved Solution Set, by set id.
 *
 * Takes solution sets and nothing else. See the file header: this signature is
 * how F11 is enforced. `championOf` (core) returns null unless the set is
 * `pinned`, names a `champion_id`, and that id is one of its members.
 */
export function championsOf(sets: readonly SolutionSetRecord[]): Map<string, string> {
  const champions = new Map<string, string>();
  for (const set of sets) {
    const champion = championOf(set);
    if (champion !== null) champions.set(set.id, champion);
  }
  return champions;
}

export interface RankInputs {
  readonly candidates: readonly RankCandidate[];
  /** Every Solution Set in the index, so membership can be resolved. */
  readonly solutionSets: readonly SolutionSetRecord[];
  readonly scores: ScoreSnapshot;
  readonly projectFacts: Readonly<Record<string, string>>;
  /** Capabilities the request is about. Empty means "let retrieval decide". */
  readonly capabilities: readonly string[];
  readonly limit: number;
}

export interface CoverageEntry {
  readonly solution_set_id: string;
  readonly unresolved_solution_set: true;
  readonly member_count: number;
  readonly problem_id: string;
}

export interface RankResult {
  readonly items: readonly ResolveItem[];
  readonly coverage: readonly CoverageEntry[];
  /** Matched, then not returned: cut by the limit or by a Champion rule. */
  readonly omitted_count: number;
}

/** Ordering: relevance, then Asset Score, then id. Total and stable. */
function compareCandidates(
  a: { rank: number; score: number; id: string },
  b: { rank: number; score: number; id: string },
): number {
  // FTS5 rank is more negative for better matches, so ascending is best-first.
  if (a.rank !== b.rank) return a.rank - b.rank;
  // Asset Score breaks relevance ties (D20.3), higher first.
  if (a.score !== b.score) return b.score - a.score;
  // An id tie-break makes the order total: two assets that are equal on every
  // ranked dimension must still come out in the same order on every machine,
  // or `context_snapshot_id` stops being reproducible.
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export function rank(inputs: RankInputs): RankResult {
  const setsById = new Map(inputs.solutionSets.map((set) => [set.id, set]));
  const champions = championsOf(inputs.solutionSets);
  const scoreOf = new Map(inputs.scores.assets.map((entry) => [entry.id, entry]));

  let omitted = 0;

  // --- 1. capability / problem match ---------------------------------------
  const wanted = new Set(inputs.capabilities);
  const matched =
    wanted.size === 0
      ? [...inputs.candidates]
      : inputs.candidates.filter((candidate) => {
          const declared = candidate.asset.problem.capabilities;
          const hit = declared.some((capability) => wanted.has(capability));
          if (!hit) omitted += 1;
          return hit;
        });

  // --- 2 & 3. Project Fit ---------------------------------------------------
  const fitted: { candidate: RankCandidate; fit: ProjectFit }[] = [];
  for (const candidate of matched) {
    const fit = projectFitOf(candidate.asset, inputs.projectFacts);
    if (fit.verdict === 'contradicted') {
      omitted += 1;
      continue;
    }
    fitted.push({ candidate, fit });
  }

  // --- 4. Champion per Solution Set ----------------------------------------
  //
  // Q-05, structurally: at most one item per resolved set reaches `items`, and
  // an unresolved set contributes a coverage entry instead of a temporary
  // winner (P-01). A member of an unresolved set is never promoted here --
  // that is the substitution F11 forbids.
  const coverage = new Map<string, CoverageEntry>();
  const kept: { candidate: RankCandidate; fit: ProjectFit; championOfSet: string | null }[] = [];

  for (const entry of fitted) {
    const setId = entry.candidate.asset.solution_set_id;
    if (setId === null) {
      kept.push({ ...entry, championOfSet: null });
      continue;
    }
    const set = setsById.get(setId);
    if (set === undefined) {
      // The asset names a set the index does not hold. That is a broken index,
      // not a ranking decision, so the asset is carried as an ordinary result
      // rather than silently dropped or silently promoted.
      kept.push({ ...entry, championOfSet: null });
      continue;
    }
    const champion = champions.get(setId);
    if (champion === undefined) {
      coverage.set(setId, {
        solution_set_id: setId,
        unresolved_solution_set: true,
        member_count: set.members.length,
        problem_id: set.problem_id,
      });
      omitted += 1;
      continue;
    }
    if (champion !== entry.candidate.asset.id) {
      // A challenger. Its detail belongs to `inspect`, never to `resolve`.
      omitted += 1;
      continue;
    }
    kept.push({ ...entry, championOfSet: setId });
  }

  // --- 5. Asset Score tie-break and the limit -------------------------------
  const ordered = kept
    .map((entry) => {
      const scored = scoreOf.get(entry.candidate.asset.id);
      return {
        ...entry,
        score: scored?.score ?? 0,
        evidence_count: scored?.evidence_count ?? 0,
      };
    })
    .sort((a, b) =>
      compareCandidates(
        { rank: a.candidate.rank, score: a.score, id: a.candidate.asset.id },
        { rank: b.candidate.rank, score: b.score, id: b.candidate.asset.id },
      ),
    );

  const returned = ordered.slice(0, Math.max(0, inputs.limit));
  omitted += ordered.length - returned.length;

  const items: ResolveItem[] = returned.map((entry) => ({
    id: entry.candidate.asset.id,
    type: entry.candidate.asset.type,
    title: entry.candidate.asset.title,
    summary: entry.candidate.asset.summary,
    project_fit: entry.fit.confirmed,
    ...(entry.championOfSet === null
      ? {}
      : // `pinned` only. `pinned_challenged` is derived from the score view's
        // challenge_states, which the bootstrap snapshot does not carry, and
        // claiming a challenge nobody recorded would be an invention.
        { champion_of: entry.championOfSet, champion_status: 'pinned' as const }),
    score: entry.score,
    score_source: 'snapshot' as const,
    evidence_count: entry.evidence_count,
  }));

  return {
    items,
    coverage: [...coverage.values()].sort((a, b) =>
      a.solution_set_id < b.solution_set_id ? -1 : 1,
    ),
    omitted_count: omitted,
  };
}
