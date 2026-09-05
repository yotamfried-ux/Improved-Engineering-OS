/**
 * JSON Schema emission -- pure, no I/O.
 *
 * `core` must not touch the filesystem (F1, and the behavioural no-I/O test), so
 * this module only *produces* the schema documents. `tools/contracts-gen` writes
 * them to `contracts/schemas/`.
 *
 * `unrepresentable: 'throw'` is deliberate (D18.5, verified): if a contract ever
 * grows a `Date`, `Map`, `Set` or transform, emission fails loudly instead of
 * silently producing a schema that does not describe the contract.
 */

import { z } from 'zod';
import { CONTRACT_REGISTRY } from './contracts/index.ts';

export interface EmittedSchema {
  readonly name: string;
  readonly fileName: string;
  readonly document: Record<string, unknown>;
}

/**
 * Emit every registered contract as a draft-2020-12 JSON Schema.
 *
 * Sorted by *file name*, not by contract name. The two orders differ -- `run`
 * sorts before `run-telemetry-state`, but `run-telemetry-state.schema.json`
 * sorts before `run.schema.json`, because `-` precedes `.` -- and sorting by
 * file name is what makes emission order match a directory listing. That is what
 * turns `pnpm contracts:check` into a meaningful determinism test rather than a
 * formatting check.
 */
export function emitContractSchemas(): readonly EmittedSchema[] {
  return CONTRACT_REGISTRY.map((descriptor) => ({
    name: descriptor.name,
    fileName: `${descriptor.name}.schema.json`,
    document: z.toJSONSchema(descriptor.schema, {
      target: 'draft-2020-12',
      unrepresentable: 'throw',
      io: 'input',
    }) as Record<string, unknown>,
  })).sort((a, b) => (a.fileName < b.fileName ? -1 : a.fileName > b.fileName ? 1 : 0));
}

/**
 * Serialize one schema document deterministically.
 *
 * Two-space indent, LF, trailing newline. The file is committed and diffed, so
 * its bytes are part of the contract.
 */
export function serializeSchemaDocument(document: Record<string, unknown>): string {
  return `${JSON.stringify(document, null, 2)}\n`;
}
