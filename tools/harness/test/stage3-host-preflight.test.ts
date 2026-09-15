import { describe, expect, it } from 'vitest';
import {
  STAGE3_REQUIRED_TOOLS,
  formatStage3HostPreflight,
  inspectStage3Host,
  type Stage3HostProbe,
} from '../src/stage3-host-preflight.ts';

function fakeProbe(
  options: {
    readonly platform?: string;
    readonly cwd?: string;
    readonly env?: Readonly<Record<string, string | undefined>>;
    readonly missing?: readonly string[];
    readonly namespaceStatus?: number;
    readonly onRun?: (command: string, args: readonly string[]) => void;
  } = {},
): Stage3HostProbe {
  const missing = new Set(options.missing ?? []);
  return {
    platform: options.platform ?? 'linux',
    cwd: options.cwd ?? '/home/owner/Improved-Engineering-OS',
    env: options.env ?? {},
    commandAvailable: (command) => !missing.has(command),
    run: (command, args) => {
      options.onRun?.(command, args);
      return { status: options.namespaceStatus ?? 0, stderr: 'isolation denied' };
    },
  };
}

describe('Stage 3 trusted-host preflight', () => {
  it('refuses native Windows and points the owner to WSL2', () => {
    const report = inspectStage3Host(fakeProbe({ platform: 'win32' }));
    expect(report.ready).toBe(false);
    expect(report.environment).toBe('windows');
    expect(formatStage3HostPreflight(report)).toContain('WSL2');
  });

  it('fails closed when one namespace tool is missing', () => {
    const report = inspectStage3Host(fakeProbe({ missing: ['slirp4netns'] }));
    expect(report.ready).toBe(false);
    expect(report.checks).toContainEqual({
      name: 'tool:slirp4netns',
      status: 'FAIL',
      detail: 'slirp4netns is missing',
    });
    expect(formatStage3HostPreflight(report)).toContain('sudo apt-get install');
  });

  it('fails closed when rootless isolation cannot be established', () => {
    const report = inspectStage3Host(fakeProbe({ namespaceStatus: 1 }));
    expect(report.ready).toBe(false);
    expect(report.checks.find((check) => check.name === 'rootless-isolation')).toMatchObject({
      status: 'FAIL',
    });
  });

  it('probes bind-mount and iptables capability inside the rootless namespace', () => {
    let shellProgram = '';
    const report = inspectStage3Host(
      fakeProbe({
        onRun: (command, args) => {
          expect(command).toBe('unshare');
          shellProgram = args.at(-1) ?? '';
        },
      }),
    );
    expect(report.ready).toBe(true);
    expect(shellProgram).toContain('mount --bind');
    expect(shellProgram).toContain('iptables -P OUTPUT DROP');
  });

  it('accepts a capable WSL host and warns when the repo lives on the Windows mount', () => {
    const report = inspectStage3Host(
      fakeProbe({
        cwd: '/mnt/c/src/Improved-Engineering-OS',
        env: { WSL_DISTRO_NAME: 'Ubuntu' },
      }),
    );
    expect(report.ready).toBe(true);
    expect(report.environment).toBe('wsl');
    expect(report.checks.find((check) => check.name === 'wsl-filesystem')).toMatchObject({
      status: 'WARN',
    });
  });

  it('requires every tool the namespace wrapper depends on', () => {
    const report = inspectStage3Host(fakeProbe());
    expect(report.ready).toBe(true);
    const toolNames = report.checks
      .filter((check) => check.name.startsWith('tool:'))
      .map((check) => check.name.slice('tool:'.length));
    expect(toolNames).toEqual(STAGE3_REQUIRED_TOOLS);
  });
});
