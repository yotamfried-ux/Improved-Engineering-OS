import { isContainedBy } from './sandbox.ts';
import type { QualificationProfile } from './qualification-profile.ts';

export interface TrialIntegrityFinding {
  readonly check: string;
  readonly status: 'PASS' | 'FAIL';
  readonly evidence: string;
}

export interface TrialIntegrityReport {
  readonly profile: QualificationProfile;
  readonly qualificationEligible: boolean;
  readonly kernelIsolationRequired: boolean;
  readonly findings: readonly TrialIntegrityFinding[];
  readonly reasons: readonly string[];
}

const FORBIDDEN_CREDENTIAL_NAMES = [
  'IEOS_SERVICE_TOKEN',
  'IEOS_INSTALLATION_TOKEN',
  'SUPABASE_SECRET_KEYS',
  'SUPABASE_SERVICE_ROLE_KEY',
] as const;

/**
 * Checks the parts of experiment integrity that are independent of kernel
 * sandboxing. These are mandatory on both qualification profiles.
 */
export function buildTrialIntegrityReport(options: {
  readonly profile: QualificationProfile;
  readonly workspaceRoot: string;
  readonly artifactPath: string;
  readonly environment: Readonly<Record<string, string>>;
  readonly allowedEnvironment: readonly string[];
  readonly allowedTools?: readonly string[];
  readonly settingSources?: readonly string[];
  readonly expectedPrompts: number;
  readonly promptsSent: number;
  readonly interactiveStdin: boolean;
  readonly ipcTarget: string;
  readonly forbiddenCredentialValues?: readonly string[];
}): TrialIntegrityReport {
  const findings: TrialIntegrityFinding[] = [];
  const add = (check: string, pass: boolean, evidence: string): void => {
    findings.push({ check, status: pass ? 'PASS' : 'FAIL', evidence });
  };

  add(
    'artifact-outside-workspace',
    !isContainedBy(options.workspaceRoot, options.artifactPath),
    'grader/transcript evidence is stored outside the disposable agent workspace',
  );

  const allowed = new Set(options.allowedEnvironment.map((name) => name.toLowerCase()));
  const unexpected = Object.keys(options.environment).filter(
    (name) => !allowed.has(name.toLowerCase()),
  );
  add(
    'environment-allowlist',
    unexpected.length === 0,
    unexpected.length === 0
      ? 'the child environment was built from the explicit allowlist'
      : `ungranted environment names: ${unexpected.join(', ')}`,
  );

  const envEntries = Object.entries(options.environment);
  const forbiddenNames = envEntries.filter(([name]) =>
    FORBIDDEN_CREDENTIAL_NAMES.some((forbidden) => forbidden.toLowerCase() === name.toLowerCase()),
  );
  const secretValues = (options.forbiddenCredentialValues ?? []).filter((value) => value !== '');
  const forbiddenValues = envEntries.filter(([, value]) => secretValues.includes(value));
  add(
    'credential-non-propagation',
    forbiddenNames.length === 0 && forbiddenValues.length === 0,
    forbiddenNames.length === 0 && forbiddenValues.length === 0
      ? 'installation/service/Supabase privileged credentials are absent from the child environment'
      : 'a host-only credential reached the child environment',
  );

  if (options.allowedTools !== undefined) {
    const forbiddenTools = options.allowedTools.filter((tool) =>
      ['websearch', 'webfetch'].includes(tool.toLowerCase()),
    );
    add(
      'web-tools-withheld',
      forbiddenTools.length === 0,
      forbiddenTools.length === 0
        ? 'WebSearch and WebFetch are not granted to the subject agent'
        : `forbidden web tool grants: ${forbiddenTools.join(', ')}`,
    );
  }

  if (options.settingSources !== undefined) {
    add(
      'project-settings-only',
      options.settingSources.length === 1 && options.settingSources[0] === 'project',
      `setting sources: ${options.settingSources.join(',') || '(none)'}`,
    );
  }

  add(
    'prompt-count',
    options.promptsSent === options.expectedPrompts,
    `${String(options.promptsSent)} prompt(s) sent; expected ${String(options.expectedPrompts)}`,
  );
  add(
    'stdin-closed',
    !options.interactiveStdin,
    options.interactiveStdin ? 'an interactive stdin channel existed' : 'stdin is closed; no rescue channel exists',
  );
  add(
    'host-proxy-ipc',
    options.environment['IEOS_INGEST_SOCKET'] === options.ipcTarget && options.ipcTarget !== '',
    'the child receives only the explicitly selected host-proxy IPC address',
  );

  const reasons = findings
    .filter((finding) => finding.status === 'FAIL')
    .map((finding) => `${finding.check}: ${finding.evidence}`);
  return {
    profile: options.profile,
    qualificationEligible: reasons.length === 0,
    kernelIsolationRequired: options.profile === 'linux-namespace-v1',
    findings,
    reasons,
  };
}
