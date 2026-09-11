/**
 * The declared enforcement status of each fitness rule must match reality.
 *
 * This is the test that stops "fitness green" from meaning less than it sounds.
 * Four of F1-F12 have no subject at Stage 0 -- there is no launcher, no release
 * resolution, no resolver, no simulation manifest. Reporting twelve green rules
 * would be exactly the false completeness the constitution forbids and that D17
 * names as a failure mode ("code complete counted as done").
 *
 * So each rule declares `enforced`, `partial` or `not-yet-enforceable`, and this
 * file checks the declaration against what is actually on disk.
 */

import { describe, expect, it } from 'vitest';
import { ENFORCED_RULES, FITNESS_RULES, summarize, type FitnessRule } from '../rules.ts';
import { exists, loadYaml } from './scan.ts';

const byId = new Map(FITNESS_RULES.map((rule) => [rule.id, rule]));
const rule = (id: string): FitnessRule => {
  const found = byId.get(id);
  if (found === undefined) throw new Error(`no fitness rule ${id}`);
  return found;
};

describe('the rule table is complete and coherent', () => {
  it('covers F1 through F12', () => {
    const ids = FITNESS_RULES.map((r) => r.id).sort();
    expect(ids).toEqual(
      ['F1a', 'F1b', 'F10', 'F11', 'F12', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9'].sort(),
    );
  });

  it('gives every rule that is not fully enforced a stated reason', () => {
    for (const r of FITNESS_RULES) {
      if (r.status !== 'enforced') {
        expect(r.note.length, `${r.id} must explain its status`).toBeGreaterThan(20);
      }
    }
  });

  it('gives every enforced rule at least one real mechanism', () => {
    for (const r of ENFORCED_RULES) {
      expect(r.mechanisms, `${r.id} claims enforcement`).not.toEqual(['none']);
      expect(r.mechanisms.length).toBeGreaterThan(0);
    }
  });

  it('gives every not-yet-enforceable rule no active mechanism to mislead with', () => {
    for (const r of FITNESS_RULES.filter((x) => x.status === 'not-yet-enforceable')) {
      // F11 is the exception worth stating: its contract-level half IS enforced,
      // which its note says, but the rule as written needs a resolver.
      if (r.id === 'F11') continue;
      expect(r.mechanisms).toEqual(['none']);
    }
  });
});

describe('declared status matches what is actually on disk', () => {
  it('F5 is not-yet-enforceable because packages/launcher does not exist', () => {
    expect(exists('packages/launcher')).toBe(false);
    expect(rule('F5').status).toBe('not-yet-enforceable');
  });

  it('F7 is partial: the prohibition is enforced, the resolution half has no subject', () => {
    // Armed at Stage 1. `packages/releases` exists, so the scan has runtime
    // code to inspect and does. What is still missing is the thing that
    // *resolves* a release -- the launcher, at Stage 4 -- which is where the
    // guide puts the unit test for the exact-version-plus-digest half.
    expect(exists('packages/releases')).toBe(true);
    expect(exists('packages/launcher')).toBe(false);
    expect(rule('F7').status).toBe('partial');
    expect(rule('F7').mechanisms).toContain('source-scan');
  });

  it('F11 is enforced now that packages/resolver exists', () => {
    // Stage 2 created the resolver, the dormancy guard fired on all four
    // assertions that assumed its absence, and the rule was armed rather than
    // left describing a world that had moved.
    expect(exists('packages/resolver')).toBe(true);
    expect(rule('F11').status).toBe('enforced');
    expect(rule('F11').dormantWhileAbsent).toEqual([]);
  });

  it('F10 is enforced now that simulations/ exists', () => {
    // Stage 3 created the directory, the dormancy guard fired, and the rule was
    // armed rather than have its excuse rewritten. The linter is what arms it:
    // the scheme regex in the contract cannot tell whether the referenced check
    // is still there, and a manifest pointing at a deleted check is ungraded
    // rather than stricter.
    expect(exists('simulations')).toBe(true);
    expect(rule('F10').status).toBe('enforced');
    expect(rule('F10').dormantWhileAbsent).toEqual([]);
  });

  it('F2 is enforced now that packages/adapters exists', () => {
    // The rule was written before its subject and waited for it. Stage 1
    // created the adapters, the dormancy guard fired, and the rule was armed
    // rather than have its excuse rewritten.
    expect(exists('packages/adapters')).toBe(true);
    expect(rule('F2').status).toBe('enforced');
    expect(rule('F2').mechanisms).toContain('source-scan');
    expect(rule('F2').dormantWhileAbsent).toEqual([]);
  });

  it('F4 is partial because ONE of its three subjects still does not exist', () => {
    // F4 constrains `resolver`, `assurance` and `evidence-derivation`. Stage 2
    // created the first and then the third, so the rule is enforced for both;
    // `assurance` is still absent, which is why it stays partial rather than
    // becoming enforced. The store side is what gives the rule a target -- it
    // was never what made the rule enforceable, and an earlier wording that
    // tied it there fired for the wrong reason.
    for (const armed of ['packages/resolver', 'packages/evidence-derivation']) {
      expect(exists(armed), `${armed} exists, so F4 is live for it`).toBe(true);
    }
    expect(
      exists('packages/assurance'),
      'packages/assurance exists, so F4 must be armed further',
    ).toBe(false);
    expect(rule('F4').status).toBe('partial');
    expect(rule('F4').dormantWhileAbsent).toEqual(['packages/assurance']);
  });

  it('F1a, F1b, F3, F6, F9 and F12 are enforced, and their subject exists', () => {
    expect(exists('packages/core/src')).toBe(true);
    expect(exists('packages/core/src/hashing.ts')).toBe(true);
    for (const id of ['F1a', 'F1b', 'F3', 'F6', 'F9', 'F12']) {
      expect(rule(id).status, `${id} claims to be enforced`).toBe('enforced');
    }
  });

  it('a rule cannot claim enforcement while its subject is missing', () => {
    // The inverse of the checks above, stated once as a general rule so a future
    // status change has to survive it.
    const subjects: Record<string, string> = {
      F5: 'packages/launcher',
      F7: 'packages/releases',
      F11: 'packages/resolver',
      F2: 'packages/adapters',
    };
    for (const [id, path] of Object.entries(subjects)) {
      if (!exists(path)) {
        expect(rule(id).status, `${id} has no subject at ${path}`).not.toBe('enforced');
      }
    }
  });
});

describe('the allowlist and exclusions are real files with reasons', () => {
  it('every allowlist entry states a reason', () => {
    const allowlist = loadYaml<Record<string, unknown>>('fitness/allowlist.yaml');
    const reasons: string[] = [];
    const walk = (node: unknown): void => {
      if (Array.isArray(node)) {
        for (const item of node) walk(item);
        return;
      }
      if (node !== null && typeof node === 'object') {
        const record = node as Record<string, unknown>;
        if (typeof record['reason'] === 'string') reasons.push(record['reason']);
        else if ('path' in record || 'name' in record) {
          throw new Error(`allowlist entry without a reason: ${JSON.stringify(record)}`);
        }
        for (const value of Object.values(record)) walk(value);
      }
    };
    walk(allowlist);
    expect(reasons.length).toBeGreaterThan(0);
    for (const reason of reasons) expect(reason.trim().length).toBeGreaterThan(20);
  });

  it('F9 has no allowlist entries -- a secret-shaped value has no legitimate home', () => {
    const allowlist = loadYaml<{ f9_secret_shaped_values: { paths: unknown[] } }>(
      'fitness/allowlist.yaml',
    );
    expect(allowlist.f9_secret_shaped_values.paths).toEqual([]);
  });

  it('every exclusion states a reason', () => {
    const exclusions =
      loadYaml<Record<string, { path: string; reason?: string }[]>>('fitness/exclusions.yaml');
    for (const [group, entries] of Object.entries(exclusions)) {
      for (const entry of entries) {
        expect(entry.reason, `${group}: ${entry.path} needs a reason`).toBeDefined();
        expect((entry.reason ?? '').trim().length).toBeGreaterThan(20);
      }
    }
  });
});

describe('the honest summary', () => {
  it('reports the split rather than a single green tick', () => {
    // Pinned deliberately, as a tripwire rather than a fact worth restating.
    // The mix only moves when a rule's enforceability genuinely changes, and
    // that should be a decision someone makes and records -- not something that
    // drifts because an assertion was written to accept whatever it found.
    //
    // Stage 0 closed at "6 enforced, 4 partial, 3 not yet enforceable".
    // Stage 1 moved two, each when its subject appeared and its dormancy guard
    // fired: F7 to partial (packages/releases), F2 to enforced
    // (packages/adapters). Stage 2 moved one more: F11 to enforced, when
    // packages/resolver appeared and gave Champion selection a code path to
    // constrain. Stage 3 moved F10 to enforced, when simulations/ appeared and
    // gave the manifest linter something to lint. F4 stays partial -- the
    // resolver exists, assurance and evidence-derivation do not. Each stage's own
    // documents still record the mix at that stage, correctly: they are history,
    // not a claim about now.
    expect(summarize()).toBe('10 enforced, 2 partial, 1 not yet enforceable');
  });

  it('does not claim all thirteen rule entries are green', () => {
    expect(ENFORCED_RULES.length).toBeLessThan(FITNESS_RULES.length);
  });
});
