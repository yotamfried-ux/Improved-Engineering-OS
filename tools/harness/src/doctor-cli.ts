/**
 * `pnpm ieos-doctor` -- the Stage 0 toolchain check (R4, ADR-0002).
 */

import { execFileSync } from 'node:child_process';
import { checkToolchain, formatReport, pnpmProbe } from './doctor.ts';

function pnpmVersion(): string | null {
  // How to spawn pnpm is platform-dependent; `pnpmProbe` holds that decision
  // and explains why. See doctor.ts.
  const probe = pnpmProbe();
  try {
    return execFileSync(probe.command, [...probe.args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      shell: probe.shell,
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
