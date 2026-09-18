import { describe, expect, it } from 'vitest';
import {
  LINUX_NAMESPACE_REQUIRED_TOOLS,
  WINDOWS_REQUIRED_TOOLS,
  formatStage3HostPreflight,
  inspectStage3Host,
  type Stage3HostProbe,
} from '../src/stage3-host-preflight.ts';

function fakeProbe(
  options: {
    readonly platform?: string;
    readonly nodeVersion?: string;
    readonly missing?: readonly string[];
    readonly namespaceStatus?: number;
    readonly onRun?: (command: string, args: readonly string[]) => void;
  } = {},
): Stage3HostProbe {
  const missing = new Set(options.missing ?? []);
  return {
    platform: options.platform ?? 'win32',
    nodeVersion: options.nodeVersion ?? '24.20.0',
    commandAvailable: (command) => !missing.has(command),
    run: (command, args) => {
      options.onRun?.(command, args);
      return { status: options.namespaceStatus ?? 0, stderr: 'isolation denied' };
    },
  };
}

describe('Stage 3 trusted-host preflight', () => {
  it('accepts native Windows without WSL or namespace packages', () => {
    const report = inspectStage3Host(
      fakeProbe({
        platform: 'win32',
        missing: ['unshare', 'slirp4netns', 'ip', 'iptables', 'mount', 'getent'],
      }),
    );
    expect(report.ready).toBe(true);
    expect(report.profile).toBe('windows-personal-v1');
    expect(formatStage3HostPreflight(report)).toContain('WSL is not required');
    expect(report.checks.find((check) => check.name === 'kernel-isolation')).toMatchObject({
      status: 'WARN',
    });
  });

  it('fails Windows when a product prerequisite is absent', () => {
    const report = inspectStage3Host(fakeProbe({ platform: 'win32', missing: ['claude'] }));
    expect(report.ready).toBe(false);
    expect(report.checks).toContainEqual({
      name: 'tool:claude',
      status: 'FAIL',
      detail: 'claude is missing',
    });
  });

  it('requires the pinned Node major on Windows', () => {
    const report = inspectStage3Host(fakeProbe({ platform: 'win32', nodeVersion: '22.18.0' }));
    expect(report.ready).toBe(false);
    expect(report.checks.find((check) => check.name === 'node')).toMatchObject({ status: 'FAIL' });
  });

  it('keeps the stronger Linux namespace profile available', () => {
    let shellProgram = '';
    const report = inspectStage3Host(
      fakeProbe({
        platform: 'linux',
        onRun: (command, args) => {
          expect(command).toBe('unshare');
          shellProgram = args.at(-1) ?? '';
        },
      }),
    );
    expect(report.ready).toBe(true);
    expect(report.profile).toBe('linux-namespace-v1');
    expect(shellProgram).toContain('mount --bind');
    expect(shellProgram).toContain('iptables -P OUTPUT DROP');
  });

  it('fails closed when a Linux namespace tool is missing', () => {
    const report = inspectStage3Host(fakeProbe({ platform: 'linux', missing: ['slirp4netns'] }));
    expect(report.ready).toBe(false);
    expect(report.checks.find((check) => check.name === 'tool:slirp4netns')).toMatchObject({
      status: 'FAIL',
    });
  });

  it('uses only the small Windows tool set for personal-v1', () => {
    const report = inspectStage3Host(fakeProbe({ platform: 'win32' }));
    const tools = report.checks
      .filter((check) => check.name.startsWith('tool:'))
      .map((check) => check.name.slice('tool:'.length));
    expect(tools).toEqual(WINDOWS_REQUIRED_TOOLS);
    expect(LINUX_NAMESPACE_REQUIRED_TOOLS.length).toBeGreaterThan(WINDOWS_REQUIRED_TOOLS.length);
  });
});
