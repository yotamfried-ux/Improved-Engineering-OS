/**
 * T6's basis, guarded at the source.
 *
 * "No rescue: no human intervention inside any trial" was a constant PASS in the
 * Stage 3 report, justified by what the simulation manifests forbid. A manifest
 * forbidding rescue is a statement of intent; what makes rescue impossible is
 * that the sandbox offers no channel for it. `runTrialProcess` gives every trial
 * child `ignore` for stdin, and neither `NamespaceRunOptions` nor
 * `TrialProcessOptions` accepts a way to supply one.
 *
 * That is a property of the source, so it is asserted against the source -- the
 * same technique `tools/qualification-report/test/required-tests-exist.test.ts`
 * uses for gate-cited test names. A runtime test cannot see the absence of an
 * option; this can, and it fails the moment someone adds one.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const sandboxSource = readFileSync(join(here, '..', 'src', 'ns-sandbox.ts'), 'utf8');
const driverSource = readFileSync(join(here, '..', 'src', 'drivers', 'claude-code.ts'), 'utf8');
const codexDriverSource = readFileSync(join(here, '..', 'src', 'drivers', 'codex.ts'), 'utf8');
const processSource = readFileSync(join(here, '..', 'src', 'trial-process.ts'), 'utf8');

/** The options interface, without the comments that legitimately discuss stdin. */
function optionsBlock(source: string, name: string): string {
  const start = source.indexOf(`export interface ${name} {`);
  expect(start).toBeGreaterThan(-1);
  const end = source.indexOf('\n}', start);
  return source
    .slice(start, end)
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('*') && !line.trimStart().startsWith('//'))
    .join('\n');
}

describe('no rescue is structural, not promised (T6)', () => {
  it('offers no option by which anything could be written to a trial', () => {
    // A vacuity guard first: if the interface cannot be found, the assertions
    // below would pass against an empty string.
    const options = optionsBlock(sandboxSource, 'NamespaceRunOptions');
    expect(options.length).toBeGreaterThan(100);
    for (const forbidden of ['input', 'stdio', 'stdin']) {
      expect(options).not.toMatch(new RegExp(`\\breadonly\\s+${forbidden}\\b`, 'u'));
    }
  });

  it('passes no input to the spawned trial', () => {
    const spawnCall = sandboxSource.slice(
      sandboxSource.indexOf('runTrialProcess(options.scriptPath'),
      sandboxSource.indexOf('let observations'),
    );
    expect(spawnCall.length).toBeGreaterThan(100);
    // Comments in this block do discuss stdin, so the check is for an actual
    // property being set, not for the word appearing.
    expect(spawnCall).not.toMatch(/^\s*(input|stdio|stdin)\s*:/mu);
  });

  it('spawns every trial child with stdin closed, in exactly one place', () => {
    expect(processSource).toMatch(/^\s*stdio: \['ignore', 'pipe', 'pipe'\],$/mu);
    expect(processSource.match(/\bspawn\(/gu)).toHaveLength(1);
    const options = optionsBlock(processSource, 'TrialProcessOptions');
    expect(options.length).toBeGreaterThan(40);
    for (const forbidden of ['input', 'stdio', 'stdin']) {
      expect(options).not.toMatch(new RegExp(`\\breadonly\\s+${forbidden}\\b`, 'u'));
    }
  });

  it('sends exactly one Claude prompt, and reports how many it sent', () => {
    expect(driverSource).toContain(
      "promptsSent: argv.filter((argument) => argument === '-p').length",
    );
    expect(driverSource.match(/^\s*'-p',$/gmu)).toHaveLength(1);
  });

  it('keeps the Codex path non-interactive with exactly one recorded prompt', () => {
    expect(codexDriverSource).toContain(
      'const rescue = { promptsSent: 1, interactiveStdin: false }',
    );
    expect(codexDriverSource).toContain('options.prompt,');
    expect(codexDriverSource).not.toMatch(/interactiveStdin:\s*true/u);
  });
});
