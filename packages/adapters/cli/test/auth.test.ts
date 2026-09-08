/**
 * `ieos auth enroll|rotate|revoke` (D22.1, D22.5).
 *
 * Two properties carry the weight here, and both are about what does not
 * happen. The token is never printed, so it cannot end up in a terminal
 * scrollback or a CI log; and the command never reaches the Evidence Plane, so
 * running `ieos` never requires a credential able to write a `principals` row.
 * The second is why this prints a statement instead of executing one.
 */

import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import {
  AuthError,
  CREDENTIALS_MODE,
  expiryFrom,
  INSTALLATION_SCOPES,
  mintToken,
  protectionOf,
  TOKEN_BYTES,
  tokenHashLiteral,
} from '../src/auth.ts';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const CLI = join(REPO_ROOT, 'packages/adapters/cli/src/cli.ts');
const OWNER = '11111111-1111-1111-1111-111111111111';

const scratch: string[] = [];
afterEach(() => {
  for (const dir of scratch.splice(0)) {
    rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
});

function credentialsPath(): string {
  const dir = mkdtempSync(join(tmpdir(), 'ieos-auth-'));
  scratch.push(dir);
  return join(dir, 'credentials.json');
}

function run(...argv: string[]): { code: number; stdout: string; stderr: string } {
  const result = spawnSync(process.execPath, [CLI, ...argv], { cwd: REPO_ROOT, encoding: 'utf8' });
  return { code: result.status ?? -1, stdout: result.stdout, stderr: result.stderr };
}

describe('the token itself', () => {
  it('is 256 bits from the injected source, encoded base64url', () => {
    const token = mintToken({ bytes: (n) => new Uint8Array(n).fill(7) });
    expect(TOKEN_BYTES).toBe(32);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/u);
    expect(token.length).toBe(43);
  });

  it('refuses a short read from the random source rather than shortening the token', () => {
    // A source that returns fewer bytes than asked is a broken source, and the
    // failure that matters is the one nobody notices: a token that looks fine
    // and carries half the entropy.
    expect(() => mintToken({ bytes: () => new Uint8Array(8) })).toThrow(AuthError);
  });

  it('hashes to the bytea literal the plane stores', () => {
    const literal = tokenHashLiteral('token');
    expect(literal).toMatch(/^\\x[0-9a-f]{64}$/u);
    expect(tokenHashLiteral('token')).toBe(literal);
    expect(tokenHashLiteral('token ')).not.toBe(literal);
  });

  it('expires in 90 days, renewable', () => {
    expect(expiryFrom('2026-09-08T00:00:00.000Z')).toBe('2026-12-07T00:00:00.000Z');
  });
});

describe('ieos auth enroll', () => {
  it('writes a 0600 credential and prints the statement, not the token', () => {
    const path = credentialsPath();
    const result = run('auth', 'enroll', '--owner', OWNER, '--credentials', path);
    expect(result.code).toBe(0);

    const credentials = JSON.parse(readFileSync(path, 'utf8')) as { token: string };
    expect(credentials.token.length).toBe(43);
    // The one assertion this command exists to satisfy: the secret is in the
    // file and nowhere in the output a terminal or a CI log would keep.
    expect(result.stdout).not.toContain(credentials.token);
    expect(result.stdout).toContain(tokenHashLiteral(credentials.token));
    expect(result.stdout).toContain('insert into principals');
  });

  it('makes the credential readable by its owner alone, or says it cannot', () => {
    // Platform-aware rather than skipped on Windows. D22.1's fallback is a
    // `0600` file, and on Windows that fallback does not exist: chmod there
    // toggles the read-only attribute and nothing else. Skipping would drop the
    // guarantee silently; asserting 0600 everywhere would assert a falsehood.
    // So each platform is held to what it can actually do, and the one that
    // cannot has to SAY so.
    const path = credentialsPath();
    const result = run('auth', 'enroll', '--owner', OWNER, '--credentials', path);
    const protection = protectionOf(statSync(path).mode, process.platform);
    if (process.platform === 'win32') {
      expect(protection.enforced).toBe(false);
      expect(result.stderr).toContain('WARNING');
      expect(result.stdout).toContain('permissions NOT enforced');
    } else {
      expect(protection.enforced).toBe(true);
      expect(statSync(path).mode & 0o777).toBe(CREDENTIALS_MODE);
      expect(result.stdout).toContain('mode 0600');
    }
  });

  it('grants exactly the three scopes an installation may hold (D22.1)', () => {
    const path = credentialsPath();
    const result = run('auth', 'enroll', '--owner', OWNER, '--credentials', path);
    for (const scope of INSTALLATION_SCOPES) expect(result.stdout).toContain(scope);
    // Not one that would hand run classification to the agent (D36). The
    // database constraint refuses it too; this is the same rule at the other end.
    expect(result.stdout).not.toContain('run.register');
  });

  it('refuses without an owner rather than emitting a placeholder', () => {
    // A statement with a placeholder uuid is a statement someone pastes
    // unedited.
    const result = run('auth', 'enroll', '--credentials', credentialsPath());
    expect(result.code).toBe(2);
    expect(result.stderr).toContain('--owner');
  });

  it('refuses to enrol twice over an existing credential', () => {
    // A second enrolment mints a second installation identity for one machine,
    // and the events already attributed to the first become unexplainable.
    const path = credentialsPath();
    run('auth', 'enroll', '--owner', OWNER, '--credentials', path);
    const second = run('auth', 'enroll', '--owner', OWNER, '--credentials', path);
    expect(second.code).toBe(4);
    expect(second.stderr).toContain('ieos auth rotate');
  });
});

describe('ieos auth rotate', () => {
  it('replaces the token but keeps the installation identity', () => {
    const path = credentialsPath();
    run('auth', 'enroll', '--owner', OWNER, '--credentials', path);
    const before = JSON.parse(readFileSync(path, 'utf8')) as {
      token: string;
      installation_id: string;
    };

    const result = run('auth', 'rotate', '--credentials', path);
    expect(result.code).toBe(0);
    const after = JSON.parse(readFileSync(path, 'utf8')) as {
      token: string;
      installation_id: string;
    };

    expect(after.token).not.toBe(before.token);
    // Same installation: the run history already attributed to it stays
    // attributable, which is the difference between rotating and re-enrolling.
    expect(after.installation_id).toBe(before.installation_id);
    expect(result.stdout).toContain('update principals');
    expect(result.stdout).toContain(after.installation_id);
  });

  it('tightens the mode of a credential that was left world-readable', () => {
    // `writeFileSync`'s mode applies only when it creates the file, so a
    // rotation over a loose file would silently keep the old permissions.
    // Where modes mean nothing, the command has to keep saying so instead.
    const path = credentialsPath();
    run('auth', 'enroll', '--owner', OWNER, '--credentials', path);
    chmodSync(path, 0o644);
    const result = run('auth', 'rotate', '--credentials', path);
    if (process.platform === 'win32') {
      expect(result.stderr).toContain('WARNING');
    } else {
      expect(statSync(path).mode & 0o777).toBe(CREDENTIALS_MODE);
    }
  });

  it('clears any revocation, because a rotated token is meant to work', () => {
    const path = credentialsPath();
    run('auth', 'enroll', '--owner', OWNER, '--credentials', path);
    expect(run('auth', 'rotate', '--credentials', path).stdout).toContain('revoked_at = null');
  });
});

describe('ieos auth revoke', () => {
  it('removes the local credential and says the revocation is not done yet', () => {
    // The distinction matters: an owner who believes a token is dead when only
    // the local copy is gone will leave a working credential in the plane.
    const path = credentialsPath();
    run('auth', 'enroll', '--owner', OWNER, '--credentials', path);
    const result = run('auth', 'revoke', '--credentials', path);
    expect(result.code).toBe(0);
    expect(() => readFileSync(path, 'utf8')).toThrow();
    expect(result.stdout).toContain('NOT revoked until');
    expect(result.stdout).toContain('set revoked_at = now()');
  });

  it('sets a timestamp rather than deleting the principal', () => {
    // Deleting would orphan the evidence this installation inserted and turn
    // "we know who wrote this" into "we do not".
    const path = credentialsPath();
    run('auth', 'enroll', '--owner', OWNER, '--credentials', path);
    const result = run('auth', 'revoke', '--credentials', path);
    expect(result.stdout).not.toMatch(/delete\s+from\s+principals/iu);
  });

  it('still prints the statement when the local credential is already gone', () => {
    // The local file and the plane's row are different things, and losing the
    // first must not stop the owner revoking the second.
    const result = run(
      'auth',
      'revoke',
      '--credentials',
      credentialsPath(),
      '--installation',
      'inst_gone',
    );
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('inst_gone');
  });
});

describe('a corrupt credential file', () => {
  it('does not stop a rotation from producing a working statement', () => {
    const path = credentialsPath();
    writeFileSync(path, 'not json', 'utf8');
    const result = run('auth', 'rotate', '--credentials', path, '--installation', 'inst_known');
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('inst_known');
  });
});

describe('what a file mode can and cannot guarantee', () => {
  it('calls 0600 enforced on a platform that has file modes', () => {
    expect(protectionOf(0o600, 'linux')).toEqual({ enforced: true, mode: 0o600, reason: null });
  });

  it('calls anything looser unenforced, and names the mode', () => {
    const loose = protectionOf(0o644, 'linux');
    expect(loose.enforced).toBe(false);
    expect(loose.reason).toContain('0644');
  });

  it('explains WHY Windows cannot enforce it, rather than reporting a bare failure', () => {
    // An owner reading "not enforced" needs to know whether they misconfigured
    // something or whether the platform simply cannot do it, because only one
    // of those has an action attached.
    const windows = protectionOf(0o666, 'win32');
    expect(windows.enforced).toBe(false);
    expect(windows.reason).toContain('POSIX file modes');
    expect(windows.reason).toContain('environment secret');
  });

  it('still calls a genuinely 0600 file enforced on Windows, if one ever appears', () => {
    // The check is on the observed bits, not on the platform name. If a future
    // Windows or a POSIX-mode filesystem produced 0600, that is enforcement and
    // the report should say so.
    expect(protectionOf(0o600, 'win32').enforced).toBe(true);
  });
});
