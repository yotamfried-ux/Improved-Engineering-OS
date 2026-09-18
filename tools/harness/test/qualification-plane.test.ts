/**
 * The trusted-host half of Stage 3 qualification.
 *
 * These tests keep the two credentials outside the trial contract and prove the
 * preflight fails before a proxy exists when authenticated ingest is not live.
 */

import { existsSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  QualificationPlaneError,
  loadQualificationPlaneConfig,
  openQualificationProxy,
} from '../src/qualification-plane.ts';

const scratch: string[] = [];
afterEach(() => {
  for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'ieos-qualification-plane-test-'));
  scratch.push(dir);
  return dir;
}

function writeServiceCredential(path: string, overrides: Record<string, unknown> = {}): void {
  writeFileSync(
    path,
    JSON.stringify({
      schema_version: '1',
      service_id: 'svc_test',
      scopes: ['run.register'],
      token: 'file-service-secret',
      created_at: '2026-09-15T00:00:00Z',
      expires_at: '2099-12-15T00:00:00Z',
      ...overrides,
    }),
    'utf8',
  );
}

function writeInstallationCredential(path: string): void {
  writeFileSync(
    path,
    JSON.stringify({
      schema_version: '1',
      installation_id: 'inst_test',
      token: 'file-installation-secret',
      created_at: '2026-09-15T00:00:00Z',
      expires_at: '2099-12-15T00:00:00Z',
    }),
    'utf8',
  );
}

function fetchReply(
  status: number,
  body: unknown = { data: { ok: true } },
): typeof globalThis.fetch {
  return (() =>
    Promise.resolve(
      new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
      }),
    )) as typeof globalThis.fetch;
}

describe('Stage 3 qualification plane configuration', () => {
  it('keeps service and installation identities separate on the trusted host', () => {
    const config = loadQualificationPlaneConfig({
      eosRoot: '/unused',
      env: {
        IEOS_INGEST_URL: 'https://plane.invalid/ingest',
        IEOS_SERVICE_TOKEN: 'service-secret',
        IEOS_INSTALLATION_TOKEN: 'installation-secret',
      },
    });
    expect(config).toEqual({
      endpoint: 'https://plane.invalid/ingest',
      serviceToken: 'service-secret',
      installationToken: 'installation-secret',
      serviceCredentialSource: 'environment',
      credentialSource: 'environment',
    });
  });

  it('reads both trusted-host credential files without requiring raw tokens in env', () => {
    const dir = tempDir();
    const credentialsPath = join(dir, 'credentials.json');
    const serviceCredentialsPath = join(dir, 'harness-service.json');
    writeInstallationCredential(credentialsPath);
    writeServiceCredential(serviceCredentialsPath);

    const config = loadQualificationPlaneConfig({
      eosRoot: dir,
      credentialsPath,
      serviceCredentialsPath,
      env: { IEOS_INGEST_ENDPOINT: 'https://plane.invalid/ingest' },
    });
    expect(config.installationToken).toBe('file-installation-secret');
    expect(config.serviceToken).toBe('file-service-secret');
    expect(config.credentialSource).toBe(credentialsPath);
    expect(config.serviceCredentialSource).toBe(serviceCredentialsPath);
  });

  it('rejects a harness service credential with broader or different authority', () => {
    const dir = tempDir();
    const serviceCredentialsPath = join(dir, 'harness-service.json');
    writeServiceCredential(serviceCredentialsPath, {
      scopes: ['run.register', 'proposal.read'],
    });
    expect(() =>
      loadQualificationPlaneConfig({
        eosRoot: dir,
        serviceCredentialsPath,
        env: {
          IEOS_INGEST_URL: 'https://plane.invalid/ingest',
          IEOS_INSTALLATION_TOKEN: 'installation-secret',
        },
      }),
    ).toThrow(/run\.register only/u);
  });

  it('rejects an expired service credential before any trial starts', () => {
    const dir = tempDir();
    const serviceCredentialsPath = join(dir, 'harness-service.json');
    writeServiceCredential(serviceCredentialsPath, { expires_at: '2000-01-01T00:00:00Z' });
    expect(() =>
      loadQualificationPlaneConfig({
        eosRoot: dir,
        serviceCredentialsPath,
        env: {
          IEOS_INGEST_URL: 'https://plane.invalid/ingest',
          IEOS_INSTALLATION_TOKEN: 'installation-secret',
        },
      }),
    ).toThrow(/expired expiry/u);
  });

  it('refuses a cleartext or malformed ingest endpoint before reading a credential', () => {
    const dir = tempDir();
    const serviceCredentialsPath = join(dir, 'harness-service.json');
    writeServiceCredential(serviceCredentialsPath);

    // The endpoint is rejected even though both credentials are present and
    // valid: it is checked before either is read, because both are sent to it.
    expect(() =>
      loadQualificationPlaneConfig({
        eosRoot: '/unused',
        serviceCredentialsPath,
        env: {
          IEOS_INGEST_URL: 'http://plane.invalid/ingest',
          IEOS_INSTALLATION_TOKEN: 'environment-installation-secret',
        },
      }),
    ).toThrow(/must use https/u);

    expect(() =>
      loadQualificationPlaneConfig({
        eosRoot: '/unused',
        serviceCredentialsPath,
        env: {
          IEOS_INGEST_URL: 'plane.invalid/ingest',
          IEOS_INSTALLATION_TOKEN: 'environment-installation-secret',
        },
      }),
    ).toThrow(/not a valid URL/u);
  });

  it('fails closed before a trial when either host identity is absent', () => {
    expect(() =>
      loadQualificationPlaneConfig({
        eosRoot: '/unused',
        env: { IEOS_INGEST_URL: 'https://plane.invalid/ingest' },
      }),
    ).toThrow(QualificationPlaneError);

    const dir = tempDir();
    const serviceCredentialsPath = join(dir, 'harness-service.json');
    writeServiceCredential(serviceCredentialsPath);
    expect(() =>
      loadQualificationPlaneConfig({
        eosRoot: '/definitely/missing',
        serviceCredentialsPath,
        env: { IEOS_INGEST_URL: 'https://plane.invalid/ingest' },
      }),
    ).toThrow(/installation credential/u);
  });
});

describe.skipIf(process.platform !== 'linux')('Stage 3 qualification proxy preflight', () => {
  const config = {
    endpoint: 'https://plane.invalid/ingest',
    serviceToken: 'service-secret',
    installationToken: 'installation-secret',
    serviceCredentialSource: 'environment' as const,
    credentialSource: 'environment' as const,
  };

  it('uses a distinct private host source and declared trial target', async () => {
    const proxy = await openQualificationProxy({
      config,
      runId: 'run_s3_canary_test',
      fetch: fetchReply(200),
    });
    try {
      expect(proxy.sourcePath).not.toBe(proxy.targetPath);
      expect(proxy.targetPath).toMatch(/^\/tmp\/ieos-/u);
      expect(existsSync(proxy.sourcePath)).toBe(true);
      expect(statSync(proxy.sourcePath).isSocket()).toBe(true);
      expect(proxy.hostReachableAtStart).toBe(true);
    } finally {
      await proxy.close();
    }
    expect(existsSync(proxy.sourcePath)).toBe(false);
  });

  it('does not create a proxy when authenticated ingest is refused', async () => {
    await expect(
      openQualificationProxy({
        config,
        runId: 'run_s3_canary_refused',
        fetch: fetchReply(401, { code: 'bad_token' }),
      }),
    ).rejects.toThrow(/not reachable/u);
  });
});
