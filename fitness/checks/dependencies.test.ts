/**
 * Dependency policy (D29) and the contract files, checked rather than trusted.
 *
 * D29 requires exact pins, a committed lockfile, and a record of each
 * dependency. The user brief adds: the exact problem it solves, the version,
 * licence and attribution obligations, and what was copied versus studied.
 *
 * A written policy nobody checks is a written policy. These tests are the check.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { exists, loadYaml, REPO_ROOT } from './scan.ts';

interface PackageJson {
  readonly name?: string;
  readonly dependencies?: Record<string, string>;
  readonly devDependencies?: Record<string, string>;
  readonly packageManager?: string;
  readonly engines?: Record<string, string>;
}

function readPackageJson(relativePath: string): PackageJson {
  return JSON.parse(readFileSync(join(REPO_ROOT, relativePath), 'utf8')) as PackageJson;
}

const MANIFESTS = [
  'package.json',
  'packages/core/package.json',
  'tools/contracts-gen/package.json',
  'tools/harness/package.json',
  'fitness/package.json',
];

const EXACT_VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u;

describe('D29 -- every dependency is pinned exactly', () => {
  it.each(MANIFESTS)('%s uses no range or tag', (manifest) => {
    const pkg = readPackageJson(manifest);
    const offenders: string[] = [];

    for (const [name, spec] of Object.entries({
      ...(pkg.dependencies ?? {}),
      ...(pkg.devDependencies ?? {}),
    })) {
      // A workspace protocol link is not a version range; it resolves to a
      // package in this repository whose own dependencies are checked here too.
      if (spec.startsWith('workspace:')) continue;
      if (!EXACT_VERSION.test(spec)) offenders.push(`${name}@${spec}`);
    }

    expect(offenders, 'D29 requires exact pins: no ^, ~, *, latest or ranges').toEqual([]);
  });

  it('never uses the tag "latest" anywhere in a manifest', () => {
    // The dependency-side sibling of F7 ("runtime never resolves latest").
    for (const manifest of MANIFESTS) {
      expect(readFileSync(join(REPO_ROOT, manifest), 'utf8')).not.toMatch(/"latest"/u);
    }
  });

  it('commits a lockfile', () => {
    expect(exists('pnpm-lock.yaml')).toBe(true);
  });

  it('pins the package manager and the Node major (D18.6)', () => {
    const root = readPackageJson('package.json');
    expect(root.packageManager).toMatch(/^pnpm@\d+\.\d+\.\d+$/u);
    expect(root.engines?.['node']).toBe('24.x');
  });
});

describe('every installed direct dependency is recorded in the decision log', () => {
  const log = readFileSync(join(REPO_ROOT, 'docs/decisions/DECISION-LOG.md'), 'utf8');

  const directDependencies = new Set<string>();
  for (const manifest of MANIFESTS) {
    const pkg = readPackageJson(manifest);
    for (const [name, spec] of Object.entries({
      ...(pkg.dependencies ?? {}),
      ...(pkg.devDependencies ?? {}),
    })) {
      if (!spec.startsWith('workspace:')) directDependencies.add(name);
    }
  }

  it('found dependencies to check, so this is not vacuous', () => {
    expect(directDependencies.size).toBeGreaterThan(5);
  });

  it.each([...directDependencies].sort())('%s appears in the decision log', (name) => {
    expect(log, `add ${name} to docs/decisions/DECISION-LOG.md section 3.1`).toContain(name);
  });

  it('records the exact installed version alongside each dependency', () => {
    const missing: string[] = [];
    for (const manifest of MANIFESTS) {
      const pkg = readPackageJson(manifest);
      for (const [name, spec] of Object.entries({
        ...(pkg.dependencies ?? {}),
        ...(pkg.devDependencies ?? {}),
      })) {
        if (spec.startsWith('workspace:')) continue;
        if (!log.includes(`\`${spec}\``)) missing.push(`${name}@${spec}`);
      }
    }
    expect(missing, 'the decision log must carry the exact pinned version').toEqual([]);
  });

  it('records a licence column for the dependency table', () => {
    // Matched loosely on the column headers rather than on exact bytes: Prettier
    // pads Markdown table cells, and a formatting run must not fail a policy check.
    const header = log.split('\n').find((line) => /\|\s*Dependency\s*\|/u.test(line));
    expect(header, 'DECISION-LOG.md must carry a dependency table').toBeDefined();
    for (const column of ['Version', 'Licence', 'Problem it solves', 'Proving test']) {
      expect(header).toContain(column);
    }
  });
});

describe('vendored material carries its attribution', () => {
  it('the JCS fixtures ship a NOTICE naming copyright, licence and provenance', () => {
    const notice = readFileSync(join(REPO_ROOT, 'packages/core/test/fixtures/jcs/NOTICE'), 'utf8');
    expect(notice).toContain('Apache License');
    expect(notice).toContain('Anders Rundgren');
    expect(notice).toContain('json-canonicalization');
    // The distinction that matters: data was taken, code was not.
    expect(notice).toMatch(/DATA ONLY/u);
    expect(notice).toMatch(/No source code from that project was copied/u);
  });

  it('every vendored fixture directory has a NOTICE', () => {
    const fixturesRoot = join(REPO_ROOT, 'packages/core/test/fixtures');
    for (const entry of readdirSync(fixturesRoot, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      expect(
        readdirSync(join(fixturesRoot, entry.name)),
        `packages/core/test/fixtures/${entry.name} needs a NOTICE`,
      ).toContain('NOTICE');
    }
  });
});

describe('the contract files are valid and honest about their state', () => {
  it('capabilities.yaml parses and is explicitly unseeded rather than invented', () => {
    const capabilities = loadYaml<{
      schema_version: string;
      seed: { status: string; source: { revision: string | null } };
      capabilities: unknown[];
    }>('contracts/capabilities.yaml');

    expect(capabilities.schema_version).toBe('1');
    expect(capabilities.seed.status).toBe('pending');
    // No capability id may be invented while the source is unreachable (O-5).
    expect(capabilities.capabilities).toEqual([]);
    expect(capabilities.seed.source.revision).toBeNull();
  });

  it('telemetry-attributes.yaml declares sensitivity and a bound for every attribute', () => {
    const registry = loadYaml<{
      attributes: { key: string; type: string; sensitivity: string; max_length: number }[];
      forbidden: { key: string; sensitivity: string }[];
    }>('contracts/telemetry-attributes.yaml');

    expect(registry.attributes.length).toBeGreaterThan(0);
    for (const attribute of registry.attributes) {
      expect(['public', 'internal']).toContain(attribute.sensitivity);
      expect(attribute.max_length).toBeGreaterThan(0);
      expect(attribute.type).toBeTruthy();
    }
    // "never" belongs in the forbidden list, not in the collected list.
    expect(registry.attributes.some((a) => a.sensitivity === 'never')).toBe(false);
  });

  it('names the forbidden attributes explicitly, so absence is a decision', () => {
    const registry = loadYaml<{ forbidden: { key: string; sensitivity: string }[] }>(
      'contracts/telemetry-attributes.yaml',
    );
    const keys = registry.forbidden.map((entry) => entry.key);
    expect(keys).toContain('prompt.text');
    expect(keys).toContain('credential.*');
    for (const entry of registry.forbidden) expect(entry.sensitivity).toBe('never');
  });
});
