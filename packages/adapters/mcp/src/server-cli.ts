/**
 * `ieos-mcp` -- the composition root for the MCP server.
 *
 * Canonical knowledge remains read-only. Runtime evidence is written only to the
 * local SQLite staging database, which the hook flusher syncs through the
 * credential-isolated ingest proxy at terminal boundaries.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve as resolvePath } from 'node:path';
import { sha256Text } from '@ieos/core';
import {
  IndexUnavailableError,
  openOutbox,
  SqliteEvidenceDocuments,
  SqliteKnowledgeIndex,
} from '@ieos/store-sqlite';
import { serveIeosMcp } from './serve.ts';
import { unobserved, type RuntimeFacts } from '@ieos/resolver';
import { SERVER_VERSION } from './server.ts';
import type { ContextSnapshot } from '@ieos/resolver';

const args = process.argv.slice(2);
const flag = (name: string): string | undefined => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};

const repoRoot = resolvePath(flag('--eos-root') ?? process.cwd());
const projectRoot = resolvePath(flag('--project') ?? process.cwd());
const indexPath = flag('--index') ?? join(repoRoot, 'knowledge.sqlite');
const runtimeDbPath = flag('--outbox') ?? join(projectRoot, '.ieos', 'outbox.sqlite');

function gitHeadSha(cwd: string): string | null {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd, encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

function profileDigest(root: string): string {
  const path = join(root, '.ieos', 'profile.yaml');
  if (!existsSync(path)) {
    return unobserved('project-profile', 'no .ieos/profile.yaml; run `ieos init` in the project');
  }
  return sha256Text(readFileSync(path, 'utf8'));
}

function facts(): RuntimeFacts | { readonly error: string } {
  const sha = gitHeadSha(projectRoot);
  if (sha === null) {
    return {
      error:
        `could not read the project's HEAD commit with \`git rev-parse HEAD\` in ${projectRoot}. ` +
        'Every context_snapshot_id is bound to a commit (D25); this runtime will not hash a ' +
        'placeholder in its place.',
    };
  }
  return {
    repo_sha: sha,
    profile_status_digest: profileDigest(projectRoot),
    change_scope: [],
    capability_snapshot_hash: unobserved(
      'capability-snapshot',
      'the capability registry is seeded at Stage 2',
    ),
    eos_release: `source:${SERVER_VERSION}`,
  };
}

async function main(): Promise<number> {
  const observed = facts();
  if ('error' in observed) {
    process.stderr.write(`${observed.error}\n`);
    return 3;
  }

  let index: SqliteKnowledgeIndex;
  try {
    index = await SqliteKnowledgeIndex.open(indexPath);
  } catch (error) {
    const detail =
      error instanceof IndexUnavailableError
        ? error.message
        : `could not open the index: ${String(error)}`;
    process.stderr.write(`${detail}\n`);
    return 3;
  }

  mkdirSync(dirname(runtimeDbPath), { recursive: true });
  const runtimeDb = await openOutbox(runtimeDbPath);
  const evidence = new SqliteEvidenceDocuments(runtimeDb);
  process.once('exit', () => runtimeDb.close());

  const store = new Map<string, ContextSnapshot>();
  const pinned = flag('--ranking-mode');
  if (pinned !== undefined && pinned !== 'recorded' && pinned !== 'live_overlay') {
    process.stderr.write(`--ranking-mode must be "recorded" or "live_overlay", not "${pinned}"\n`);
    runtimeDb.close();
    return 64;
  }

  serveIeosMcp(
    {
      index,
      facts: observed,
      staging: evidence,
      snapshots: evidence,
      ...(pinned === undefined ? {} : { pinnedRankingMode: pinned }),
    },
    store,
    { onerror: (error) => process.stderr.write(`${error.message}\n`) },
  );
  return 0;
}

const code = await main();
if (code !== 0) process.exit(code);
