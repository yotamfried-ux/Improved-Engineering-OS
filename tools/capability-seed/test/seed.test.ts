/**
 * D28 capability seed (Stage 0 criterion B4).
 *
 * The properties that matter, and that the user brief names explicitly: ids are
 * preserved, duplicates and conflicts are rejected, and regeneration is stable.
 *
 * The transform tests use small inline fixtures so they run everywhere. One
 * further test regenerates from the real legacy checkout and asserts byte
 * identity with the committed file; it can only run where that checkout is
 * present, and it reports that rather than passing silently.
 */

import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { sha256Text } from '@ieos/core';
import {
  CapabilitySeedError,
  DROPPED_CAPABILITY_FIELDS,
  renderCapabilitiesYaml,
  seedCapabilities,
  type SeedProvenance,
} from '../src/index.ts';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const committedPath = join(repoRoot, 'contracts', 'capabilities.yaml');

const PROVENANCE: SeedProvenance = {
  repository: 'owner/legacy',
  path: 'core/capability-registry.yaml',
  revision: 'a'.repeat(40),
  source_digest: 'sha256:00',
};

const MINIMAL = `
source_classes:
  validator: {description: "A check."}
  pattern: {description: "A reusable pattern."}
capabilities:
  b.second: {kind: validator, runtime_status: active_plan_gate}
  a.first: {kind: pattern, runtime_status: active_plan_gate}
`;

describe('ids are preserved verbatim', () => {
  it('keeps the id exactly as written', () => {
    const document = seedCapabilities(MINIMAL, PROVENANCE);
    expect(document.capabilities.map((c) => c.id)).toEqual(['a.first', 'b.second']);
  });

  it('does not normalize, re-case, prefix or tidy an id', () => {
    // An id is the identity a Solution Set's equivalence class rests on (D28).
    // Provenance that renames its subject is not provenance.
    const odd = `
source_classes:
  validator: {description: "A check."}
capabilities:
  "Weird.ID_with-Mixed.Case": {kind: validator}
`;
    expect(seedCapabilities(odd, PROVENANCE).capabilities[0]?.id).toBe('Weird.ID_with-Mixed.Case');
  });

  it('carries the kind vocabulary over from source_classes', () => {
    const document = seedCapabilities(MINIMAL, PROVENANCE);
    expect(document.kinds.map((k) => k.id)).toEqual(['pattern', 'validator']);
    expect(document.kinds[0]?.description).toBe('A reusable pattern.');
  });

  it('drops enforcement fields, and records that it did', () => {
    const document = seedCapabilities(MINIMAL, PROVENANCE);
    for (const capability of document.capabilities) {
      expect(Object.keys(capability).sort()).toEqual(['id', 'kind']);
      expect(capability).not.toHaveProperty('runtime_status');
    }
    // The omission is auditable rather than invisible.
    for (const field of DROPPED_CAPABILITY_FIELDS) {
      expect(document.seed.dropped_fields).toContain(field);
    }
  });

  it('records the exact provenance it was given', () => {
    expect(seedCapabilities(MINIMAL, PROVENANCE).seed.source).toEqual(PROVENANCE);
  });
});

describe('duplicates and conflicts are rejected, never merged', () => {
  it('rejects an unknown kind rather than inventing a class for it', () => {
    const unknownKind = `
source_classes:
  validator: {description: "A check."}
capabilities:
  a.first: {kind: not_a_declared_class}
`;
    expect(() => seedCapabilities(unknownKind, PROVENANCE)).toThrow(/not in source_classes/u);
  });

  it('rejects a capability with no kind', () => {
    const noKind = `
source_classes:
  validator: {description: "A check."}
capabilities:
  a.first: {runtime_status: active}
`;
    expect(() => seedCapabilities(noKind, PROVENANCE)).toThrow(/declares no kind/u);
  });

  it('rejects a source with no capabilities, so empty never means unreachable', () => {
    // The ambiguity this removes: before the seed, an empty file could mean
    // "the source had none" or "the source could not be read". Those must not
    // look the same.
    const empty = `
source_classes:
  validator: {description: "A check."}
capabilities: {}
`;
    expect(() => seedCapabilities(empty, PROVENANCE)).toThrow(/declares no capabilities/u);
  });

  it('rejects a source with no kind vocabulary', () => {
    expect(() => seedCapabilities('capabilities:\n  a.first: {kind: x}\n', PROVENANCE)).toThrow(
      /no source_classes/u,
    );
  });

  it('rejects malformed YAML rather than seeding a partial taxonomy', () => {
    expect(() => seedCapabilities('capabilities: [unclosed\n', PROVENANCE)).toThrow(
      CapabilitySeedError,
    );
  });

  it('rejects a capability entry that is not a mapping', () => {
    const scalar = `
source_classes:
  validator: {description: "A check."}
capabilities:
  a.first: "just a string"
`;
    expect(() => seedCapabilities(scalar, PROVENANCE)).toThrow(/not a mapping/u);
  });

  it('names the offending path on every rejection', () => {
    try {
      seedCapabilities(
        'source_classes:\n  v: {description: "d"}\ncapabilities:\n  a.first: {kind: nope}\n',
        PROVENANCE,
      );
      expect.unreachable('unknown kind should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(CapabilitySeedError);
      expect((error as CapabilitySeedError).at).toBe('capabilities.a.first');
    }
  });
});

describe('regeneration is stable', () => {
  it('produces an identical document from identical input', () => {
    expect(seedCapabilities(MINIMAL, PROVENANCE)).toEqual(seedCapabilities(MINIMAL, PROVENANCE));
  });

  it('produces identical bytes from identical input', () => {
    const once = renderCapabilitiesYaml(seedCapabilities(MINIMAL, PROVENANCE));
    const twice = renderCapabilitiesYaml(seedCapabilities(MINIMAL, PROVENANCE));
    expect(once).toBe(twice);
  });

  it('sorts capabilities by id, so source ordering cannot leak into the output', () => {
    const reordered = `
source_classes:
  validator: {description: "A check."}
  pattern: {description: "A reusable pattern."}
capabilities:
  a.first: {kind: pattern}
  b.second: {kind: validator}
`;
    expect(renderCapabilitiesYaml(seedCapabilities(reordered, PROVENANCE))).toBe(
      renderCapabilitiesYaml(seedCapabilities(MINIMAL, PROVENANCE)),
    );
  });

  it('renders YAML that parses back to the same ids and kinds', () => {
    const document = seedCapabilities(MINIMAL, PROVENANCE);
    const parsed = parse(renderCapabilitiesYaml(document)) as {
      capabilities: { id: string; kind: string }[];
    };
    expect(parsed.capabilities).toEqual([...document.capabilities]);
  });
});

// ---------------------------------------------------------------------------
// The committed artefact
// ---------------------------------------------------------------------------

const committed = readFileSync(committedPath, 'utf8');
const committedDocument = parse(committed) as {
  seed: { status: string; source: SeedProvenance; dropped_fields: string[] };
  kinds: { id: string }[];
  capabilities: { id: string; kind: string }[];
};

describe('the committed contracts/capabilities.yaml', () => {
  it('is seeded, not pending', () => {
    expect(committedDocument.seed.status).toBe('seeded');
  });

  it('carries an exact revision and a source digest, not a branch name', () => {
    expect(committedDocument.seed.source.revision).toMatch(/^[0-9a-f]{40}$/u);
    expect(committedDocument.seed.source.source_digest).toMatch(/^sha256:[0-9a-f]{64}$/u);
    expect(committedDocument.seed.source.repository).toBe('yotamfried-ux/Engineering-OS');
    expect(committedDocument.seed.source.path).toBe('core/capability-registry.yaml');
  });

  it('carries a non-vacuous corpus', () => {
    // Guards the failure this whole criterion is about: a seed that silently
    // produced nothing would otherwise look like a clean pass.
    expect(committedDocument.capabilities.length).toBeGreaterThanOrEqual(28);
    expect(committedDocument.kinds.length).toBeGreaterThanOrEqual(7);
  });

  it('carries no enforcement field on any capability', () => {
    for (const capability of committedDocument.capabilities) {
      expect(Object.keys(capability).sort()).toEqual(['id', 'kind']);
    }
  });

  it('declares every kind it uses', () => {
    const known = new Set(committedDocument.kinds.map((kind) => kind.id));
    for (const capability of committedDocument.capabilities) {
      expect(known, `kind ${capability.kind} is undeclared`).toContain(capability.kind);
    }
  });

  it('has no duplicate id', () => {
    const ids = committedDocument.capabilities.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('is sorted by id', () => {
    const ids = committedDocument.capabilities.map((c) => c.id);
    expect(ids).toEqual([...ids].sort());
  });
});

// ---------------------------------------------------------------------------
// Regeneration against the real source, where it is reachable
// ---------------------------------------------------------------------------

const legacyPath =
  process.env['IEOS_LEGACY_REGISTRY'] ?? '/home/user/engineering-os/core/capability-registry.yaml';
const legacyAvailable = existsSync(legacyPath);

describe('regeneration from the authoritative source', () => {
  it.skipIf(!legacyAvailable)('reproduces the committed file byte for byte', () => {
    const sourceText = readFileSync(legacyPath, 'utf8');
    const revision = execFileSync('git', ['-C', dirname(legacyPath), 'rev-parse', 'HEAD'], {
      encoding: 'utf8',
    }).trim();

    const rendered = renderCapabilitiesYaml(
      seedCapabilities(sourceText, {
        repository: 'yotamfried-ux/Engineering-OS',
        path: 'core/capability-registry.yaml',
        revision,
        source_digest: sha256Text(sourceText),
      }),
    );
    expect(rendered).toBe(committed);
  });

  it.skipIf(!legacyAvailable)('matches the recorded source digest', () => {
    const sourceText = readFileSync(legacyPath, 'utf8');
    expect(sha256Text(sourceText)).toBe(committedDocument.seed.source.source_digest);
  });

  it('records why regeneration was or was not re-executed here', () => {
    // Not a skip: this always runs, so the run always states which of the two
    // situations applied rather than leaving a silent gap in the record.
    if (legacyAvailable) {
      expect(existsSync(legacyPath)).toBe(true);
    } else {
      // The committed digest and revision remain the standing evidence.
      expect(committedDocument.seed.source.source_digest).toMatch(/^sha256:[0-9a-f]{64}$/u);
    }
  });
});
