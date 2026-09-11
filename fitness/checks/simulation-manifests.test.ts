/**
 * F10 -- every Simulation Manifest references an evaluator entry outside `simulations/`.
 *
 * The rule was `partial` while no `simulations/` directory existed: the schema
 * half was enforced (`simulationManifestSchema` refuses a `hidden_conditions_ref`
 * outside the `evaluator-only://` scheme) and there was nothing to lint. Stage 3
 * creates the directory, so the behavioural half is enforced here and the rule
 * stops being dormant.
 *
 * The risk is specific. TD-16 records it as "hidden fixtures leak into the agent
 * checkout", and a hidden condition stored next to its manifest is reachable from
 * any trial that can read the manifest -- which would invalidate every trial that
 * used it, silently, because nothing downstream can tell a leaked condition from
 * an honest pass.
 *
 * So three things are checked, and the third is the one a scheme regex cannot do:
 * the referenced target must actually exist. A manifest pointing at a deleted
 * check is not a stricter manifest, it is an ungraded one.
 */

import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parse } from 'yaml';
import { simulationManifestSchema } from '@ieos/core';

const REPO_ROOT = resolve(import.meta.dirname, '..', '..');
const SIMULATIONS = join(REPO_ROOT, 'simulations');
const EVALUATOR = join(REPO_ROOT, 'evaluator');

const manifestFiles = existsSync(SIMULATIONS)
  ? readdirSync(SIMULATIONS).filter((name) => name.endsWith('.yaml') || name.endsWith('.yml'))
  : [];

describe('F10: Simulation Manifests', () => {
  it('has manifests to lint, so these assertions are not vacuous', () => {
    // Without this, deleting every manifest would turn the whole rule green.
    expect(manifestFiles.length).toBeGreaterThan(0);
  });

  it.each(manifestFiles)('%s satisfies the frozen manifest contract', (name) => {
    const parsed = parse(readFileSync(join(SIMULATIONS, name), 'utf8'));
    const result = simulationManifestSchema.safeParse(parsed);
    expect(
      result.success,
      result.success ? '' : JSON.stringify(result.error.issues, null, 2),
    ).toBe(true);
  });

  it.each(manifestFiles)('%s keeps its hidden conditions out of simulations/', (name) => {
    const manifest = simulationManifestSchema.parse(
      parse(readFileSync(join(SIMULATIONS, name), 'utf8')),
    );
    const target = manifest.hidden_conditions_ref.replace(/^evaluator-only:\/\//u, '');

    expect(target).not.toMatch(/^simulations\//u);
    expect(target).not.toContain('..');

    // The scheme says where the condition should live; this says it is there.
    const resolved = join(EVALUATOR, target);
    expect(
      existsSync(resolved),
      `${name} references ${manifest.hidden_conditions_ref}, which does not exist at ${resolved}`,
    ).toBe(true);
    expect(resolved.startsWith(EVALUATOR)).toBe(true);
  });

  it.each(manifestFiles)('%s declares controls that can fail (D14)', (name) => {
    const manifest = simulationManifestSchema.parse(
      parse(readFileSync(join(SIMULATIONS, name), 'utf8')),
    );
    // A manifest whose positive and negative controls are the same text is not
    // declaring a control, it is declaring a hope.
    expect(manifest.validity_controls.positive).not.toEqual(manifest.validity_controls.negative);
    expect(manifest.allowed_interventions.eos_coaching).toBe(false);
  });
});
