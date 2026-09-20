import { describe, expect, it } from 'vitest';
import {
  codexPermissionProbeArgs,
  validateCodexPermissionProbeResult,
} from '../src/codex-permission-preflight.ts';

describe('Codex permission preflight', () => {
  it('uses the same named workspace-only profile without invoking a model', () => {
    const args = codexPermissionProbeArgs({
      workspaceRoot: 'C:\\work\\trial',
      outsidePath: 'C:\\work\\private\\secret.txt',
      platform: 'win32',
      nodeExecutable: 'node.exe',
    });

    expect(args[0]).toBe('sandbox');
    expect(args).toContain('default_permissions="ieos-stage3"');
    expect(args).toContain('permissions.ieos-stage3.extends=":workspace"');
    expect(args).toContain('permissions.ieos-stage3.filesystem.:root="deny"');
    expect(args).toContain('permissions.ieos-stage3.filesystem.:minimal="read"');
    expect(args).toContain('permissions.ieos-stage3.filesystem.:tmpdir="deny"');
    expect(args).toContain('permissions.ieos-stage3.filesystem.:slash_tmp="deny"');
    expect(args).toContain('permissions.ieos-stage3.network.enabled=false');
    expect(args).toContain('windows.sandbox="elevated"');
    expect(args).toContain('-P');
    expect(args).toContain('ieos-stage3');
    expect(args).toContain('-C');
    expect(args).toContain('node.exe');
    expect(args).not.toContain('exec');
    expect(args).not.toContain('--model');
  });

  it('accepts only an explicit successful probe marker', () => {
    expect(
      validateCodexPermissionProbeResult({
        status: 0,
        stdout: 'IEOS_CODEX_PERMISSION_PROBE_OK\n',
        stderr: '',
      }),
    ).toEqual({
      status: 'PASS',
      method: 'model-free-sandbox',
      profile: 'ieos-stage3',
    });
  });

  it('fails closed when the outside-workspace file is readable', () => {
    expect(() =>
      validateCodexPermissionProbeResult({
        status: 41,
        stdout: '',
        stderr: 'outside-workspace read succeeded',
      }),
    ).toThrow(/outside the workspace/iu);
  });

  it('fails closed on sandbox setup errors or missing success evidence', () => {
    expect(() =>
      validateCodexPermissionProbeResult({
        status: 69,
        stdout: '',
        stderr: 'sandbox setup failed',
      }),
    ).toThrow(/status 69/iu);
    expect(() =>
      validateCodexPermissionProbeResult({
        status: 0,
        stdout: '',
        stderr: '',
      }),
    ).toThrow(/success marker/iu);
  });
});
