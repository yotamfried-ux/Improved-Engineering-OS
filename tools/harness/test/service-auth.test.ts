/**
 * Stage 3 harness service-principal lifecycle (D36).
 *
 * The tests are intentionally about the credential boundary: the raw token is
 * local-only, SQL receives the hash, the principal has run.register only, and
 * rotation preserves identity rather than silently minting a new classifier.
 */

import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import {
  CREDENTIALS_MODE,
  protectionOf,
  tokenHashLiteral,
} from '../../../packages/adapters/cli/src/auth.ts';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const CLI = join(REPO_ROOT, 'tools/harness/src/stage3-service-auth-cli.ts');
const OWNER = '11111111-1111-1111-1111-111111111111';

const scratch: string[] = [];
afterEach(() => {
  for (const dir of scratch.splice(0)) {
    rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
});

function credentialPath(): string {
  const dir = mkdtempSync(join(tmpdir(), 'ieos-stage3-service-auth-'));
  scratch.push(dir);
  return join(dir, 'harness-service.json');
}

function run(...argv: string[]): { code: number; stdout: string; stderr: string } {
  const result = spawnSync(process.execPath, [CLI, ...argv], { cwd: REPO_ROOT, encoding: 'utf8' });
  return { code: result.status ?? -1, stdout: result.stdout, stderr: result.stderr };
}

describe('Stage 3 harness service enrolment', () => {
  it('stores the raw token locally and prints only its hash', () => {
    const path = credentialPath();
    const result = run('enroll', '--owner', OWNER, '--credentials', path);
    expect(result.code).toBe(0);

    const credential = JSON.parse(readFileSync(path, 'utf8')) as {
      service_id: string;
      scopes: string[];
      token: string;
    };
    expect(credential.service_id).toMatch(/^svc_/u);
    expect(credential.scopes).toEqual(['run.register']);
    expect(credential.token).toMatch(/^[A-Za-z0-9_-]{43}$/u);
    expect(result.stdout).not.toContain(credential.token);
    expect(result.stderr).not.toContain(credential.token);
    expect(result.stdout).toContain(tokenHashLiteral(credential.token));
    expect(result.stdout).toContain("'service'");
    expect(result.stdout).toContain("'run.register'");
    expect(result.stdout).not.toContain('telemetry.insert');
  });

  it('protects the service credential with 0600 where the platform supports it', () => {
    const path = credentialPath();
    const result = run('enroll', '--owner', OWNER, '--credentials', path);
    expect(result.code).toBe(0);
    const protection = protectionOf(statSync(path).mode, process.platform);
    if (process.platform === 'win32') {
      expect(protection.enforced).toBe(false);
      expect(result.stderr).toContain('WARNING');
    } else {
      expect(protection.enforced).toBe(true);
      expect(statSync(path).mode & 0o777).toBe(CREDENTIALS_MODE);
    }
  });

  it('refuses to enrol over an existing service credential', () => {
    const path = credentialPath();
    expect(run('enroll', '--owner', OWNER, '--credentials', path).code).toBe(0);
    const second = run('enroll', '--owner', OWNER, '--credentials', path);
    expect(second.code).toBe(4);
    expect(second.stderr).toContain('Use rotate');
  });
});

describe('Stage 3 harness service rotation and revocation', () => {
  it('rotates the token while preserving the service identity', () => {
    const path = credentialPath();
    run('enroll', '--owner', OWNER, '--credentials', path);
    const before = JSON.parse(readFileSync(path, 'utf8')) as {
      service_id: string;
      token: string;
    };

    const result = run('rotate', '--credentials', path);
    expect(result.code).toBe(0);
    const after = JSON.parse(readFileSync(path, 'utf8')) as {
      service_id: string;
      token: string;
    };
    expect(after.service_id).toBe(before.service_id);
    expect(after.token).not.toBe(before.token);
    expect(result.stdout).not.toContain(after.token);
    expect(result.stdout).toContain("kind = 'service'");
    expect(result.stdout).toContain('revoked_at = null');
  });

  it('fails closed when rotation has no known service identity', () => {
    const result = run('rotate', '--credentials', credentialPath());
    expect(result.code).toBe(4);
    expect(result.stderr).toContain('cannot rotate without');
  });

  it('removes the local credential but preserves the server-side row for attribution', () => {
    const path = credentialPath();
    run('enroll', '--owner', OWNER, '--credentials', path);
    const result = run('revoke', '--credentials', path);
    expect(result.code).toBe(0);
    expect(() => readFileSync(path, 'utf8')).toThrow();
    expect(result.stdout).toContain('set revoked_at = now()');
    expect(result.stdout).not.toMatch(/delete\s+from\s+principals/iu);
    expect(result.stdout).toContain('NOT revoked until');
  });
});
