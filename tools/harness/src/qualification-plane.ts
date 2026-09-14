/**
 * Trusted-host configuration for Stage 3 qualification.
 *
 * The separation is the security boundary:
 *
 * - the service token exists only on the host and pre-registers the Run (D36);
 * - the installation token exists only on the host and feeds the ingest proxy;
 * - the trial receives neither. It receives one declared AF_UNIX socket and a
 *   boolean reachability attestation after the host has actually probed the
 *   authenticated ingest path.
 *
 * This module deliberately does not launch the agent. It establishes the
 * preconditions under which launching one can produce qualification evidence.
 */

import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { httpIngest, servePlaneProxy, type PlaneProxy } from './plane-ingest.ts';

export const INGEST_SOCKET_ENV = 'IEOS_INGEST_SOCKET';
export const REACHABILITY_ATTESTATION_ENV = 'IEOS_INGEST_REACHABLE_AT_START';

export interface QualificationPlaneConfig {
  readonly endpoint: string;
  readonly serviceToken: string;
  readonly installationToken: string;
  readonly credentialSource: 'environment' | string;
}

interface CredentialFile {
  readonly schema_version?: unknown;
  readonly installation_id?: unknown;
  readonly token?: unknown;
  readonly expires_at?: unknown;
}

export class QualificationPlaneError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'QualificationPlaneError';
  }
}

/**
 * Read the two host-only identities required by a qualification run.
 *
 * `IEOS_INGEST_URL` is the product-facing D22 name. The older
 * `IEOS_INGEST_ENDPOINT` spelling is accepted for the existing Stage 3 runner
 * while the configuration is migrated, so this fix does not turn a naming
 * cleanup into a credential outage.
 */
export function loadQualificationPlaneConfig(options: {
  readonly eosRoot: string;
  readonly env?: Readonly<Record<string, string | undefined>>;
  readonly credentialsPath?: string;
}): QualificationPlaneConfig {
  const env = options.env ?? process.env;
  const endpoint = env['IEOS_INGEST_URL'] ?? env['IEOS_INGEST_ENDPOINT'];
  if (endpoint === undefined || endpoint.trim() === '') {
    throw new QualificationPlaneError(
      'Stage 3 qualification requires IEOS_INGEST_URL (IEOS_INGEST_ENDPOINT is accepted as a legacy alias)',
    );
  }

  const serviceToken = env['IEOS_SERVICE_TOKEN'];
  if (serviceToken === undefined || serviceToken === '') {
    throw new QualificationPlaneError(
      'Stage 3 qualification requires IEOS_SERVICE_TOKEN on the trusted host before any trial starts',
    );
  }

  const environmentToken = env['IEOS_INSTALLATION_TOKEN'];
  if (environmentToken !== undefined && environmentToken !== '') {
    return {
      endpoint,
      serviceToken,
      installationToken: environmentToken,
      credentialSource: 'environment',
    };
  }

  const credentialsPath = resolve(
    options.credentialsPath ?? join(options.eosRoot, '.ieos', 'credentials.json'),
  );
  if (!existsSync(credentialsPath)) {
    throw new QualificationPlaneError(
      `Stage 3 qualification needs an installation credential at ${credentialsPath} or IEOS_INSTALLATION_TOKEN on the trusted host`,
    );
  }

  let credential: CredentialFile;
  try {
    credential = JSON.parse(readFileSync(credentialsPath, 'utf8')) as CredentialFile;
  } catch {
    throw new QualificationPlaneError(
      `the installation credential at ${credentialsPath} is not valid JSON`,
    );
  }
  if (
    credential.schema_version !== '1' ||
    typeof credential.installation_id !== 'string' ||
    !credential.installation_id.startsWith('inst_') ||
    typeof credential.token !== 'string' ||
    credential.token === ''
  ) {
    throw new QualificationPlaneError(
      `the installation credential at ${credentialsPath} does not match the D22 credential contract`,
    );
  }
  if (
    typeof credential.expires_at === 'string' &&
    Number.isFinite(Date.parse(credential.expires_at)) &&
    Date.parse(credential.expires_at) <= Date.now()
  ) {
    throw new QualificationPlaneError(
      `the installation credential at ${credentialsPath} is expired; rotate it before qualification`,
    );
  }

  return {
    endpoint,
    serviceToken,
    installationToken: credential.token,
    credentialSource: credentialsPath,
  };
}

export interface QualificationProxy {
  /** Host-only listener path. Never placed in the trial environment. */
  readonly sourcePath: string;
  /** The only socket path the trial may see, declared by its isolation policy. */
  readonly targetPath: string;
  readonly hostReachableAtStart: true;
  close(): Promise<void>;
}

/**
 * Probe the authenticated path and only then expose a proxy.
 *
 * A TCP connection or a listening local socket is not enough: D23's
 * `ingest_reachable_at_start` means this installation credential could actually
 * ask the Evidence Plane a permitted question before work began. If it cannot,
 * the function throws before an agent can incur cost.
 */
export async function openQualificationProxy(options: {
  readonly config: QualificationPlaneConfig;
  readonly runId: string;
  readonly fetch?: typeof globalThis.fetch;
}): Promise<QualificationProxy> {
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

  const sourceDir = mkdtempSync(join(tmpdir(), 'ieos-stage3-proxy-'));
  const sourcePath = join(sourceDir, 'ingest.sock');
  const safeRunId = options.runId.replace(/[^A-Za-z0-9_-]/gu, '_').slice(0, 40);
  // Distinct from sourcePath: ns-trial creates/removes the target inode on the
  // host as part of the bind mount setup. Reusing the source would delete the
  // listener before the namespace could mount it.
  const targetPath = `/tmp/ieos-${safeRunId}-${String(process.pid)}.sock`;

  let proxy: PlaneProxy;
  try {
    proxy = await servePlaneProxy({ socketPath: sourcePath, ingest });
  } catch (error) {
    rmSync(sourceDir, { recursive: true, force: true });
    throw error;
  }

  return {
    sourcePath,
    targetPath,
    hostReachableAtStart: true,
    close: async () => {
      try {
        await proxy.close();
      } finally {
        rmSync(sourceDir, { recursive: true, force: true });
      }
    },
  };
}
