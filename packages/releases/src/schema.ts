/**
 * The physical layout of the compiled knowledge index (D20.2).
 *
 * The DDL lives with the builder, which is the only thing that creates an index.
 * The reader in `store-sqlite` does not import it -- the guide's dependency
 * graph forbids an edge between the two packages in either direction -- and it
 * does not need to: what the two must agree on is the compatibility contract in
 * `@ieos/core` (`INDEX_SCHEMA_VERSION`, `INDEX_META_KEYS`), and a reader that
 * needed the DDL would be coupling itself to a layout it has no contract for.
 *
 * `strict` tables are used throughout so a type error in the builder becomes a
 * write failure here rather than a surprising value in a reader much later.
 */

/**
 * `journal_mode = delete` is deliberate for a *built artifact*.
 *
 * WAL is the right mode for a database being written concurrently, and Stage 0's
 * SQLite qualification verified WAL behaviour for the runtime stores that will
 * need it. The compiled index is different: built once, shipped, then only ever
 * read. A WAL index would carry `-wal` and `-shm` sidecars that are not part of
 * the artifact, which would make "the index" -- and therefore its digest --
 * ambiguous.
 */
export const INDEX_JOURNAL_MODE = 'delete';

export const CREATE_INDEX_SQL: readonly string[] = [
  `create table meta (
     key   text primary key not null,
     value text not null
   ) strict`,

  `create table assets (
     id              text primary key not null,
     type            text not null,
     slug            text not null,
     title           text not null,
     summary         text not null,
     status          text not null,
     problem_id      text not null,
     solution_set_id text,
     content_hash    text not null,
     record_json     text not null
   ) strict`,

  // The capability half of D20.3's retrieval. The index stores the graph; the
  // Stage 2 resolver is what ranks over it.
  `create table asset_capabilities (
     asset_id      text not null,
     capability_id text not null,
     primary key (asset_id, capability_id)
   ) strict, without rowid`,

  `create table solution_sets (
     id              text primary key not null,
     problem_id      text not null,
     canonical_state text not null,
     champion_id     text,
     record_json     text not null
   ) strict`,

  `create table solution_set_members (
     solution_set_id text not null,
     asset_id        text not null,
     primary key (solution_set_id, asset_id)
   ) strict, without rowid`,

  `create table controls (
     id          text primary key not null,
     record_json text not null
   ) strict`,

  // D20.2 names exactly these four searchable fields.
  `create virtual table assets_fts using fts5(
     asset_id unindexed,
     title,
     summary,
     tags,
     body,
     tokenize='unicode61'
   )`,
];
