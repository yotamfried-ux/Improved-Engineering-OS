/**
 * Contract tests: valid accepted, invalid rejected with a locatable reason,
 * unknown enum tolerated where declared.
 *
 * Every negative case starts from a valid fixture and breaks exactly one thing,
 * so a failure names the rule that fired.
 *
 * The invariants asserted here are the ones the guide expects fitness rules or
 * code review to catch. Catching them in the schema is earlier and cheaper, and
 * -- more importantly -- means a violating record cannot exist in the first
 * place rather than being detected after it does.
 */

import { describe, expect, it } from 'vitest';
import type { z } from 'zod';

import { assetSchema } from '../../src/contracts/asset.ts';
import { solutionSetSchema } from '../../src/contracts/solution-set.ts';
import { runTelemetryStateSchema, telemetryEnvelopeSchema } from '../../src/contracts/telemetry.ts';
import {
  evidenceSchema,
  isOptimizationInput,
  mayJustifyChampionPromotion,
} from '../../src/contracts/evidence.ts';
import { principalSchema, registerRunRequestSchema, runSchema } from '../../src/contracts/runs.ts';
import { simulationManifestSchema } from '../../src/contracts/simulation.ts';
import {
  buildUnprovenSnapshot,
  scoreSnapshotSchema,
  UNIFORM_PRIOR,
} from '../../src/contracts/score-view.ts';
import { resolveRequestSchema, resolveResponseSchema } from '../../src/contracts/agent-contract.ts';
import { CONTRACT_REGISTRY } from '../../src/contracts/index.ts';
import * as fx from './fixtures.ts';

/** Assert a rejection, and return the paths so a test can say where it fired. */
function rejectionPaths(schema: z.ZodType, value: unknown): string[] {
  const result = schema.safeParse(value);
  expect(result.success).toBe(false);
  if (result.success) return [];
  return result.error.issues.map((issue) => issue.path.join('.'));
}

describe('every contract carries a lifecycle block', () => {
  it.each(CONTRACT_REGISTRY.map((c) => [c.name, c] as const))(
    '%s declares its stability and stage owner',
    (_name, descriptor) => {
      expect(descriptor.stability).toBe('development');
      expect(descriptor.ownedByStage).toBeGreaterThanOrEqual(0);
      // Nothing may claim `stable` before the Stage 3 slice has exercised it.
      expect(descriptor.stability).not.toBe('stable');
    },
  );
});

describe('Asset (D6, D19, R-04)', () => {
  it('accepts a valid asset', () => {
    expect(assetSchema.safeParse(fx.anAsset()).success).toBe(true);
  });

  it.each(['candidate', 'observation', 'promotion_proposal'])(
    'rejects the staging status %s in canonical knowledge (R-04)',
    (status) => {
      expect(rejectionPaths(assetSchema, fx.anAsset({ status } as never))).toContain('status');
    },
  );

  it('rejects an asset with no provenance', () => {
    expect(rejectionPaths(assetSchema, fx.anAsset({ provenance: [] }))).toContain('provenance');
  });

  it('rejects an unknown top-level field rather than ignoring it', () => {
    const withExtra = { ...fx.anAsset(), canonical: true };
    expect(assetSchema.safeParse(withExtra).success).toBe(false);
  });

  it('rejects a summary over 400 characters, so resolve stays small (D9)', () => {
    expect(rejectionPaths(assetSchema, fx.anAsset({ summary: 'x'.repeat(401) }))).toContain(
      'summary',
    );
  });

  it('rejects an evidence policy that admits holdout evidence (D33)', () => {
    const paths = rejectionPaths(
      assetSchema,
      fx.anAsset({ evidence_policy: { eligible_origins: ['holdout'] } as never }),
    );
    expect(paths.some((p) => p.startsWith('evidence_policy'))).toBe(true);
  });

  it('rejects a superseded asset that names nothing that superseded it', () => {
    expect(
      rejectionPaths(
        assetSchema,
        fx.anAsset({
          status: 'superseded',
          relationships: { supersedes: [], superseded_by: [], related_to: [] },
        }),
      ),
    ).toContain('relationships.superseded_by');
  });

  it('rejects an asset that supersedes itself', () => {
    expect(
      rejectionPaths(
        assetSchema,
        fx.anAsset({
          relationships: { supersedes: [fx.ASSET_ID], superseded_by: [], related_to: [] },
        }),
      ),
    ).toContain('relationships.supersedes');
  });

  it('accepts an asset with a null source_revision rather than requiring an invented one', () => {
    const asset = fx.anAsset();
    const unrevisioned = {
      ...asset,
      provenance: [{ ...asset.provenance[0]!, source_revision: null, integrity: 'unknown' }],
    };
    expect(assetSchema.safeParse(unrevisioned).success).toBe(true);
  });
});

describe('Solution Set (D34, P-01, C-01)', () => {
  it('accepts an unresolved set with a null champion', () => {
    expect(solutionSetSchema.safeParse(fx.anUnresolvedSolutionSet()).success).toBe(true);
  });

  it('accepts a pinned set with a champion drawn from its members', () => {
    expect(solutionSetSchema.safeParse(fx.aPinnedSolutionSet()).success).toBe(true);
  });

  it('rejects a pinned set with no champion', () => {
    expect(
      rejectionPaths(solutionSetSchema, fx.aPinnedSolutionSet({ champion_id: null })),
    ).toContain('champion_id');
  });

  it('rejects an unresolved set that names a champion -- no hidden path to pinned (C-05)', () => {
    expect(
      rejectionPaths(solutionSetSchema, fx.anUnresolvedSolutionSet({ champion_id: fx.ASSET_ID })),
    ).toContain('champion_id');
  });

  it('rejects a champion that is not a member of the set', () => {
    expect(
      rejectionPaths(solutionSetSchema, fx.aPinnedSolutionSet({ champion_id: 'asset_elsewhere' })),
    ).toContain('champion_id');
  });

  it('rejects an unresolved set that does not say why', () => {
    expect(
      rejectionPaths(solutionSetSchema, fx.anUnresolvedSolutionSet({ why_unresolved: null })),
    ).toContain('why_unresolved');
  });

  it('rejects challenge_state written into canonical knowledge (C-01, F11)', () => {
    // challenge_state is derived at runtime and belongs to the score view. This
    // is the half of F11 a contract can enforce before a resolver exists.
    const contaminated = { ...fx.aPinnedSolutionSet(), challenge_state: 'challenged' };
    expect(solutionSetSchema.safeParse(contaminated).success).toBe(false);
  });

  it('rejects an unresolved set that claims a pinning release', () => {
    expect(
      rejectionPaths(
        solutionSetSchema,
        fx.anUnresolvedSolutionSet({ champion_since_release: '1.0.0' }),
      ),
    ).toContain('champion_since_release');
  });
});

describe('Telemetry envelope (D26, D36)', () => {
  it('accepts a valid event', () => {
    expect(telemetryEnvelopeSchema.safeParse(fx.aTelemetryEvent()).success).toBe(true);
  });

  it("rejects a client-supplied origin_class -- classification is the server's (D36)", () => {
    const spoofed = { ...fx.aTelemetryEvent(), origin_class: 'qualification' };
    expect(telemetryEnvelopeSchema.safeParse(spoofed).success).toBe(false);
  });

  it('rejects a client-supplied ingested_at', () => {
    const event = fx.aTelemetryEvent();
    const spoofed = {
      ...event,
      time: { ...event.time, ingested_at: '2026-09-04T00:00:00.000Z' },
    };
    expect(rejectionPaths(telemetryEnvelopeSchema, spoofed)).toContain('time.ingested_at');
  });

  it('tolerates an unknown event type, so an older runtime does not drop a newer run', () => {
    expect(
      telemetryEnvelopeSchema.safeParse(fx.aTelemetryEvent({ event_type: 'tool.future' })).success,
    ).toBe(true);
  });

  it('rejects a nested attribute value, where a prompt or credential could hide', () => {
    expect(
      telemetryEnvelopeSchema.safeParse(
        fx.aTelemetryEvent({ attributes: { nested: { secret: 'x' } } as never }),
      ).success,
    ).toBe(false);
  });

  it('rejects a negative sequence, which would corrupt ordering', () => {
    expect(
      rejectionPaths(
        telemetryEnvelopeSchema,
        fx.aTelemetryEvent({ source: { type: 'agent', sequence: -1 } }),
      ),
    ).toContain('source.sequence');
  });

  it('rejects an INCOMPLETE run marked qualification-eligible (D23)', () => {
    expect(
      rejectionPaths(runTelemetryStateSchema, {
        run_id: fx.RUN_ID,
        telemetry_state: 'INCOMPLETE',
        qualification_eligible: true,
        ingest_reachable_at_start: true,
      }),
    ).toContain('qualification_eligible');
  });

  it('accepts an INCOMPLETE run that is honestly ineligible', () => {
    expect(
      runTelemetryStateSchema.safeParse({
        run_id: fx.RUN_ID,
        telemetry_state: 'INCOMPLETE',
        qualification_eligible: false,
        ingest_reachable_at_start: false,
      }).success,
    ).toBe(true);
  });
});

describe('Evidence (D32, D33, P-02, C-05)', () => {
  it('accepts a valid evidence record', () => {
    expect(evidenceSchema.safeParse(fx.anEvidenceRecord()).success).toBe(true);
  });

  it.each(['corroborated', 'externally_verified'])(
    'rejects agent_runtime evidence graded %s (P-02)',
    (verification) => {
      expect(
        rejectionPaths(
          evidenceSchema,
          fx.anEvidenceRecord({
            integrity: { source_authority: 'agent_runtime', verification } as never,
          }),
        ).some((p) => p.startsWith('integrity')),
      ).toBe(true);
    },
  );

  it('rejects client-originated operational telemetry claiming directly_verified (P-02)', () => {
    const record = fx.anEvidenceRecord();
    expect(
      rejectionPaths(
        evidenceSchema,
        fx.anEvidenceRecord({
          attribution: { ...record.attribution, exposure: 'directly_verified' },
        }),
      ),
    ).toContain('attribution.exposure');
  });

  it('accepts CI-corroborated evidence, which is what a promotion needs', () => {
    expect(
      evidenceSchema.safeParse(
        fx.anEvidenceRecord({
          integrity: { source_authority: 'ci', verification: 'corroborated' },
        }),
      ).success,
    ).toBe(true);
  });

  it('rejects holdout evidence with no holdout_state (D33)', () => {
    expect(
      rejectionPaths(evidenceSchema, fx.anEvidenceRecord({ origin_class: 'holdout' })),
    ).toContain('holdout_state');
  });

  it('rejects holdout_state on non-holdout evidence (D33)', () => {
    expect(
      rejectionPaths(evidenceSchema, fx.anEvidenceRecord({ holdout_state: 'active' })),
    ).toContain('holdout_state');
  });

  it('rejects an unrecognised staleness selector rather than never matching it (D27)', () => {
    const record = fx.anEvidenceRecord();
    expect(
      rejectionPaths(
        evidenceSchema,
        fx.anEvidenceRecord({ scope: { ...record.scope, depends_on: ['whatever:x'] } }),
      ).some((p) => p.startsWith('scope.depends_on')),
    ).toBe(true);
  });

  it('rejects evidence with no source events, which would make attribution a guess', () => {
    const record = fx.anEvidenceRecord();
    expect(
      rejectionPaths(
        evidenceSchema,
        fx.anEvidenceRecord({ attribution: { ...record.attribution, source_event_ids: [] } }),
      ),
    ).toContain('attribution.source_event_ids');
  });
});

describe('the C-05 ladder and D33, as behaviour', () => {
  it('reported evidence is a scoring signal only', () => {
    expect(mayJustifyChampionPromotion(fx.anEvidenceRecord())).toBe(false);
  });

  it('observed evidence makes a challenger evidence-worthy but cannot promote', () => {
    expect(
      mayJustifyChampionPromotion(
        fx.anEvidenceRecord({
          integrity: { source_authority: 'deterministic_test', verification: 'observed' },
        }),
      ),
    ).toBe(false);
  });

  it('corroborated evidence may justify a promotion proposal', () => {
    expect(
      mayJustifyChampionPromotion(
        fx.anEvidenceRecord({
          integrity: { source_authority: 'ci', verification: 'corroborated' },
        }),
      ),
    ).toBe(true);
  });

  it('an active holdout may never justify a promotion, however strong (D33)', () => {
    const holdout = fx.anEvidenceRecord({
      origin_class: 'holdout',
      holdout_state: 'active',
      integrity: { source_authority: 'external', verification: 'externally_verified' },
    });
    expect(evidenceSchema.safeParse(holdout).success).toBe(true);
    expect(mayJustifyChampionPromotion(holdout)).toBe(false);
    expect(isOptimizationInput(holdout)).toBe(false);
  });

  it('a retired holdout becomes usable historical evidence (D33)', () => {
    const retired = fx.anEvidenceRecord({
      origin_class: 'holdout',
      holdout_state: 'retired',
      integrity: { source_authority: 'ci', verification: 'corroborated' },
    });
    expect(isOptimizationInput(retired)).toBe(true);
    expect(mayJustifyChampionPromotion(retired)).toBe(true);
  });
});

describe('Runs and principals (D22, D36, Q-07)', () => {
  it('accepts an unregistered operational run', () => {
    expect(runSchema.safeParse(fx.aRun()).success).toBe(true);
  });

  it('rejects an unregistered run claiming a stronger class (D36)', () => {
    expect(rejectionPaths(runSchema, fx.aRun({ origin_class: 'qualification' }))).toContain(
      'origin_class',
    );
  });

  it('accepts a properly registered qualification run', () => {
    expect(
      runSchema.safeParse(
        fx.aRun({
          registered_by: 'svc_01J9Z6Q0K3N6X4R8V2T7M5B1WQ',
          origin_class: 'qualification',
          registered_at: '2026-09-03T00:00:00.000Z',
        }),
      ).success,
    ).toBe(true);
  });

  it('rejects late registration -- register_run must precede the first event (D36)', () => {
    expect(
      rejectionPaths(
        runSchema,
        fx.aRun({
          registered_by: 'svc_01J9Z6Q0K3N6X4R8V2T7M5B1WQ',
          origin_class: 'qualification',
          registered_at: '2026-09-05T00:00:00.000Z',
        }),
      ),
    ).toContain('registered_at');
  });

  it('rejects an installation holding a service scope (D22)', () => {
    expect(
      rejectionPaths(
        principalSchema,
        fx.aPrincipal({ scopes: ['telemetry.insert', 'run.register'] }),
      ),
    ).toContain('scopes');
  });

  it('accepts a service principal holding run.register', () => {
    expect(
      principalSchema.safeParse(
        fx.aPrincipal({
          id: 'svc_01J9Z6Q0K3N6X4R8V2T7M5B1WQ',
          kind: 'service',
          scopes: ['run.register'],
        }),
      ).success,
    ).toBe(true);
  });

  it('rejects an unrecognised scope rather than tolerating it as nothing', () => {
    expect(
      principalSchema.safeParse(fx.aPrincipal({ scopes: ['telemetry.write'] as never })).success,
    ).toBe(false);
  });

  it('rejects registering a holdout run with no eval set version', () => {
    expect(
      rejectionPaths(registerRunRequestSchema, {
        run_id: fx.RUN_ID,
        origin_class: 'holdout',
        eval_set_version: null,
        holdout_state: 'active',
        simulation_id: null,
      }),
    ).toContain('eval_set_version');
  });

  it('never stores a raw token: token_hash must be a hex digest', () => {
    expect(
      rejectionPaths(principalSchema, fx.aPrincipal({ token_hash: 'plaintext-token' })),
    ).toContain('token_hash');
  });
});

describe('Score snapshot (D24, Q-02)', () => {
  it('builds a valid deterministic UNPROVEN snapshot', () => {
    const snapshot = buildUnprovenSnapshot([fx.ASSET_ID_2, fx.ASSET_ID]);
    expect(scoreSnapshotSchema.safeParse(snapshot).success).toBe(true);
    // Sorted, so the same knowledge tree always produces the same bytes (F8).
    expect(snapshot.assets.map((a) => a.id)).toEqual([fx.ASSET_ID, fx.ASSET_ID_2]);
    expect(snapshot.assets.every((a) => a.score === UNIFORM_PRIOR)).toBe(true);
  });

  it('rejects an UNPROVEN snapshot that looks measured', () => {
    const snapshot = buildUnprovenSnapshot([fx.ASSET_ID]);
    expect(
      rejectionPaths(scoreSnapshotSchema, {
        ...snapshot,
        computed_at: '2026-09-04T00:00:00.000Z',
      }),
    ).toContain('computed_at');
  });

  it('rejects an UNPROVEN snapshot carrying evidence counts', () => {
    const snapshot = buildUnprovenSnapshot([fx.ASSET_ID]);
    expect(
      rejectionPaths(scoreSnapshotSchema, {
        ...snapshot,
        assets: [{ id: fx.ASSET_ID, score: UNIFORM_PRIOR, evidence_count: 3 }],
      }),
    ).toContain('assets.0.evidence_count');
  });

  it('rejects a derived snapshot with no score view (Q-06)', () => {
    const snapshot = buildUnprovenSnapshot([fx.ASSET_ID]);
    expect(
      rejectionPaths(scoreSnapshotSchema, {
        ...snapshot,
        state: 'DERIVED',
        computed_at: '2026-09-04T00:00:00.000Z',
      }),
    ).toContain('score_view_id');
  });

  it('carries no champion field at all -- champions come from the release (C-01)', () => {
    const snapshot = buildUnprovenSnapshot([fx.ASSET_ID]);
    expect(Object.keys(snapshot)).not.toContain('champion_id');
    expect(scoreSnapshotSchema.safeParse({ ...snapshot, champion_id: fx.ASSET_ID }).success).toBe(
      false,
    );
  });
});

describe('Agent Contract (D25, Q-05, Q-06, P-01)', () => {
  const aResolveResponse = () => ({
    schema_version: '1',
    stability: 'development' as const,
    introduced_in: '0.1.0',
    deprecated_in: null,
    replacement: null,
    migration_path: null,
    context_snapshot_id: 'ctx_XC2P3MWXWU4N3NHZT5LC6DPIVP3S27MEZIJGA5SOIJ3S4LB5HCGA',
    ranking_mode: 'recorded' as const,
    effective_score_view_id: 'esv_JSJGYYGBWP53Y6YU2QFLGQHCDPIGB7ZQSNN5JIAJQL3EEXUENLCA',
    items: [] as unknown[],
    coverage: [] as unknown[],
    omitted_count: 0,
    controls: [] as string[],
  });

  it('rejects recorded ranking with no score_view_id (Q-06)', () => {
    expect(
      rejectionPaths(resolveRequestSchema, {
        task_hint: 'add login',
        project_id: 'proj_1',
        run_id: fx.RUN_ID,
        ranking_mode: 'recorded',
      }),
    ).toContain('score_view_id');
  });

  it('accepts live_overlay with no score_view_id', () => {
    expect(
      resolveRequestSchema.safeParse({
        task_hint: 'add login',
        project_id: 'proj_1',
        run_id: fx.RUN_ID,
        ranking_mode: 'live_overlay',
      }).success,
    ).toBe(true);
  });

  it('rejects two Champions for one Solution Set (D34)', () => {
    const item = {
      id: fx.ASSET_ID,
      type: 'pattern',
      title: 'a',
      summary: 's',
      project_fit: 1,
      champion_of: fx.SOLSET_ID,
      champion_status: 'pinned',
      score: 0.5,
      score_source: 'snapshot',
      evidence_count: 0,
    };
    expect(
      rejectionPaths(resolveResponseSchema, {
        ...aResolveResponse(),
        items: [item, { ...item, id: fx.ASSET_ID_2 }],
      }),
    ).toContain('items');
  });

  it('rejects a set reported both unresolved and championed (P-01)', () => {
    expect(
      rejectionPaths(resolveResponseSchema, {
        ...aResolveResponse(),
        items: [
          {
            id: fx.ASSET_ID,
            type: 'pattern',
            title: 'a',
            summary: 's',
            project_fit: 1,
            champion_of: fx.SOLSET_ID,
            champion_status: 'pinned',
            score: 0.5,
            score_source: 'snapshot',
            evidence_count: 0,
          },
        ],
        coverage: [
          {
            solution_set_id: fx.SOLSET_ID,
            unresolved_solution_set: true,
            member_count: 2,
            problem_id: 'problem.auth.browser-login',
          },
        ],
      }),
    ).toContain('coverage');
  });

  it('accepts an unresolved set reported as coverage with no items (P-01)', () => {
    expect(
      resolveResponseSchema.safeParse({
        ...aResolveResponse(),
        coverage: [
          {
            solution_set_id: fx.SOLSET_ID,
            unresolved_solution_set: true,
            member_count: 2,
            problem_id: 'problem.auth.browser-login',
          },
        ],
      }).success,
    ).toBe(true);
  });

  it('has no field in which resolve could list a challenger (Q-05)', () => {
    const withChallenger = {
      ...aResolveResponse(),
      challengers: [{ id: fx.ASSET_ID_2, live_score: 0.9 }],
    };
    expect(resolveResponseSchema.safeParse(withChallenger).success).toBe(false);
  });
});

describe('Simulation manifest (D14, D17, F10)', () => {
  it('accepts a valid manifest', () => {
    expect(simulationManifestSchema.safeParse(fx.aSimulationManifest()).success).toBe(true);
  });

  it('rejects hidden conditions stored inside simulations/ (F10)', () => {
    expect(
      rejectionPaths(
        simulationManifestSchema,
        fx.aSimulationManifest({ hidden_conditions_ref: 'simulations/fixtures/hidden.yaml' }),
      ),
    ).toContain('hidden_conditions_ref');
  });

  it('rejects a stochastic policy with a single trial', () => {
    expect(
      rejectionPaths(
        simulationManifestSchema,
        fx.aSimulationManifest({
          repetition_policy: {
            type: 'stochastic',
            minimum_trials: 1,
            stopping_rule: 'versioned policy',
          },
        }),
      ).some((p) => p.startsWith('repetition_policy')),
    ).toBe(true);
  });

  it('rejects a manifest with no negative validity control', () => {
    const manifest = fx.aSimulationManifest();
    expect(
      rejectionPaths(
        simulationManifestSchema,
        fx.aSimulationManifest({
          validity_controls: { ...manifest.validity_controls, negative: [] },
        }),
      ).some((p) => p.startsWith('validity_controls')),
    ).toBe(true);
  });

  it('rejects a criterion that is both success and failure', () => {
    expect(
      rejectionPaths(
        simulationManifestSchema,
        fx.aSimulationManifest({
          success_criteria: ['x'],
          failure_criteria: ['x'],
        }),
      ),
    ).toContain('failure_criteria');
  });
});
