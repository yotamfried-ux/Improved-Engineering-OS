/**
 * The knowledge tree this repository actually ships.
 *
 * Every other test in this package builds a fixture tree. That leaves one thing
 * unchecked, and it is the thing that broke: the committed `knowledge/` tree
 * itself. `content_hash` covers each asset's `body.md` and `files/` (D19, D35),
 * so anything that rewrites those bytes after the hash was computed invalidates
 * the asset -- and the tool that did it was Prettier, formatting imported
 * Markdown on its way into a commit. Thirteen bodies lost byte-identity with
 * the sections they were imported from, `pnpm build:index` refused the tree, and
 * nothing said so until CI ran the build minutes after the push.
 *
 * `knowledge/` is in `.prettierignore` now, which stops that specific cause.
 * This test is the general one: it reads the real tree and holds it to the same
 * rule the build does, in the suite a contributor runs before pushing.
 */

import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { knowledgeTreeDigest, readKnowledgeTree } from '../src/index.ts';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const knowledgeRoot = join(repoRoot, 'knowledge');

describe('the committed knowledge tree', () => {
  it('exists, so this file is not passing over an absent subject', () => {
    // The tree arrives at Stage 2. Before that an empty tree was legitimate and
    // this suite would have been vacuous -- which is why the check is explicit
    // rather than implied by the tests below finding nothing to complain about.
    expect(existsSync(knowledgeRoot)).toBe(true);
  });

  it('is admissible: every asset satisfies its contract and its declared hash', () => {
    // `readKnowledgeTree` performs the D19 verification, so a body edited after
    // its hash was computed fails here with the file named.
    const tree = readKnowledgeTree(knowledgeRoot);
    expect(tree.assets.length).toBeGreaterThan(0);
    expect(tree.solutionSets.length).toBeGreaterThan(0);
  });

  it('digests to the same value twice, over the real corpus (F8)', () => {
    // The determinism tests elsewhere use fixtures of two or three assets. This
    // one runs the same property over the corpus that ships.
    const first = knowledgeTreeDigest(readKnowledgeTree(knowledgeRoot));
    const second = knowledgeTreeDigest(readKnowledgeTree(knowledgeRoot));
    expect(second).toBe(first);
  });

  it('leaves every Solution Set unresolved, because no importer picks a Champion', () => {
    // D34 and P-01: `canonical_state` is owned by Git and set by a promotion.
    // An import tool that shipped a pinned Champion would have taken a decision
    // that only a release may take.
    const tree = readKnowledgeTree(knowledgeRoot);
    for (const set of tree.solutionSets) {
      expect(set.canonical_state).toBe('unresolved');
      expect(set.champion_id).toBeNull();
    }
  });
});
