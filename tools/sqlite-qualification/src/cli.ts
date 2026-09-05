/**
 * `pnpm sqlite:qualify` -- runs the seven recorded checks against every
 * candidate that can be loaded here, and writes the evidence file.
 *
 * Output is a record of what was measured, not a verdict about what to adopt.
 * The verdict lives in the decision log, where the platform coverage is visible
 * alongside it.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadBetterSqlite3, loadNodeSqlite, qualify } from './index.ts';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const outDir = join(repoRoot, 'qualification', 'evidence');

/**
 * Where to write the evidence.
 *
 * Defaults to the committed cross-candidate record, which is correct when this
 * is run deliberately with both candidates resolvable. It must NOT be the
 * default anywhere that only one candidate can load: a Windows CI runner cannot
 * resolve `better-sqlite3`, so writing there would replace a two-candidate
 * record with a one-candidate one -- and the suite that reads the committed
 * file would then fail on a file this tool had just destroyed underneath it.
 * That is exactly what happened before `--out` existed.
 */
function outputPath(argv: readonly string[]): string {
  const index = argv.indexOf('--out');
  const named = index >= 0 ? argv[index + 1] : undefined;
  if (named === undefined) return join(outDir, 'sqlite-qualification.json');
  return isAbsolute(named) ? named : join(repoRoot, named);
}

const results = [];
results.push(await qualify(await loadNodeSqlite()));

// `better-sqlite3` is not a dependency here, so the caller points at an
// installation elsewhere: `--better-sqlite3 <path to its lib/index.js>`.
const args = process.argv.slice(2);
const flag = args.indexOf('--better-sqlite3');
const betterSpecifier =
  flag >= 0 ? args[flag + 1] : (process.env['IEOS_BETTER_SQLITE3'] ?? undefined);

const better = await loadBetterSqlite3(betterSpecifier);
if (better === null) {
  process.stdout.write(
    'better-sqlite3 was not resolvable, so its checks were NOT executed here.\n' +
      'It is deliberately not a dependency of this repository: adding it would be adopting a\n' +
      'candidate in order to qualify it. Point at an installation with\n' +
      '  pnpm sqlite:qualify --better-sqlite3 <path>/node_modules/better-sqlite3/lib/index.js\n',
  );
} else {
  results.push(await qualify(better));
}

for (const result of results) {
  process.stdout.write(
    `\n${result.candidate} (binding ${result.bindingVersion}, engine ${String(result.engineVersion)}) on ${result.platform}\n`,
  );
  for (const check of result.checks) {
    process.stdout.write(
      `  ${check.outcome.toUpperCase().padEnd(10)} ${String(check.id)}. ${check.name}\n      ${check.evidence}\n`,
    );
  }
  process.stdout.write(
    `  all checks passed on ${result.platform}: ${String(result.allChecksPassedOnThisPlatform)}\n` +
      `  QUALIFIED (all checks on all required platforms ${result.platformsRequired.join(' + ')}): ${String(result.qualified)}\n`,
  );
}

const file = outputPath(args);
mkdirSync(dirname(file), { recursive: true });
writeFileSync(file, `${JSON.stringify({ results }, null, 2)}\n`, 'utf8');
process.stdout.write(`\nevidence written to ${file}\n`);
