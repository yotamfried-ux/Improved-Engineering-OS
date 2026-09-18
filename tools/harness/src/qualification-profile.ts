import { pathWithGitBashFirst } from './git-bash.ts';
import type { IsolationPolicy } from './isolation.ts';
import { namespaceTrialPolicy } from './isolation.ts';
import { runInNamespace, type NamespaceRunOptions, type NamespaceRunResult } from './ns-sandbox.ts';
import { httpIngest, servePlaneProxy, type PlaneProxy } from './plane-ingest.ts';
import {
  QualificationPlaneError,
  openQualificationProxy,
  type QualificationPlaneConfig,
} from './qualification-plane.ts';
import { runTrialProcess } from './trial-process.ts';

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
  /**
   * Where a Windows trial's `bash` should come from, from
   * `windowsBashDirectory()`.
   *
   * Passed in rather than resolved here: this function's job is to build an
   * environment from the one it is given, and a test asserts exactly that it
   * does not inherit host state. Reaching for the host's `git` from inside it
   * broke that guarantee -- and the CI job on Windows caught it.
   */
  readonly bashDirectory?: string | undefined;
}): Readonly<Record<string, string | undefined>> {
  const platform = options.platform ?? process.platform;
  const env = options.env ?? process.env;
  const source: Record<string, string | undefined> = {};
  for (const name of qualificationEnvironmentNames(platform)) {
    source[name] =
      name === 'HOME' && platform === 'win32'
        ? (envValue(env, 'HOME', platform) ?? envValue(env, 'USERPROFILE', platform))
        : envValue(env, name, platform);
  }

  // A trial's `bash` must be Git's, not the WSL launcher that shadows it. Done
  // here rather than in the fixture because the fixture is graded content, and
  // through the shared helper so the evaluator path cannot drift from this one.
  if (platform === 'win32' && options.bashDirectory !== undefined) {
    source['PATH'] = pathWithGitBashFirst(source['PATH'] ?? '', options.bashDirectory);
  }

  Object.assign(source, options.trusted);
  return source;
}

/**
 * Execute under the strongest mechanism the active product profile actually has.
 * Linux keeps the namespace wrapper. Windows gets a replaced environment,
 * closed stdin and a dedicated workspace, with no invented kernel-sandbox claim.
 */
export async function runQualificationProcess(
  options: NamespaceRunOptions & { readonly platform?: NodeJS.Platform },
): Promise<NamespaceRunResult> {
  const platform = options.platform ?? process.platform;
  if (platform === 'linux') return runInNamespace(options);
  if (platform !== 'win32') qualificationProfileFor(platform);

  const [command, ...args] = options.command;
  if (command === undefined) throw new Error('qualification process command is empty');
  // Asynchronous so the named-pipe proxy on this event loop keeps answering the
  // trial's hooks while it runs.
  const run = await runTrialProcess(command, args, {
    cwd: options.cwd,
    env: options.environment,
    timeoutMs: options.timeoutSeconds * 1000,
    maxBufferBytes: 64 * 1024 * 1024,
  });
  return {
    status: run.status,
    stdout: run.stdout,
    stderr: run.error === null ? run.stderr : `${run.stderr}${run.error}\n`,
    timedOut: run.timedOut,
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
