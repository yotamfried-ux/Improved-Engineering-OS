import { spawnSync } from 'node:child_process';

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
  commandAvailable(command: string): boolean;
  run(
    command: string,
    args: readonly string[],
  ): { readonly status: number | null; readonly stderr: string };
}

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

const systemProbe: Stage3HostProbe = {
  platform: process.platform,
  nodeVersion: process.versions.node,
  commandAvailable: (command) => {
    const check =
      process.platform === 'win32'
        ? spawnSync('where.exe', [command], { encoding: 'utf8', windowsHide: true })
        : spawnSync('/bin/sh', ['-c', `command -v -- ${command} >/dev/null 2>&1`], {
            encoding: 'utf8',
          });
    return check.status === 0;
  },
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
