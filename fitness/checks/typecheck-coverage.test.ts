/**
 * Every workspace package is inside the typecheck program.
 *
 * The defect this exists for, which happened rather than being imagined: the
 * root `tsconfig.json` covered packages only one level deep, while the guide
 * nests the adapters one level deeper, at `packages/adapters/cli`. A glob
 * segment of a single asterisk matches one path segment, so the entire
 * adapters tree was silently outside the typecheck program. `pnpm typecheck`
 * reported success over code it never looked at, and
 * the gap only surfaced when the runtime refused an import of a function that
 * does not exist.
 *
 * That is the same shape as every other vacuity failure this repository guards:
 * a check that inspects nothing and says it passed. So it is guarded the same
 * way -- by asserting coverage directly, rather than trusting a glob to keep
 * matching as the tree grows.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { REPO_ROOT } from './scan.ts';

/** Every directory holding a package.json, under the workspace roots. */
function workspacePackages(): string[] {
  const found: string[] = [];
  const visit = (dir: string, depth: number): void => {
    if (depth > 3) return;
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    if (entries.some((e) => e.isFile() && e.name === 'package.json') && dir !== REPO_ROOT) {
      found.push(relative(REPO_ROOT, dir).split('\\').join('/'));
    }
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name === 'node_modules' || entry.name === 'dist') continue;
      visit(join(dir, entry.name), depth + 1);
    }
  };
  visit(join(REPO_ROOT, 'packages'), 0);
  visit(join(REPO_ROOT, 'tools'), 0);
  return found.sort();
}

/** Does a tsconfig include pattern match a path? `*` is one segment, `**` many. */
function matches(pattern: string, path: string): boolean {
  const regex = new RegExp(
    `^${pattern
      .split('/')
      .map((segment) =>
        segment === '**'
          ? '(?:[^/]+/)*[^/]+'
          : segment.replace(/[.+^${}()|[\]\\]/gu, '\\$&').replace(/\*/gu, '[^/]*'),
      )
      .join('/')
      .replace('(?:[^/]+/)*[^/]+/', '(?:[^/]+/)*')}$`,
    'u',
  );
  return regex.test(path);
}

const includes = (): string[] => {
  // The root tsconfig carries comments, which JSON.parse rejects. Strip them
  // the same way tsc does rather than forbidding comments in a config file.
  const raw = readFileSync(join(REPO_ROOT, 'tsconfig.json'), 'utf8').replace(/^\s*\/\/.*$/gmu, '');
  return (JSON.parse(raw) as { include: string[] }).include;
};

describe('the typecheck program covers every workspace package', () => {
  const packages = workspacePackages();
  const patterns = includes();

  it('finds packages to check, so this test is not vacuous', () => {
    expect(packages.length).toBeGreaterThanOrEqual(8);
    expect(patterns.length).toBeGreaterThan(0);
  });

  it('includes a nested adapter package, which is what regressed', () => {
    expect(packages).toContain('packages/adapters/cli');
  });

  it.each(workspacePackages())('%s has its sources in the typecheck program', (pkg) => {
    const srcDir = join(REPO_ROOT, pkg, 'src');
    const checksDir = join(REPO_ROOT, pkg, 'checks');
    // `fitness` keeps its code in `checks/`, and the root config covers it with
    // its own pattern; every other package uses `src/`.
    const probe = existsSync(srcDir)
      ? `${pkg}/src/index.ts`
      : existsSync(checksDir)
        ? `${pkg}/checks/probe.ts`
        : null;
    if (probe === null) return; // a package with neither is not code we compile

    expect(
      patterns.some((pattern) => matches(pattern, probe)),
      `${probe} is matched by no include pattern in tsconfig.json, so tsc never sees it`,
    ).toBe(true);
  });
});
