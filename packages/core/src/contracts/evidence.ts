/**
 * Evidence contract -- guide section 5.4, D27, D32, D33, P-02, C-03, C-05.
 *
 * Two rules are enforced structurally rather than left to the deriver:
 *
 *   P-02: client-originated operational telemetry alone can never reach
 *         `corroborated` or `externally_verified`. A compromised installation
 *         can nudge a score; it cannot manufacture the integrity grade a
 *         promotion requires.
 *
 *   D33:  active holdout evidence is never an optimization input. The pairing of
 *         `origin_class` and `holdout_state` is checked so `holdout_state` cannot
 *         be set on a non-holdout row, nor omitted on a holdout one.
 */

import { z } from 'zod';
import { isoInstantSchema, lifecycleFields, sha256DigestSchema } from './lifecycle.ts';
import { originClassSchema } from './asset.ts';

export const evidenceKindSchema = z.enum([
  'success',
  'failure',
  'partial',
  'verification',
  'rework',
]);

/** Report attribution ladder: appearing in `resolve` is not success evidence. */
export const exposureSchema = z.enum([
  'exposed',
  'inspected',
  'applied',
  'directly_verified',
  'failed',
  'contributed_to_failure',
]);

export const sourceAuthoritySchema = z.enum([
  'agent_runtime',
  'deterministic_test',
  'ci',
  'review',
  'external',
]);
export type SourceAuthority = z.infer<typeof sourceAuthoritySchema>;

export const verificationSchema = z.enum([
  'reported',
  'observed',
  'corroborated',
  'externally_verified',
]);
export type Verification = z.infer<typeof verificationSchema>;

/**
 * D27 staleness selectors. The prefix set is closed: an unrecognised selector
 * kind would silently never match, which reads as "evidence is still valid"
 * and is the wrong direction to fail in.
 */
export const dependencySelectorSchema = z
  .string()
  .regex(
    /^(dependency|profile|provider|infra):.+$/u,
    'selector must be dependency:<package>, profile:<field>, provider:<id> or infra:<path or key>',
  );

export const evidenceScopeSchema = z.object({
  paths: z.array(z.string().min(1)),
  depends_on: z.array(dependencySelectorSchema),
  max_age_days: z.int().positive().nullable(),
});

export const integritySchema = z
  .object({
    source_authority: sourceAuthoritySchema,
    verification: verificationSchema,
  })
  .strict()
  .superRefine((integrity, ctx) => {
    // P-02. The deriver stamps both fields from the event source and the Run
    // record, never from event content -- but nothing stops a bug from stamping
    // them inconsistently, so the pairing is checked here too.
    if (
      integrity.source_authority === 'agent_runtime' &&
      integrity.verification !== 'reported' &&
      integrity.verification !== 'observed'
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['verification'],
        message:
          'client-originated telemetry (source_authority "agent_runtime") can never reach ' +
          `"${integrity.verification}"; only "reported" or "observed" (P-02)`,
      });
    }
    if (
      integrity.source_authority === 'external' &&
      integrity.verification !== 'externally_verified' &&
      integrity.verification !== 'corroborated'
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['verification'],
        message:
          'external attestation grades as "corroborated" or "externally_verified"; ' +
          `received "${integrity.verification}"`,
      });
    }
  });

export const derivationSchema = z
  .object({
    deriver_id: z.string().min(1),
    deriver_version: z.string().min(1),
    input_snapshot_hash: sha256DigestSchema,
    /** Latest `ingested_at` consumed by this derivation. */
    input_watermark: isoInstantSchema.nullable(),
    /** Excluded from replay comparison (D32). */
    derived_at: isoInstantSchema,
    /** Supersession, never deletion (D32). */
    supersedes_derivation_id: z.string().min(1).nullable(),
  })
  .strict();

export const evidenceSchema = z
  .object({
    ...lifecycleFields,

    /** `evd_` + base32(sha256(JCS(...))) per C-03; see `ids.ts`. */
    evidence_id: z.string().min(1),

    subject: z.object({
      type: z.enum(['asset', 'control', 'integration', 'project', 'solution_set']),
      id: z.string().min(1),
    }),

    kind: evidenceKindSchema,
    origin_class: originClassSchema,
    holdout_state: z.enum(['active', 'retired']).nullable(),
    independence_group: z.string().min(1),

    strength: z.object({
      polarity: z.enum(['positive', 'negative', 'neutral']),
      weight: z.number().min(0).max(1),
      confidence: z.number().min(0).max(1),
    }),

    attribution: z.object({
      exposure: exposureSchema,
      source_event_ids: z.array(z.string().min(1)).min(1),
      trace_id: z.string().min(1),
    }),

    integrity: integritySchema,
    derivation: derivationSchema,
    revision: z.object({ repo_sha: z.string().min(1) }),
    scope: evidenceScopeSchema,
  })
  .strict()
  .superRefine((evidence, ctx) => {
    // D33: holdout_state belongs to holdout evidence and nothing else.
    if (evidence.origin_class === 'holdout' && evidence.holdout_state === null) {
      ctx.addIssue({
        code: 'custom',
        path: ['holdout_state'],
        message: 'holdout evidence must declare holdout_state "active" or "retired" (D33)',
      });
    }
    if (evidence.origin_class !== 'holdout' && evidence.holdout_state !== null) {
      ctx.addIssue({
        code: 'custom',
        path: ['holdout_state'],
        message: 'holdout_state is only meaningful when origin_class is "holdout" (D33)',
      });
    }
    // P-02, restated at the row level: operational evidence is client-originated
    // unless an independent authority produced it.
    if (
      evidence.origin_class === 'operational' &&
      evidence.integrity.source_authority === 'agent_runtime' &&
      evidence.attribution.exposure === 'directly_verified'
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['attribution', 'exposure'],
        message:
          'client-originated operational telemetry alone can never produce ' +
          '"directly_verified" attribution (P-02)',
      });
    }
  });

export type EvidenceRecord = z.infer<typeof evidenceSchema>;

/**
 * The C-05 eligibility ladder, as data rather than as prose.
 *
 * Stage 10's `scoring-policy.yaml` applies it. It is here at Stage 0 so the
 * ladder has one definition, and so the "no hidden path from unresolved to
 * pinned" property can be tested before a scorer exists.
 */
export const INTEGRITY_LADDER = {
  reported: { scoringSignal: true, evidenceWorthy: false, championEligible: false },
  observed: { scoringSignal: true, evidenceWorthy: true, championEligible: false },
  corroborated: { scoringSignal: true, evidenceWorthy: true, championEligible: true },
  externally_verified: { scoringSignal: true, evidenceWorthy: true, championEligible: true },
} as const satisfies Record<
  Verification,
  { scoringSignal: boolean; evidenceWorthy: boolean; championEligible: boolean }
>;

/**
 * Whether this evidence may support a Champion Promotion Proposal.
 *
 * Two independent reasons to say no: the integrity grade is below
 * `corroborated` (C-05), or the evidence is an active holdout (D33). Both are
 * checked, because either alone would leave a hole.
 */
export function mayJustifyChampionPromotion(evidence: EvidenceRecord): boolean {
  if (evidence.origin_class === 'holdout' && evidence.holdout_state === 'active') return false;
  return INTEGRITY_LADDER[evidence.integrity.verification].championEligible;
}

/** D33: an active holdout is never an optimization input. */
export function isOptimizationInput(evidence: EvidenceRecord): boolean {
  return !(evidence.origin_class === 'holdout' && evidence.holdout_state === 'active');
}
