/**
 * The contract registry.
 *
 * `CONTRACT_REGISTRY` is the single list of public contracts and their stability.
 * `tools/contracts-gen` emits one JSON Schema per entry into `contracts/schemas/`,
 * so the emitted set is derived from this list rather than from a second list
 * that could drift from it.
 */

import type { z } from 'zod';

import { assetSchema } from './asset.ts';
import { solutionSetSchema } from './solution-set.ts';
import { telemetryEnvelopeSchema, runTelemetryStateSchema } from './telemetry.ts';
import { evidenceSchema } from './evidence.ts';
import {
  expandRequestSchema,
  inspectRequestSchema,
  inspectSolutionSetResponseSchema,
  observationSchema,
  observeResponseSchema,
  resolveRequestSchema,
  resolveResponseSchema,
} from './agent-contract.ts';
import { simulationManifestSchema } from './simulation.ts';
import { principalSchema, registerRunRequestSchema, runSchema } from './runs.ts';
import { effectiveScoreViewSchema, scoreSnapshotSchema } from './score-view.ts';
import {
  controlSchema,
  installationManifestSchema,
  projectProfileSchema,
  releaseManifestSchema,
} from './stubs.ts';
import type { Stability } from './lifecycle.ts';

export * from './lifecycle.ts';
export * from './asset.ts';
export * from './solution-set.ts';
export * from './telemetry.ts';
export * from './evidence.ts';
export * from './agent-contract.ts';
export * from './simulation.ts';
export * from './runs.ts';
export * from './score-view.ts';
export * from './stubs.ts';

export interface ContractDescriptor {
  /** File name stem under `contracts/schemas/`. */
  readonly name: string;
  readonly schema: z.ZodType;
  readonly stability: Stability;
  /**
   * True when the contract is a Stage 0 stub whose stage has not arrived.
   * Recorded so nobody mistakes a placeholder for a designed contract.
   */
  readonly stub: boolean;
  /** Which stage owns the full design of this contract. */
  readonly ownedByStage: number;
}

/**
 * Every contract emitted to `contracts/schemas/`, sorted by name so emission
 * order is deterministic.
 */
export const CONTRACT_REGISTRY: readonly ContractDescriptor[] = [
  { name: 'asset', schema: assetSchema, stability: 'development', stub: false, ownedByStage: 0 },
  {
    name: 'solution-set',
    schema: solutionSetSchema,
    stability: 'development',
    stub: false,
    ownedByStage: 0,
  },
  {
    name: 'telemetry-envelope',
    schema: telemetryEnvelopeSchema,
    stability: 'development',
    stub: false,
    ownedByStage: 0,
  },
  {
    name: 'run-telemetry-state',
    schema: runTelemetryStateSchema,
    stability: 'development',
    stub: false,
    ownedByStage: 0,
  },
  {
    name: 'evidence',
    schema: evidenceSchema,
    stability: 'development',
    stub: false,
    ownedByStage: 0,
  },
  {
    name: 'agent-contract-resolve-request',
    schema: resolveRequestSchema,
    stability: 'development',
    stub: false,
    ownedByStage: 0,
  },
  {
    name: 'agent-contract-resolve-response',
    schema: resolveResponseSchema,
    stability: 'development',
    stub: false,
    ownedByStage: 0,
  },
  {
    name: 'agent-contract-inspect-request',
    schema: inspectRequestSchema,
    stability: 'development',
    stub: false,
    ownedByStage: 0,
  },
  {
    name: 'agent-contract-inspect-solution-set',
    schema: inspectSolutionSetResponseSchema,
    stability: 'development',
    stub: false,
    ownedByStage: 0,
  },
  {
    name: 'agent-contract-expand-request',
    schema: expandRequestSchema,
    stability: 'development',
    stub: false,
    ownedByStage: 0,
  },
  {
    name: 'agent-contract-observation',
    schema: observationSchema,
    stability: 'development',
    stub: false,
    ownedByStage: 0,
  },
  {
    name: 'agent-contract-observe-response',
    schema: observeResponseSchema,
    stability: 'development',
    stub: false,
    ownedByStage: 0,
  },
  {
    name: 'simulation-manifest',
    schema: simulationManifestSchema,
    stability: 'development',
    stub: false,
    ownedByStage: 0,
  },
  {
    name: 'principal',
    schema: principalSchema,
    stability: 'development',
    stub: false,
    ownedByStage: 0,
  },
  { name: 'run', schema: runSchema, stability: 'development', stub: false, ownedByStage: 0 },
  {
    name: 'register-run-request',
    schema: registerRunRequestSchema,
    stability: 'development',
    stub: false,
    ownedByStage: 0,
  },
  {
    name: 'effective-score-view',
    schema: effectiveScoreViewSchema,
    stability: 'development',
    stub: false,
    ownedByStage: 0,
  },
  {
    name: 'score-snapshot',
    schema: scoreSnapshotSchema,
    stability: 'development',
    stub: false,
    ownedByStage: 0,
  },

  // Stubs: present so no migration is needed, designed at their stage.
  {
    name: 'project-profile',
    schema: projectProfileSchema,
    stability: 'development',
    stub: true,
    ownedByStage: 6,
  },
  { name: 'control', schema: controlSchema, stability: 'development', stub: true, ownedByStage: 9 },
  {
    name: 'release-manifest',
    schema: releaseManifestSchema,
    stability: 'development',
    stub: true,
    ownedByStage: 4,
  },
  {
    name: 'installation-manifest',
    schema: installationManifestSchema,
    stability: 'development',
    stub: true,
    ownedByStage: 4,
  },
];
