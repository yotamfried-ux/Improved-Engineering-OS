/**
 * Writes `contracts/schemas/*.schema.json` from `@ieos/core`.
 *
 * This lives outside `core` because `core` performs no I/O (F1, ADR-0004).
 * `core` produces the schema documents; this module puts them on disk.
 */

import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { emitContractSchemas, serializeSchemaDocument } from '@ieos/core';

export interface SchemaFile {
  readonly fileName: string;
  readonly content: string;
}

/** The full set of schema files, in deterministic order. */
export function renderSchemaFiles(): readonly SchemaFile[] {
  return emitContractSchemas().map((schema) => ({
    fileName: schema.fileName,
    content: serializeSchemaDocument(schema.document),
  }));
}

export type CheckResult =
  | { readonly ok: true }
  | {
      readonly ok: false;
      /** Files whose committed content differs from what emission produces. */
      readonly changed: readonly string[];
      /** Files emission produces that are not committed. */
      readonly missing: readonly string[];
      /** Committed files emission no longer produces. */
      readonly extra: readonly string[];
    };

/**
 * Compare the committed schemas with freshly emitted ones.
 *
 * Any difference fails. The Stage 0 exit gate requires `contracts/schemas/` to
 * regenerate with no diff, which is only a meaningful determinism check if the
 * comparison is on exact bytes.
 */
export function checkSchemas(outDir: string): CheckResult {
  const rendered = renderSchemaFiles();
  const expected = new Map(rendered.map((file) => [file.fileName, file.content]));

  let committed: string[] = [];
  try {
    committed = readdirSync(outDir).filter((name) => name.endsWith('.schema.json'));
  } catch {
    committed = [];
  }

  const changed: string[] = [];
  const missing: string[] = [];
  for (const [fileName, content] of expected) {
    if (!committed.includes(fileName)) {
      missing.push(fileName);
      continue;
    }
    if (readFileSync(join(outDir, fileName), 'utf8') !== content) {
      changed.push(fileName);
    }
  }
  const extra = committed.filter((name) => !expected.has(name));

  if (changed.length === 0 && missing.length === 0 && extra.length === 0) {
    return { ok: true };
  }
  return { ok: false, changed, missing, extra };
}

/**
 * Write the schemas, removing any stale file first.
 *
 * Stale removal matters: a renamed contract would otherwise leave its old schema
 * behind, and something downstream would keep validating against a contract that
 * no longer exists.
 */
export function writeSchemas(outDir: string): readonly string[] {
  mkdirSync(outDir, { recursive: true });
  const rendered = renderSchemaFiles();
  const expected = new Set(rendered.map((file) => file.fileName));

  for (const name of readdirSync(outDir)) {
    if (name.endsWith('.schema.json') && !expected.has(name)) {
      rmSync(join(outDir, name));
    }
  }
  for (const file of rendered) {
    writeFileSync(join(outDir, file.fileName), file.content, 'utf8');
  }
  return rendered.map((file) => file.fileName);
}
