/**
 * Compile a knowledge tree into `knowledge.sqlite` (D20.2).
 *
 * Run from source at Stages 0-3 via `pnpm build:index`, and at release build
 * time later. Fitness rule F8 requires the build to be deterministic: the same
 * tree must produce the same index digest, on any platform, in any order.
 *
 * Determinism here is not a property to hope for, so nothing in this file is
 * left to chance:
 *
 *   directory listings are sorted, never trusted in filesystem order;
 *   the digest is taken over the tree's canonical logical content (D35), never
 *   over the database file, because SQLite page bytes are not stable and Stage
 *   0's qualification check 7 recorded exactly that;
 *   no clock, no locale, no environment reaches the digest.
 *
 * The digest deliberately covers what was compiled, not how it was stored, so
 * a change to the physical schema does not masquerade as a change to knowledge.
 */

import { readdirSync, readFileSync, mkdirSync, rmSync, statSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { parse as parseYaml } from 'yaml';
import {
  assetSchema,
  solutionSetSchema,
  hashFileSet,
  sha256Canonical,
  sha256Text,
  INDEX_META_KEYS,
  INDEX_SCHEMA_VERSION,
  type AssetRecord,
  type SolutionSetRecord,
} from '@ieos/core';
import { CREATE_INDEX_SQL, INDEX_JOURNAL_MODE } from './schema.ts';
import { emitUnprovenSnapshot } from './scores-snapshot.ts';

export class KnowledgeTreeError extends Error {
  readonly at: string;

  constructor(message: string, at: string) {
    super(`${at}: ${message}`);
    this.name = 'KnowledgeTreeError';
    this.at = at;
  }
}

export interface CompiledAsset {
  readonly asset: AssetRecord;
  /** The asset's body text, read from the path the record names. */
  readonly body: string;
}

export interface KnowledgeTree {
  readonly assets: readonly CompiledAsset[];
  readonly solutionSets: readonly SolutionSetRecord[];
}

export interface BuildResult {
  readonly indexDigest: string;
  readonly assetCount: number;
  readonly solutionSetCount: number;
  /** Where the index was written. */
  readonly path: string;
}

/** Files in a directory tree, relative to it, sorted for determinism. */
function walk(root: string): string[] {
  const out: string[] = [];
  const visit = (dir: string): void => {
    const entries = readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
      a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
    );
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) visit(full);
      else if (entry.isFile()) out.push(relative(root, full).split(sep).join('/'));
    }
  };
  try {
    if (!statSync(root).isDirectory()) return [];
  } catch {
    return [];
  }
  visit(root);
  return out.sort();
}

/**
 * The files `content_hash` is taken over: the body, plus everything under
 * `files/`, addressed relative to the asset directory.
 *
 * Paths are relative and `/`-separated, because a digest that embedded an
 * absolute path or a backslash would differ between machines -- which is the
 * failure D35's manifest rules exist to prevent.
 */
function assetFileSet(assetDir: string, bodyName: string): { path: string; bytes: Uint8Array }[] {
  const entries: { path: string; bytes: Uint8Array }[] = [
    { path: bodyName, bytes: new Uint8Array(readFileSync(join(assetDir, bodyName))) },
  ];
  for (const relPath of walk(join(assetDir, 'files'))) {
    entries.push({
      path: `files/${relPath}`,
      bytes: new Uint8Array(readFileSync(join(assetDir, 'files', relPath))),
    });
  }
  return entries;
}

function parseRecord<T>(
  schema: {
    safeParse(v: unknown): {
      success: boolean;
      data?: T;
      error?: { issues: { path: PropertyKey[]; message: string }[] };
    };
  },
  text: string,
  at: string,
): T {
  let raw: unknown;
  try {
    raw = parseYaml(text);
  } catch (cause) {
    throw new KnowledgeTreeError(`is not valid YAML (${String(cause)})`, at);
  }
  const result = schema.safeParse(raw);
  if (!result.success || result.data === undefined) {
    const first = result.error?.issues[0];
    throw new KnowledgeTreeError(
      `does not satisfy its contract${first ? ` (${first.path.map(String).join('.')}: ${first.message})` : ''}`,
      at,
    );
  }
  return result.data;
}

/**
 * Read and validate a knowledge tree.
 *
 * Everything is validated here, at the boundary, so an invalid asset never
 * reaches the index. An index that contains a record the contracts reject is
 * the failure the reader's revalidation exists to catch second; catching it
 * first, with the file path in the message, is what makes it fixable.
 */
export function readKnowledgeTree(root: string): KnowledgeTree {
  const assets: CompiledAsset[] = [];
  const seenIds = new Set<string>();

  for (const relPath of walk(join(root, 'assets'))) {
    if (!relPath.endsWith('/asset.yaml') && relPath !== 'asset.yaml') continue;
    const at = `knowledge/assets/${relPath}`;
    const asset = parseRecord(assetSchema, readFileSync(join(root, 'assets', relPath), 'utf8'), at);

    if (seenIds.has(asset.id)) {
      throw new KnowledgeTreeError(`duplicate asset id ${asset.id}`, at);
    }
    seenIds.add(asset.id);

    // `body` is a relative path (D20.1), not the text. Reading it here is what
    // makes the body searchable; a missing body is a broken asset, not an
    // asset with an empty body.
    const assetDir = dirname(join(root, 'assets', relPath));
    const bodyPath = join(assetDir, asset.body);
    let body: string;
    try {
      body = readFileSync(bodyPath, 'utf8');
    } catch {
      throw new KnowledgeTreeError(`names a body ${asset.body} that cannot be read`, at);
    }

    // D19 defines `content_hash` as the D35 file-set digest over `body.md` plus
    // anything under `files/`. Nothing recomputed it, so until now the field was
    // whatever the author typed -- and it is an addressing key: two assets with
    // the same `content_hash` are treated as the same content. A key nobody
    // checks is a key that will eventually be wrong.
    const observed = hashFileSet(assetFileSet(assetDir, asset.body));
    if (observed !== asset.content_hash) {
      throw new KnowledgeTreeError(
        `declares content_hash ${asset.content_hash} but its ${asset.body} and files/ hash to ` +
          `${observed} (D19, D35)`,
        at,
      );
    }

    assets.push({ asset, body });
  }

  const solutionSets: SolutionSetRecord[] = [];
  const seenSets = new Set<string>();
  for (const relPath of walk(join(root, 'solution-sets'))) {
    if (!relPath.endsWith('.yaml')) continue;
    const at = `knowledge/solution-sets/${relPath}`;
    const set = parseRecord(
      solutionSetSchema,
      readFileSync(join(root, 'solution-sets', relPath), 'utf8'),
      at,
    );
    if (seenSets.has(set.id))
      throw new KnowledgeTreeError(`duplicate solution set id ${set.id}`, at);
    seenSets.add(set.id);
    solutionSets.push(set);
  }

  // Sorted by id, so the tree's meaning does not depend on where its files sit.
  assets.sort((a, b) => (a.asset.id < b.asset.id ? -1 : a.asset.id > b.asset.id ? 1 : 0));
  solutionSets.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return { assets, solutionSets };
}

/**
 * Order-normalize the fields the builder itself treats as sets.
 *
 * `problem.capabilities` is written to `asset_capabilities` sorted, and to the
 * FTS `tags` column sorted, so two trees that differ only in the order those
 * were authored compile to the same index and must digest the same. Everything
 * else is hashed exactly as written.
 */
function normalizedAsset(asset: AssetRecord): Record<string, unknown> {
  return {
    ...asset,
    problem: { ...asset.problem, capabilities: [...asset.problem.capabilities].sort() },
  };
}

function normalizedSolutionSet(set: SolutionSetRecord): Record<string, unknown> {
  return { ...set, members: [...set.members].sort() };
}

/**
 * The D35 digest of a knowledge tree's logical content.
 *
 * Over structure, never over the database file. Stage 0's SQLite check 7
 * recorded that raw page bytes are not something to rely on, and D35 is
 * explicit that an index digest is taken over canonical structure.
 *
 * It covers the **whole record**, not a summary of it. The earlier version
 * hashed `{id, content_hash, body_hash}` per asset, which was wrong in a way
 * that a green build could never surface: `content_hash` is defined over
 * `body.md` and `files/` (D19), so `title`, `summary`, `status`, `problem_id`
 * and `problem.capabilities` could all change -- changing what is written to
 * SQLite, and what the Stage 2 resolver ranks on -- while the digest stood
 * still. `index_digest` is an input to every `context_snapshot_id` (T-05), so
 * that meant a decision could cite an index state it did not actually see.
 *
 * The rule now is simply: if it reaches the index, it reaches the digest.
 */
export function knowledgeTreeDigest(tree: KnowledgeTree): string {
  return sha256Canonical({
    schema_version: INDEX_SCHEMA_VERSION,
    assets: tree.assets.map((entry) => ({
      record: normalizedAsset(entry.asset),
      // The body is part of what was compiled, so a body edit changes the
      // index digest even when the record around it does not.
      body_hash: sha256Text(entry.body),
    })),
    solution_sets: tree.solutionSets.map(normalizedSolutionSet),
  });
}

/** The minimal writable-database surface the builder uses. */
export interface WritableDatabase {
  exec(sql: string): void;
  prepare(sql: string): { run(...params: unknown[]): unknown };
  close(): void;
}

export interface BuildOptions {
  /** Root of the knowledge tree, e.g. `<repo>/knowledge`. */
  readonly knowledgeRoot: string;
  /** Where to write the compiled index. Overwritten if it exists. */
  readonly outputPath: string;
  /** Injected so the builder is testable without a real database. */
  readonly openWritable: (path: string) => WritableDatabase;
}

/** Compile a knowledge tree into an index file. */
export function buildIndex(options: BuildOptions): BuildResult {
  const tree = readKnowledgeTree(options.knowledgeRoot);
  const digest = knowledgeTreeDigest(tree);

  // A stale file left in place would be indistinguishable from a fresh build
  // that happened to produce the same rows.
  rmSync(options.outputPath, { force: true });
  rmSync(`${options.outputPath}-wal`, { force: true });
  rmSync(`${options.outputPath}-shm`, { force: true });
  mkdirSync(dirname(options.outputPath), { recursive: true });

  const db = options.openWritable(options.outputPath);
  try {
    db.exec(`pragma journal_mode=${INDEX_JOURNAL_MODE}`);
    for (const statement of CREATE_INDEX_SQL) db.exec(statement);

    const insertAsset = db.prepare(
      `insert into assets (id, type, slug, title, summary, status, problem_id,
         solution_set_id, content_hash, record_json) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const insertCapability = db.prepare(
      'insert into asset_capabilities (asset_id, capability_id) values (?, ?)',
    );
    const insertFts = db.prepare(
      'insert into assets_fts (asset_id, title, summary, tags, body) values (?, ?, ?, ?, ?)',
    );

    for (const { asset, body } of tree.assets) {
      insertAsset.run(
        asset.id,
        asset.type,
        asset.slug,
        asset.title,
        asset.summary,
        asset.status,
        asset.problem.id,
        asset.solution_set_id,
        asset.content_hash,
        JSON.stringify(asset),
      );
      // Sorted, so the physical row order of a set-valued field is fixed too.
      for (const capability of [...asset.problem.capabilities].sort()) {
        insertCapability.run(asset.id, capability);
      }
      insertFts.run(
        asset.id,
        asset.title,
        asset.summary,
        [...asset.problem.capabilities].sort().join(' '),
        body,
      );
    }

    const insertSet = db.prepare(
      `insert into solution_sets (id, problem_id, canonical_state, champion_id, record_json)
         values (?, ?, ?, ?, ?)`,
    );
    const insertMember = db.prepare(
      'insert into solution_set_members (solution_set_id, asset_id) values (?, ?)',
    );
    for (const set of tree.solutionSets) {
      insertSet.run(
        set.id,
        set.problem_id,
        set.canonical_state,
        set.champion_id,
        JSON.stringify(set),
      );
      for (const member of [...set.members].sort()) insertMember.run(set.id, member);
    }

    // The bootstrap snapshot ships inside the index (D24, Q-02) so `resolve`
    // has something to read offline, and it says UNPROVEN in its own data.
    const snapshot = emitUnprovenSnapshot(tree.assets.map((entry) => entry.asset.id));

    const insertMeta = db.prepare('insert into meta (key, value) values (?, ?)');
    insertMeta.run(INDEX_META_KEYS.schemaVersion, INDEX_SCHEMA_VERSION);
    insertMeta.run(INDEX_META_KEYS.indexDigest, digest);
    insertMeta.run(INDEX_META_KEYS.scoreSnapshot, JSON.stringify(snapshot.snapshot));
    insertMeta.run(INDEX_META_KEYS.builtFrom, options.knowledgeRoot.split(sep).join('/'));
  } finally {
    db.close();
  }

  return {
    indexDigest: digest,
    assetCount: tree.assets.length,
    solutionSetCount: tree.solutionSets.length,
    path: options.outputPath,
  };
}
