/**
 * `pnpm snapshot:emit` -- writes the bootstrap snapshot and prints its digest.
 *
 * The Windows smoke job runs this and compares the digest with the Linux run:
 * that comparison is the D35 cross-platform gate.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { emitUnprovenSnapshot } from './index.ts';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

// Stage 0 has no knowledge/ tree, so the bootstrap snapshot covers no assets.
// That is the honest state, and it still exercises the whole path.
const emitted = emitUnprovenSnapshot([]);

const args = process.argv.slice(2);
if (args.includes('--digest-only')) {
  process.stdout.write(`${emitted.digest}\n`);
  process.exit(0);
}

const outDir = join(repoRoot, 'qualification', 'evidence');
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'scores.snapshot.json'), emitted.content, 'utf8');

process.stdout.write(
  `state=${emitted.snapshot.state} assets=${String(emitted.snapshot.assets.length)}\n` +
    `digest=${emitted.digest}\n`,
);
