/**
 * Behavioural proof that `packages/core` performs no I/O (ADR-0004).
 *
 * dependency-cruiser can show that `core` does not *import* a module named
 * `node:fs`. It cannot show that `core` does not *do* I/O -- through a dynamic
 * import, a global, a transitive dependency, or a name nobody thought to
 * blocklist. The research inventory is explicit that a dependency graph cannot
 * prove a runtime property, so this test exercises the whole public surface with
 * the I/O escape routes booby-trapped.
 *
 * If any of them fires, the trap throws and the test fails with the name of the
 * capability that was reached for.
 */

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import * as core from '../src/index.ts';

const reached: string[] = [];

/** Replaced globals, restored afterwards. */
const originals = new Map<string, unknown>();

function trapGlobal(name: string): void {
  const globals = globalThis as unknown as Record<string, unknown>;
  originals.set(name, globals[name]);
  // The target must itself be callable and constructible, or `apply` and
  // `construct` never fire and the trap silently proves nothing.
  globals[name] = new Proxy(function trapped() {}, {
    get(_target, property) {
      reached.push(`${name}.${String(property)}`);
      throw new Error(`core reached for ${name}.${String(property)}`);
    },
    apply() {
      reached.push(name);
      throw new Error(`core called ${name}`);
    },
    construct() {
      reached.push(name);
      throw new Error(`core constructed ${name}`);
    },
  });
}

function restoreGlobals(): void {
  const globals = globalThis as unknown as Record<string, unknown>;
  for (const [name, value] of originals) {
    globals[name] = value;
  }
  originals.clear();
}

describe('core performs no I/O', () => {
  beforeEach(() => {
    reached.length = 0;
    // Network and process escape routes reachable without an import.
    trapGlobal('fetch');
    trapGlobal('XMLHttpRequest');
    trapGlobal('WebSocket');
  });

  afterEach(() => {
    restoreGlobals();
  });

  it('exercises the whole public surface without touching a trapped capability', () => {
    const clock: core.Clock = {
      nowMs: () => 1_700_000_000_000,
      nowIso: () => '2023-11-14T22:13:20.000Z',
    };
    const random: core.RandomSource = { bytes: (n) => new Uint8Array(n) };
    const utf8 = (value: string): Uint8Array => new TextEncoder().encode(value);

    // Hashing and canonicalization.
    core.canonicalizeJson({ b: 1, a: [null, true, 'x'] });
    core.sha256Canonical({ a: 1 });
    core.sha256Text('a\r\nb');
    core.hashFileSet([{ path: 'body.md', bytes: utf8('body') }]);
    core.base32Encode(utf8('foobar'));
    core.deterministicId('evd', { a: 1 });

    // Normalization.
    core.normalizeIdentifierText('café');
    core.normalizeTextForHashing('a\r\nb');
    core.normalizeRelativePosixPath('files/a.md');
    core.normalizeIdentifierSet(['a', 'b']);

    // Identities.
    core.mintId('asset', clock, random);
    core.evidenceId({
      run_id: 'run_1',
      deriver_id: 'attribution',
      deriver_version: '1',
      input_snapshot_hash: 'sha256:00',
    });

    // Contracts and emission.
    core.buildUnprovenSnapshot(['asset_b', 'asset_a']);
    core.emitContractSchemas();
    core.solutionSetSchema.safeParse({});

    expect(reached).toEqual([]);
  });

  it('the traps actually fire, so a passing run means something', () => {
    // A trap that cannot fire would make the test above vacuous -- the same
    // "evaluator does not detect known-bad" failure the Stage 0 manifest names.
    // This control caught exactly that: the first version of `trapGlobal` used a
    // plain object as the proxy target, so calling it threw a TypeError before
    // the `apply` trap could record anything.
    expect(() => (globalThis as unknown as { fetch: () => void }).fetch()).toThrow(/core called/u);
    expect(reached).toContain('fetch');

    expect(
      () => new (globalThis as unknown as { WebSocket: new () => unknown }).WebSocket(),
    ).toThrow(/core constructed/u);
    expect(reached).toContain('WebSocket');
  });

  it('imports no filesystem, process or network module', async () => {
    // The static half of the same guarantee: read every source file under
    // src/ and assert none of them names an I/O module. Kept alongside the
    // behavioural test because each catches what the other cannot.
    const { readdirSync, readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const { dirname } = await import('node:path');

    const srcRoot = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');

    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const full = join(dir, entry.name);
        return entry.isDirectory() ? walk(full) : entry.name.endsWith('.ts') ? [full] : [];
      });

    const forbidden = [
      'node:fs',
      'node:fs/promises',
      'node:child_process',
      'node:net',
      'node:http',
      'node:https',
      'node:dns',
      'node:worker_threads',
      'node:cluster',
    ];

    const offenders: string[] = [];
    for (const file of walk(srcRoot)) {
      const source = readFileSync(file, 'utf8');
      for (const moduleName of forbidden) {
        if (source.includes(`'${moduleName}'`) || source.includes(`"${moduleName}"`)) {
          offenders.push(`${file} imports ${moduleName}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
