/**
 * Knowledge-index precondition for the Stage 3 canary and trials.
 *
 * The MCP server a trial starts opens `knowledge.sqlite` read-only and refuses to
 * serve without it. That file is a gitignored build artifact, so a fresh checkout
 * does not have one; without this check the full preflight could report READY
 * while every `resolve` in the canary is certain to fail.
 */

import { existsSync } from 'node:fs';
import { IndexUnavailableError, SqliteKnowledgeIndex } from '@ieos/store-sqlite';

export type KnowledgeIndexPreflight =
  | { readonly ok: true; readonly indexDigest: string }
  | { readonly ok: false; readonly reason: string };

const REBUILD = 'Build it on this host with `pnpm build:index` at the HEAD you will qualify.';

export async function inspectKnowledgeIndex(path: string): Promise<KnowledgeIndexPreflight> {
  if (!existsSync(path)) {
    return { ok: false, reason: `no knowledge index at ${path}. ${REBUILD}` };
  }
  try {
    const index = await SqliteKnowledgeIndex.open(path);
    try {
      return { ok: true, indexDigest: await index.indexDigest() };
    } finally {
      index.close();
    }
  } catch (error) {
    const detail =
      error instanceof IndexUnavailableError
        ? error.message
        : error instanceof Error
          ? error.message
          : String(error);
    return {
      ok: false,
      reason: `the knowledge index at ${path} is unusable: ${detail} ${REBUILD}`,
    };
  }
}
