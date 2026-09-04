/**
 * F1a, F2, F4, F5 -- enforcement mechanism 1: the static import graph.
 *
 * dependency-cruiser runs as part of `pnpm test` rather than only as a separate
 * command, because a boundary check that has to be remembered is a boundary
 * check that will be forgotten.
 *
 * The second test here matters as much as the first: dependency-cruiser silently
 * degrades to "0 dependencies cruised" when it cannot parse the TypeScript in
 * use, and a rule that inspects nothing reports success. That exact failure
 * happened while writing this (dependency-cruiser 18.2.0 does not support
 * TypeScript 7, which is why ADR-0002 pins TypeScript 6.0.3), so it is asserted
 * rather than assumed.
 */

import { execFileSync } from 'node:child_process';
import { rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { REPO_ROOT } from './scan.ts';

interface CruiseSummary {
  readonly summary: {
    readonly error: number;
    readonly warn: number;
    readonly totalCruised: number;
    readonly totalDependenciesCruised: number;
    readonly violations: readonly {
      readonly rule: { readonly name: string; readonly severity: string };
      readonly from: string;
      readonly to: string;
    }[];
  };
}

function cruise(): CruiseSummary {
  const output = execFileSync(
    'node',
    [
      'node_modules/dependency-cruiser/bin/dependency-cruise.mjs',
      '--config',
      'fitness/.dependency-cruiser.cjs',
      '--output-type',
      'json',
      'packages',
      'tools',
      'fitness',
    ],
    { cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  );
  return JSON.parse(output) as CruiseSummary;
}

const PROBE = join(REPO_ROOT, 'packages/core/src/__fitness-probe.ts');

/** Write a deliberate violation into core, cruise, and report what fired. */
function cruiseWithProbe(source: string): readonly string[] {
  writeFileSync(PROBE, source, 'utf8');
  return cruise().summary.violations.map((violation) => violation.rule.name);
}

afterEach(() => {
  rmSync(PROBE, { force: true });
});

const result = cruise();

describe('the dependency graph obeys the guide section 3 direction', () => {
  it('reports no rule violation', () => {
    const violations = result.summary.violations.map(
      (violation) => `${violation.rule.name}: ${violation.from} -> ${violation.to}`,
    );
    expect(violations, violations.join('\n')).toEqual([]);
    expect(result.summary.error).toBe(0);
  });
});

describe('the analysis is not silently empty', () => {
  it('actually cruised the TypeScript sources', () => {
    // Guard against the degraded mode: an unsupported TypeScript version makes
    // dependency-cruiser cruise one module and report success.
    expect(result.summary.totalCruised).toBeGreaterThan(30);
    expect(result.summary.totalDependenciesCruised).toBeGreaterThan(50);
  });

  it('the toolchain pin is what keeps the analysis working', () => {
    // ADR-0002 records this: dependency-cruiser 18.2.0 declares support for
    // typescript >=2.0.0 <7.0.0. Bumping TypeScript past that range would send
    // this check back to reporting success over nothing.
    const declared = execFileSync('node', ['-p', "require('typescript').version"], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    }).trim();
    expect(Number.parseInt(declared.split('.')[0] as string, 10)).toBeLessThan(7);
  });
});

describe('the rules can actually fire (control)', () => {
  // Without these, "no dependency violations found" could mean the rules are
  // unfireable rather than that the code is clean. One of them was: the F1a path
  // rule never matched, because pnpm's strict node_modules makes an undeclared
  // workspace import unresolvable, so it had no resolved path to match against.

  it('fires on I/O inside core', () => {
    const fired = cruiseWithProbe(
      "import { readFileSync } from 'node:fs';\nexport const p = () => readFileSync('x');\n",
    );
    expect(fired).toContain('f1b-core-performs-no-io');
  });

  it('fires on a workspace import from core, by specifier', () => {
    const fired = cruiseWithProbe("export { REQUIRED_TOOLCHAIN } from '@ieos/harness';\n");
    expect(fired).toContain('f1a-core-imports-no-ieos-package-by-name');
  });

  it('fires on an unresolvable import anywhere', () => {
    // An unresolved import is analysed as nothing, so every boundary rule would
    // pass over it. That has to be an error in its own right.
    const fired = cruiseWithProbe("export { thing } from 'no-such-package-anywhere';\n");
    expect(fired).toContain('no-unresolvable');
  });

  it('the probe leaves no trace, so the clean result above stays clean', () => {
    expect(cruise().summary.error).toBe(0);
  });
});
