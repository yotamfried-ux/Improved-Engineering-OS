/**
 * Deterministic contract fixtures.
 *
 * Every value here is fixed: no `Date.now()`, no random ids, no environment
 * lookups. A fixture that varies between runs would make a failing contract test
 * unreproducible, which is the opposite of what Stage 0 is for.
 *
 * Each builder returns a *valid* record. Negative tests start from one of these
 * and break exactly one thing, so a failure names the rule that fired rather
 * than a pile of unrelated issues.
 */

import type { AssetRecord } from '../../src/contracts/asset.ts';
import type { SolutionSetRecord } from '../../src/contracts/solution-set.ts';
import type { TelemetryEvent } from '../../src/contracts/telemetry.ts';
import type { EvidenceRecord } from '../../src/contracts/evidence.ts';
import type { PrincipalRecord, RunRecord } from '../../src/contracts/runs.ts';
import type { SimulationManifest } from '../../src/contracts/simulation.ts';

const LIFECYCLE = {
  schema_version: '1',
  stability: 'development',
  introduced_in: '0.1.0',
  deprecated_in: null,
  replacement: null,
  migration_path: null,
} as const;

const AT = '2026-09-04T00:00:00.000Z';
const SHA0 = 'sha256:44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a';

export const ASSET_ID = 'asset_01J9Z6Q0K3N6X4R8V2T7M5B1WQ';
export const ASSET_ID_2 = 'asset_01J9Z6Q0K3N6X4R8V2T7M5B1WR';
export const SOLSET_ID = 'solset_01J9Z6Q0K3N6X4R8V2T7M5B1WQ';
export const RUN_ID = 'run_01J9Z6Q0K3N6X4R8V2T7M5B1WQ';

/** Overrides are shallow: enough for a negative test to break one field. */
type Override<T> = { readonly [K in keyof T]?: T[K] };

export function anAsset(override: Override<AssetRecord> = {}): AssetRecord {
  return {
    ...LIFECYCLE,
    id: ASSET_ID,
    type: 'pattern',
    slug: 'oauth-pkce-web',
    title: 'OAuth 2.1 PKCE for browser apps',
    summary: 'Authorization code flow with PKCE for a browser client.',
    status: 'active',
    content_hash: SHA0,
    legacy_ids: ['patterns/auth/oauth-pkce.md'],
    problem: { id: 'problem.auth.browser-login', capabilities: ['auth.oauth.pkce'] },
    solution_set_id: SOLSET_ID,
    applicability: { conditions: [{ fact: 'platform', in: ['web'] }] },
    compatibility: { platforms: ['web'], providers: ['supabase-auth'], constraints: [] },
    provenance: [
      {
        source_type: 'existing_eos',
        source_identity: 'yotamfried-ux/Engineering-OS',
        source_revision: 'b'.repeat(40),
        observed_at: AT,
        integrity: 'verified',
      },
    ],
    freshness: { class: 'normal', last_verified_at: AT },
    risk: { execution_authority: 'data_only', blast_radius: 'read_only' },
    relationships: { supersedes: [], superseded_by: [], related_to: [] },
    evidence_policy: { eligible_origins: ['qualification', 'operational'] },
    body: 'body.md',
    files: [],
    ...override,
  } as AssetRecord;
}

/** An unresolved set: the state a freshly imported group legitimately has (P-01). */
export function anUnresolvedSolutionSet(
  override: Override<SolutionSetRecord> = {},
): SolutionSetRecord {
  return {
    ...LIFECYCLE,
    id: SOLSET_ID,
    problem_id: 'problem.auth.browser-login',
    compatibility_key: 'web|supabase-auth',
    members: [ASSET_ID, ASSET_ID_2],
    canonical_state: 'unresolved',
    champion_id: null,
    champion_since_release: null,
    why_unresolved: 'all members unproven at import; no evidence at corroborated or better',
    ...override,
  } as SolutionSetRecord;
}

export function aPinnedSolutionSet(override: Override<SolutionSetRecord> = {}): SolutionSetRecord {
  return {
    ...anUnresolvedSolutionSet(),
    canonical_state: 'pinned',
    champion_id: ASSET_ID,
    champion_since_release: '1.0.0',
    why_unresolved: null,
    ...override,
  } as SolutionSetRecord;
}

export function aTelemetryEvent(override: Override<TelemetryEvent> = {}): TelemetryEvent {
  return {
    ...LIFECYCLE,
    event_id: 'evt_01J9Z6Q0K3N6X4R8V2T7M5B1WQ',
    event_type: 'tool.call',
    project_id: 'proj_01J9Z6Q0K3N6X4R8V2T7M5B1WQ',
    work_id: 'work_01J9Z6Q0K3N6X4R8V2T7M5B1WQ',
    run_id: RUN_ID,
    installation_id: 'inst_01J9Z6Q0K3N6X4R8V2T7M5B1WQ',
    emitter_id: 'emt_01J9Z6Q0K3N6X4R8V2T7M5B1WQ',
    session_kind: 'local_persistent',
    trace: { trace_id: 't1', span_id: 's1', parent_span_id: null, links: [] },
    time: { occurred_at: AT, observed_at: AT, ingested_at: null },
    source: { type: 'agent', sequence: 42 },
    revision: { repo_sha: 'c'.repeat(40), eos_release: '0.1.0' },
    harness: {
      agent: 'primary',
      model: 'unspecified',
      adapter_version: '0.1.0',
      available_capabilities_hash: SHA0,
    },
    attributes: { 'tool.name': 'resolve' },
    ...override,
  } as TelemetryEvent;
}

export function anEvidenceRecord(override: Override<EvidenceRecord> = {}): EvidenceRecord {
  return {
    ...LIFECYCLE,
    evidence_id: 'evd_HW5BB4DC4CYANHICZEUNAKCPSYWHHNRDHSPBACREA4ASASP2XMPQ',
    subject: { type: 'asset', id: ASSET_ID },
    kind: 'success',
    origin_class: 'operational',
    holdout_state: null,
    independence_group: 'ig_01J9Z6Q0K3N6X4R8V2T7M5B1WQ',
    strength: { polarity: 'positive', weight: 0.1, confidence: 0.2 },
    attribution: {
      exposure: 'applied',
      source_event_ids: ['evt_01J9Z6Q0K3N6X4R8V2T7M5B1WQ'],
      trace_id: 't1',
    },
    integrity: { source_authority: 'agent_runtime', verification: 'reported' },
    derivation: {
      deriver_id: 'attribution',
      deriver_version: '3',
      input_snapshot_hash: SHA0,
      input_watermark: AT,
      derived_at: AT,
      supersedes_derivation_id: null,
    },
    revision: { repo_sha: 'c'.repeat(40) },
    scope: {
      paths: ['src/auth/**'],
      depends_on: ['dependency:@supabase/ssr', 'profile:authentication_required'],
      max_age_days: 90,
    },
    ...override,
  } as EvidenceRecord;
}

export function aRun(override: Override<RunRecord> = {}): RunRecord {
  return {
    ...LIFECYCLE,
    run_id: RUN_ID,
    owner_id: 'owner_1',
    registered_by: null,
    origin_class: 'operational',
    holdout_state: null,
    eval_set_version: null,
    simulation_id: null,
    registered_at: null,
    first_event_at: AT,
    telemetry_state: 'COMPLETE',
    qualification_eligible: false,
    ...override,
  } as RunRecord;
}

export function aPrincipal(override: Override<PrincipalRecord> = {}): PrincipalRecord {
  return {
    ...LIFECYCLE,
    id: 'inst_01J9Z6Q0K3N6X4R8V2T7M5B1WQ',
    kind: 'installation',
    owner_id: 'owner_1',
    token_hash: 'd'.repeat(64),
    scopes: ['telemetry.insert', 'observation.insert', 'read.minimal'],
    label: 'laptop',
    created_at: AT,
    expires_at: '2026-12-03T00:00:00.000Z',
    revoked_at: null,
    last_seen_at: null,
    ...override,
  } as PrincipalRecord;
}

export function aSimulationManifest(
  override: Override<SimulationManifest> = {},
): SimulationManifest {
  return {
    ...LIFECYCLE,
    id: 'simulation.stage-0.contract-validity',
    version: 1,
    claim: 'Schemas and identities are trustworthy enough to build on.',
    environment: {
      repo_revision: 'c'.repeat(40),
      eos_release: '0.1.0',
      agent: 'fake',
      model: 'fake',
      tools: [],
      permissions: [],
      network_policy: 'deny',
      budgets: { wall_clock_seconds: 60 },
    },
    starting_state: {},
    stimulus: { task: 'Validate a corrupted Evidence record referencing a nonexistent Run.' },
    hidden_conditions_ref: 'evaluator-only://stage-0/contract-validity.yaml',
    allowed_interventions: { user_architecture_decision: false, eos_coaching: false },
    success_criteria: ['invalid rejected with reason'],
    failure_criteria: ['invalid accepted'],
    stop_conditions: ['budget exceeded'],
    graders: [{ id: 'schema-validity', kind: 'deterministic' }],
    validity_controls: {
      positive: ['valid-asset'],
      negative: ['asset-with-staging-status'],
      mutation: [],
    },
    required_evidence: ['machine-readable validation report'],
    recovery: { procedure: 'discard sandbox' },
    repetition_policy: { type: 'deterministic', minimum_trials: 1, stopping_rule: 'single run' },
    ...override,
  } as SimulationManifest;
}
