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
  readonly serviceCredentialSource: 'environment' | string;
  readonly credentialSource: 'environment' | string;
}

interface InstallationCredentialFile {
  readonly schema_version?: unknown;
  readonly installation_id?: unknown;
  readonly token?: unknown;
  readonly expires_at?: unknown;
}

interface ServiceCredentialFile {
  readonly schema_version?: unknown;
  readonly service_id?: unknown;
  readonly scopes?: unknown;
  readonly token?: unknown;
  readonly expires_at?: unknown;
}

export class QualificationPlaneError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'QualificationPlaneError';
  }
}

function expiryProblem(value: unknown): 'missing' | 'invalid' | 'expired' | null {
  if (typeof value !== 'string' || value === '') return 'missing';
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return 'invalid';
  return parsed <= Date.now() ? 'expired' : null;
}

function loadServiceCredential(options: {
  readonly eosRoot: string;
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly serviceCredentialsPath?: string;
}): { readonly token: string; readonly source: 'environment' | string } {
  const environmentToken = options.env['IEOS_SERVICE_TOKEN'];
  if (environmentToken !== undefined && environmentToken !== '') {
    return { token: environmentToken, source: 'environment' };
  }

  const path = resolve(
    options.serviceCredentialsPath ?? join(options.eosRoot, '.ieos', 'harness-service.json'),
  );
  if (!existsSync(path)) {
    throw new QualificationPlaneError(
      `Stage 3 qualification needs a harness service credential at ${path} or IEOS_SERVICE_TOKEN on the trusted host`,
    );
  }

  let credential: ServiceCredentialFile;
  try {
    credential = JSON.parse(readFileSync(path, 'utf8')) as ServiceCredentialFile;
  } catch {
    throw new QualificationPlaneError(
      `the harness service credential at ${path} is not valid JSON`,
    );
  }

  const scopes = credential.scopes;
  const exactScope = Array.isArray(scopes) && scopes.length === 1 && scopes[0] === 'run.register';
  if (
    credential.schema_version !== '1' ||
    typeof credential.service_id !== 'string' ||
    !credential.service_id.startsWith('svc_') ||
    typeof credential.token !== 'string' ||
    credential.token === '' ||
    !exactScope
  ) {
    throw new QualificationPlaneError(
      `the harness service credential at ${path} does not match the D36 credential contract (svc_ identity with run.register only)`,
    );
  }

  const expiry = expiryProblem(credential.expires_at);
  if (expiry !== null) {
    throw new QualificationPlaneError(
      `the harness service credential at ${path} has ${expiry} expiry; rotate it before qualification`,
    );
  }

  return { token: credential.token, source: path };
}

/**
 * Read the two host-only identities required by a qualification run.
 *
 * `IEOS_INGEST_URL` is the product-facing D22 name. The older
 * `IEOS_INGEST_ENDPOINT` spelling is accepted for the existing Stage 3 runner
 * while the configuration is migrated. Both credentials may be supplied as
 * trusted-host environment secrets; by default they are read from separate
 * local credential files, so the raw tokens never need to be copied into a
 * shell command or trial environment.
 */
export function loadQualificationPlaneConfig(options: {
  readonly eosRoot: string;
  readonly env?: Readonly<Record<string, string | undefined>>;
  readonly credentialsPath?: string;
  readonly serviceCredentialsPath?: string;
}): QualificationPlaneConfig {
  const env = options.env ?? process.env;
  const endpoint = env['IEOS_INGEST_URL'] ?? env['IEOS_INGEST_ENDPOINT'];
  if (endpoint === undefined || endpoint.trim() === '') {
    throw new QualificationPlaneError(
      'Stage 3 qualification requires IEOS_INGEST_URL (IEOS_INGEST_ENDPOINT is accepted as a legacy alias)',
    );
  }
  // Both host credentials are sent to this endpoint, so it is checked before
  // either is read off disk: a cleartext endpoint would put them on the wire.
  let endpointUrl: URL;
  try {
    endpointUrl = new URL(endpoint);
  } catch {
    throw new QualificationPlaneError(`the ingest endpoint is not a valid URL: ${endpoint}`);
  }
  if (endpointUrl.protocol !== 'https:') {
    throw new QualificationPlaneError(
      `the ingest endpoint must use https, not ${endpointUrl.protocol}; the installation and service tokens are sent to it`,
    );
  }

  const service = loadServiceCredential({
    eosRoot: options.eosRoot,
    env,
    ...(options.serviceCredentialsPath === undefined
      ? {}
      : { serviceCredentialsPath: options.serviceCredentialsPath }),
  });

  const environmentToken = env['IEOS_INSTALLATION_TOKEN'];
  if (environmentToken !== undefined && environmentToken !== '') {
    return {
      endpoint,
      serviceToken: service.token,
      installationToken: environmentToken,
      serviceCredentialSource: service.source,
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

  let credential: InstallationCredentialFile;
  try {
    credential = JSON.parse(readFileSync(credentialsPath, 'utf8')) as InstallationCredentialFile;
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
  const expiry = expiryProblem(credential.expires_at);
  if (expiry !== null) {
    throw new QualificationPlaneError(
      `the installation credential at ${credentialsPath} has ${expiry} expiry; rotate it before qualification`,
    );
  }

  return {
    endpoint,
    serviceToken: service.token,
    installationToken: credential.token,
    serviceCredentialSource: service.source,
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
