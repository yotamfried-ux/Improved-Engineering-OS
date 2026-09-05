/**
 * `pnpm capabilities:emit` / `pnpm capabilities:check`.
 *
 * Reads the legacy registry from a checkout, seeds it deterministically, and
 * writes `contracts/capabilities.yaml`. The source path is supplied by the
 * caller rather than hard-coded, because a path to someone's checkout in a
 * runtime file is exactly what fitness rule F6 forbids.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sha256Text } from '@ieos/core';
import { renderCapabilitiesYaml, seedCapabilities } from './index.ts';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const target = join(repoRoot, 'contracts', 'capabilities.yaml');

const args = process.argv.slice(2);
const check = args.includes('--check');
const sourceIndex = args.indexOf('--source');
const sourcePath = sourceIndex >= 0 ? args[sourceIndex + 1] : process.env['IEOS_LEGACY_REGISTRY'];

if (sourcePath === undefined || sourcePath.length === 0) {
  process.stderr.write(
    'usage: capability-seed --source <path to legacy core/capability-registry.yaml> [--check]\n' +
      '   or: IEOS_LEGACY_REGISTRY=<path> capability-seed [--check]\n',
  );
  process.exit(2);
}

const sourceText = readFileSync(sourcePath, 'utf8');

function revisionOf(path: string): string {
  try {
    return execFileSync('git', ['-C', dirname(path), 'rev-parse', 'HEAD'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    process.stderr.write(
      `refusing to seed: ${path} is not inside a git checkout, so no exact revision can be ` +
        'recorded. Provenance without a revision is not provenance (D6, D19).\n',
    );
    process.exit(2);
  }
}

const document = seedCapabilities(sourceText, {
  repository: 'yotamfried-ux/Engineering-OS',
  path: 'core/capability-registry.yaml',
  revision: revisionOf(sourcePath),
  source_digest: sha256Text(sourceText),
});

const rendered = renderCapabilitiesYaml(document);

if (check) {
  const committed = readFileSync(target, 'utf8');
  if (committed === rendered) {
    process.stdout.write(
      `contracts/capabilities.yaml is up to date (${String(document.capabilities.length)} capabilities)\n`,
    );
    process.exit(0);
  }
  process.stderr.write('contracts/capabilities.yaml differs from a fresh seed of the source.\n');
  process.exit(1);
}

writeFileSync(target, rendered, 'utf8');
process.stdout.write(
  `seeded ${String(document.capabilities.length)} capabilities from ` +
    `${document.seed.source.repository}@${document.seed.source.revision.slice(0, 12)}\n`,
);
