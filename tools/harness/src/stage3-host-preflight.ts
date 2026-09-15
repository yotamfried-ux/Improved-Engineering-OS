import { spawnSync } from 'node:child_process';

export type Stage3HostCheckStatus = 'PASS' | 'FAIL' | 'WARN';

export interface Stage3HostCheck {
  readonly name: string;
  readonly status: Stage3HostCheckStatus;
  readonly detail: string;
}

export interface Stage3HostPreflight {
  readonly ready: boolean;
  readonly environment: 'linux' | 'wsl' | 'windows' | 'other';
  readonly checks: readonly Stage3HostCheck[];
}

export interface Stage3HostProbe {
  readonly platform: string;
  readonly cwd: string;
  readonly env: Readonly<Record<string, string | undefined>>;
  commandAvailable(command: string): boolean;
  run(
    command: string,
    args: readonly string[],
  ): { readonly status: number | null; readonly stderr: string };
}

export const STAGE3_REQUIRED_TOOLS = [
  'git',
  'unshare',
  'slirp4netns',
  'ip',
  'iptables',
  'mount',
  'getent',
] as const;

function environmentOf(probe: Stage3HostProbe): Stage3HostPreflight['environment'] {
  if (probe.platform === 'win32') return 'windows';
  if (probe.platform !== 'linux') return 'other';
  if (probe.env['WSL_DISTRO_NAME'] !== undefined || probe.env['WSL_INTEROP'] !== undefined) {
    return 'wsl';
  }
  return 'linux';
}

const systemProbe: Stage3HostProbe = {
  platform: process.platform,
  cwd: process.cwd(),
  env: process.env,
  commandAvailable: (command) =>
    spawnSync('/bin/sh', ['-c', `command -v -- ${command} >/dev/null 2>&1`], {
      encoding: 'utf8',
    }).status === 0,
  run: (command, args) => {
    const result = spawnSync(command, [...args], { encoding: 'utf8' });
    return { status: result.status, stderr: result.stderr ?? '' };
  },
};

/**
 * Prove the host can establish the same Linux isolation mechanism Stage 3 uses.
 *
 * This is deliberately separate from the Evidence Plane credential/network
 * probe. It lets a Windows owner validate WSL before minting any credential and
 * prevents a canary from discovering a missing namespace package only after it
 * has already pre-registered a Run.
 */
export function inspectStage3Host(probe: Stage3HostProbe = systemProbe): Stage3HostPreflight {
  const environment = environmentOf(probe);
  const checks: Stage3HostCheck[] = [];

  if (probe.platform !== 'linux') {
    checks.push({
      name: 'platform',
      status: 'FAIL',
      detail:
        probe.platform === 'win32'
          ? 'native Windows cannot provide the Stage 3 Linux namespaces; run from WSL2 Ubuntu'
          : `Stage 3 requires Linux namespaces, received ${probe.platform}`,
    });
    return { ready: false, environment, checks };
  }

  checks.push({
    name: 'platform',
    status: 'PASS',
    detail: environment === 'wsl' ? 'Linux under WSL detected' : 'Linux detected',
  });

  if (environment === 'wsl' && /^\/mnt\/[a-z]\//iu.test(probe.cwd)) {
    checks.push({
      name: 'wsl-filesystem',
      status: 'WARN',
      detail:
        'the repository is under /mnt/*; a clone inside the WSL Linux filesystem is recommended for Unix socket and bind-mount qualification',
    });
  }

  let toolsReady = true;
  for (const tool of STAGE3_REQUIRED_TOOLS) {
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
      'true',
    ]);
    checks.push({
      name: 'rootless-namespaces',
      status: namespace.status === 0 ? 'PASS' : 'FAIL',
      detail:
        namespace.status === 0
          ? 'rootless user, network and mount namespaces can be created'
          : `rootless namespace probe failed (${String(namespace.status)}): ${namespace.stderr.trim() || 'no stderr'}`,
    });
  } else {
    checks.push({
      name: 'rootless-namespaces',
      status: 'FAIL',
      detail: 'namespace probe was not attempted because required tools are missing',
    });
  }

  return {
    ready: checks.every((check) => check.status !== 'FAIL'),
    environment,
    checks,
  };
}

export function formatStage3HostPreflight(report: Stage3HostPreflight): string {
  const lines = [
    `Stage 3 host preflight: ${report.ready ? 'READY' : 'NOT READY'}`,
    `  environment: ${report.environment}`,
    ...report.checks.map(
      (check) => `  [${check.status}] ${check.name}: ${check.detail}`,
    ),
  ];

  if (!report.ready && report.environment === 'windows') {
    lines.push('  next: open Ubuntu in WSL2 and run this command again inside WSL');
  }
  if (!report.ready && (report.environment === 'linux' || report.environment === 'wsl')) {
    lines.push(
      '  Ubuntu/WSL2 packages: sudo apt-get update && sudo apt-get install -y slirp4netns iproute2 iptables util-linux git',
    );
  }

  return `${lines.join('\n')}\n`;
}
