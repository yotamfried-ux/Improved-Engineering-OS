import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { windowsBashDirectory } from './git-bash.ts';

export type Stage3HostCheckStatus = 'PASS' | 'FAIL' | 'WARN';

export interface Stage3HostCheck {
  readonly name: string;
  readonly status: Stage3HostCheckStatus;
  readonly detail: string;
}

export interface Stage3HostPreflight {
  readonly ready: boolean;
  readonly environment: 'linux' | 'windows' | 'other';
  readonly profile: 'windows-personal-v1' | 'linux-namespace-v1' | null;
  readonly checks: readonly Stage3HostCheck[];
}

export interface Stage3HostProbe {
  readonly platform: string;
  readonly nodeVersion: string;
  readonly pnpmVersion: string;
  commandAvailable(command: string): boolean;
  windowsGitBashDirectory(): string | undefined;
  symlinkCapability(): { readonly ok: boolean; readonly detail: string };
  run(
    command: string,
    args: readonly string[],
  ): { readonly status: number | null; readonly stderr: string };
}

export const PINNED_PNPM_VERSION = '11.25.0';
export const WINDOWS_REQUIRED_TOOLS = ['git', 'claude'] as const;
export const LINUX_NAMESPACE_REQUIRED_TOOLS = [
  'git',
  'claude',
  'unshare',
  'slirp4netns',
  'ip',
  'iptables',
  'mount',
  'getent',
] as const;

function environmentOf(platform: string): Stage3HostPreflight['environment'] {
  if (platform === 'win32') return 'windows';
  if (platform === 'linux') return 'linux';
  return 'other';
}

export interface CommandVersionRunner {
  (
    command: string,
    args: readonly string[],
  ): { readonly status: number | null; readonly stdout?: string };
}

const systemCommandVersionRunner: CommandVersionRunner = (command, args) => {
  const result = spawnSync(command, [...args], {
    encoding: 'utf8',
    windowsHide: true,
  });
  return { status: result.status, stdout: result.stdout ?? '' };
};

export function commandVersion(
  command: string,
  platform: string = process.platform,
  runner: CommandVersionRunner = systemCommandVersionRunner,
  comspec: string = process.env['ComSpec'] ?? 'cmd.exe',
): string {
  const executable = platform === 'win32' ? comspec : command;
  const args =
    platform === 'win32' ? ['/d', '/s', '/c', `${command} --version`] : ['--version'];
  const result = runner(executable, args);
  if (result.status !== 0) return '';
  return (result.stdout ?? '').trim();
}

function systemSymlinkCapability(): { readonly ok: boolean; readonly detail: string } {
  const root = mkdtempSync(join(tmpdir(), 'ieos-stage3-symlink-'));
  const target = join(root, 'target');
  const link = join(root, 'link');
  try {
    mkdirSync(target);
    symlinkSync(target, link, 'dir');
    return { ok: true, detail: 'directory symlink creation is permitted' };
  } catch (error) {
    return {
      ok: false,
      detail:
        error instanceof Error
          ? `directory symlink creation failed: ${error.message}`
          : `directory symlink creation failed: ${String(error)}`,
    };
  } finally {
    rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
}

const systemProbe: Stage3HostProbe = {
  platform: process.platform,
  nodeVersion: process.versions.node,
  pnpmVersion: commandVersion('pnpm'),
  commandAvailable: (command) => {
    const check =
      process.platform === 'win32'
        ? spawnSync('where.exe', [command], { encoding: 'utf8', windowsHide: true })
        : spawnSync('/bin/sh', ['-c', `command -v -- ${command} >/dev/null 2>&1`], {
            encoding: 'utf8',
          });
    return check.status === 0;
  },
  windowsGitBashDirectory: () => windowsBashDirectory(),
  symlinkCapability: systemSymlinkCapability,
  run: (command, args) => {
    const result = spawnSync(command, [...args], { encoding: 'utf8', windowsHide: true });
    return { status: result.status, stderr: result.stderr ?? '' };
  },
};

/**
 * Validate the host against the platform profile the owner actually uses.
 *
 * Windows is the canonical personal-v1 qualification platform. It does not need
 * WSL or Linux namespace packages. Linux remains supported as an optional
 * stronger profile and keeps the namespace capability probe.
 */
export function inspectStage3Host(probe: Stage3HostProbe = systemProbe): Stage3HostPreflight {
  const environment = environmentOf(probe.platform);
  const checks: Stage3HostCheck[] = [];
  const major = Number(probe.nodeVersion.split('.')[0]);
  checks.push({
    name: 'node',
    status: major === 24 ? 'PASS' : 'FAIL',
    detail:
      major === 24
        ? `Node ${probe.nodeVersion} matches the 24.x pin`
        : `Node ${probe.nodeVersion} does not match the required 24.x pin`,
  });
  checks.push({
    name: 'pnpm',
    status: probe.pnpmVersion === PINNED_PNPM_VERSION ? 'PASS' : 'FAIL',
    detail:
      probe.pnpmVersion === PINNED_PNPM_VERSION
        ? `pnpm ${probe.pnpmVersion} matches the exact workspace pin`
        : `pnpm ${probe.pnpmVersion || '(unavailable)'} does not match required ${PINNED_PNPM_VERSION}`,
  });

  if (probe.platform === 'win32') {
    checks.unshift({
      name: 'platform',
      status: 'PASS',
      detail:
        'native Windows selected as the personal-v1 qualification platform; WSL is not required',
    });
    for (const tool of WINDOWS_REQUIRED_TOOLS) {
      const available = probe.commandAvailable(tool);
      checks.push({
        name: `tool:${tool}`,
        status: available ? 'PASS' : 'FAIL',
        detail: available ? `${tool} is available` : `${tool} is missing`,
      });
    }
    const gitBash = probe.windowsGitBashDirectory();
    checks.push({
      name: 'git-bash',
      status: gitBash === undefined ? 'FAIL' : 'PASS',
      detail:
        gitBash === undefined
          ? 'Git Bash could not be resolved from the Git for Windows installation'
          : `Git Bash resolved from ${gitBash}; System32/WSL bash may remain first on the host PATH`,
    });
    const symlink = probe.symlinkCapability();
    checks.push({
      name: 'symlink',
      status: symlink.ok ? 'PASS' : 'FAIL',
      detail: symlink.ok
        ? symlink.detail
        : `${symlink.detail}. Enable Windows Developer Mode (or equivalent symlink privilege) before qualification`,
    });
    checks.push({
      name: 'kernel-isolation',
      status: 'WARN',
      detail:
        'PID/network kernel confinement is not implemented or claimed by windows-personal-v1; Stage 3 gates the Windows integrity controls the owner actually uses',
    });
    return {
      ready: checks.every((check) => check.status !== 'FAIL'),
      environment,
      profile: 'windows-personal-v1',
      checks,
    };
  }

  if (probe.platform === 'linux') {
    checks.unshift({
      name: 'platform',
      status: 'PASS',
      detail: 'Linux selected with the stronger namespace qualification profile',
    });
    let toolsReady = true;
    for (const tool of LINUX_NAMESPACE_REQUIRED_TOOLS) {
      const available = probe.commandAvailable(tool);
      checks.push({
        name: `tool:${tool}`,
        status: available ? 'PASS' : 'FAIL',
        detail: available ? `${tool} is available` : `${tool} is missing`,
      });
      toolsReady = toolsReady && available;
    }
    if (toolsReady) {
      const namespace = probe.run('unshare', [
        '--user',
        '--map-root-user',
        '--net',
        '--mount',
        '--propagation',
        'private',
        '/bin/sh',
        '-c',
        'set -e; t=$(mktemp -d); mkdir "$t/a" "$t/b"; mount --bind "$t/a" "$t/b"; iptables -P OUTPUT DROP; iptables -A OUTPUT -o lo -j ACCEPT',
      ]);
      checks.push({
        name: 'rootless-isolation',
        status: namespace.status === 0 ? 'PASS' : 'FAIL',
        detail:
          namespace.status === 0
            ? 'rootless user/network/mount namespaces, bind mounts and iptables policy are usable'
            : `rootless isolation probe failed (${String(namespace.status)}): ${namespace.stderr.trim() || 'no stderr'}`,
      });
    } else {
      checks.push({
        name: 'rootless-isolation',
        status: 'FAIL',
        detail: 'isolation probe was not attempted because required Linux tools are missing',
      });
    }
    return {
      ready: checks.every((check) => check.status !== 'FAIL'),
      environment,
      profile: 'linux-namespace-v1',
      checks,
    };
  }

  checks.unshift({
    name: 'platform',
    status: 'FAIL',
    detail: `Stage 3 personal v1 supports Windows (preferred) and Linux, received ${probe.platform}`,
  });
  return { ready: false, environment, profile: null, checks };
}

export function formatStage3HostPreflight(report: Stage3HostPreflight): string {
  const lines = [
    `Stage 3 host preflight: ${report.ready ? 'READY' : 'NOT READY'}`,
    `  environment: ${report.environment}`,
    `  profile: ${report.profile ?? 'unsupported'}`,
    ...report.checks.map((check) => `  [${check.status}] ${check.name}: ${check.detail}`),
  ];
  if (!report.ready && report.environment === 'linux') {
    lines.push(
      '  optional Linux profile packages: sudo apt-get update && sudo apt-get install -y slirp4netns iproute2 iptables util-linux git',
    );
  }
  return `${lines.join('\n')}\n`;
}
