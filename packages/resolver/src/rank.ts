/** Deterministic ranking (D20.3), as a pure function. */

import { championOf } from '@ieos/core';
import type { AssetRecord, ResolveItem, ScoreSnapshot, SolutionSetRecord } from '@ieos/core';

export interface RankCandidate {
  readonly asset: AssetRecord;
  /** SQLite FTS5 rank: more negative is more relevant. */
  readonly rank: number;
}

export type FitVerdict = 'fits' | 'unknown' | 'contradicted';

export interface ProjectFit {
  readonly verdict: FitVerdict;
  readonly confirmed: number;
}

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
  readonly solutionSets: readonly SolutionSetRecord[];
  readonly scores: ScoreSnapshot;
  readonly projectFacts: Readonly<Record<string, string>>;
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
  readonly omitted_count: number;
}

function compareCandidates(
  a: { rank: number; score: number; id: string },
  b: { rank: number; score: number; id: string },
): number {
  if (a.rank !== b.rank) return a.rank - b.rank;
  if (a.score !== b.score) return b.score - a.score;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export function rank(inputs: RankInputs): RankResult {
  const setsById = new Map(inputs.solutionSets.map((set) => [set.id, set]));
  const champions = championsOf(inputs.solutionSets);
  const scoreOf = new Map(inputs.scores.assets.map((entry) => [entry.id, entry]));

  let omitted = 0;

  // A failed solution is evidence about what not to recommend. It remains in
  // the index for explicit `inspect`, but never enters normal resolve/expand
  // ranking, even if BM25 or a stale release Champion would otherwise put it first.
  const recommendable = inputs.candidates.filter((candidate) => {
    if (candidate.asset.type !== 'failed_solution') return true;
    omitted += 1;
    return false;
  });

  const wanted = new Set(inputs.capabilities);
  const matched =
    wanted.size === 0
      ? [...recommendable]
      : recommendable.filter((candidate) => {
          const hit = candidate.asset.problem.capabilities.some((capability) =>
            wanted.has(capability),
          );
          if (!hit) omitted += 1;
          return hit;
        });

  const fitted: { candidate: RankCandidate; fit: ProjectFit }[] = [];
  for (const candidate of matched) {
    const fit = projectFitOf(candidate.asset, inputs.projectFacts);
    if (fit.verdict === 'contradicted') {
      omitted += 1;
      continue;
    }
    fitted.push({ candidate, fit });
  }

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
      omitted += 1;
      continue;
    }
    kept.push({ ...entry, championOfSet: setId });
  }

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
      : { champion_of: entry.championOfSet, champion_status: 'pinned' as const }),
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
