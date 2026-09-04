/**
 * `pnpm contracts:emit` / `pnpm contracts:check`.
 *
 * Run directly by Node 24's native TypeScript type stripping -- no build step
 * and no extra dependency.
 */

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { checkSchemas, writeSchemas } from './index.ts';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const outDir = join(repoRoot, 'contracts', 'schemas');

const mode = process.argv.includes('--check') ? 'check' : 'write';

if (mode === 'write') {
  const written = writeSchemas(outDir);
  process.stdout.write(`emitted ${String(written.length)} schemas to contracts/schemas/\n`);
  process.exit(0);
}

const result = checkSchemas(outDir);
if (result.ok) {
  process.stdout.write('contracts/schemas is up to date\n');
  process.exit(0);
}

process.stderr.write('contracts/schemas is out of date. Run `pnpm contracts:emit`.\n');
for (const name of result.changed) process.stderr.write(`  changed: ${name}\n`);
for (const name of result.missing) process.stderr.write(`  missing: ${name}\n`);
for (const name of result.extra) process.stderr.write(`  stale:   ${name}\n`);
process.exit(1);
