export {
  buildContextSnapshot,
  isUnobserved,
  unobserved,
  type ContextSnapshot,
  type RuntimeFacts,
} from './context.ts';
export {
  championsOf,
  projectFitOf,
  rank,
  type CoverageEntry,
  type FitVerdict,
  type ProjectFit,
  type RankCandidate,
  type RankInputs,
  type RankResult,
} from './rank.ts';
export { effectiveViewIdFor } from './score-view.ts';
export {
  DEFAULT_LIMIT,
  MAX_LIMIT,
  expand,
  resolve,
  ResolverError,
  type ResolveDeps,
} from './resolve.ts';
