/**
 * The runtime check must fail correctly, which is the whole reason it exists
 * (research finding R4).
 *
 * `checkToolchain` takes observed versions as arguments precisely so its
 * behaviour under a missing or wrong toolchain is testable without uninstalling
 * anything.
 */

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { checkToolchain, formatReport, REQUIRED_TOOLCHAIN } from '../src/doctor.ts';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

describe('the declared requirement matches the repository', () => {
  it('agrees with engines.node and packageManager in the root package.json', () => {
    // Two sources of truth for the pinned toolchain would drift. This test is
    // the thing that stops them.
    const pkg = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8')) as {
      engines: { node: string };
      packageManager: string;
      devEngines: { packageManager: { name: string; version: string } };
    };

    expect(pkg.engines.node).toBe(`${String(REQUIRED_TOOLCHAIN.nodeMajor)}.x`);
    expect(pkg.packageManager).toBe(`pnpm@${REQUIRED_TOOLCHAIN.pnpmVersion}`);
    expect(pkg.devEngines.packageManager.name).toBe('pnpm');
    expect(pkg.devEngines.packageManager.version).toBe(REQUIRED_TOOLCHAIN.pnpmVersion);
  });
});

describe('a correct toolchain passes', () => {
  it('accepts the pinned versions', () => {
    const report = checkToolchain({ nodeVersion: 'v24.20.0', pnpmVersion: '11.25.0' });
    expect(report.ok).toBe(true);
    expect(report.checks.every((check) => check.status === 'ok')).toBe(true);
  });

  it('accepts any Node 24 patch, since the pin is on the major', () => {
    expect(checkToolchain({ nodeVersion: 'v24.11.0', pnpmVersion: '11.25.0' }).ok).toBe(true);
  });

  it('tolerates trailing whitespace from a CLI invocation', () => {
    expect(checkToolchain({ nodeVersion: 'v24.20.0', pnpmVersion: '11.25.0\n' }).ok).toBe(true);
  });
});

describe('a missing or wrong toolchain fails, and says what to do', () => {
  it('fails when Node is absent, and does not infer it from an installed agent (R4)', () => {
    const report = checkToolchain({ nodeVersion: null, pnpmVersion: '11.25.0' });
    expect(report.ok).toBe(false);

    const node = report.checks.find((check) => check.name === 'node');
    expect(node?.status).toBe('failed');
    expect(node?.detail).toMatch(/does not install Node/u);
    expect(node?.detail).toMatch(/docs\/setup\.md/u);
  });

  it('fails on the wrong Node major, naming both versions', () => {
    const report = checkToolchain({ nodeVersion: 'v22.22.2', pnpmVersion: '11.25.0' });
    expect(report.ok).toBe(false);

    const node = report.checks.find((check) => check.name === 'node');
    expect(node?.detail).toContain('v22.22.2');
    expect(node?.detail).toContain('24.x');
  });

  it('fails on an unparseable Node version rather than guessing', () => {
    expect(checkToolchain({ nodeVersion: 'unknown', pnpmVersion: '11.25.0' }).ok).toBe(false);
  });

  it('fails when pnpm is absent, and names the corepack command that fixes it', () => {
    const report = checkToolchain({ nodeVersion: 'v24.20.0', pnpmVersion: null });
    const pnpm = report.checks.find((check) => check.name === 'pnpm');
    expect(pnpm?.status).toBe('failed');
    expect(pnpm?.detail).toMatch(/corepack prepare pnpm@11\.25\.0/u);
  });

  it('fails on a different pnpm version, because the pin is exact', () => {
    const report = checkToolchain({ nodeVersion: 'v24.20.0', pnpmVersion: '10.33.0' });
    expect(report.ok).toBe(false);
    expect(report.checks.find((check) => check.name === 'pnpm')?.detail).toContain('10.33.0');
  });

  it('reports every failure, not just the first', () => {
    const report = checkToolchain({ nodeVersion: null, pnpmVersion: null });
    expect(report.checks.filter((check) => check.status === 'failed')).toHaveLength(2);
  });
});

describe('report formatting', () => {
  it('marks failures visibly and keeps the remedy inline', () => {
    const text = formatReport(checkToolchain({ nodeVersion: null, pnpmVersion: null }));
    expect(text).toContain('FAIL  node:');
    expect(text).toContain('FAIL  pnpm:');
    expect(text).toContain('toolchain check failed');
  });

  it('says so plainly when everything is fine', () => {
    const text = formatReport(checkToolchain({ nodeVersion: 'v24.20.0', pnpmVersion: '11.25.0' }));
    expect(text).toContain('toolchain ok');
    expect(text).not.toContain('FAIL');
  });
});
