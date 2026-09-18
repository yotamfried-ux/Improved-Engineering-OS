import { join, resolve } from 'node:path';
import { httpIngest } from './plane-ingest.ts';
import { QualificationPlaneError, loadQualificationPlaneConfig } from './qualification-plane.ts';
import { formatStage3HostPreflight, inspectStage3Host } from './stage3-host-preflight.ts';
import { inspectKnowledgeIndex } from './stage3-index-preflight.ts';

const args = process.argv.slice(2);
const flag = (name: string): string | undefined => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};
const hostOnly = args.includes('--host-only');
const explicitRoot = flag('--eos-root');
const eosRoot =
  explicitRoot === undefined
    ? resolve(import.meta.dirname, '..', '..', '..')
    : resolve(explicitRoot);
const credentialsPath = flag('--credentials');
const serviceCredentialsPath = flag('--service-credentials');

const host = inspectStage3Host();
process.stdout.write(formatStage3HostPreflight(host));
if (!host.ready) process.exit(69);

if (hostOnly) {
  process.stdout.write('Stage 3 preflight: HOST READY FOR LOCAL CREDENTIAL PROVISIONING\n');
  process.exit(0);
}

let config: ReturnType<typeof loadQualificationPlaneConfig>;
try {
  config = loadQualificationPlaneConfig({
    eosRoot,
    ...(credentialsPath === undefined ? {} : { credentialsPath }),
    ...(serviceCredentialsPath === undefined ? {} : { serviceCredentialsPath }),
  });
  process.stdout.write(
    [
      'Stage 3 credential preflight: PASS',
      `  service credential: ${config.serviceCredentialSource === 'environment' ? 'trusted-host environment' : 'trusted-host local file'}`,
      `  installation credential: ${config.credentialSource === 'environment' ? 'trusted-host environment' : 'trusted-host local file'}`,
      '',
    ].join('\n'),
  );
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(
    [
      'Stage 3 credential preflight: FAIL',
      `  ${message}`,
      '',
      'If the two local identities have not been provisioned yet, run on this trusted host:',
      '  pnpm ieos auth enroll --owner <supabase-auth-user-uuid>',
      '  pnpm stage3:service-auth enroll --owner <supabase-auth-user-uuid>',
      'Apply only the hash-bearing SQL those commands print; never copy the raw tokens into chat, Git or SQL.',
      '',
    ].join('\n'),
  );
  process.exit(error instanceof QualificationPlaneError ? 3 : 1);
}

const ingest = httpIngest({
  endpoint: config.endpoint,
  installationToken: config.installationToken,
  fetch: globalThis.fetch,
});
if (!(await ingest.isReachable())) {
  process.stderr.write(
    [
      'Stage 3 Evidence Plane reachability preflight: FAIL',
      '  authenticated installation read_minimal health check did not succeed',
      '',
    ].join('\n'),
  );
  process.exit(5);
}
process.stdout.write(
  [
    'Stage 3 Evidence Plane reachability preflight: PASS',
    '  authenticated installation path accepted read_minimal health',
    '',
  ].join('\n'),
);

const indexPath = flag('--index') ?? join(eosRoot, 'knowledge.sqlite');
const index = await inspectKnowledgeIndex(indexPath);
if (!index.ok) {
  process.stderr.write(
    ['Stage 3 knowledge index preflight: FAIL', `  ${index.reason}`, ''].join('\n'),
  );
  process.exit(4);
}
process.stdout.write(
  [
    'Stage 3 knowledge index preflight: PASS',
    `  index_digest: ${index.indexDigest}`,
    'Stage 3 preflight: READY FOR NO-MODEL CANARY',
    '',
  ].join('\n'),
);
