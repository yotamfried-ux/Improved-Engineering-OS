/**
 * Asset contract -- guide section 5.1, D6, D19, D20.1, D33.
 *
 * The invariant this file exists to make structural: an asset in canonical
 * `knowledge/` can only carry a canonical lifecycle status. R-04 removed
 * `candidate` from canonical knowledge; `observation`, `candidate` and
 * `promotion_proposal` live in Supabase staging. Because `assetStatusSchema`
 * simply does not contain them, a staging state in a canonical asset is a schema
 * rejection, not a review finding.
 */

import { z } from 'zod';
import { isoInstantSchema, lifecycleFields, sha256DigestSchema } from './lifecycle.ts';

export const assetTypeSchema = z.enum([
  'pattern',
  'skill',
  'template',
  'reference_test',
  'reference_repo',
  'lesson',
  'failed_solution',
  'provider',
  'integration',
  'fact',
  'control_guidance',
]);
export type AssetType = z.infer<typeof assetTypeSchema>;

/**
 * Canonical lifecycle only (D19, R-04).
 *
 * Note the absence of `candidate`. That absence is the contract.
 */
export const assetStatusSchema = z.enum([
  'active',
  'restricted',
  'quarantined',
  'deprecated',
  'superseded',
]);
export type AssetStatus = z.infer<typeof assetStatusSchema>;

export const originClassSchema = z.enum([
  'development',
  'qualification',
  'operational',
  'holdout',
  'external_attestation',
]);
export type OriginClass = z.infer<typeof originClassSchema>;

export const provenanceEntrySchema = z.object({
  source_type: z.enum([
    'official_docs',
    'repo',
    'existing_eos',
    'observation',
    'external_attestation',
    'owner',
  ]),
  source_identity: z.string().min(1),
  /** Null when the source has no addressable revision; never invented. */
  source_revision: z.string().min(1).nullable(),
  observed_at: isoInstantSchema,
  integrity: z.enum(['verified', 'partial', 'unknown']),
});
export type ProvenanceEntry = z.infer<typeof provenanceEntrySchema>;

export const freshnessSchema = z.object({
  class: z.enum(['stable', 'normal', 'volatile', 'live_required']),
  last_verified_at: isoInstantSchema.nullable(),
});

export const riskSchema = z.object({
  execution_authority: z.enum(['data_only', 'executable']),
  blast_radius: z.enum(['read_only', 'write', 'destructive', 'privileged']),
});

export const applicabilityConditionSchema = z.object({
  fact: z.string().min(1),
  in: z.array(z.string().min(1)).min(1),
});

/**
 * D33: an asset's evidence policy may never admit an active holdout.
 *
 * `holdout` is absent from the enum rather than filtered later, so "never let
 * holdout evidence reach the scorer" is enforced at the point the policy is
 * written instead of at the point it is read.
 */
export const evidencePolicySchema = z.object({
  eligible_origins: z
    .array(z.enum(['development', 'qualification', 'operational', 'external_attestation']))
    .min(1),
});

export const assetSchema = z
  .object({
    ...lifecycleFields,

    id: z.string().min(1),
    type: assetTypeSchema,
    slug: z.string().min(1),
    title: z.string().min(1),
    /** Guide section 5.1: what `resolve` returns. Bounded so `resolve` stays small. */
    summary: z.string().min(1).max(400),
    status: assetStatusSchema,

    content_hash: sha256DigestSchema,
    /** D19: old Engineering-OS paths, so provenance survives the rebuild. */
    legacy_ids: z.array(z.string().min(1)),

    problem: z.object({
      id: z.string().min(1),
      capabilities: z.array(z.string().min(1)),
    }),
    solution_set_id: z.string().min(1).nullable(),

    applicability: z.object({ conditions: z.array(applicabilityConditionSchema) }),
    compatibility: z.object({
      platforms: z.array(z.string().min(1)),
      providers: z.array(z.string().min(1)),
      constraints: z.array(z.string().min(1)),
    }),

    /** At least one entry: an asset with no provenance is not admissible (D6, D8). */
    provenance: z.array(provenanceEntrySchema).min(1),
    freshness: freshnessSchema,
    risk: riskSchema,

    relationships: z.object({
      supersedes: z.array(z.string().min(1)),
      superseded_by: z.array(z.string().min(1)),
      related_to: z.array(z.string().min(1)),
    }),

    evidence_policy: evidencePolicySchema,

    /** Relative path to the body, always `body.md` under D20.1. */
    body: z.string().min(1),
    files: z.array(z.string().min(1)),
  })
  .strict()
  .superRefine((asset, ctx) => {
    // A superseded asset that names nothing it was superseded by leaves the
    // resolver with a dead end and no explanation.
    if (asset.status === 'superseded' && asset.relationships.superseded_by.length === 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['relationships', 'superseded_by'],
        message: 'a superseded asset must name at least one asset that superseded it',
      });
    }
    if (asset.relationships.supersedes.includes(asset.id)) {
      ctx.addIssue({
        code: 'custom',
        path: ['relationships', 'supersedes'],
        message: 'an asset cannot supersede itself',
      });
    }
  });

export type AssetRecord = z.infer<typeof assetSchema>;
