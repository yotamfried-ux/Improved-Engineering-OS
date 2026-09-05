/**
 * Champion selection (D34, P-06, fitness rule F11).
 *
 * The one function a resolver path may use to obtain a Champion. It reads the
 * canonical Solution Set -- what a pinned release compiles into the release
 * index -- and nothing else. No score, no live overlay, no ranking: under
 * `ranking_mode: live_overlay` those may reorder a result list, but they never
 * decide who the Champion is (P-06).
 *
 * It exists at Stage 0, before any resolver does, so that the resolver arrives
 * to meet an existing invariant instead of negotiating with one.
 *
 * It is deliberately total and defensive. `solutionSetSchema` already makes an
 * unresolved set with a champion unrepresentable, but this function is the last
 * thing standing between a malformed record and a Champion, so it re-checks
 * rather than assuming it was handed validated input. The invariant then holds
 * for *any* input, which is what "never yields a Champion in any resolver path"
 * has to mean if it is to be worth stating.
 */

import type { SolutionSetRecord } from './contracts/solution-set.ts';

/** Anything shaped enough to ask the question of, validated or not. */
export interface ChampionCandidate {
  readonly canonical_state?: unknown;
  readonly champion_id?: unknown;
  readonly members?: unknown;
}

/**
 * The Champion of a Solution Set, or `null` when it has none.
 *
 * Returns `null` unless all three hold: the set is `pinned`, it names a
 * non-empty `champion_id`, and that id is one of its own `members`. A champion
 * outside the set would be a Champion nothing in the set can justify.
 */
export function championOf(set: ChampionCandidate | SolutionSetRecord): string | null {
  if (set.canonical_state !== 'pinned') return null;

  const champion = set.champion_id;
  if (typeof champion !== 'string' || champion.length === 0) return null;

  const members = set.members;
  if (!Array.isArray(members) || !members.includes(champion)) return null;

  return champion;
}

/** True when this set can yield a Champion at all. */
export function hasChampion(set: ChampionCandidate | SolutionSetRecord): boolean {
  return championOf(set) !== null;
}
