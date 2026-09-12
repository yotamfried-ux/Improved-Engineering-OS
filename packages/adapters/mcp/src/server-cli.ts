/**
 * `ieos-mcp` -- the composition root for the MCP server.
 *
 * This path is what `ieos init` writes into `.mcp.json` and `.codex/config.toml`,
 * so it is named to the repository's `*-cli.ts` convention and a test asserts the
 * footprint points at a file that exists.
 *
 * Everything impure lives here: the filesystem, `git`, the environment, the
 * process's own stdio. `server.ts` and `handlers.ts` above it take their world
 * as arguments, which is what lets the conformance smoke exercise the real
 * protocol against a fixture instead of a checkout.
 *
 * Note what this file does NOT do: invent a value for a fact it cannot observe.
 * `repo_sha` comes from `git` or the call fails; the Project Profile digest and
 * the capability snapshot are declared `unobserved:` with the stage that will
 * supply them. Those declarations are hashed into `context_snapshot_id` and
 * handed back by `inspect`, so a snapshot from this stage can never be mistaken
 * for one taken when those inputs were real.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve as resolvePath } from 'node:path';
import { sha256Text } from '@ieos/core';
import { IndexUnavailableError, SqliteKnowledgeIndex } from '@ieos/store-sqlite';
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

function gitHeadSha(cwd: string): string | null {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd, encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

function profileDigest(root: string): string {
  // `.ieos/profile.yaml` is part of the D18.4 footprint `ieos init` writes. The
  // Profile's own contract is designed at Stage 6, so what is digested here is
  // the file as it stands -- honest about what it covers, and stable enough
  // that a Profile edit changes the snapshot id.
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
    // The change scope is what the agent is about to touch. Nothing computes it
    // at this stage, and an empty list says exactly that: no scope declared.
    change_scope: [],
    capability_snapshot_hash: unobserved(
      'capability-snapshot',
      'the capability registry is seeded at Stage 2',
    ),
    // Not a release version: this runtime is running from a source checkout,
    // and D24 release pinning arrives at Stage 4.
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

  const store = new Map<string, ContextSnapshot>();
  // `--ranking-mode recorded` is how a Stage 3 trial pins its ranking: the agent
  // cannot opt back into the live overlay, so two trials of one task stay
  // comparable however the scores moved between them.
  const pinned = flag('--ranking-mode');
  if (pinned !== undefined && pinned !== 'recorded' && pinned !== 'live_overlay') {
    process.stderr.write(`--ranking-mode must be "recorded" or "live_overlay", not "${pinned}"\n`);
    return 64;
  }
  serveIeosMcp(
    // Staging is null at Stage 1: `observe` refuses rather than accepting a
    // write that would reach nothing (T-04, D22).
    {
      index,
      facts: observed,
      staging: null,
      ...(pinned === undefined ? {} : { pinnedRankingMode: pinned }),
    },
    store,
    // stderr, never stdout: stdout is the protocol's wire.
    { onerror: (error) => process.stderr.write(`${error.message}\n`) },
  );
  return 0;
}

const code = await main();
if (code !== 0) process.exit(code);
