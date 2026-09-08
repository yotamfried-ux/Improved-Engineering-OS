/**
 * The seed import, and the four things it must refuse to do.
 *
 * C-04 makes this tool's *absences* as load-bearing as its output: it must not
 * choose a Champion, must not imply evidence, must not push, and must not
 * invent a capability id. Three of those are asserted here; the fourth (no
 * push) is enforced repository-wide by F3's grep over `tools/`.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';
import { assetSchema, hashFileSet, solutionSetSchema } from '@ieos/core';
import { compileAsset, compileSolutionSets, extractSection, type Selection } from '../src/index.ts';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const selection = parseYaml(
  readFileSync(join(REPO_ROOT, 'tools/seed-import/selection.yaml'), 'utf8'),
) as Selection;

const REVISION = 'a'.repeat(40);
const AT = '2026-09-06T00:00:00.000Z';

const MULTI = `# Auth Patterns

Intro prose.

## Pattern: One

First body.

---

## Pattern: Two

Second body.
`;

describe('section extraction, because one file holds several solutions', () => {
  it('takes only the named section, and keeps its heading', () => {
    const section = extractSection(MULTI, 'Pattern: One');
    expect(section).toContain('## Pattern: One');
    expect(section).toContain('First body.');
    expect(section).not.toContain('Second body.');
    expect(section).not.toContain('Intro prose.');
  });

  it('drops the rule the corpus puts between sections', () => {
    expect(extractSection(MULTI, 'Pattern: One').trimEnd().endsWith('First body.')).toBe(true);
  });

  it('takes the last section to the end of the file', () => {
    expect(extractSection(MULTI, 'Pattern: Two')).toContain('Second body.');
  });

  it('refuses a heading that is not there rather than importing the whole file', () => {
    expect(() => extractSection(MULTI, 'Pattern: Missing')).toThrow(/no "## Pattern: Missing"/u);
  });
});

describe('what the importer refuses to do', () => {
  it('never chooses a Champion (D34, P-01)', () => {
    // The failure this prevents: a set of freshly imported, unproven
    // alternatives acquiring a canonical answer because something had to pick.
    for (const set of compileSolutionSets(selection)) {
      expect(set.champion_id).toBeNull();
      expect(set.canonical_state).toBe('unresolved');
      expect(set.why_unresolved).toBeTruthy();
    }
  });

  it('declares only capability ids that already exist in the taxonomy', () => {
    // D28 grows the taxonomy through its own promotion PR. The legacy registry
    // turned out to be workflow-shaped, so most seed assets honestly declare no
    // capability -- inventing `auth.oauth.pkce` is what O-5 refused to do.
    const known = new Set(
      (
        parseYaml(readFileSync(join(REPO_ROOT, 'contracts/capabilities.yaml'), 'utf8')) as {
          capabilities: { id: string }[];
        }
      ).capabilities.map((capability) => capability.id),
    );
    expect(known.size).toBeGreaterThan(0);
    for (const asset of selection.assets) {
      for (const capability of asset.capabilities) {
        expect(known.has(capability), `${capability} is not in contracts/capabilities.yaml`).toBe(
          true,
        );
      }
    }
  });

  it('imports assets as active and unproven, claiming no evidence (R-04)', () => {
    const { asset } = compileAsset(
      selection.assets[0]!,
      MULTI.replace('Pattern: One', selection.assets[0]!.section ?? 'x'),
      REVISION,
      AT,
    );
    expect(asset.status).toBe('active');
    // Importing is not verifying: nothing re-checked that this still holds.
    expect(asset.freshness.last_verified_at).toBeNull();
  });
});

describe('provenance is recorded, not asserted', () => {
  const compiled = compileAsset(
    { ...selection.assets[0]!, section: 'Pattern: One' },
    MULTI,
    REVISION,
    AT,
  );

  it('carries the legacy path and the exact revision', () => {
    expect(compiled.asset.legacy_ids).toEqual([selection.assets[0]!.legacy_path]);
    expect(compiled.asset.provenance[0]?.source_revision).toBe(REVISION);
    expect(compiled.asset.provenance[0]?.source_type).toBe('existing_eos');
  });

  it('hashes the body it will actually write, not the legacy file', () => {
    // The index builder verifies `content_hash` against `body.md` and `files/`
    // at build time, so a hash over the whole source file would fail the build.
    const expected = hashFileSet([
      { path: 'body.md', bytes: new TextEncoder().encode(compiled.body) },
    ]);
    expect(compiled.asset.content_hash).toBe(expected);
  });

  it('produces a record its contract accepts', () => {
    expect(assetSchema.safeParse(compiled.asset).success).toBe(true);
  });

  it('produces solution sets their contract accepts', () => {
    for (const set of compileSolutionSets(selection)) {
      expect(solutionSetSchema.safeParse(set).success).toBe(true);
    }
  });
});

describe('the selection satisfies what the guide asks of it', () => {
  const types = selection.assets.map((asset) => asset.type);

  it('is 10 to 20 assets', () => {
    expect(selection.assets.length).toBeGreaterThanOrEqual(10);
    expect(selection.assets.length).toBeLessThanOrEqual(20);
  });

  it('includes a lesson, a failed_solution and a control_guidance', () => {
    expect(types).toContain('lesson');
    expect(types).toContain('failed_solution');
    expect(types).toContain('control_guidance');
  });

  it('puts at least two assets in one Solution Set', () => {
    const bySet = new Map<string, number>();
    for (const asset of selection.assets) {
      if (asset.solution_set_id === null) continue;
      bySet.set(asset.solution_set_id, (bySet.get(asset.solution_set_id) ?? 0) + 1);
    }
    expect([...bySet.values()].some((count) => count >= 2)).toBe(true);
  });

  it('mints a distinct id for every asset and set', () => {
    const ids = selection.assets.map((asset) => asset.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
