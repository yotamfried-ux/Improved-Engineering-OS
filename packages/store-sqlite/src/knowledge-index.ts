/**
 * The `KnowledgeIndex` port, over the compiled SQLite index (D20.2, guide §3).
 *
 * The database is opened with `readOnly: true`. That is the point of this file
 * rather than a detail of it: fitness rule F3 says runtime code never mutates
 * canonical knowledge, and a read-only handle cannot, whatever anyone later
 * writes here. The rule stops depending on reviewers noticing an INSERT.
 *
 * `node:sqlite` is the binding, adopted at Stage 0 as owner-approved deviation
 * C-9 on measured evidence. It is still flagged experimental by Node and can be
 * switched off with `--no-experimental-sqlite`, so loading it is treated as a
 * thing that can fail and is reported as such -- `ieos doctor` surfaces it --
 * rather than assumed.
 */

import { assetSchema, solutionSetSchema, scoreSnapshotSchema } from '@ieos/core';
import type {
  AssetRecord,
  AssetSearchHit,
  KnowledgeIndex,
  ScoreSnapshot,
  SolutionSetRecord,
} from '@ieos/core';
import { INDEX_META_KEYS, INDEX_SCHEMA_VERSION } from '@ieos/core';

export class IndexUnavailableError extends Error {
  // Written out rather than declared as parameter properties: `erasableSyntaxOnly`
  // is on, because Node 24 strips types rather than compiling them, and
  // parameter properties are syntax that cannot simply be erased.
  override readonly cause: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'IndexUnavailableError';
    this.cause = cause;
  }
}

/** The narrow slice of `node:sqlite` this reader uses. */
interface ReadOnlyDatabase {
  prepare(sql: string): {
    get(...params: unknown[]): Record<string, unknown> | undefined;
    all(...params: unknown[]): Record<string, unknown>[];
  };
  close(): void;
}

/**
 * Open `node:sqlite` read-only.
 *
 * Separated so the failure modes are distinguishable: the module being absent
 * (the runtime was started with `--no-experimental-sqlite`, or a future Node
 * removed it) is a different problem from the file being missing or corrupt,
 * and a doctor that conflates them sends the reader looking in the wrong place.
 */
export async function openReadOnly(path: string): Promise<ReadOnlyDatabase> {
  let sqlite: { DatabaseSync: new (p: string, o?: Record<string, unknown>) => ReadOnlyDatabase };
  try {
    sqlite = (await import('node:sqlite')) as unknown as typeof sqlite;
  } catch (cause) {
    throw new IndexUnavailableError(
      'node:sqlite is not available in this runtime. It is experimental in Node 24 and is ' +
        'disabled by --no-experimental-sqlite. Run `ieos doctor` for the full picture.',
      cause,
    );
  }
  try {
    return new sqlite.DatabaseSync(path, { readOnly: true });
  } catch (cause) {
    throw new IndexUnavailableError(
      `could not open the knowledge index at ${path} for reading. ` +
        'Build it with `pnpm build:index`.',
      cause,
    );
  }
}

/**
 * Turn a caller's free text into an FTS5 query.
 *
 * The port takes a *user query*; translating it into a storage engine's query
 * language is this adapter's job, which is also why the resolver never sees
 * FTS5 syntax (F4 keeps it away from store internals, and this keeps the
 * dialect away from it in return).
 *
 * Two things went wrong when the raw text was passed straight to `MATCH`, and
 * both were silent in different ways:
 *
 *   **Implicit AND.** FTS5 joins bare terms with AND, so
 *   `a test that passes without proving what it claims` required every one of
 *   those words in one document and matched nothing. `resolve` answered "no
 *   relevant knowledge" for a corpus that held exactly that lesson -- an empty
 *   result is indistinguishable from an honest miss.
 *
 *   **Operator characters.** `:` is FTS5's column filter, so a hint like
 *   `auth: login` raised `no such column: auth` and the query threw rather than
 *   returning anything. A task hint is prose from an agent; it will contain
 *   colons, quotes and hyphens.
 *
 * So the text is split on everything that is not a letter, digit or underscore
 * -- which is what removes the operators, since none of them survives
 * tokenization -- and each surviving token is quoted as an FTS5 string literal
 * before the tokens are joined with OR. Ranking, not matching, decides which of
 * them wins: BM25 already rewards documents matching more of the query, and the
 * resolver orders on that.
 *
 * Note there is deliberately no quote-escaping here. A token cannot contain a
 * double quote, because the split removes it first; adding an escape would be a
 * second mechanism that can never fire, which reads like defence and is not.
 */
export function toFtsQuery(text: string): string | null {
  const tokens = text
    .split(/[^\p{L}\p{N}_]+/u)
    // Single characters are noise in prose and match almost everything.
    .filter((token) => token.length > 1)
    .map((token) => `"${token}"`);
  return tokens.length === 0 ? null : tokens.join(' OR ');
}

/**
 * Read-only view of a compiled index.
 *
 * Every record is revalidated against its contract on the way out. That looks
 * redundant -- the builder validated on the way in -- and is not: the index is
 * a file that can be older than the contracts, hand-edited, or truncated, and
 * "the index said so" is not a reason to hand a malformed record to the
 * resolver. Validation here is what makes a stale index a loud failure.
 */
export class SqliteKnowledgeIndex implements KnowledgeIndex {
  readonly #db: ReadOnlyDatabase;
  readonly #digest: string;

  private constructor(db: ReadOnlyDatabase, digest: string) {
    this.#db = db;
    this.#digest = digest;
  }

  /**
   * Open and validate an index.
   *
   * Every failure after the handle exists closes it. That is done with one
   * try/catch rather than a `close()` beside each `throw`, because the
   * per-throw version is what broke: `readMeta` throws when there is no meta
   * table, and it sat outside both of the explicit closes. The handle leaked,
   * which Linux hides -- an open file can still be unlinked -- and Windows does
   * not, so the Windows smoke job failed with EPERM while every Linux run
   * passed. A structure that cannot forget is worth more here than one that
   * remembers correctly today.
   *
   * `opener` is injectable so the release is provable in a test rather than
   * only on the platform that happens to enforce it.
   */
  static async open(
    path: string,
    opener: (p: string) => Promise<ReadOnlyDatabase> = openReadOnly,
  ): Promise<SqliteKnowledgeIndex> {
    const db = await opener(path);
    try {
      const schemaVersion = readMeta(db, INDEX_META_KEYS.schemaVersion);
      if (schemaVersion !== INDEX_SCHEMA_VERSION) {
        throw new IndexUnavailableError(
          `the index at ${path} declares schema version ${String(schemaVersion)}, but this ` +
            `runtime reads version ${INDEX_SCHEMA_VERSION}. Rebuild it with \`pnpm build:index\`.`,
        );
      }

      const digest = readMeta(db, INDEX_META_KEYS.indexDigest);
      if (digest === undefined) {
        throw new IndexUnavailableError(
          `the index at ${path} carries no index digest, so nothing that cites it could be ` +
            'reproduced. Rebuild it with `pnpm build:index`.',
        );
      }

      return new SqliteKnowledgeIndex(db, digest);
    } catch (error) {
      // Closing must not mask the real failure, so a close that itself fails is
      // swallowed: the caller needs to know why the index was rejected, not
      // that cleanup was also unhappy.
      try {
        db.close();
      } catch {
        // ignored deliberately; see above
      }
      throw error;
    }
  }

  close(): void {
    this.#db.close();
  }

  // Each method below is `async` so that a refusal reaches the caller as a
  // rejected promise. These return Promises, so a caller may reasonably write
  // `.catch(...)` instead of `await` -- and a synchronous throw would sail past
  // that and crash somewhere unrelated.
  async indexDigest(): Promise<string> {
    return this.#digest;
  }

  async getAsset(id: string): Promise<AssetRecord | undefined> {
    const row = this.#db.prepare('select record_json from assets where id = ?').get(id);
    if (row === undefined) return undefined;
    return parse(assetSchema, row['record_json'], `asset ${id}`);
  }

  /**
   * The body text, read from the FTS table.
   *
   * The body is stored once, in `assets_fts`, where the builder put it so it
   * would be searchable. Reading it back from there rather than duplicating it
   * into `assets` keeps one copy: two copies is how a body and its own search
   * index start disagreeing.
   */
  async getAssetBody(id: string): Promise<string | undefined> {
    const row = this.#db.prepare('select body from assets_fts where asset_id = ?').get(id);
    if (row === undefined) return undefined;
    return String(row['body']);
  }

  async getSolutionSet(id: string): Promise<SolutionSetRecord | undefined> {
    const row = this.#db.prepare('select record_json from solution_sets where id = ?').get(id);
    if (row === undefined) return undefined;
    return parse(solutionSetSchema, row['record_json'], `solution set ${id}`);
  }

  async listSolutionSets(): Promise<readonly SolutionSetRecord[]> {
    const rows = this.#db.prepare('select id, record_json from solution_sets order by id').all();
    return rows.map((row) =>
      parse(solutionSetSchema, row['record_json'], `solution set ${String(row['id'])}`),
    );
  }

  /**
   * FTS5 search, ordered deterministically.
   *
   * Ordered by `rank` and then by `asset_id`, because BM25 ties are common in a
   * small corpus and an unordered tie would make two runs of the same query
   * disagree -- which would show up much later as a non-reproducible
   * `context_snapshot_id`.
   */
  async searchAssets(query: string, limit: number): Promise<readonly AssetSearchHit[]> {
    if (limit <= 0) return [];
    const match = toFtsQuery(query);
    // A query with no usable token matches nothing. That is a real answer, and
    // it is reached without asking FTS5 to parse something it would reject.
    if (match === null) return [];

    const rows = this.#db
      .prepare(
        `select f.asset_id as id, a.record_json as record_json, rank as rank
           from assets_fts f
           join assets a on a.id = f.asset_id
          where assets_fts match ?
          order by rank, f.asset_id
          limit ?`,
      )
      .all(match, limit);

    return rows.map((row) => ({
      asset: parse(assetSchema, row['record_json'], `asset ${String(row['id'])}`),
      rank: Number(row['rank']),
    }));
  }

  /**
   * The bootstrap score snapshot (D24, Q-02).
   *
   * At Stage 1 the index carries the `UNPROVEN` snapshot the release build
   * emitted. It is read back and revalidated rather than reconstructed, so a
   * snapshot that ever claimed to be `DERIVED` without the evidence to support
   * it would fail here rather than flow onward as a score.
   */
  async getScoreSnapshot(): Promise<ScoreSnapshot> {
    const row = this.#db
      .prepare('select value from meta where key = ?')
      .get(INDEX_META_KEYS.scoreSnapshot);
    if (row === undefined) {
      throw new IndexUnavailableError(
        'the index carries no score snapshot. Rebuild it with `pnpm build:index`.',
      );
    }
    return parse(scoreSnapshotSchema, row['value'], 'score snapshot');
  }
}

function readMeta(db: ReadOnlyDatabase, key: string): string | undefined {
  try {
    const row = db.prepare('select value from meta where key = ?').get(key);
    return row === undefined ? undefined : String(row['value']);
  } catch (cause) {
    throw new IndexUnavailableError(
      'the index has no meta table, so it is not a knowledge index this runtime understands.',
      cause,
    );
  }
}

function parse<T>(
  schema: { safeParse(v: unknown): { success: boolean; data?: T } },
  json: unknown,
  what: string,
): T {
  let value: unknown;
  try {
    value = JSON.parse(String(json));
  } catch (cause) {
    throw new IndexUnavailableError(`${what} in the index is not valid JSON`, cause);
  }
  const result = schema.safeParse(value);
  if (!result.success || result.data === undefined) {
    throw new IndexUnavailableError(
      `${what} in the index does not satisfy its contract. The index is stale or damaged; ` +
        'rebuild it with `pnpm build:index`.',
    );
  }
  return result.data;
}
