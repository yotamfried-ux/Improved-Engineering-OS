/**
 * Every test a gate row names must actually exist.
 *
 * Stage 1's report resolves its rows by full test name, and treats a name the
 * platform records do not mention as `unproven` — deliberately, because a row
 * passing on a test nobody ran is the false PASS this repository is built to
 * refuse. The failure mode that leaves is subtler: rename a test for a good
 * reason, and a row silently loses its evidence. Nothing in the suite notices,
 * because every test still passes; the gate turns `unproven` in CI, one job late,
 * and reads like a regression in the thing being measured.
 *
 * That happened during Stage 3. A conformance test was renamed when it stopped
 * asserting a refusal and started asserting service (S-6), and row G4 went
 * unproven in the next report.
 *
 * So the names are checked against the source here, where a rename fails
 * immediately and next to the reason. This is a source scan, which is the right
 * shape: the alternative is running every suite and collecting titles, which is
 * what CI already does one job too late to help.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { REQUIRED_TESTS as STAGE1_REQUIRED } from '../src/stage1.ts';

const REPO_ROOT = resolve(import.meta.dirname, '..', '..', '..');

function testFiles(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.git' || entry === 'dist') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) testFiles(full, found);
    else if (entry.endsWith('.test.ts')) found.push(full);
  }
  return found;
}

/**
 * Full test names, reconstructed the way vitest composes them: enclosing
 * `describe` titles joined to the `it` title by single spaces.
 *
 * Indentation-driven, which is sound here because every file is Prettier-
 * formatted with a fixed two-space step. A file that defied that would produce
 * names that match nothing and fail loudly rather than pass vacuously.
 */
function fullNamesIn(source: string): string[] {
  const names: string[] = [];
  const stack: { indent: number; title: string }[] = [];
  for (const line of source.split('\n')) {
    const describeMatch = /^(\s*)describe(?:\.\w+)?\(\s*(['"])(.*?)\2/u.exec(line);
    if (describeMatch !== null) {
      const indent = describeMatch[1]?.length ?? 0;
      while (stack.length > 0 && (stack.at(-1)?.indent ?? 0) >= indent) stack.pop();
      stack.push({ indent, title: describeMatch[3] ?? '' });
      continue;
    }
    const itMatch = /^(\s*)it\(\s*(['"])(.*?)\2/u.exec(line);
    if (itMatch !== null) {
      const indent = itMatch[1]?.length ?? 0;
      const enclosing = stack.filter((frame) => frame.indent < indent).map((frame) => frame.title);
      names.push([...enclosing, itMatch[3] ?? ''].join(' '));
    }
  }
  return names;
}

const allNames = new Set(
  testFiles(REPO_ROOT).flatMap((file) => fullNamesIn(readFileSync(file, 'utf8'))),
);

describe('the scan works at all', () => {
  it('found a large number of test names, so these assertions are not vacuous', () => {
    // Without this, a broken scanner would make every assertion below trivially
    // true against an empty set.
    expect(allNames.size).toBeGreaterThan(200);
  });

  it('does not find a name that no test defines (control)', () => {
    // The assertions below are worth nothing unless a wrong name actually fails.
    expect(allNames.has('MCP 2026-07-28 conformance smoke asserts something nobody wrote')).toBe(
      false,
    );
  });

  it('reconstructs a nested name the way vitest composes it', () => {
    const names = fullNamesIn(
      ["describe('outer', () => {", "  describe('inner', () => {", "    it('leaf', () => {"].join(
        '\n',
      ),
    );
    expect(names).toEqual(['outer inner leaf']);
  });
});

describe('every test a Stage 1 gate row names exists', () => {
  const entries = Object.entries(STAGE1_REQUIRED).flatMap(([row, names]) =>
    names.map((name) => [row, name] as const),
  );

  it('has rows to check', () => {
    expect(entries.length).toBeGreaterThan(5);
  });

  it.each(entries)('%s names a test that exists: %s', (row, name) => {
    expect(
      allNames.has(name),
      `Gate row ${row} names a test that no source file defines:\n  ${name}\n\n` +
        'Either the test was renamed — in which case point the row at the test that now ' +
        'carries its claim, or replace it if the rename changed what it asserts — or it was ' +
        'deleted, in which case the row has no evidence and must not be left looking like it does.',
    ).toBe(true);
  });
});
