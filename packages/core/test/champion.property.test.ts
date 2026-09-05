/**
 * Stage 0 exit gate, row G3: "a property test proves that a Solution Set with
 * `champion_id: null` never yields a Champion in any resolver path."
 *
 * A property test rather than examples, because the claim is universal. Examples
 * would show that the cases someone thought of behave; the claim is about the
 * ones nobody thought of.
 *
 * `championOf` is the single function any resolver path may use to obtain a
 * Champion, so "in any resolver path" reduces to "in this function". That is
 * enforced structurally: no resolver exists yet (fitness F11 is dormant and
 * guarded), and when one arrives it meets this invariant already standing.
 *
 * The arbitraries deliberately generate records the schema would REJECT --
 * unresolved sets carrying a champion, champions outside the member list,
 * wrong-typed fields. Restricting the property to valid input would prove only
 * that validation works, which is a different claim and a weaker one.
 */

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { championOf, hasChampion, solutionSetSchema } from '../src/index.ts';

/** Recorded so the qualification report can state how many cases actually ran. */
export const CHAMPION_PROPERTY_RUNS = 2000;

const anId = fc.string({ minLength: 1, maxLength: 12 });

/**
 * Arbitrary Solution-Set-shaped records, valid and invalid alike.
 *
 * `champion_id` is drawn from the generated members often enough that valid
 * pinned sets really occur. Generating the two independently looked fine and
 * was not: random strings almost never collide, so `championOf` returned null
 * every time and three of the properties below held vacuously. The vacuity
 * control at the bottom of this file is what caught it.
 */
const anySetShape = fc.array(anId, { maxLength: 6 }).chain((members) =>
  fc.record({
    canonical_state: fc.oneof(
      fc.constant('unresolved'),
      fc.constant('pinned'),
      fc.constant('pinned'),
      fc.constant(''),
      fc.constant(null),
      fc.constant(undefined),
      fc.string(),
    ),
    champion_id: fc.oneof(
      // A real member: the case that must be able to yield a Champion.
      members.length > 0 ? fc.constantFrom(...members) : fc.constant(null),
      fc.constant(null),
      anId,
      fc.constant(''),
      fc.integer(),
    ),
    members: fc.oneof(
      fc.constant(members),
      fc.constant(members),
      fc.constant(null),
      fc.constant('not a list'),
    ),
  }),
);

describe('champion_id: null never yields a Champion (gate row G3)', () => {
  it('never returns a Champion when champion_id is null, whatever else is true', () => {
    fc.assert(
      fc.property(anySetShape, (set) => {
        if (set.champion_id !== null) return true;
        return championOf(set) === null && !hasChampion(set);
      }),
      { numRuns: CHAMPION_PROPERTY_RUNS },
    );
  });

  it('never returns a Champion for an unresolved set, even one carrying a champion_id', () => {
    // The record the schema forbids. If it ever reached a resolver anyway --
    // hand-edited YAML, a bad migration -- it must still yield nothing.
    fc.assert(
      fc.property(anySetShape, (set) => {
        if (set.canonical_state !== 'unresolved') return true;
        return championOf(set) === null;
      }),
      { numRuns: CHAMPION_PROPERTY_RUNS },
    );
  });

  it('never returns an id that is not a member of the set', () => {
    fc.assert(
      fc.property(anySetShape, (set) => {
        const champion = championOf(set);
        if (champion === null) return true;
        return Array.isArray(set.members) && set.members.includes(champion);
      }),
      { numRuns: CHAMPION_PROPERTY_RUNS },
    );
  });

  it('returns a Champion only for a pinned set, and then exactly champion_id', () => {
    fc.assert(
      fc.property(anySetShape, (set) => {
        const champion = championOf(set);
        if (champion === null) return true;
        return set.canonical_state === 'pinned' && champion === set.champion_id;
      }),
      { numRuns: CHAMPION_PROPERTY_RUNS },
    );
  });
});

describe('the property is not vacuous', () => {
  it('the generator actually produces both null and non-null champions', () => {
    // A property that only ever saw one shape would pass while proving nothing.
    let sawNullChampion = false;
    let sawPinnedWithChampion = false;
    fc.assert(
      fc.property(anySetShape, (set) => {
        if (set.champion_id === null) sawNullChampion = true;
        if (championOf(set) !== null) sawPinnedWithChampion = true;
        return true;
      }),
      { numRuns: CHAMPION_PROPERTY_RUNS },
    );
    expect(sawNullChampion, 'no null-champion case was generated').toBe(true);
    expect(sawPinnedWithChampion, 'no Champion was ever returned, so nothing was proven').toBe(
      true,
    );
  });

  it('a pinned set with a valid member does yield that Champion', () => {
    // The positive control: if championOf returned null unconditionally, every
    // property above would pass and mean nothing.
    expect(
      championOf({ canonical_state: 'pinned', champion_id: 'asset_a', members: ['asset_a'] }),
    ).toBe('asset_a');
  });
});

describe('the contract and the selector agree', () => {
  it('the schema rejects exactly the records the selector refuses to serve', () => {
    const unresolvedWithChampion = {
      schema_version: '1',
      stability: 'development',
      introduced_in: '0.1.0',
      deprecated_in: null,
      replacement: null,
      migration_path: null,
      id: 'set_a',
      problem_id: 'problem_a',
      compatibility_key: 'key',
      members: ['asset_a'],
      canonical_state: 'unresolved',
      champion_id: 'asset_a',
      champion_since_release: null,
      why_unresolved: 'no evidence yet',
    };
    expect(solutionSetSchema.safeParse(unresolvedWithChampion).success).toBe(false);
    expect(championOf(unresolvedWithChampion)).toBeNull();
  });
});
