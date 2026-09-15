import { spawnSync } from 'node:child_process';
import type { IsolationPolicy } from './isolation.ts';
import { namespaceTrialPolicy } from './isolation.ts';
import {
  runInNamespace,
  type NamespaceRunOptions,
  type NamespaceRunResult,
} from './ns-sandbox.ts';
import { httpIngest, servePlaneProxy, type PlaneProxy } from './plane-ingest.ts';
import {
  QualificationPlaneError,
  openQualificationProxy,
  type QualificationPlaneConfig,
} from './qualification-plane.ts';

export type QualificationProfile = 'windows-personal-v1' | 'linux-namespace-v1';

export function qualificationProfileFor(
  platform: NodeJS.Platform = process.platform,
): QualificationProfile {
  if (platform === 'win32') return 'windows-personal-v1';
  if (platform === 'linux') return 'linux-namespace-v1';
  throw new Error(`Stage 3 qualification supports Windows and Linux, received ${platform}`);
}

/**
 * Stage 3 evaluates the platform the owner actually uses.
 *
 * Linux keeps all four ADR-0005 boundaries mandatory. The owner's Windows v1
 * profile requires only the filesystem/environment boundaries this harness can
 * actually prove there. Process/network kernel confinement stay explicit as
 * unproven and non-gating rather than being relabelled as security properties.
 */
export function qualificationTrialPolicy(options: {
  readonly platform?: NodeJS.Platform;
  readonly workspaceRoot: string;
  readonly evaluatorRoot: string;
  readonly allowedHosts: readonly string[];
  readonly allowedExecutables?: readonly string[];
  readonly allowedEnvironment: readonly string[];
  readonly ipcTarget?: string;
}): IsolationPolicy {
  const platform = options.platform ?? process.platform;
  if (platform === 'linux') {
    return namespaceTrialPolicy({
      workspaceRoot: options.workspaceRoot,
      evaluatorRoot: options.evaluatorRoot,
      allowedHosts: options.allowedHosts,
      allowedExecutables: options.allowedExecutables ?? [],
      allowedEnvironment: options.allowedEnvironment,
      declaredUnixSockets: options.ipcTarget === undefined ? [] : [options.ipcTarget],
    });
  }
  if (platform !== 'win32') qualificationProfileFor(platform);

  return {
    filesystem: {
      allowedRoots: [options.workspaceRoot],
      deniedRoots: [options.evaluatorRoot],
      declaredUnixSockets: [],
    },
    environment: { allowedNames: options.allowedEnvironment },
    process: { allowedExecutables: options.allowedExecutables ?? [] },
    network: { mode: 'unrestricted', allowedHosts: [] },
    requiredBoundaries: ['filesystem', 'environment'],
  };
}

/** Names deliberately copied into a Windows trial instead of inheriting env. */
export function qualificationEnvironmentNames(
  platform: NodeJS.Platform = process.platform,
): readonly string[] {
  if (platform === 'win32') {
    return [
      'PATH',
      'PATHEXT',
      'SystemRoot',
      'ComSpec',
      'HOME',
      'USERPROFILE',
      'APPDATA',
      'LOCALAPPDATA',
      'TEMP',
      'TMP',
      'NODE_EXTRA_CA_CERTS',
    ];
  }
  return ['PATH', 'HOME', 'TMPDIR', 'NODE_EXTRA_CA_CERTS'];
}

function envValue(
  env: Readonly<Record<string, string | undefined>>,
  name: string,
  platform: NodeJS.Platform,
): string | undefined {
  const direct = env[name];
  if (direct !== undefined || platform !== 'win32') return direct;
  const key = Object.keys(env).find((candidate) => candidate.toLowerCase() === name.toLowerCase());
  return key === undefined ? undefined : env[key];
}

export function qualificationEnvironmentSource(options: {
  readonly platform?: NodeJS.Platform;
  readonly env?: Readonly<Record<string, string | undefined>>;
  readonly trusted: Readonly<Record<string, string>>;
}): Readonly<Record<string, string | undefined>> {
  const platform = options.platform ?? process.platform;
  const env = options.env ?? process.env;
  const source: Record<string, string | undefined> = {};
  for (const name of qualificationEnvironmentNames(platform)) {
    source[name] =
      name === 'HOME' && platform === 'win32'
        ? envValue(env, 'HOME', platform) ?? envValue(env, 'USERPROFILE', platform)
        : envValue(env, name, platform);
  }
  Object.assign(source, options.trusted);
  return source;
}

/**
 * Execute under the strongest mechanism the active product profile actually has.
 * Linux keeps the namespace wrapper. Windows gets a replaced environment,
 * closed stdin and a dedicated workspace, with no invented kernel-sandbox claim.
 */
export function runQualificationProcess(
  options: NamespaceRunOptions & { readonly platform?: NodeJS.Platform },
): NamespaceRunResult {
  const platform = options.platform ?? process.platform;
  if (platform === 'linux') return runInNamespace(options);
  if (platform !== 'win32') qualificationProfileFor(platform);

  const [command, ...args] = options.command;
  if (command === undefined) throw new Error('qualification process command is empty');
  const run = spawnSync(command, args, {
    cwd: options.cwd,
    env: { ...options.environment },
    encoding: 'utf8',
    timeout: options.timeoutSeconds * 1000,
    maxBuffer: 64 * 1024 * 1024,
    windowsHide: true,
  });
  const error = run.error as NodeJS.ErrnoException | undefined;
  return {
    status: run.status,
    stdout: run.stdout ?? '',
    stderr: run.stderr ?? '',
    timedOut: error?.code === 'ETIMEDOUT' || run.signal !== null,
    observations: null,
    unavailableReason: null,
  };
}

export interface PlatformQualificationProxy {
  readonly sourcePath: string;
  readonly targetPath: string;
  readonly transport: 'unix-socket' | 'windows-named-pipe';
  readonly hostReachableAtStart: true;
  close(): Promise<void>;
}

/** Windows uses one host named pipe; Linux retains private source + AF_UNIX mount. */
export async function openPlatformQualificationProxy(options: {
  readonly config: QualificationPlaneConfig;
  readonly runId: string;
  readonly platform?: NodeJS.Platform;
  readonly fetch?: typeof globalThis.fetch;
}): Promise<PlatformQualificationProxy> {
  const platform = options.platform ?? process.platform;
  if (platform === 'linux') {
    const proxy = await openQualificationProxy({
      config: options.config,
      runId: options.runId,
      ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
    });
    return { ...proxy, transport: 'unix-socket' };
  }
  if (platform !== 'win32') qualificationProfileFor(platform);

  const ingest = httpIngest({
    endpoint: options.config.endpoint,
    installationToken: options.config.installationToken,
    fetch: options.fetch ?? globalThis.fetch,
  });
  if (!(await ingest.isReachable())) {
    throw new QualificationPlaneError(
      'the authenticated installation ingest path is not reachable; refusing to launch a qualification trial',
    );
  }

  const safeRunId = options.runId.replace(/[^A-Za-z0-9_-]/gu, '_').slice(0, 48);
  const pipePath = `\\\\.\\pipe\\ieos-${safeRunId}-${String(process.pid)}`;
  let proxy: PlaneProxy;
  try {
    proxy = await servePlaneProxy({ socketPath: pipePath, ingest });
  } catch (error) {
    throw new QualificationPlaneError(
      `could not open the Windows qualification named pipe: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  return {
    sourcePath: pipePath,
    targetPath: pipePath,
    transport: 'windows-named-pipe',
    hostReachableAtStart: true,
    close: () => proxy.close(),
  };
}
