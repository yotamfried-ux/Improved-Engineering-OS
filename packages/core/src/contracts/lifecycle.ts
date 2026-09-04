/**
 * The lifecycle block every public IEOS contract carries (guide section 5, and
 * the report's Compatibility/Deprecation Contract).
 *
 * The report models this on OpenTelemetry's stability lifecycle: a `stable`
 * contract takes no breaking semantic change within a major version, and
 * unknown enum values are tolerated where that can be done safely.
 */

import { z } from 'zod';

export const stabilitySchema = z.enum(['development', 'stable', 'deprecated', 'removed']);
export type Stability = z.infer<typeof stabilitySchema>;

/**
 * ISO-8601 instant.
 *
 * A string, never a `Date`: D18.5 records that `Date` is unrepresentable in JSON
 * Schema and that `z.toJSONSchema(..., { unrepresentable: 'throw' })` would
 * refuse it. It is also unhashable under D35 (`hashing.ts` rejects `Date`), so
 * the same rule holds at both boundaries.
 */
export const isoInstantSchema = z.iso.datetime({ offset: true });

/** `sha256:<lowercase hex>`, D35's textual digest form. */
export const sha256DigestSchema = z
  .string()
  .regex(/^sha256:[0-9a-f]{64}$/u, 'expected "sha256:" followed by 64 lowercase hex characters');

export const lifecycleSchema = z.object({
  schema_version: z.string().min(1),
  stability: stabilitySchema,
  introduced_in: z.string().min(1),
  deprecated_in: z.string().min(1).nullable(),
  replacement: z.string().min(1).nullable(),
  migration_path: z.string().min(1).nullable(),
});
export type Lifecycle = z.infer<typeof lifecycleSchema>;

/**
 * The lifecycle block a Stage 0 contract carries.
 *
 * Every contract in this package is `development`. Marking any of them `stable`
 * before the Stage 3 slice has exercised it would be a promise this project has
 * no evidence for.
 */
export const STAGE_0_LIFECYCLE: Lifecycle = {
  schema_version: '1',
  stability: 'development',
  introduced_in: '0.1.0',
  deprecated_in: null,
  replacement: null,
  migration_path: null,
};

/**
 * Attach the lifecycle block to a contract's object shape.
 *
 * Each contract spreads this so the block is structurally part of the schema
 * rather than documentation about it.
 */
export const lifecycleFields = {
  schema_version: z.string().min(1),
  stability: stabilitySchema,
  introduced_in: z.string().min(1),
  deprecated_in: z.string().min(1).nullable().default(null),
  replacement: z.string().min(1).nullable().default(null),
  migration_path: z.string().min(1).nullable().default(null),
} as const;

/**
 * An enum that tolerates unrecognised values.
 *
 * The report requires unknown enum values to be tolerated "when it can be done
 * safely". Safely means: the value survives, and the caller can see it did not
 * match. It is used for open vocabularies such as event types, and deliberately
 * NOT for closed safety-relevant vocabularies such as `origin_class` or
 * `canonical_state`, where an unrecognised value must be rejected.
 */
export function openEnum<const T extends readonly [string, ...string[]]>(values: T) {
  return z.union([z.enum(values), z.string().min(1)]);
}
