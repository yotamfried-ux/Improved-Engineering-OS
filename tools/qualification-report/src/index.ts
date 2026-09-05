export {
  ASSET_TREE_FIXTURE,
  collectPlatformEvidence,
  failures,
  totalPassed,
  totalSkipped,
  totalTests,
  type CollectOptions,
  type PlatformEvidence,
  type SuiteResult,
} from './evidence.ts';
export {
  evaluateStage0,
  type GateInput,
  type GateReport,
  type GateRow,
  type RowStatus,
} from './gate.ts';
export {
  evaluateStage1,
  REQUIRED_COMMANDS,
  REQUIRED_TESTS,
  STAGE_0_EMPTY_SNAPSHOT_DIGEST,
  type Stage1GateInput,
} from './stage1.ts';
export { renderReport, type RenderInput } from './render.ts';
