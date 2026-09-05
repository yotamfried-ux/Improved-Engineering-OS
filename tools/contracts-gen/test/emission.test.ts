/**
 * Schema emission is a determinism test, not a formatting convenience.
 *
 * `contracts/schemas/` is committed and diffed. If emission were unstable, every
 * commit would carry noise and a real contract change would be invisible in it.
 */

import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { CONTRACT_REGISTRY } from '@ieos/core';
import { checkSchemas, renderSchemaFiles, writeSchemas } from '../src/index.ts';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const committedDir = join(repoRoot, 'contracts', 'schemas');

const temporaries: string[] = [];
function scratchDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'ieos-schemas-'));
  temporaries.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of temporaries.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('emission is deterministic', () => {
  it('produces byte-identical output twice', () => {
    expect(renderSchemaFiles()).toEqual(renderSchemaFiles());
  });

  it('emits exactly one schema per registered contract', () => {
    expect(renderSchemaFiles()).toHaveLength(CONTRACT_REGISTRY.length);
  });

  it('emits in a stable, name-sorted order', () => {
    const names = renderSchemaFiles().map((file) => file.fileName);
    expect(names).toEqual([...names].sort());
  });

  it('ends every file with exactly one trailing newline', () => {
    for (const file of renderSchemaFiles()) {
      expect(file.content.endsWith('}\n')).toBe(true);
      expect(file.content.endsWith('}\n\n')).toBe(false);
    }
  });

  it('emits draft-2020-12', () => {
    for (const file of renderSchemaFiles()) {
      const document = JSON.parse(file.content) as { $schema?: string };
      expect(document.$schema).toBe('https://json-schema.org/draft/2020-12/schema');
    }
  });

  it('emits no unrepresentable type -- Date, Map and Set would have thrown', () => {
    // `unrepresentable: 'throw'` means reaching this line at all is the assertion:
    // a contract that grew a Date would have failed emission above.
    expect(() => renderSchemaFiles()).not.toThrow();
  });
});

describe('the committed schemas match the contracts', () => {
  it('reports up to date', () => {
    const result = checkSchemas(committedDir);
    if (!result.ok) {
      throw new Error(
        `contracts/schemas is stale. changed=${result.changed.join(',')} ` +
          `missing=${result.missing.join(',')} stale=${result.extra.join(',')}`,
      );
    }
    expect(result.ok).toBe(true);
  });

  it('every committed file corresponds to a registered contract', () => {
    const committed = readdirSync(committedDir).filter((name) => name.endsWith('.schema.json'));
    const expected = new Set(CONTRACT_REGISTRY.map((c) => `${c.name}.schema.json`));
    expect(committed.filter((name) => !expected.has(name))).toEqual([]);
  });
});

describe('the staleness check can actually fail', () => {
  // A check that cannot fail proves nothing -- the same grader-validity problem
  // the Stage 0 manifest names.
  it('detects changed content', () => {
    const dir = scratchDir();
    writeSchemas(dir);
    const [first] = readdirSync(dir);
    writeFileSync(join(dir, first as string), '{"tampered":true}\n', 'utf8');

    const result = checkSchemas(dir);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.changed).toContain(first);
  });

  it('detects a missing file', () => {
    const dir = scratchDir();
    writeSchemas(dir);
    const [first] = readdirSync(dir);
    rmSync(join(dir, first as string));

    const result = checkSchemas(dir);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.missing).toContain(first);
  });

  it('detects a stale file left behind by a rename', () => {
    const dir = scratchDir();
    writeSchemas(dir);
    writeFileSync(join(dir, 'removed-contract.schema.json'), '{}\n', 'utf8');

    const result = checkSchemas(dir);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.extra).toContain('removed-contract.schema.json');
  });

  it('writeSchemas removes a stale file rather than leaving it to validate against', () => {
    const dir = scratchDir();
    writeSchemas(dir);
    writeFileSync(join(dir, 'removed-contract.schema.json'), '{}\n', 'utf8');

    writeSchemas(dir);
    expect(readdirSync(dir)).not.toContain('removed-contract.schema.json');
    expect(checkSchemas(dir).ok).toBe(true);
  });

  it('writeSchemas leaves non-schema files alone', () => {
    const dir = scratchDir();
    writeFileSync(join(dir, 'README.md'), 'generated\n', 'utf8');
    writeSchemas(dir);
    expect(readFileSync(join(dir, 'README.md'), 'utf8')).toBe('generated\n');
  });
});
