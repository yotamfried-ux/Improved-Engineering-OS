export { CREATE_INDEX_SQL, INDEX_JOURNAL_MODE } from './schema.ts';
export {
  EMPTY_SNAPSHOT_DIGEST,
  emitUnprovenSnapshot,
  type EmittedSnapshot,
} from './scores-snapshot.ts';
export {
  buildIndex,
  knowledgeTreeDigest,
  KnowledgeTreeError,
  readKnowledgeTree,
  type BuildOptions,
  type BuildResult,
  type CompiledAsset,
  type KnowledgeTree,
  type WritableDatabase,
} from './build-index.ts';
