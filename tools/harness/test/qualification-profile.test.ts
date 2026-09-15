import { describe, expect, it } from 'vitest';
import {
  openPlatformQualificationProxy,
  qualificationEnvironmentSource,
  qualificationProfileFor,
  qualificationTrialPolicy,
  runQualificationProcess,
} from '../src/qualification-profile.ts';

describe('Stage 3 qualification profiles', () => {
  it('makes native Windows the personal-v1 profile without claiming kernel boundaries', () => {
    const policy = qualificationTrialPolicy({
      platform: 'win32',
      workspaceRoot: 'C:\\trial',
      evaluatorRoot: 'C:\\evaluator',
      allowedHosts: ['api.anthropic.com:443'],
      allowedExecutables: ['claude'],
      allowedEnvironment: ['PATH', 'IEOS_RUN_ID'],
      ipcTarget: '\\\\.\\pipe\\ieos-test',
    });
    expect(qualificationProfileFor('win32')).toBe('windows-personal-v1');
    expect(policy.requiredBoundaries).toEqual(['filesystem', 'environment']);
    expect(policy.network.mode).toBe('unrestricted');
    expect(policy.filesystem.declaredUnixSockets).toEqual([]);
  });

  it('keeps all four boundaries mandatory on the optional Linux profile', () => {
    const policy = qualificationTrialPolicy({
      platform: 'linux',
      workspaceRoot: '/tmp/trial',
      evaluatorRoot: '/repo/evaluator',
      allowedHosts: ['api.anthropic.com:443'],
      allowedExecutables: ['claude'],
      allowedEnvironment: ['PATH', 'IEOS_RUN_ID'],
      ipcTarget: '/tmp/ieos.sock',
    });
    expect(qualificationProfileFor('linux')).toBe('linux-namespace-v1');
    expect(policy.requiredBoundaries).toEqual([
      'filesystem',
      'environment',
      'process',
      'network',
    ]);
    expect(policy.filesystem.declaredUnixSockets).toEqual(['/tmp/ieos.sock']);
  });

  it('normalizes the small Windows environment instead of inheriting it', () => {
    const source = qualificationEnvironmentSource({
      platform: 'win32',
      env: {
        Path: 'C:\\tools',
        USERPROFILE: 'C:\\Users\\owner',
        IEOS_INSTALLATION_TOKEN: 'must-not-leak',
      },
      trusted: { IEOS_RUN_ID: 'run_test' },
    });
    expect(source['PATH']).toBe('C:\\tools');
    expect(source['HOME']).toBe('C:\\Users\\owner');
    expect(source['IEOS_INSTALLATION_TOKEN']).toBeUndefined();
    expect(source['IEOS_RUN_ID']).toBe('run_test');
  });

  it('runs the Windows profile directly with only the supplied environment', () => {
    const result = runQualificationProcess({
      platform: 'win32',
      command: [process.execPath, '-e', 'process.stdout.write(process.env.TEST_VALUE ?? "missing")'],
      cwd: process.cwd(),
      environment: { TEST_VALUE: 'present' },
      allowedHosts: [],
      deniedRoots: [],
      timeoutSeconds: 5,
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toBe('present');
    expect(result.observations).toBeNull();
  });
});

describe.skipIf(process.platform !== 'win32')('Windows qualification IPC', () => {
  it('opens a real named pipe instead of requiring an AF_UNIX mount', async () => {
    const fetch = (() =>
      Promise.resolve(
        new Response(JSON.stringify({ data: { ok: true } }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      )) as typeof globalThis.fetch;
    const proxy = await openPlatformQualificationProxy({
      platform: 'win32',
      runId: 'run_windows_pipe_test',
      config: {
        endpoint: 'https://plane.invalid/ingest',
        serviceToken: 'service-secret',
        installationToken: 'installation-secret',
        serviceCredentialSource: 'environment',
        credentialSource: 'environment',
      },
      fetch,
    });
    try {
      expect(proxy.transport).toBe('windows-named-pipe');
      expect(proxy.sourcePath).toBe(proxy.targetPath);
      expect(proxy.targetPath).toMatch(/^\\\\\.\\pipe\\ieos-/u);
    } finally {
      await proxy.close();
    }
  });
});
