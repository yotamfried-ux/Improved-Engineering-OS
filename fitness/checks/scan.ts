/**
 * Shared machinery for the scoped source scans (ADR-0004, mechanism 2).
 *
 * Deliberately small and dependency-free beyond `yaml`: a fitness check that
 * needed a build step would stop running the moment the build broke, which is
 * exactly when it matters most.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

export const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

const ALWAYS_SKIPPED = new Set(['node_modules', 'dist', '.git', 'coverage']);

export interface SourceFile {
  /** Repository-relative POSIX path. */
  readonly path: string;
  readonly content: string;
}

/**
 * Read every text file under `roots`, relative to the repository.
 *
 * Missing roots are skipped rather than treated as an error: several fitness
 * rules are deliberately armed before the directory they guard exists.
 */
export function readSourceFiles(
  roots: readonly string[],
  options: { readonly extensions?: readonly string[]; readonly exclude?: readonly string[] } = {},
): readonly SourceFile[] {
  const extensions = options.extensions ?? [
    '.ts',
    '.tsx',
    '.js',
    '.mjs',
    '.cjs',
    '.json',
    '.yaml',
    '.yml',
    '.sql',
  ];
  const exclude = options.exclude ?? [];
  const files: SourceFile[] = [];

  const walk = (absolute: string): void => {
    let entries;
    try {
      entries = readdirSync(absolute, { withFileTypes: true });
    } catch {
      return; // the directory does not exist yet
    }
    for (const entry of entries) {
      if (ALWAYS_SKIPPED.has(entry.name)) continue;
      const full = join(absolute, entry.name);
      const rel = toPosix(relative(REPO_ROOT, full));
      if (exclude.some((prefix) => rel === prefix || rel.startsWith(`${prefix}/`))) continue;
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (!extensions.some((extension) => entry.name.endsWith(extension))) continue;
      files.push({ path: rel, content: readFileSync(full, 'utf8') });
    }
  };

  for (const root of roots) {
    const absolute = join(REPO_ROOT, root);
    try {
      if (statSync(absolute).isDirectory()) walk(absolute);
      else files.push({ path: toPosix(root), content: readFileSync(absolute, 'utf8') });
    } catch {
      // Root not present yet; the rule stays armed.
    }
  }
  return files;
}

export function toPosix(value: string): string {
  return sep === '/' ? value : value.split(sep).join('/');
}

export function exists(relativePath: string): boolean {
  try {
    statSync(join(REPO_ROOT, relativePath));
    return true;
  } catch {
    return false;
  }
}

export function loadYaml<T>(relativePath: string): T {
  return parse(readFileSync(join(REPO_ROOT, relativePath), 'utf8')) as T;
}

export interface Violation {
  readonly path: string;
  readonly line: number;
  readonly excerpt: string;
}

/**
 * Find every line matching `pattern`.
 *
 * Returns the file, the line number and the matching text, because a fitness
 * failure that says only "F9 failed" costs the reader a search.
 */
export function findMatches(files: readonly SourceFile[], pattern: RegExp): Violation[] {
  const violations: Violation[] = [];
  for (const file of files) {
    const lines = file.content.split('\n');
    for (const [index, line] of lines.entries()) {
      // Fresh regex per line so a /g pattern's lastIndex cannot skip a match.
      if (new RegExp(pattern.source, pattern.flags.replace('g', '')).test(line)) {
        violations.push({ path: file.path, line: index + 1, excerpt: line.trim().slice(0, 160) });
      }
    }
  }
  return violations;
}

export function describe(violations: readonly Violation[]): string {
  return violations.map((v) => `  ${v.path}:${String(v.line)}  ${v.excerpt}`).join('\n');
}

/**
 * Strip line and block comments, keeping line numbering intact.
 *
 * F1's wording is "contains no `claude`, `codex`, `anthropic`, `openai`,
 * `supabase` identifiers". An identifier is code. A comment explaining that
 * `store-supabase` implements a port is architectural documentation, and
 * forbidding it would push the architecture out of the code that implements it.
 *
 * Blank lines replace stripped content so a violation still reports the line it
 * is on.
 */
export function stripComments(file: SourceFile): SourceFile {
  const withoutBlocks = file.content.replace(/\/\*[\s\S]*?\*\//gu, (block) =>
    '\n'.repeat((block.match(/\n/gu) ?? []).length),
  );
  const withoutLines = withoutBlocks
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/u, ''))
    .join('\n');
  return { path: file.path, content: withoutLines };
}

export function stripAllComments(files: readonly SourceFile[]): readonly SourceFile[] {
  return files.map(stripComments);
}
