/**
 * Runs and principals -- guide section 5.9, D22, D36, Q-07.
 *
 * These exist at Stage 0 specifically so no migration is needed later (D36's
 * closing line). Nothing implements them yet.
 *
 * D36's whole mechanism is that a Run's `origin_class` comes from a record
 * written by a service principal before the run's first event, never from the
 * events themselves. Two things enforce that here: `registerRunRequestSchema` is
 * separate from the telemetry envelope (which has no `origin_class` field at
 * all), and `DEFAULT_ORIGIN_CLASS` states the fallback for an unregistered run
 * in one place.
 */

import { z } from 'zod';
import { isoInstantSchema, lifecycleFields } from './lifecycle.ts';
import { originClassSchema } from './asset.ts';

export const principalKindSchema = z.enum(['installation', 'service']);
export type PrincipalKind = z.infer<typeof principalKindSchema>;

/**
 * The complete scope vocabulary. Closed on purpose: an unrecognised scope must
 * not be tolerated, because tolerating it means granting nothing while looking
 * like it granted something.
 */
export const scopeSchema = z.enum([
  'telemetry.insert',
  'observation.insert',
  'read.minimal',
  'run.register',
  'proposal.read',
  'proposal.ack',
  'ci',
]);
export type Scope = z.infer<typeof scopeSchema>;

/** D22.1: an installation may only ever hold these three. */
const INSTALLATION_SCOPES: readonly Scope[] = [
  'telemetry.insert',
  'observation.insert',
  'read.minimal',
];

export const principalSchema = z
  .object({
    ...lifecycleFields,
    id: z.string().min(1),
    kind: principalKindSchema,
    owner_id: z.string().min(1),
    /**
     * SHA-256 of the opaque token. The token itself is never stored (D22.1) and
     * never appears in any contract in this repository.
     */
    token_hash: z.string().regex(/^[0-9a-f]{64}$/u, 'expected 64 lowercase hex characters'),
    scopes: z.array(scopeSchema).min(1),
    label: z.string().min(1).nullable(),
    created_at: isoInstantSchema,
    expires_at: isoInstantSchema,
    revoked_at: isoInstantSchema.nullable(),
    last_seen_at: isoInstantSchema.nullable(),
  })
  .strict()
  .superRefine((principal, ctx) => {
    if (principal.kind === 'installation') {
      const extra = principal.scopes.filter((scope) => !INSTALLATION_SCOPES.includes(scope));
      if (extra.length > 0) {
        ctx.addIssue({
          code: 'custom',
          path: ['scopes'],
          message:
            `an installation may not hold ${extra.join(', ')}; ` +
            `installation scopes are ${INSTALLATION_SCOPES.join(', ')} (D22)`,
        });
      }
    }
  });
export type PrincipalRecord = z.infer<typeof principalSchema>;

/** An unregistered run is `operational`, never anything stronger (D36). */
export const DEFAULT_ORIGIN_CLASS = 'operational' as const;

/**
 * `register_run` -- exposed to service principals holding `run.register` only.
 *
 * Must be called before the run's first event; late registration is rejected.
 * That rejection is a server rule, but the shape is fixed here so both sides
 * agree on it.
 */
export const registerRunRequestSchema = z
  .object({
    run_id: z.string().min(1),
    origin_class: originClassSchema,
    eval_set_version: z.string().min(1).nullable(),
    holdout_state: z.enum(['active', 'retired']).nullable(),
    simulation_id: z.string().min(1).nullable(),
  })
  .strict()
  .superRefine((request, ctx) => {
    if (request.origin_class === 'holdout' && request.holdout_state === null) {
      ctx.addIssue({
        code: 'custom',
        path: ['holdout_state'],
        message: 'registering a holdout run requires holdout_state (D33, D36)',
      });
    }
    if (request.origin_class !== 'holdout' && request.holdout_state !== null) {
      ctx.addIssue({
        code: 'custom',
        path: ['holdout_state'],
        message: 'holdout_state is only meaningful for a holdout run',
      });
    }
    if (request.origin_class === 'holdout' && request.eval_set_version === null) {
      ctx.addIssue({
        code: 'custom',
        path: ['eval_set_version'],
        message: 'a holdout run must name the eval set version the scorer treats per D33',
      });
    }
  });
export type RegisterRunRequest = z.infer<typeof registerRunRequestSchema>;

export const runSchema = z
  .object({
    ...lifecycleFields,
    run_id: z.string().min(1),
    owner_id: z.string().min(1),
    /** Null for an unregistered (therefore operational) run. */
    registered_by: z.string().min(1).nullable(),
    origin_class: originClassSchema,
    holdout_state: z.enum(['active', 'retired']).nullable(),
    eval_set_version: z.string().min(1).nullable(),
    simulation_id: z.string().min(1).nullable(),
    registered_at: isoInstantSchema.nullable(),
    first_event_at: isoInstantSchema.nullable(),
    telemetry_state: z.enum(['COMPLETE', 'INCOMPLETE']).nullable(),
    qualification_eligible: z.boolean().nullable(),
  })
  .strict()
  .superRefine((run, ctx) => {
    // D36: only a registered run may carry a classification other than the default.
    if (run.registered_by === null && run.origin_class !== DEFAULT_ORIGIN_CLASS) {
      ctx.addIssue({
        code: 'custom',
        path: ['origin_class'],
        message:
          `an unregistered run is "${DEFAULT_ORIGIN_CLASS}"; ` +
          `only a service principal may pre-register another class (D36)`,
      });
    }
    if (run.registered_by !== null && run.registered_at === null) {
      ctx.addIssue({
        code: 'custom',
        path: ['registered_at'],
        message: 'a registered run must record when it was registered',
      });
    }
    // D36: registration must precede the first event; late registration is rejected.
    if (
      run.registered_at !== null &&
      run.first_event_at !== null &&
      Date.parse(run.registered_at) > Date.parse(run.first_event_at)
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['registered_at'],
        message: "register_run must be called before the run's first event (D36)",
      });
    }
    if (run.telemetry_state === 'INCOMPLETE' && run.qualification_eligible === true) {
      ctx.addIssue({
        code: 'custom',
        path: ['qualification_eligible'],
        message: 'an INCOMPLETE run is never qualification-eligible (D23)',
      });
    }
  });
export type RunRecord = z.infer<typeof runSchema>;
