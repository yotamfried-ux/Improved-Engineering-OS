export { CREATE_INDEX_SQL, INDEX_JOURNAL_MODE } from './schema.ts';
export {
  buildScoreSnapshot,
  EMPTY_SNAPSHOT_DIGEST,
  emitUnprovenSnapshot,
  snapshotFromOverlay,
  type EmittedSnapshot,
  type ScoreOverlay,
  type SnapshotBuild,
  type SnapshotSource,
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
