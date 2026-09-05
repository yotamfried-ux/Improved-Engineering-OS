/**
 * Print the honest fitness rule status.
 *
 * Reporting "F1-F12 green" when several rules have no subject yet would be the
 * false completeness the constitution forbids, so the summary shows the split.
 */

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const { FITNESS_RULES, summarize } = await import(join(repoRoot, 'fitness/rules.ts'));

process.stdout.write(`## Fitness rules\n\n**${summarize()}** — not "all green".\n\n`);
process.stdout.write('| Rule | Status | Invariant |\n|---|---|---|\n');
for (const rule of FITNESS_RULES) {
  process.stdout.write(`| ${rule.id} | \`${rule.status}\` | ${rule.invariant} |\n`);
}
process.stdout.write(
  '\nRules that are `partial` or `not-yet-enforceable` have no subject yet at Stage 0.\n',
);
