/**
 * `pnpm seed:import --source <legacy checkout>` -- the Stage 2 seed.
 *
 * Writes `knowledge/`, and a promotion bundle under `qualification/promotions/`
 * for the owner to review. It does not touch git: C-04 says the bootstrap
 * import tool never pushes, and the owner opening the PR is the approval step.
 *
 * Re-running against the same revision produces no diff, which is what makes
 * the bundle reviewable as a batch rather than as a moving target.
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml, stringify as toYaml } from 'yaml';
import { assetSchema, sha256Canonical, solutionSetSchema } from '@ieos/core';
import { compileAsset, compileSolutionSets, SeedImportError, type Selection } from './index.ts';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const args = process.argv.slice(2);
const flag = (name: string): string | undefined => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};

const source = flag('--source') ?? process.env['IEOS_LEGACY_CHECKOUT'];
if (source === undefined || source.length === 0) {
  process.stderr.write(
    'usage: seed-import --source <path to an Engineering-OS checkout>\n' +
      '   or: IEOS_LEGACY_CHECKOUT=<path> seed-import\n',
  );
  process.exit(2);
}

/** The exact commit the bytes are read at. Never a branch name (D19). */
function revisionOf(checkout: string): string {
  return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: checkout, encoding: 'utf8' }).trim();
}

const selection = parseYaml(
  readFileSync(join(repoRoot, 'tools/seed-import/selection.yaml'), 'utf8'),
) as Selection;

const revision = revisionOf(source);
if (revision !== selection.revision_pin) {
  // The selection was made by reading specific bytes. Importing different ones
  // under the same description would put a claim in `knowledge/` that nobody
  // checked, which is the whole failure `provenance` exists to prevent.
  process.stderr.write(
    `the checkout is at ${revision}, but the selection was made against ` +
      `${selection.revision_pin}.\nRe-select against this revision, or check out the pinned one.\n`,
  );
  process.exit(1);
}

// Fixed, not `now()`: an import re-run must produce no diff, and a timestamp
// that moved would make every asset differ on every run.
const observedAt = '2026-09-06T00:00:00.000Z';

const knowledgeRoot = join(repoRoot, 'knowledge');
const written: { id: string; path: string; legacy: string }[] = [];

for (const selected of selection.assets) {
  const sourcePath = join(source, selected.legacy_path);
  let text: string;
  try {
    text = readFileSync(sourcePath, 'utf8');
  } catch {
    throw new SeedImportError(`cannot be read from the checkout`, selected.legacy_path);
  }

  const compiled = compileAsset(selected, text, revision, observedAt);
  const parsed = assetSchema.safeParse(compiled.asset);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    throw new SeedImportError(
      `does not satisfy the asset contract (${first?.path.join('.')}: ${first?.message})`,
      selected.id,
    );
  }

  const dir = join(knowledgeRoot, 'assets', compiled.directory);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'body.md'), compiled.body, 'utf8');
  writeFileSync(join(dir, 'asset.yaml'), toYaml(parsed.data, { lineWidth: 0 }), 'utf8');
  written.push({
    id: selected.id,
    path: `knowledge/assets/${compiled.directory}`,
    legacy: selected.legacy_path,
  });
}

const sets = compileSolutionSets(selection);
mkdirSync(join(knowledgeRoot, 'solution-sets'), { recursive: true });
for (const set of sets) {
  const parsed = solutionSetSchema.safeParse(set);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    throw new SeedImportError(
      `does not satisfy the solution set contract (${first?.path.join('.')}: ${first?.message})`,
      set.id,
    );
  }
  writeFileSync(
    join(knowledgeRoot, 'solution-sets', `${set.id}.yaml`),
    toYaml(parsed.data, { lineWidth: 0 }),
    'utf8',
  );
}

// --- the promotion bundle (C-04) -------------------------------------------
//
// What the owner reviews before merging. It states what came from where, at
// which revision, and -- importantly -- what it deliberately does NOT do.
const bundle = {
  schema_version: '1',
  kind: 'bootstrap_seed',
  stage: 2,
  generated_by: 'tools/seed-import',
  source: {
    repository: 'yotamfried-ux/Engineering-OS',
    revision,
    selection_digest: sha256Canonical(selection as never),
  },
  counts: {
    assets: written.length,
    solution_sets: sets.length,
    unresolved_solution_sets: sets.filter((set) => set.canonical_state === 'unresolved').length,
  },
  assets: written,
  solution_sets: sets.map((set) => ({
    id: set.id,
    canonical_state: set.canonical_state,
    champion_id: set.champion_id,
    members: set.members,
  })),
  not_done: [
    'No Champion was chosen. Every set is unresolved with champion_id: null (D34, P-01).',
    'No evidence was imported or implied. Assets are active and unproven (R-04).',
    'No branch was created and nothing was pushed. The owner opens the PR (C-04).',
    'No capability id was invented. Assets declare only ids already in contracts/capabilities.yaml.',
  ],
};

const bundleDir = join(repoRoot, 'qualification/promotions/seed-2026-09-06');
mkdirSync(bundleDir, { recursive: true });
writeFileSync(join(bundleDir, 'promotion.yaml'), toYaml(bundle, { lineWidth: 0 }), 'utf8');

process.stdout.write(
  `seeded ${String(written.length)} assets and ${String(sets.length)} solution set(s)\n` +
    `  from:   yotamfried-ux/Engineering-OS@${revision.slice(0, 12)}\n` +
    `  bundle: qualification/promotions/seed-2026-09-06/promotion.yaml\n` +
    'Nothing was pushed. Review the bundle and open the PR (C-04).\n',
);
