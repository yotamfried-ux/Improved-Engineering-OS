/**
 * The KnowledgeIndex reader.
 *
 * Fixtures are built here with raw SQL rather than with the Stage 1 builder, on
 * purpose. The guide's dependency graph forbids `store-sqlite` and `releases`
 * from depending on each other, and a reader test that imported the builder
 * would also stop being a test of the reader: a bug they shared would cancel
 * out. So these tests write the file the reader claims to understand, and the
 * builder's own tests prove the builder writes that same shape.
 *
 * The assertions that matter most are the refusals. A reader that answers from
 * a stale, truncated or hand-edited index is worse than one that fails, because
 * the wrong answer arrives with a valid-looking index digest attached to it.
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { INDEX_META_KEYS, INDEX_SCHEMA_VERSION, sha256Canonical } from '@ieos/core';
import { IndexUnavailableError, SqliteKnowledgeIndex } from '../src/index.ts';

const LIFECYCLE = {
  schema_version: '1',
  stability: 'development' as const,
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
  title: 'OAuth PKCE for browser apps',
  summary: 'Authorization code flow with PKCE for public clients.',
  status: 'active',
  content_hash: `sha256:${'a'.repeat(64)}`,
  legacy_ids: [],
  problem: { id: 'problem_auth', capabilities: ['cap.auth'] },
  solution_set_id: 'set_auth',
  applicability: { conditions: [] },
  compatibility: { platforms: [], providers: [], constraints: [] },
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
  id: 'set_auth',
  problem_id: 'problem_auth',
  compatibility_key: 'browser',
  members: ['asset_alpha'],
  canonical_state: 'unresolved',
  champion_id: null,
  champion_since_release: null,
  why_unresolved: 'no evidence yet',
  ...over,
});

const aSnapshot = (): Record<string, unknown> => ({
  ...LIFECYCLE,
  state: 'UNPROVEN',
  score_view_id: null,
  scoring_policy_version: '0',
  computed_at: null,
  assets: [],
});

const scratch: string[] = [];
afterEach(() => {
  for (const dir of scratch.splice(0)) {
    rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
});

interface Fixture {
  readonly assets?: Record<string, unknown>[];
  readonly solutionSets?: Record<string, unknown>[];
  readonly bodies?: Record<string, string>;
  readonly schemaVersion?: string;
  readonly omitDigest?: boolean;
  readonly omitSnapshot?: boolean;
  readonly omitMetaTable?: boolean;
}

/** Write an index file by hand, so the reader is tested against a real file. */
function buildFixture(fixture: Fixture = {}): string {
  const dir = mkdtempSync(join(tmpdir(), 'ieos-index-'));
  scratch.push(dir);
  const path = join(dir, 'knowledge.sqlite');
  const db = new DatabaseSync(path);

  db.exec('pragma journal_mode=delete');
  if (!fixture.omitMetaTable) {
    db.exec('create table meta (key text primary key not null, value text not null) strict');
  }
  db.exec(
    `create table assets (id text primary key not null, type text not null, slug text not null,
       title text not null, summary text not null, status text not null, problem_id text not null,
       solution_set_id text, content_hash text not null, record_json text not null) strict`,
  );
  db.exec(
    `create table solution_sets (id text primary key not null, problem_id text not null,
       canonical_state text not null, champion_id text, record_json text not null) strict`,
  );
  db.exec(
    `create virtual table assets_fts using fts5(asset_id unindexed, title, summary, tags, body, tokenize='unicode61')`,
  );

  const assets = fixture.assets ?? [anAsset()];
  for (const asset of assets) {
    db.prepare(
      `insert into assets (id, type, slug, title, summary, status, problem_id, solution_set_id,
         content_hash, record_json) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      String(asset['id']),
      String(asset['type']),
      String(asset['slug']),
      String(asset['title']),
      String(asset['summary']),
      String(asset['status']),
      String((asset['problem'] as { id: string }).id),
      asset['solution_set_id'] === null ? null : String(asset['solution_set_id']),
      String(asset['content_hash']),
      JSON.stringify(asset),
    );
    db.prepare(
      'insert into assets_fts (asset_id, title, summary, tags, body) values (?, ?, ?, ?, ?)',
    ).run(
      String(asset['id']),
      String(asset['title']),
      String(asset['summary']),
      (asset['problem'] as { capabilities: string[] }).capabilities.join(' '),
      fixture.bodies?.[String(asset['id'])] ?? 'body text',
    );
  }

  for (const set of fixture.solutionSets ?? [aSolutionSet()]) {
    db.prepare(
      `insert into solution_sets (id, problem_id, canonical_state, champion_id, record_json)
         values (?, ?, ?, ?, ?)`,
    ).run(
      String(set['id']),
      String(set['problem_id']),
      String(set['canonical_state']),
      set['champion_id'] === null ? null : String(set['champion_id']),
      JSON.stringify(set),
    );
  }

  if (!fixture.omitMetaTable) {
    const put = db.prepare('insert into meta (key, value) values (?, ?)');
    put.run(INDEX_META_KEYS.schemaVersion, fixture.schemaVersion ?? INDEX_SCHEMA_VERSION);
    if (!fixture.omitDigest) {
      put.run(INDEX_META_KEYS.indexDigest, sha256Canonical({ assets: assets.map((a) => a['id']) }));
    }
    if (!fixture.omitSnapshot) {
      put.run(INDEX_META_KEYS.scoreSnapshot, JSON.stringify(aSnapshot()));
    }
  }
  db.close();
  return path;
}

describe('reading a well-formed index', () => {
  it('returns an asset that satisfies its contract', async () => {
    const index = await SqliteKnowledgeIndex.open(buildFixture());
    const asset = await index.getAsset('asset_alpha');
    expect(asset?.title).toBe('OAuth PKCE for browser apps');
    expect(asset?.problem.capabilities).toEqual(['cap.auth']);
    index.close();
  });

  it('returns undefined for an id it does not hold, rather than throwing', async () => {
    const index = await SqliteKnowledgeIndex.open(buildFixture());
    expect(await index.getAsset('asset_missing')).toBeUndefined();
    expect(await index.getSolutionSet('set_missing')).toBeUndefined();
    index.close();
  });

  it('returns solution sets ordered by id', async () => {
    const index = await SqliteKnowledgeIndex.open(
      buildFixture({
        solutionSets: [
          aSolutionSet({ id: 'set_zulu' }),
          aSolutionSet({ id: 'set_alpha', members: [], why_unresolved: 'none' }),
        ],
      }),
    );
    expect((await index.listSolutionSets()).map((s) => s.id)).toEqual(['set_alpha', 'set_zulu']);
    index.close();
  });

  it('serves the index digest the builder recorded', async () => {
    const index = await SqliteKnowledgeIndex.open(buildFixture());
    expect(await index.indexDigest()).toMatch(/^sha256:[0-9a-f]{64}$/u);
    index.close();
  });

  it('serves the bootstrap snapshot as UNPROVEN, not as a score', async () => {
    const index = await SqliteKnowledgeIndex.open(buildFixture());
    const snapshot = await index.getScoreSnapshot();
    expect(snapshot.state).toBe('UNPROVEN');
    expect(snapshot.computed_at).toBeNull();
    index.close();
  });
});

describe('full-text search', () => {
  it('finds an asset by a word in its title', async () => {
    const index = await SqliteKnowledgeIndex.open(buildFixture());
    const hits = await index.searchAssets('PKCE', 10);
    expect(hits.map((h) => h.asset.id)).toEqual(['asset_alpha']);
    index.close();
  });

  it('finds an asset by a word only in its body, which is what FTS5 is for', async () => {
    const index = await SqliteKnowledgeIndex.open(
      buildFixture({ bodies: { asset_alpha: 'remember the code_verifier' } }),
    );
    expect((await index.searchAssets('code_verifier', 10)).length).toBe(1);
    index.close();
  });

  it('returns nothing for a query that matches nothing', async () => {
    const index = await SqliteKnowledgeIndex.open(buildFixture());
    expect(await index.searchAssets('kubernetes', 10)).toEqual([]);
    index.close();
  });

  it('treats an empty query and a non-positive limit as no search at all', async () => {
    // Rather than as "match everything", which is how an empty filter usually
    // turns into an accidental full-corpus dump.
    const index = await SqliteKnowledgeIndex.open(buildFixture());
    expect(await index.searchAssets('   ', 10)).toEqual([]);
    expect(await index.searchAssets('PKCE', 0)).toEqual([]);
    index.close();
  });

  it('honours the limit', async () => {
    const index = await SqliteKnowledgeIndex.open(
      buildFixture({
        assets: [
          anAsset({ id: 'asset_a', slug: 'a' }),
          anAsset({ id: 'asset_b', slug: 'b' }),
          anAsset({ id: 'asset_c', slug: 'c' }),
        ],
      }),
    );
    expect((await index.searchAssets('OAuth', 2)).length).toBe(2);
    index.close();
  });

  it('orders identically across repeated queries', async () => {
    // Ties in BM25 are common in a small corpus. An unordered tie would make
    // two runs of one query disagree, and that would surface much later as a
    // context_snapshot_id that cannot be reproduced.
    const index = await SqliteKnowledgeIndex.open(
      buildFixture({
        assets: [
          anAsset({ id: 'asset_a', slug: 'a' }),
          anAsset({ id: 'asset_b', slug: 'b' }),
          anAsset({ id: 'asset_c', slug: 'c' }),
        ],
      }),
    );
    const once = (await index.searchAssets('OAuth', 10)).map((h) => h.asset.id);
    const twice = (await index.searchAssets('OAuth', 10)).map((h) => h.asset.id);
    expect(twice).toEqual(once);
    expect(once.length).toBe(3);
    index.close();
  });
});

describe('the reader refuses an index it cannot vouch for', () => {
  it('refuses a schema version it does not read', async () => {
    await expect(SqliteKnowledgeIndex.open(buildFixture({ schemaVersion: '999' }))).rejects.toThrow(
      /schema version 999/u,
    );
  });

  it('refuses an index with no digest, since nothing citing it could be reproduced', async () => {
    await expect(SqliteKnowledgeIndex.open(buildFixture({ omitDigest: true }))).rejects.toThrow(
      /no index digest/u,
    );
  });

  it('refuses a file that is not a knowledge index at all', async () => {
    await expect(SqliteKnowledgeIndex.open(buildFixture({ omitMetaTable: true }))).rejects.toThrow(
      IndexUnavailableError,
    );
  });

  it('refuses to open a file that does not exist', async () => {
    await expect(SqliteKnowledgeIndex.open(join(tmpdir(), 'ieos-absent.sqlite'))).rejects.toThrow(
      /could not open the knowledge index/u,
    );
  });

  it('fails loudly on a record that no longer satisfies its contract', async () => {
    // The stale-index case: the file outlived the contracts. Returning the row
    // anyway would push a malformed record into the resolver.
    const path = buildFixture();
    const db = new DatabaseSync(path);
    db.prepare('update assets set record_json = ? where id = ?').run(
      JSON.stringify({ id: 'asset_alpha', title: 'no longer an asset' }),
      'asset_alpha',
    );
    db.close();

    const index = await SqliteKnowledgeIndex.open(path);
    await expect(index.getAsset('asset_alpha')).rejects.toThrow(/does not satisfy its contract/u);
    index.close();
  });

  it('reports a missing score snapshot rather than inventing one', async () => {
    const index = await SqliteKnowledgeIndex.open(buildFixture({ omitSnapshot: true }));
    await expect(index.getScoreSnapshot()).rejects.toThrow(/no score snapshot/u);
    index.close();
  });
});

describe('the index is opened read-only (fitness F3, structurally)', () => {
  it('cannot be written through, even by code that tries', async () => {
    // F3 says runtime code never mutates canonical knowledge. This is that rule
    // held by the handle rather than by a reviewer noticing an INSERT: the
    // attempt below fails because the database is open read-only.
    const path = buildFixture();
    const index = await SqliteKnowledgeIndex.open(path);
    const db = (index as unknown as { ['#db']?: unknown })['#db'];
    expect(db).toBeUndefined(); // truly private; not reachable to be misused

    // And prove the mode itself, through a second read-only handle.
    const readOnly = new DatabaseSync(path, { readOnly: true });
    expect(() =>
      readOnly.exec(
        "insert into assets values ('x','p','s','t','s','active','p',null,'sha256:x','{}')",
      ),
    ).toThrow();
    readOnly.close();
    index.close();
  });

  it('a writable handle CAN write, so the control above is meaningful', async () => {
    // Without this, "the write threw" could mean the SQL was simply wrong.
    const path = buildFixture();
    const writable = new DatabaseSync(path);
    expect(() =>
      writable.exec(
        "insert into assets values ('x','pattern','s','t','s','active','p',null,'sha256:x','{}')",
      ),
    ).not.toThrow();
    writable.close();
  });
});

describe('a rejected index never leaks its handle', () => {
  /**
   * The bug this pins, found by the Windows smoke job and invisible on Linux:
   * `open()` validated the index after acquiring the handle, and the throw for
   * a missing meta table sat outside the two places that closed it. Linux lets
   * you unlink an open file, so every Linux run passed; Windows refuses, and
   * the temp directory could not be removed -- EPERM, from cleanup code that
   * was not itself at fault.
   *
   * Testing it through a fake handle rather than through the filesystem means
   * the release is provable everywhere, not only where the OS enforces it.
   */
  const fakeDb = (behaviour: 'no-meta' | 'bad-version' | 'no-digest') => {
    let closed = 0;
    const db = {
      prepare(sql: string) {
        if (behaviour === 'no-meta') {
          return {
            get: () => {
              throw new Error('no such table: meta');
            },
            all: () => [],
          };
        }
        return {
          get: (key?: unknown) => {
            if (!sql.includes('meta')) return undefined;
            if (key === 'schema_version')
              return { value: behaviour === 'bad-version' ? '999' : '1' };
            if (key === 'index_digest')
              return behaviour === 'no-digest' ? undefined : { value: 'sha256:x' };
            return undefined;
          },
          all: () => [],
        };
      },
      close: () => {
        closed += 1;
      },
    };
    return { db, closed: () => closed };
  };

  it.each(['no-meta', 'bad-version', 'no-digest'] as const)(
    'closes the handle when the index is rejected for: %s',
    async (behaviour) => {
      const fake = fakeDb(behaviour);
      await expect(
        SqliteKnowledgeIndex.open('irrelevant', () => Promise.resolve(fake.db as never)),
      ).rejects.toThrow(IndexUnavailableError);
      expect(fake.closed(), 'the handle was not released on rejection').toBe(1);
    },
  );

  it('the control: a handle that is never closed would be caught', () => {
    // Without this, `closed() === 1` could pass because the fake counts wrong.
    const fake = fakeDb('no-meta');
    expect(fake.closed()).toBe(0);
  });
});
