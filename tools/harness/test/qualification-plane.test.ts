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

function fetchReply(status: number, body: unknown = { data: { ok: true } }): typeof globalThis.fetch {
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
      credentialSource: 'environment',
    });
  });

  it('reads the existing D22 credential file instead of inventing another credential format', () => {
    const dir = tempDir();
    const credentialsPath = join(dir, 'credentials.json');
    writeFileSync(
      credentialsPath,
      JSON.stringify({
        schema_version: '1',
        installation_id: 'inst_test',
        token: 'file-installation-secret',
        created_at: '2026-09-15T00:00:00Z',
        expires_at: '2026-12-15T00:00:00Z',
      }),
      'utf8',
    );
    const config = loadQualificationPlaneConfig({
      eosRoot: dir,
      credentialsPath,
      env: {
        IEOS_INGEST_ENDPOINT: 'https://plane.invalid/ingest',
        IEOS_SERVICE_TOKEN: 'service-secret',
      },
    });
    expect(config.installationToken).toBe('file-installation-secret');
    expect(config.credentialSource).toBe(credentialsPath);
  });

  it('fails closed before a trial when either host identity is absent', () => {
    expect(() =>
      loadQualificationPlaneConfig({
        eosRoot: '/unused',
        env: { IEOS_INGEST_URL: 'https://plane.invalid/ingest' },
      }),
    ).toThrow(QualificationPlaneError);
    expect(() =>
      loadQualificationPlaneConfig({
        eosRoot: '/definitely/missing',
        env: {
          IEOS_INGEST_URL: 'https://plane.invalid/ingest',
          IEOS_SERVICE_TOKEN: 'service-secret',
        },
      }),
    ).toThrow(/installation credential/u);
  });
});

describe.skipIf(process.platform !== 'linux')('Stage 3 qualification proxy preflight', () => {
  const config = {
    endpoint: 'https://plane.invalid/ingest',
    serviceToken: 'service-secret',
    installationToken: 'installation-secret',
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
