/**
 * `pnpm build:index` -- compile the knowledge tree from source (D20.2).
 *
 * A repo script rather than an `ieos` subcommand, which is what D20.2 says
 * ("at Stage 0-3 via `pnpm build:index` from source") and what keeps the guide's
 * dependency graph intact: no adapter needs to depend on `releases`.
 */

import { DatabaseSync } from 'node:sqlite';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildIndex, KnowledgeTreeError } from './build-index.ts';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const args = process.argv.slice(2);
const flag = (name: string): string | undefined => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};

try {
  const result = buildIndex({
    knowledgeRoot: flag('--knowledge') ?? join(repoRoot, 'knowledge'),
    outputPath: flag('--out') ?? join(repoRoot, 'knowledge.sqlite'),
    openWritable: (path) => new DatabaseSync(path),
  });
  process.stdout.write(
    `built ${result.path}\n` +
      `  assets:        ${String(result.assetCount)}\n` +
      `  solution sets: ${String(result.solutionSetCount)}\n` +
      `  index_digest:  ${result.indexDigest}\n`,
  );
} catch (error) {
  if (error instanceof KnowledgeTreeError) {
    // A tree error names the file, because "invalid asset" without a path is
    // an error message nobody can act on.
    process.stderr.write(`\nknowledge tree is not admissible:\n  ${error.message}\n\n`);
    process.exit(1);
  }
  throw error;
}
