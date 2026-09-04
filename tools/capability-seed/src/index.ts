/**
 * D28 capability taxonomy seed.
 *
 * The guide (D28, Appendix A) says `contracts/capabilities.yaml` is "seeded from
 * this repository's `core/capability-registry.yaml`", keeping ids and dropping
 * enforcement fields.
 *
 * Two rules govern what this transform is allowed to do:
 *
 *   Keep ids verbatim. An id is the identity a Solution Set's equivalence class
 *   is built on (D28), and provenance that renames its subject is not
 *   provenance. Nothing here normalizes, prefixes, re-cases or "tidies" an id.
 *
 *   Drop enforcement, keep taxonomy. D16 is explicit that old workflow policy
 *   must not become a runtime rule, and R-04's failure mode is exactly that.
 *   `runtime_status` and the registry's `selection_rules` / `coverage_contract`
 *   are enforcement; the id and its source class are taxonomy. The dropped
 *   field names are recorded in the output so the omission is auditable rather
 *   than invisible.
 *
 * The transform is pure and deterministic: same source bytes in, same document
 * out, capabilities sorted by id.
 */

import { parse } from 'yaml';

export class CapabilitySeedError extends Error {
  readonly at: string;
  constructor(message: string, at: string) {
    super(`${message} (at ${at})`);
    this.name = 'CapabilitySeedError';
    this.at = at;
  }
}

export interface SeedProvenance {
  readonly repository: string;
  readonly path: string;
  /** Exact commit the bytes were read at. Never a branch name. */
  readonly revision: string;
  /** `sha256:<hex>` over the exact source bytes, per D35. */
  readonly source_digest: string;
}

export interface SeededCapability {
  readonly id: string;
  readonly kind: string;
}

export interface CapabilitySeedDocument {
  readonly schema_version: string;
  readonly stability: string;
  readonly introduced_in: string;
  readonly deprecated_in: null;
  readonly replacement: null;
  readonly migration_path: null;
  readonly seed: {
    readonly status: 'seeded';
    readonly source: SeedProvenance;
    /** Field names deliberately not carried over, so the omission is auditable. */
    readonly dropped_fields: readonly string[];
    readonly note: string;
  };
  readonly kinds: readonly { readonly id: string; readonly description: string }[];
  readonly capabilities: readonly SeededCapability[];
}

/**
 * Fields that exist in the legacy registry and must not reach the new contract.
 *
 * Each is enforcement or old-runtime state, not taxonomy.
 */
export const DROPPED_CAPABILITY_FIELDS: readonly string[] = ['runtime_status'];

/** Top-level registry sections that are enforcement or workflow, never taxonomy. */
export const DROPPED_REGISTRY_SECTIONS: readonly string[] = [
  'runtime_enabled',
  'runtime_scope',
  'coverage_contract',
  'selection_rules',
  'task_classes',
  'next_pr_contract',
  'legacy_compatibility',
  'rejected_for_now',
  'removed_external_skills',
];

interface LegacyRegistry {
  readonly source_classes?: Record<string, { description?: string }>;
  readonly capabilities?: Record<string, Record<string, unknown>>;
}

/**
 * Transform the legacy registry text into the D28 seed document.
 *
 * @throws CapabilitySeedError on a duplicate id, an unknown or missing kind, an
 *         empty id, or a malformed source. Every one of these is a reason to
 *         stop rather than to emit a partially trustworthy taxonomy.
 */
export function seedCapabilities(
  sourceText: string,
  provenance: SeedProvenance,
): CapabilitySeedDocument {
  let registry: LegacyRegistry;
  try {
    registry = parse(sourceText) as LegacyRegistry;
  } catch (error) {
    throw new CapabilitySeedError(
      `source is not valid YAML: ${error instanceof Error ? error.message : String(error)}`,
      provenance.path,
    );
  }

  if (registry === null || typeof registry !== 'object') {
    throw new CapabilitySeedError('source did not parse to a mapping', provenance.path);
  }

  const sourceClasses = registry.source_classes;
  if (sourceClasses === undefined || Object.keys(sourceClasses).length === 0) {
    throw new CapabilitySeedError(
      'source declares no source_classes, so no kind vocabulary can be carried over',
      'source_classes',
    );
  }

  const capabilities = registry.capabilities;
  if (capabilities === undefined || Object.keys(capabilities).length === 0) {
    throw new CapabilitySeedError(
      'source declares no capabilities; an empty seed would be indistinguishable from an ' +
        'unreachable source, which is exactly the ambiguity this seed exists to remove',
      'capabilities',
    );
  }

  const kinds = Object.entries(sourceClasses)
    .map(([id, value]) => {
      const description = value?.description;
      if (typeof description !== 'string' || description.trim().length === 0) {
        throw new CapabilitySeedError('source class has no description', `source_classes.${id}`);
      }
      return { id, description };
    })
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const knownKinds = new Set(kinds.map((kind) => kind.id));
  const seen = new Set<string>();
  const seeded: SeededCapability[] = [];

  for (const [id, value] of Object.entries(capabilities)) {
    if (id.trim().length === 0) {
      throw new CapabilitySeedError('capability id is empty', 'capabilities');
    }
    // Ids are kept verbatim; a duplicate is a conflict, never a merge (D19's
    // "equal hash with different metadata yields related_to, not a merge" is the
    // same principle one level down).
    if (seen.has(id)) {
      throw new CapabilitySeedError(`duplicate capability id ${JSON.stringify(id)}`, 'capabilities');
    }
    seen.add(id);

    if (value === null || typeof value !== 'object') {
      throw new CapabilitySeedError('capability entry is not a mapping', `capabilities.${id}`);
    }
    const kind = value['kind'];
    if (typeof kind !== 'string' || kind.trim().length === 0) {
      throw new CapabilitySeedError('capability declares no kind', `capabilities.${id}`);
    }
    if (!knownKinds.has(kind)) {
      throw new CapabilitySeedError(
        `capability declares kind ${JSON.stringify(kind)}, which is not in source_classes`,
        `capabilities.${id}`,
      );
    }
    seeded.push({ id, kind });
  }

  seeded.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  return {
    schema_version: '1',
    stability: 'development',
    introduced_in: '0.1.0',
    deprecated_in: null,
    replacement: null,
    migration_path: null,
    seed: {
      status: 'seeded',
      source: provenance,
      dropped_fields: [...DROPPED_CAPABILITY_FIELDS, ...DROPPED_REGISTRY_SECTIONS],
      note:
        'Ids are carried over verbatim (D28, Appendix A). Enforcement fields are dropped: the ' +
        'old runtime gate is not inherited (D16), and old workflow policy must never become a ' +
        'runtime rule. Growth from here is by promotion PR only.',
    },
    kinds,
    capabilities: seeded,
  };
}

/**
 * Render the seed as the YAML this repository commits.
 *
 * Hand-rendered rather than passed through a YAML serializer: the file is
 * committed, diffed and regenerated, so its exact bytes are part of the
 * contract, and a serializer's formatting choices are not something this
 * project should inherit silently.
 */
export function renderCapabilitiesYaml(document: CapabilitySeedDocument): string {
  const lines: string[] = [
    '# Capability taxonomy (D28).',
    '#',
    '# GENERATED by tools/capability-seed. Do not edit by hand.',
    '# Regenerate with: pnpm capabilities:emit',
    '#',
    '# Seeded from the legacy Engineering-OS capability registry at the exact revision',
    '# recorded below. Ids are verbatim; enforcement fields are dropped, because the old',
    '# runtime gate is explicitly not inherited (D16, R-04).',
    '#',
    '# Growth rule (D28): capabilities are added only through a promotion PR. Before Stage 10',
    '# that is the C-04 bootstrap path -- an import tool writes a local bundle and the owner',
    '# opens the PR; the tool never pushes.',
    '',
    `schema_version: ${JSON.stringify(document.schema_version)}`,
    `stability: ${document.stability}`,
    `introduced_in: ${JSON.stringify(document.introduced_in)}`,
    'deprecated_in: null',
    'replacement: null',
    'migration_path: null',
    '',
    'seed:',
    `  status: ${document.seed.status}`,
    '  source:',
    `    repository: ${JSON.stringify(document.seed.source.repository)}`,
    `    path: ${JSON.stringify(document.seed.source.path)}`,
    `    revision: ${JSON.stringify(document.seed.source.revision)}`,
    `    source_digest: ${JSON.stringify(document.seed.source.source_digest)}`,
    '  dropped_fields:',
    ...document.seed.dropped_fields.map((field) => `    - ${JSON.stringify(field)}`),
    `  note: >-`,
    ...wrap(document.seed.note, 92).map((line) => `    ${line}`),
    '',
    '# The kind vocabulary, carried over from the source registry\'s source_classes.',
    'kinds:',
  ];

  for (const kind of document.kinds) {
    lines.push(`  - id: ${JSON.stringify(kind.id)}`);
    lines.push(`    description: ${JSON.stringify(kind.description)}`);
  }

  lines.push('');
  lines.push(`# ${String(document.capabilities.length)} capabilities, sorted by id.`);
  lines.push('capabilities:');
  for (const capability of document.capabilities) {
    lines.push(`  - id: ${JSON.stringify(capability.id)}`);
    lines.push(`    kind: ${JSON.stringify(capability.kind)}`);
  }

  return `${lines.join('\n')}\n`;
}

function wrap(text: string, width: number): string[] {
  const words = text.split(/\s+/u);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    if (current.length === 0) current = word;
    else if (current.length + 1 + word.length <= width) current = `${current} ${word}`;
    else {
      lines.push(current);
      current = word;
    }
  }
  if (current.length > 0) lines.push(current);
  return lines;
}
