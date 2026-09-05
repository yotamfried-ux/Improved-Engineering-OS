import { spawnSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const CLI = join(REPO_ROOT, 'packages/adapters/cli/src/cli.ts');
const scratch: string[] = [];

function project(): string {
  const root = mkdtempSync(join(tmpdir(), 'ieos-stage1-sim-'));
  scratch.push(root);
  return root;
}

function run(...argv: string[]): { code: number; stdout: string; stderr: string } {
  const result = spawnSync(process.execPath, [CLI, ...argv], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
  return {
    code: result.status ?? -1,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

afterEach(() => {
  for (const root of scratch.splice(0)) {
    rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
});

describe('the empirical Stage 1 init scenarios', () => {
  it('preserves installation/project identity and user-owned profile state on rerun', () => {
    const target = project();
    const first = run('init', '--eos-root', REPO_ROOT, '--project', target);
    expect(first.code, first.stderr).toBe(0);

    const installationPath = join(target, '.ieos', 'installation.json');
    const profilePath = join(target, '.ieos', 'profile.yaml');
    const before = JSON.parse(readFileSync(installationPath, 'utf8')) as {
      installation_id: string;
      project_id: string;
    };

    const userProfile = [
      'schema_version: "1"',
      `project_id: ${JSON.stringify(before.project_id)}`,
      'spec:',
      '  lifecycle: "production"',
      '  database_provider: "supabase"',
      '  authentication_required: true',
      '  deployment: "vercel"',
      '  architecture_constraints:',
      '    - "user-owned-value-must-survive"',
      '',
    ].join('\n');
    writeFileSync(profilePath, userProfile, 'utf8');

    const second = run('init', '--eos-root', REPO_ROOT, '--project', target);
    expect(second.code, second.stderr).toBe(0);
    expect(second.stdout).toContain('kept   .ieos/profile.yaml');

    const after = JSON.parse(readFileSync(installationPath, 'utf8')) as {
      installation_id: string;
      project_id: string;
    };
    expect(after.installation_id).toBe(before.installation_id);
    expect(after.project_id).toBe(before.project_id);
    expect(readFileSync(profilePath, 'utf8')).toBe(userProfile);
  });

  it('refuses to mint a new identity over a malformed existing installation', () => {
    const target = project();
    const installationPath = join(target, '.ieos', 'installation.json');
    mkdirSync(dirname(installationPath), { recursive: true });
    writeFileSync(installationPath, '{not-json', 'utf8');

    const result = run('init', '--eos-root', REPO_ROOT, '--project', target);
    expect(result.code).toBe(2);
    expect(result.stderr).toMatch(/Refusing to mint a new identity/u);
    expect(readFileSync(installationPath, 'utf8')).toBe('{not-json');
  });
});

describe('doctor verifies the generated instructions users actually run agents with', () => {
  it('passes after init and ignores edits outside the IEOS marker block', () => {
    const target = project();
    expect(run('init', '--eos-root', REPO_ROOT, '--project', target).code).toBe(0);

    const before = run('doctor', '--eos-root', REPO_ROOT, '--project', target);
    expect(before.code, before.stdout + before.stderr).toBe(0);
    expect(before.stdout).toMatch(/ok\s+bootstrap:/u);

    const agents = join(target, 'AGENTS.md');
    writeFileSync(
      agents,
      `# Human-owned instructions\n\n${readFileSync(agents, 'utf8')}`,
      'utf8',
    );

    const after = run('doctor', '--eos-root', REPO_ROOT, '--project', target);
    expect(after.code, after.stdout + after.stderr).toBe(0);
    expect(after.stdout).toMatch(/ok\s+bootstrap:/u);
  });

  it('fails when a generated IEOS block is changed after init', () => {
    const target = project();
    expect(run('init', '--eos-root', REPO_ROOT, '--project', target).code).toBe(0);

    const agents = join(target, 'AGENTS.md');
    const original = readFileSync(agents, 'utf8');
    writeFileSync(
      agents,
      original.replace('## Engineering OS', '## Engineering OS tampered'),
      'utf8',
    );

    const result = run('doctor', '--eos-root', REPO_ROOT, '--project', target);
    expect(result.code).toBe(1);
    expect(result.stdout).toMatch(/^FAIL\s+bootstrap:/mu);
    expect(result.stdout).toMatch(/AGENTS\.md IEOS block hash/u);
  });

  it('fails when one generated instruction file loses its marker block', () => {
    const target = project();
    expect(run('init', '--eos-root', REPO_ROOT, '--project', target).code).toBe(0);

    writeFileSync(join(target, 'CLAUDE.md'), '# deliberately replaced\n', 'utf8');
    const result = run('doctor', '--eos-root', REPO_ROOT, '--project', target);
    expect(result.code).toBe(1);
    expect(result.stdout).toMatch(/CLAUDE\.md is missing a complete IEOS marker block/u);
  });
});
