/**
 * Dormancy guards (owner decision / deviation C-10, 2026-09-05).
 *
 * The Stage 0 exit gate says "F1-F12 green". Read literally that is
 * unsatisfiable here: seven of the thirteen rules name components
 * (`packages/launcher`, `packages/releases`, `packages/resolver`,
 * `simulations/`) that Stage 0 deliberately does not create. Only two things
 * could make it literally green -- deleting those rules, or letting them pass
 * over nothing -- and the second is the vacuous success this repository has
 * already hit once, when dependency-cruiser cruised one module and exited 0.
 *
 * The approved reading instead: every rule enforceable now is green, and every
 * rule whose subject belongs to a later stage is explicitly `partial` or
 * `not-yet-enforceable` **and carries a guard that arms itself**.
 *
 * That guard is this file. Each dormant rule declares the paths whose absence
 * is its excuse, and these tests assert those paths really are absent. The
 * commit that creates `packages/launcher` fails here until F5 is armed against
 * it. Dormancy cannot outlive its reason, and it cannot be extended by
 * forgetting.
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FITNESS_RULES } from '../rules.ts';
import { REPO_ROOT } from './scan.ts';

const dormant = FITNESS_RULES.filter((rule) => rule.status !== 'enforced');
const enforced = FITNESS_RULES.filter((rule) => rule.status === 'enforced');

describe('the guard set is not empty', () => {
  it('has dormant rules to guard, so these tests are not vacuous', () => {
    // If every rule became enforced, this file would otherwise pass by
    // inspecting nothing. That is the exact failure mode it exists to prevent,
    // so it is asserted rather than assumed.
    expect(dormant.length).toBeGreaterThan(0);
    expect(enforced.length).toBeGreaterThan(0);
    expect(dormant.length + enforced.length).toBe(FITNESS_RULES.length);
  });
});

describe('every dormant rule states what it is waiting for', () => {
  it.each(dormant.map((rule) => [rule.id, rule] as const))(
    '%s names at least one absent subject',
    (_id, rule) => {
      // "Not yet enforceable" with no stated subject is indistinguishable from
      // "we stopped bothering". The subject is what makes the claim checkable.
      expect(rule.dormantWhileAbsent.length).toBeGreaterThan(0);
      expect(rule.note.length).toBeGreaterThan(20);
    },
  );

  it.each(dormant.flatMap((rule) => rule.dormantWhileAbsent.map((path) => [rule.id, path])))(
    '%s is still dormant only because %s does not exist',
    (id, path) => {
      const absent = !existsSync(join(REPO_ROOT, path));
      expect(
        absent,
        `${path} now exists, so fitness rule ${id} is no longer dormant for the reason it ` +
          `claims. Arm ${id} against it and move its status off ` +
          `"${FITNESS_RULES.find((r) => r.id === id)?.status ?? '?'}", or correct ` +
          `dormantWhileAbsent if the subject moved. Do not delete this assertion: it is the ` +
          `only thing standing between a dormant rule and a silent vacuous pass.`,
      ).toBe(true);
    },
  );
});

describe('dormancy cannot be claimed by a rule that is already enforced', () => {
  it.each(enforced.map((rule) => [rule.id, rule] as const))(
    '%s declares no absent subject',
    (_id, rule) => {
      // Otherwise "enforced" could quietly come with an escape clause.
      expect(rule.dormantWhileAbsent).toEqual([]);
    },
  );
});

describe('the gate reading is the one the owner approved', () => {
  it('reports every rule by status rather than as a single green tick', () => {
    for (const rule of FITNESS_RULES) {
      expect(['enforced', 'partial', 'not-yet-enforceable']).toContain(rule.status);
    }
    // No fourth status, and in particular nothing that reads as "close enough".
    expect(new Set(FITNESS_RULES.map((r) => r.status)).size).toBeLessThanOrEqual(3);
  });

  it('records the interpretation in the decision log, not only in code', () => {
    const log = join(REPO_ROOT, 'docs/decisions/DECISION-LOG.md');
    expect(existsSync(log)).toBe(true);
  });
});
