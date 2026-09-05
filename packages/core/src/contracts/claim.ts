/**
 * Claim status: the one place the difference between "passed", "failed" and
 * "never observed" is defined.
 *
 * The constitution states the rule this contract exists to make structural:
 * *"No silent guessing — missing information is UNKNOWN, not inferred success"*,
 * and D23's telemetry corollary, *"telemetry loss must never look like a
 * measured run"*.
 *
 * Several vocabularies for the same three-way distinction had already grown up
 * around the repository, each correct in its own domain:
 *
 *   isolation boundaries   proven | violated | unproven
 *   qualification checks   pass   | fail     | unexecuted
 *   score snapshots        DERIVED (proven) | -- | UNPROVEN
 *   run telemetry          COMPLETE | -- | INCOMPLETE
 *   fitness rules          enforced | -- | not-yet-enforceable / partial
 *
 * This module does not replace any of them. It names the shared shape --
 * `proven | failed | unproven` -- and maps each domain vocabulary onto it, so a
 * report can aggregate across domains without anyone inventing a sixth
 * vocabulary to do it. The domain terms stay the terms their domain uses.
 */

import { z } from 'zod';
import { lifecycleFields } from './lifecycle.ts';

/**
 * The three-way distinction, and only these three.
 *
 * There is deliberately no fourth value meaning "probably fine" or "not
 * applicable": both would become places for an unobserved claim to hide.
 */
export const claimStatusSchema = z.enum(['proven', 'failed', 'unproven']);
export type ClaimStatus = z.infer<typeof claimStatusSchema>;

/** Why a claim is `unproven`. Required, so absence of evidence is explained. */
export const unprovenReasonSchema = z.enum([
  /** The check exists but was not executed in this environment. */
  'not_executed',
  /** Executed, but the observation needed was not available. */
  'not_observed',
  /** The subject the claim is about does not exist yet. */
  'no_subject',
  /** An external dependency prevents execution. */
  'blocked',
]);
export type UnprovenReason = z.infer<typeof unprovenReasonSchema>;

export const claimSchema = z
  .object({
    ...lifecycleFields,
    id: z.string().min(1),
    statement: z.string().min(1),
    status: claimStatusSchema,
    /** Required when unproven, forbidden otherwise. */
    unproven_reason: unprovenReasonSchema.nullable(),
    /**
     * What was actually observed, or what stopped it being observed.
     *
     * Required on every status, including `proven`: a proven claim with no
     * evidence is an assertion, which is what this whole contract is against.
     */
    evidence: z.string().min(1),
    /** Where the claim was observed, when that is part of what it proves. */
    observed_on: z.array(z.string().min(1)),
    /** Environments the claim must hold on before it counts as proven. */
    required_on: z.array(z.string().min(1)),
  })
  .strict()
  .superRefine((claim, ctx) => {
    if (claim.status === 'unproven' && claim.unproven_reason === null) {
      ctx.addIssue({
        code: 'custom',
        path: ['unproven_reason'],
        message: 'an unproven claim must say why it is unproven; silence reads as a pass',
      });
    }
    if (claim.status !== 'unproven' && claim.unproven_reason !== null) {
      ctx.addIssue({
        code: 'custom',
        path: ['unproven_reason'],
        message: 'unproven_reason is only meaningful when the status is unproven',
      });
    }
    // The core rule: a claim cannot be proven on fewer environments than it
    // requires. This is what stops "green on Linux" from becoming "green".
    if (claim.status === 'proven') {
      const missing = claim.required_on.filter((env) => !claim.observed_on.includes(env));
      if (missing.length > 0) {
        ctx.addIssue({
          code: 'custom',
          path: ['status'],
          message:
            `claim requires observation on ${missing.join(', ')} but was only observed on ` +
            `${claim.observed_on.join(', ') || '(nothing)'}; it is unproven, not proven`,
        });
      }
    }
  });

export type ClaimRecord = z.infer<typeof claimSchema>;

// ---------------------------------------------------------------------------
// Mappings from the vocabularies already in use
// ---------------------------------------------------------------------------

/** `proven | violated | unproven` (harness isolation boundaries). */
export function fromBoundaryVerdict(verdict: 'proven' | 'violated' | 'unproven'): ClaimStatus {
  return verdict === 'proven' ? 'proven' : verdict === 'violated' ? 'failed' : 'unproven';
}

/** `pass | fail | unexecuted` (qualification checks). */
export function fromCheckOutcome(outcome: 'pass' | 'fail' | 'unexecuted'): ClaimStatus {
  return outcome === 'pass' ? 'proven' : outcome === 'fail' ? 'failed' : 'unproven';
}

/** `UNPROVEN | DERIVED` (score snapshot state, D24). */
export function fromSnapshotState(state: 'UNPROVEN' | 'DERIVED'): ClaimStatus {
  return state === 'DERIVED' ? 'proven' : 'unproven';
}

/** `COMPLETE | INCOMPLETE` (run telemetry state, D23). */
export function fromTelemetryState(state: 'COMPLETE' | 'INCOMPLETE'): ClaimStatus {
  return state === 'COMPLETE' ? 'proven' : 'unproven';
}

/** `enforced | partial | not-yet-enforceable` (fitness rules). */
export function fromFitnessStatus(
  status: 'enforced' | 'partial' | 'not-yet-enforceable',
): ClaimStatus {
  return status === 'enforced' ? 'proven' : 'unproven';
}

/**
 * Aggregate a set of claims.
 *
 * Deliberately pessimistic, in this order: any failure makes the whole set
 * `failed`; otherwise any unproven claim makes it `unproven`; only an entirely
 * proven set is `proven`. An empty set is `unproven`, never `proven` — nothing
 * observed is not the same as nothing wrong, and an empty set silently passing
 * is precisely how a vacuous check reports success.
 */
export function aggregateClaims(claims: readonly { readonly status: ClaimStatus }[]): ClaimStatus {
  if (claims.length === 0) return 'unproven';
  if (claims.some((claim) => claim.status === 'failed')) return 'failed';
  if (claims.some((claim) => claim.status === 'unproven')) return 'unproven';
  return 'proven';
}
