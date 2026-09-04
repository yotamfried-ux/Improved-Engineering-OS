/**
 * Solution Set contract -- guide section 5.10, D34, P-01, C-01.
 *
 * Three invariants are made structural here, because each of them is something
 * the guide expects a fitness rule or a code review to catch, and a contract can
 * catch it earlier and more reliably:
 *
 *   1. `champion_id` is non-null exactly when `canonical_state` is `pinned`.
 *      A "temporary winner" for an unresolved set is unrepresentable.
 *
 *   2. `challenge_state` cannot appear at all. C-01 split ownership: Git owns
 *      `canonical_state`, the Evidence Plane derives `challenge_state` into the
 *      score view. `.strict()` means writing it into `knowledge/` is a schema
 *      rejection, which is half of fitness rule F11 enforced without a resolver
 *      existing yet.
 *
 *   3. An unresolved set must say why. `why_unresolved` is required when the set
 *      is unresolved, so `resolve` can report honest coverage rather than
 *      silence.
 */

import { z } from 'zod';
import { lifecycleFields } from './lifecycle.ts';

export const canonicalStateSchema = z.enum(['unresolved', 'pinned']);
export type CanonicalState = z.infer<typeof canonicalStateSchema>;

/**
 * Derived at runtime into the score view; never stored in Git.
 *
 * Exported for the score-view contract's use. It is deliberately NOT part of
 * `solutionSetSchema`.
 */
export const challengeStateSchema = z.enum(['none', 'challenged']);
export type ChallengeState = z.infer<typeof challengeStateSchema>;

export const solutionSetSchema = z
  .object({
    ...lifecycleFields,

    id: z.string().min(1),
    problem_id: z.string().min(1),
    /** With `problem_id`, defines the equivalence class (D28). */
    compatibility_key: z.string().min(1),
    members: z.array(z.string().min(1)),

    canonical_state: canonicalStateSchema,
    champion_id: z.string().min(1).nullable(),
    champion_since_release: z.string().min(1).nullable(),
    why_unresolved: z.string().min(1).nullable(),
  })
  .strict()
  .superRefine((set, ctx) => {
    if (set.canonical_state === 'pinned') {
      if (set.champion_id === null) {
        ctx.addIssue({
          code: 'custom',
          path: ['champion_id'],
          message: 'canonical_state "pinned" requires a non-null champion_id',
        });
      } else if (!set.members.includes(set.champion_id)) {
        ctx.addIssue({
          code: 'custom',
          path: ['champion_id'],
          message: 'champion_id must be a member of the solution set',
        });
      }
      if (set.why_unresolved !== null) {
        ctx.addIssue({
          code: 'custom',
          path: ['why_unresolved'],
          message: 'a pinned solution set must not carry why_unresolved',
        });
      }
      return;
    }

    // canonical_state === 'unresolved'
    if (set.champion_id !== null) {
      ctx.addIssue({
        code: 'custom',
        path: ['champion_id'],
        message:
          'canonical_state "unresolved" requires champion_id null; ' +
          'there is no path from unresolved to a champion that skips a promotion (C-05)',
      });
    }
    if (set.champion_since_release !== null) {
      ctx.addIssue({
        code: 'custom',
        path: ['champion_since_release'],
        message: 'an unresolved solution set has no champion, so no pinning release',
      });
    }
    if (set.why_unresolved === null) {
      ctx.addIssue({
        code: 'custom',
        path: ['why_unresolved'],
        message: 'an unresolved solution set must record why it is unresolved',
      });
    }
  });

export type SolutionSetRecord = z.infer<typeof solutionSetSchema>;
