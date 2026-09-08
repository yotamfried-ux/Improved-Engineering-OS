export {
  ASSET_TREE_FIXTURE,
  collectPlatformEvidence,
  failureReason,
  failures,
  totalPassed,
  totalSkipped,
  totalTests,
  type CollectOptions,
  type KnowledgeEvidence,
  type PlatformEvidence,
  type Stage2Evidence,
  type SuiteFailure,
  type SuiteResult,
} from './evidence.ts';
export {
  CHAMPION_PROPERTY_TESTS,
  describeProblems,
  evaluateStage0,
  platformProblems,
  type NamedTestOutcome,
  type GateInput,
  type GateReport,
  type GateRow,
  type RowStatus,
} from './gate.ts';
export {
  evaluateStage2,
  REQUIRED_ASSET_TYPES,
  SEED_CORPUS,
  STAGE_2_TESTS,
  type Stage2GateInput,
} from './stage2.ts';
export {
  evaluateStage1,
  REQUIRED_COMMANDS,
  REQUIRED_TESTS,
  STAGE_0_EMPTY_SNAPSHOT_DIGEST,
  type Stage1GateInput,
} from './stage1.ts';
export { renderReport, type RenderInput } from './render.ts';
