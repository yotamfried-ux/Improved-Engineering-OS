/**
 * Simulation Manifest -- report appendix, D14, D17, F10.
 *
 * The report's rule: criteria may never be changed after a failure to produce a
 * pass. If a scenario turns out to be invalid it gets a new `version` and the
 * old failure is kept. `version` is therefore required and monotonic by
 * convention, and the manifest carries its own validity controls so a broken
 * grader is detectable.
 *
 * F10: `hidden_conditions_ref` must point outside `simulations/`. A hidden
 * condition stored next to the manifest is reachable from an agent sandbox that
 * mounts the manifest, which would silently invalidate every trial that used it.
 * The scheme prefix is checked here; that the target exists is checked by the
 * manifest linter when `evaluator/` exists.
 */

import { z } from 'zod';
import { lifecycleFields } from './lifecycle.ts';

export const graderKindSchema = z.enum(['deterministic', 'trace_rule', 'model']);

/**
 * The report's grading hierarchy, as data.
 *
 * Lower number outranks higher. An LLM grader may never overrule a deterministic
 * test that shows the code failed -- the report is explicit about that -- so the
 * ordering is encoded rather than left to whoever writes the grader.
 */
export const GRADER_PRECEDENCE = {
  deterministic: 0,
  trace_rule: 1,
  model: 2,
} as const satisfies Record<z.infer<typeof graderKindSchema>, number>;

export const graderRefSchema = z
  .object({
    id: z.string().min(1),
    kind: graderKindSchema,
  })
  .strict();

export const simulationManifestSchema = z
  .object({
    ...lifecycleFields,

    id: z.string().min(1),
    /** A new version, never an edit, when a scenario turns out to be invalid. */
    version: z.int().positive(),
    claim: z.string().min(1),

    environment: z
      .object({
        repo_revision: z.string().min(1),
        eos_release: z.string().min(1),
        agent: z.string().min(1),
        model: z.string().min(1),
        tools: z.array(z.string().min(1)),
        permissions: z.array(z.string().min(1)),
        network_policy: z.enum(['deny', 'allowlist', 'unrestricted']),
        budgets: z.record(z.string().min(1), z.number().nonnegative()),
      })
      .strict(),

    starting_state: z.record(z.string().min(1), z.string()),
    stimulus: z.object({ task: z.string().min(1) }).strict(),

    /**
     * Must resolve outside `simulations/` (F10, TD-16).
     *
     * `evaluator-only://` is the scheme the report uses; it names a location the
     * agent workspace never mounts.
     */
    hidden_conditions_ref: z
      .string()
      .regex(
        /^evaluator-only:\/\/.+/u,
        'hidden conditions must live outside simulations/ under the evaluator-only:// scheme (F10)',
      ),

    allowed_interventions: z
      .object({
        user_architecture_decision: z.boolean(),
        /** Always false for a real slice: coaching invalidates the hidden condition. */
        eos_coaching: z.boolean(),
      })
      .strict(),

    success_criteria: z.array(z.string().min(1)).min(1),
    failure_criteria: z.array(z.string().min(1)).min(1),
    stop_conditions: z.array(z.string().min(1)).min(1),

    graders: z.array(graderRefSchema).min(1),

    /**
     * Every critical grader needs a positive and a negative control (report;
     * Stage 0 "grader validity"). A grader that cannot fail proves nothing, and
     * the Stage 0 manifest names "evaluator does not detect known-bad" as a
     * failure condition.
     */
    validity_controls: z
      .object({
        positive: z.array(z.string().min(1)).min(1),
        negative: z.array(z.string().min(1)).min(1),
        mutation: z.array(z.string().min(1)),
      })
      .strict(),

    required_evidence: z.array(z.string().min(1)).min(1),
    recovery: z.object({ procedure: z.string().min(1) }).strict(),

    repetition_policy: z
      .object({
        type: z.enum(['deterministic', 'stochastic']),
        minimum_trials: z.int().positive().nullable(),
        stopping_rule: z.string().min(1),
      })
      .strict()
      .superRefine((policy, ctx) => {
        // "No capability may be inferred from a single stochastic run" (report).
        if (policy.type === 'stochastic' && (policy.minimum_trials ?? 0) < 2) {
          ctx.addIssue({
            code: 'custom',
            path: ['minimum_trials'],
            message:
              'a stochastic evaluation needs more than one trial; capability may not be ' +
              'inferred from a single stochastic run',
          });
        }
      }),
  })
  .strict()
  .superRefine((manifest, ctx) => {
    if (manifest.success_criteria.some((c) => manifest.failure_criteria.includes(c))) {
      ctx.addIssue({
        code: 'custom',
        path: ['failure_criteria'],
        message: 'a criterion cannot be both a success and a failure condition',
      });
    }
  });

export type SimulationManifest = z.infer<typeof simulationManifestSchema>;
