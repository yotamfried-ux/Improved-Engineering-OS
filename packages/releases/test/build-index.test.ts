/**
 * The knowledge index builder (D20.2), and above all its determinism (F8).
 *
 * F8 says the same inputs produce the same digests. That is the property the
 * whole release story rests on -- `index_digest` is part of every
 * `context_snapshot_id` (T-05), so a build that wobbled would make decisions
 * unreproducible long after the fact, in a way nothing would flag at the time.
 *
 * So determinism is tested from several directions rather than once: repeated
 * builds, shuffled filesystem order, and the specific things that must and must
 * not move the digest.
 */

import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { stringify as toYaml } from 'yaml';
import { hashFileSet } from '@ieos/core';
import {
  buildIndex,
  knowledgeTreeDigest,
  KnowledgeTreeError,
  readKnowledgeTree,
} from '../src/index.ts';

const LIFECYCLE = {
  schema_version: '1',
  stability: 'development',
  introduced_in: '0.1.0',
  deprecated_in: null,
  replacement: null,
  migration_path: null,
};

const anAsset = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  ...LIFECYCLE,
  id: 'asset_alpha',
  type: 'pattern',
  slug: 'alpha',
  title: 'OAuth 2.1 PKCE for browser apps',
  summary: 'Authorization code flow with PKCE for a browser client.',
  status: 'active',
  content_hash: `sha256:${'a'.repeat(64)}`,
  legacy_ids: [],
  problem: { id: 'problem.auth.browser-login', capabilities: ['auth.oauth.pkce'] },
  solution_set_id: 'solset_alpha',
  applicability: { conditions: [] },
  compatibility: { platforms: ['web'], providers: [], constraints: [] },
  provenance: [
    {
      source_type: 'existing_eos',
      source_identity: 'yotamfried-ux/Engineering-OS',
      source_revision: 'b'.repeat(40),
      observed_at: '2026-09-05T00:00:00.000Z',
      integrity: 'verified',
    },
  ],
  freshness: { class: 'normal', last_verified_at: '2026-09-05T00:00:00.000Z' },
  risk: { execution_authority: 'data_only', blast_radius: 'read_only' },
  relationships: { supersedes: [], superseded_by: [], related_to: [] },
  evidence_policy: { eligible_origins: ['qualification', 'operational'] },
  body: 'body.md',
  files: [],
  ...over,
});

const aSolutionSet = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  ...LIFECYCLE,
  id: 'solset_alpha',
  problem_id: 'problem.auth.browser-login',
  compatibility_key: 'web',
  members: ['asset_alpha'],
  canonical_state: 'unresolved',
  champion_id: null,
  champion_since_release: null,
  why_unresolved: 'no evidence yet',
  ...over,
});

const scratch: string[] = [];
afterEach(() => {
  for (const dir of scratch.splice(0)) {
    rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
});

interface TreeSpec {
  readonly assets?: {
    record: Record<string, unknown>;
    slugDir: string;
    body?: string;
    /** Extra files under `files/`, so `content_hash` covers more than the body. */
    files?: Record<string, string>;
    /**
     * Keep the record's declared `content_hash` instead of computing the real
     * one. Only the test that proves a false hash is rejected sets this.
     */
    keepContentHash?: boolean;
  }[];
  readonly solutionSets?: Record<string, unknown>[];
}

function writeTree(spec: TreeSpec = {}): string {
  const root = mkdtempSync(join(tmpdir(), 'ieos-knowledge-'));
  scratch.push(root);
  const assets = spec.assets ?? [{ record: anAsset(), slugDir: 'pattern/alpha' }];
  for (const entry of assets) {
    const dir = join(root, 'assets', entry.slugDir);
    mkdirSync(dir, { recursive: true });
    const body = entry.body ?? '# Body\n\nUse a code_verifier.\n';
    writeFileSync(join(dir, 'body.md'), body, 'utf8');

    const fileSet = [{ path: 'body.md', bytes: new TextEncoder().encode(body) }];
    for (const [name, content] of Object.entries(entry.files ?? {})) {
      const target = join(dir, 'files', name);
      mkdirSync(join(target, '..'), { recursive: true });
      writeFileSync(target, content, 'utf8');
      fileSet.push({ path: `files/${name}`, bytes: new TextEncoder().encode(content) });
    }

    // The builder verifies `content_hash` against what is on disk (D19), so the
    // fixture computes the real one. The only test that does not is the one
    // proving a false hash is rejected.
    const record = entry.keepContentHash
      ? entry.record
      : { ...entry.record, content_hash: hashFileSet(fileSet) };
    writeFileSync(join(dir, 'asset.yaml'), toYaml(record), 'utf8');
  }
  const sets = spec.solutionSets ?? [aSolutionSet()];
  mkdirSync(join(root, 'solution-sets'), { recursive: true });
  for (const set of sets) {
    writeFileSync(join(root, 'solution-sets', `${String(set['id'])}.yaml`), toYaml(set), 'utf8');
  }
  return root;
}

function build(root: string): { digest: string; path: string } {
  const outDir = mkdtempSync(join(tmpdir(), 'ieos-out-'));
  scratch.push(outDir);
  const path = join(outDir, 'knowledge.sqlite');
  const result = buildIndex({
    knowledgeRoot: root,
    outputPath: path,
    openWritable: (p) => new DatabaseSync(p),
  });
  return { digest: result.indexDigest, path };
}

describe('reading a knowledge tree', () => {
  it('reads assets with their body text', () => {
    const tree = readKnowledgeTree(writeTree());
    expect(tree.assets).toHaveLength(1);
    expect(tree.assets[0]?.asset.id).toBe('asset_alpha');
    expect(tree.assets[0]?.body).toContain('code_verifier');
  });

  it('returns an empty tree rather than failing when there is no knowledge yet', () => {
    // Stage 1 has no assets. An empty tree is a legitimate state, not an error,
    // and `resolve` answering "nothing" is different from `resolve` crashing.
    const root = mkdtempSync(join(tmpdir(), 'ieos-empty-'));
    scratch.push(root);
    const tree = readKnowledgeTree(root);
    expect(tree.assets).toEqual([]);
    expect(tree.solutionSets).toEqual([]);
  });

  it('sorts assets and solution sets by id, not by where their files sit', () => {
    const tree = readKnowledgeTree(
      writeTree({
        assets: [
          { record: anAsset({ id: 'asset_zulu', slug: 'z' }), slugDir: 'aaa-first-on-disk' },
          { record: anAsset({ id: 'asset_alpha', slug: 'a' }), slugDir: 'zzz-last-on-disk' },
        ],
      }),
    );
    expect(tree.assets.map((a) => a.asset.id)).toEqual(['asset_alpha', 'asset_zulu']);
  });
});

describe('the tree is validated at the boundary, with the file named', () => {
  it('rejects an asset that does not satisfy its contract, and says where', () => {
    const root = writeTree({
      assets: [{ record: anAsset({ summary: '' }), slugDir: 'pattern/bad' }],
    });
    expect(() => readKnowledgeTree(root)).toThrow(KnowledgeTreeError);
    expect(() => readKnowledgeTree(root)).toThrow(/pattern\/bad/u);
  });

  it('rejects malformed YAML rather than compiling a partial tree', () => {
    const root = writeTree();
    writeFileSync(join(root, 'assets', 'pattern/alpha', 'asset.yaml'), 'id: [unclosed\n', 'utf8');
    expect(() => readKnowledgeTree(root)).toThrow(/not valid YAML/u);
  });

  it('rejects a duplicate asset id', () => {
    const root = writeTree({
      assets: [
        { record: anAsset(), slugDir: 'pattern/one' },
        { record: anAsset(), slugDir: 'pattern/two' },
      ],
    });
    expect(() => readKnowledgeTree(root)).toThrow(/duplicate asset id/u);
  });

  it('rejects an asset whose declared content_hash is not the one its files produce', () => {
    // `content_hash` is an addressing key (D19): equal hashes mean "the same
    // content" to the importer and the resolver. Until it was checked it was
    // just a string somebody typed, and a wrong one silently claims identity
    // with content it does not have.
    expect(() =>
      readKnowledgeTree(
        writeTree({
          assets: [
            {
              record: anAsset({ content_hash: `sha256:${'f'.repeat(64)}` }),
              slugDir: 'p/a',
              keepContentHash: true,
            },
          ],
        }),
      ),
    ).toThrow(KnowledgeTreeError);
  });

  it('counts files/ in content_hash, not just the body', () => {
    // D19 says body.md *plus anything under* files/. A verification that only
    // covered the body would accept an asset whose attachments had been swapped.
    const withoutFiles = readKnowledgeTree(writeTree());
    const withFiles = readKnowledgeTree(
      writeTree({ assets: [{ record: anAsset(), slugDir: 'p/a', files: { 'a.md': 'attached' } }] }),
    );
    expect(withFiles.assets[0]?.asset.content_hash).not.toBe(
      withoutFiles.assets[0]?.asset.content_hash,
    );
  });

  it('rejects an asset whose body cannot be read', () => {
    // A missing body is a broken asset, not an asset with an empty body: it
    // would silently become unsearchable while looking perfectly valid.
    const root = writeTree();
    rmSync(join(root, 'assets', 'pattern/alpha', 'body.md'));
    expect(() => readKnowledgeTree(root)).toThrow(/body body\.md that cannot be read/u);
  });
});

describe('determinism (fitness F8)', () => {
  it('produces the same digest when built twice', () => {
    const root = writeTree();
    expect(build(root).digest).toBe(build(root).digest);
  });

  it('produces the same digest regardless of where files sit on disk', () => {
    const record = anAsset();
    const a = writeTree({ assets: [{ record, slugDir: 'pattern/alpha' }] });
    const b = writeTree({ assets: [{ record, slugDir: 'zzz/deeply/nested/elsewhere' }] });
    expect(build(a).digest).toBe(build(b).digest);
  });

  it('changes the digest when the asset content changes', () => {
    // `content_hash` is now computed from the files rather than declared, so
    // this changes the files -- which is what "the content changed" means.
    const before = build(writeTree()).digest;
    const after = build(
      writeTree({
        assets: [{ record: anAsset(), slugDir: 'p/a', files: { 'extra.md': 'more' } }],
      }),
    ).digest;
    expect(after).not.toBe(before);
  });

  // --- The metadata the index actually stores ------------------------------
  //
  // `content_hash` covers `body.md` and `files/` (D19). It says nothing about
  // title, summary, capabilities, status or problem id -- all of which the
  // builder writes into SQLite and the Stage 2 resolver will rank on. A digest
  // that moved only with `content_hash` would let the index change underneath a
  // `context_snapshot_id` that claims to identify it.

  it('changes the digest when only the TITLE changes', () => {
    const before = build(writeTree()).digest;
    const after = build(
      writeTree({
        assets: [{ record: anAsset({ title: 'A different title entirely' }), slugDir: 'p/a' }],
      }),
    ).digest;
    expect(after).not.toBe(before);
  });

  it('changes the digest when only a CAPABILITY changes', () => {
    const before = build(writeTree()).digest;
    const after = build(
      writeTree({
        assets: [
          {
            record: anAsset({
              problem: { id: 'problem.auth.browser-login', capabilities: ['auth.oauth.device'] },
            }),
            slugDir: 'p/a',
          },
        ],
      }),
    ).digest;
    expect(after).not.toBe(before);
  });

  it('changes the digest when only the STATUS changes', () => {
    const before = build(writeTree()).digest;
    const after = build(
      writeTree({ assets: [{ record: anAsset({ status: 'deprecated' }), slugDir: 'p/a' }] }),
    ).digest;
    expect(after).not.toBe(before);
  });

  it('changes the digest when only SOLUTION SET metadata changes', () => {
    const before = build(writeTree()).digest;
    const after = build(
      writeTree({ solutionSets: [aSolutionSet({ why_unresolved: 'a different reason' })] }),
    ).digest;
    expect(after).not.toBe(before);
  });

  it('changes the digest when only the SUMMARY changes', () => {
    const before = build(writeTree()).digest;
    const after = build(
      writeTree({
        assets: [{ record: anAsset({ summary: 'Something else entirely.' }), slugDir: 'p/a' }],
      }),
    ).digest;
    expect(after).not.toBe(before);
  });

  it('changes the digest when only the PROBLEM ID changes', () => {
    const before = build(writeTree()).digest;
    const after = build(
      writeTree({
        assets: [
          {
            record: anAsset({
              problem: { id: 'problem.other', capabilities: ['auth.oauth.pkce'] },
            }),
            slugDir: 'p/a',
          },
        ],
      }),
    ).digest;
    expect(after).not.toBe(before);
  });

  it('changes the digest when only the BODY changes', () => {
    // The body is part of what was compiled and is searchable, so an edit to it
    // is a change to the index even though the record around it is untouched.
    const before = build(writeTree()).digest;
    const after = build(
      writeTree({ assets: [{ record: anAsset(), slugDir: 'p/a', body: 'different' }] }),
    ).digest;
    expect(after).not.toBe(before);
  });

  it('is a digest over logical content, not over the database file', () => {
    // D35, and Stage 0's SQLite check 7: raw page bytes are not stable enough
    // to be an identity. Two builds of the same tree must agree on the digest
    // whether or not the files happen to be byte-identical.
    const root = writeTree();
    const first = build(root);
    const second = build(root);
    expect(second.digest).toBe(first.digest);
    expect(knowledgeTreeDigest(readKnowledgeTree(root))).toBe(first.digest);
  });
});

describe('the compiled index carries what a reader needs', () => {
  it('writes meta, assets, capabilities, solution sets and the FTS table', () => {
    const { path, digest } = build(writeTree());
    const db = new DatabaseSync(path, { readOnly: true });

    const meta = Object.fromEntries(
      db
        .prepare('select key, value from meta')
        .all()
        .map((r) => [r['key'], r['value']]),
    );
    expect(meta['schema_version']).toBe('1');
    expect(meta['index_digest']).toBe(digest);

    expect(db.prepare('select count(*) as n from assets').get()?.['n']).toBe(1);
    expect(db.prepare('select count(*) as n from asset_capabilities').get()?.['n']).toBe(1);
    expect(db.prepare('select count(*) as n from solution_sets').get()?.['n']).toBe(1);
    expect(db.prepare('select count(*) as n from solution_set_members').get()?.['n']).toBe(1);
    expect(
      db
        .prepare("select count(*) as n from assets_fts where assets_fts match 'code_verifier'")
        .get()?.['n'],
    ).toBe(1);
    db.close();
  });

  it('ships the bootstrap snapshot, and it says UNPROVEN', () => {
    const { path } = build(writeTree());
    const db = new DatabaseSync(path, { readOnly: true });
    const raw = db.prepare("select value from meta where key = 'score_snapshot'").get();
    const snapshot = JSON.parse(String(raw?.['value'])) as {
      state: string;
      computed_at: string | null;
      assets: { id: string; evidence_count: number }[];
    };
    expect(snapshot.state).toBe('UNPROVEN');
    expect(snapshot.computed_at).toBeNull();
    expect(snapshot.assets.every((a) => a.evidence_count === 0)).toBe(true);
    db.close();
  });

  it('leaves no WAL sidecars, so "the index" is one file', () => {
    // journal_mode=delete is deliberate for a shipped artifact: sidecars would
    // make the thing being digested ambiguous.
    const { path } = build(writeTree());
    for (const sidecar of [`${path}-wal`, `${path}-shm`]) {
      expect(() => readFileSync(sidecar)).toThrow();
    }
  });

  it('overwrites a previous index rather than appending to it', () => {
    const root = writeTree();
    const first = build(root);
    const again = buildIndex({
      knowledgeRoot: root,
      outputPath: first.path,
      openWritable: (p) => new DatabaseSync(p),
    });
    const db = new DatabaseSync(first.path, { readOnly: true });
    expect(db.prepare('select count(*) as n from assets').get()?.['n']).toBe(1);
    db.close();
    expect(again.indexDigest).toBe(first.digest);
  });
});
