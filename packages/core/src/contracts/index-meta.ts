/**
 * The compatibility contract between whoever builds the knowledge index and
 * whoever reads it (D20.2).
 *
 * This file holds no SQL. The guide's package dependency graph puts the builder
 * in `releases` and the reader in `store-sqlite`, and permits no dependency
 * between them in either direction -- so the small amount they must agree on
 * lives here, where a contract belongs, and the physical DDL stays with the
 * producer that creates it.
 *
 * What they agree on is deliberately minimal: a schema version, and the keys of
 * the `meta` rows a reader must find. Everything else about the file is the
 * builder's business, and a reader that needs more than this is coupling itself
 * to a layout it has no contract for.
 */

/**
 * Bumped when the physical layout changes in a way a reader must notice.
 *
 * A reader that finds a different version refuses to serve the index rather
 * than guessing. An index is a compiled artifact that can easily outlive the
 * code that reads it, and a silently misread index would surface much later as
 * a wrong answer with a valid-looking `index_digest` behind it.
 */
export const INDEX_SCHEMA_VERSION = '1';

/** Keys the builder must write into `meta` and the reader may rely on. */
export const INDEX_META_KEYS = {
  /** D35 digest over the index's logical content, never over its file bytes. */
  indexDigest: 'index_digest',
  schemaVersion: 'schema_version',
  /** The D24/Q-02 score snapshot shipped with the index, as canonical JSON. */
  scoreSnapshot: 'score_snapshot',
  /** Which knowledge tree this was compiled from, for provenance. */
  builtFrom: 'built_from',
} as const;

export type IndexMetaKey = (typeof INDEX_META_KEYS)[keyof typeof INDEX_META_KEYS];
