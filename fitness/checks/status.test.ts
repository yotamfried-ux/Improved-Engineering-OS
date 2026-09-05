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

  it('F11 is not-yet-enforceable because no resolver exists', () => {
    expect(exists('packages/resolver')).toBe(false);
    expect(rule('F11').status).toBe('not-yet-enforceable');
  });

  it('F10 is partial because no simulations/ directory exists', () => {
    expect(exists('simulations')).toBe(false);
    expect(rule('F10').status).toBe('partial');
  });

  it('F2 is partial because no packages/adapters exists', () => {
    expect(exists('packages/adapters')).toBe(false);
    expect(rule('F2').status).toBe('partial');
  });

  it('F4 is partial because its SUBJECTS do not exist, not because no store does', () => {
    // The earlier wording tied F4 to the store side and fired the moment Stage 1
    // created `packages/store-sqlite` -- correctly, because the stated reason had
    // become false. But it was the wrong reason from the start: F4 constrains
    // `resolver`, `assurance` and `evidence-derivation`, and it is those three
    // that do not exist yet. A store existing is what gives the rule a real
    // target; it is not what makes the rule enforceable.
    for (const subject of [
      'packages/resolver',
      'packages/assurance',
      'packages/evidence-derivation',
    ]) {
      expect(exists(subject), `${subject} exists, so F4 must be armed`).toBe(false);
    }
    expect(rule('F4').status).toBe('partial');
    // And the dependency rule now has something to point at, so the day a
    // subject appears the rule bites rather than needing to be written first.
    expect(exists('packages/store-sqlite')).toBe(true);
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
    // Stage 1 armed F7 when `packages/releases` gave it a subject, moving it
    // from not-yet-enforceable to partial. Stage 0's own documents still record
    // the Stage 0 mix, correctly: they are history, not a claim about now.
    expect(summarize()).toBe('6 enforced, 5 partial, 2 not yet enforceable');
  });

  it('does not claim all thirteen rule entries are green', () => {
    expect(ENFORCED_RULES.length).toBeLessThan(FITNESS_RULES.length);
  });
});
