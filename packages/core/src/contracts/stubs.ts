/**
 * Stub contracts -- `project-profile`, `control`, `release`.
 *
 * Stage 0 deliverables list these as *stubs* with `stability: development` until
 * their stages (Profile at Stage 6, Control at Stage 9, Release at Stage 4).
 *
 * They are stubs in a specific sense: the fields the constitution's State
 * Ownership Matrix depends on are present and typed, so nothing later needs a
 * migration to introduce them; everything else is deliberately absent rather
 * than guessed. A field invented here would become a contract other code starts
 * depending on before the stage that was supposed to design it.
 */

import { z } from 'zod';
import { isoInstantSchema, lifecycleFields, sha256DigestSchema } from './lifecycle.ts';

// ---------------------------------------------------------------------------
// Project Profile (guide 5.2, D5) -- Stage 6
// ---------------------------------------------------------------------------

/**
 * Only `spec` lives in Git. Observed `status` belongs to the Evidence Plane and
 * is deliberately not part of this schema: the constitution is explicit that
 * declared intent and observed reality have different owners, and that neither
 * "user always wins" nor "repo always wins" is a rule.
 */
export const projectProfileSchema = z
  .object({
    ...lifecycleFields,
    project_id: z.string().min(1),
    eos: z.union([
      z
        .object({
          pinned_release: z.string().min(1),
          release_digest: sha256DigestSchema,
        })
        .strict(),
      // Stages 0-3 run from a source checkout; there is no pinned release yet.
      z
        .object({
          source_checkout: z.string().min(1),
          index_digest: sha256DigestSchema,
        })
        .strict(),
    ]),
    spec: z
      .object({
        lifecycle: z.enum(['prototype', 'internal', 'production']),
        database_provider: z.string().min(1).nullable(),
        authentication_required: z.boolean(),
        deployment: z.string().min(1).nullable(),
        architecture_constraints: z.array(z.string().min(1)),
      })
      .strict(),
    decisions: z.array(
      z
        .object({
          decision_id: z.string().min(1),
          subject: z.string().min(1),
          status: z.enum(['proposed', 'accepted', 'superseded']),
        })
        .strict(),
    ),
    /** Named unknowns stay UNKNOWN; they are never filled by inference (D5). */
    known_unknowns: z.array(z.string().min(1)),
  })
  .strict();
export type ProjectProfile = z.infer<typeof projectProfileSchema>;

/** Declared vs observed, per the constitution. Never resolved by preference. */
export const driftStateSchema = z.enum(['ALIGNED', 'DRIFT', 'UNKNOWN']);
export type DriftState = z.infer<typeof driftStateSchema>;

// ---------------------------------------------------------------------------
// Control (guide 5.5, D10) -- Stage 9
// ---------------------------------------------------------------------------

export const controlStateSchema = z.enum(['SATISFIED', 'MISSING', 'UNKNOWN', 'EXEMPT', 'STALE']);
export type ControlState = z.infer<typeof controlStateSchema>;

export const controlSchema = z
  .object({
    ...lifecycleFields,
    id: z.string().min(1),
    title: z.string().min(1),
    /** Only a critical control may fail closed (D10). */
    critical: z.boolean(),
    applies_when: z.array(
      z
        .object({
          fact: z.string().min(1),
          eq: z.union([z.string(), z.boolean(), z.number()]).optional(),
          in: z.array(z.string().min(1)).optional(),
        })
        .strict(),
    ),
    satisfied_by: z.array(
      z
        .object({
          evidence_kind: z.string().min(1),
          subject_type: z.string().min(1),
          min_confidence: z.number().min(0).max(1),
        })
        .strict(),
    ),
    default_scope: z
      .object({
        paths: z.array(z.string().min(1)),
        depends_on: z.array(z.string().min(1)),
        max_age_days: z.int().positive().nullable(),
      })
      .strict(),
    exemption: z
      .object({
        allowed: z.boolean(),
        max_days: z.int().positive().nullable(),
        requires_decision: z.boolean(),
      })
      .strict(),
  })
  .strict();
export type ControlRecord = z.infer<typeof controlSchema>;

// ---------------------------------------------------------------------------
// Release manifest (guide 5.7, D12) -- Stage 4
// ---------------------------------------------------------------------------

export const releaseManifestSchema = z
  .object({
    ...lifecycleFields,
    version: z.string().min(1),
    tag: z.string().min(1),
    source_commit: z.string().min(1),
    artifact_digest: sha256DigestSchema,
    index_digest: sha256DigestSchema,
    scores_snapshot_digest: sha256DigestSchema,
    sbom_ref: z.string().min(1).nullable(),
    /**
     * T-08: the digest is always verified in-launcher; attestation verification
     * is delegated to official tooling. `verifier` is null exactly when the
     * status is `unverified`, so "we did not check" can never be recorded as a
     * verification by an unnamed verifier.
     */
    release_attestation: z
      .object({
        status: z.enum(['verified', 'unverified']),
        verifier: z.enum(['gh', 'sigstore-lib']).nullable(),
      })
      .strict()
      .superRefine((attestation, ctx) => {
        if (attestation.status === 'verified' && attestation.verifier === null) {
          ctx.addIssue({
            code: 'custom',
            path: ['verifier'],
            message:
              'a verified attestation must name the official verifier that checked it (T-08)',
          });
        }
        if (attestation.status === 'unverified' && attestation.verifier !== null) {
          ctx.addIssue({
            code: 'custom',
            path: ['verifier'],
            message: 'an unverified attestation names no verifier',
          });
        }
      }),
    /** Hash of the champion_id + canonical_state assignments in this release (D34, C-01). */
    champions_digest: sha256DigestSchema,
    score_view_id: z.string().min(1),
    contracts: z.record(z.string().min(1), z.string().min(1)),
    built_at: isoInstantSchema,
  })
  .strict();
export type ReleaseManifest = z.infer<typeof releaseManifestSchema>;

/** `.ieos/installation.json` (guide 5.8, D18.4). */
export const installationManifestSchema = z
  .object({
    schema_version: z.string().min(1),
    release: z.string().min(1),
    artifact_digest: sha256DigestSchema,
    bootstrap_template_hash: sha256DigestSchema,
    installed_at: isoInstantSchema,
    installation_id: z.string().min(1),
    ingest_endpoint: z.url(),
  })
  .strict();
export type InstallationManifest = z.infer<typeof installationManifestSchema>;
