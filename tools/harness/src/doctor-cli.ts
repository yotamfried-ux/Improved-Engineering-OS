/**
 * `pnpm doctor` -- the Stage 0 toolchain check (R4, ADR-0002).
 */

import { execFileSync } from 'node:child_process';
import { checkToolchain, formatReport } from './doctor.ts';

function pnpmVersion(): string | null {
  try {
    return execFileSync('pnpm', ['--version'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    return null;
  }
}

const report = checkToolchain({
  nodeVersion: process.version,
  pnpmVersion: pnpmVersion(),
});

process.stdout.write(formatReport(report));
process.exit(report.ok ? 0 : 1);
