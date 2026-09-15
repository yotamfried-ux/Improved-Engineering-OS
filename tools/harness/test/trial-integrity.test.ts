import { describe, expect, it } from 'vitest';
import { buildTrialIntegrityReport } from '../src/trial-integrity.ts';

const base = () => ({
  profile: 'windows-personal-v1' as const,
  workspaceRoot: '/tmp/trial',
  artifactPath: '/tmp/evidence/transcript.ndjson',
  environment: {
    PATH: '/tools',
    IEOS_INGEST_SOCKET: 'pipe-test',
  },
  allowedEnvironment: ['PATH', 'IEOS_INGEST_SOCKET'],
  allowedTools: ['Read', 'Write', 'Bash'],
  settingSources: ['project'],
  expectedPrompts: 1,
  promptsSent: 1,
  interactiveStdin: false,
  ipcTarget: 'pipe-test',
  forbiddenCredentialValues: ['service-secret', 'installation-secret'],
});

describe('Stage 3 trial integrity', () => {
  it('accepts the Windows personal profile without pretending kernel isolation exists', () => {
    const report = buildTrialIntegrityReport(base());
    expect(report.qualificationEligible).toBe(true);
    expect(report.kernelIsolationRequired).toBe(false);
  });

  it('fails if a host-only credential reaches the child under any variable name', () => {
    const report = buildTrialIntegrityReport({
      ...base(),
      environment: {
        ...base().environment,
        ACCIDENTAL_VALUE: 'service-secret',
      },
      allowedEnvironment: [...base().allowedEnvironment, 'ACCIDENTAL_VALUE'],
    });
    expect(report.qualificationEligible).toBe(false);
    expect(report.reasons.join('\n')).toContain('credential-non-propagation');
  });

  it('fails if the agent is granted a web search tool', () => {
    const report = buildTrialIntegrityReport({
      ...base(),
      allowedTools: [...base().allowedTools, 'WebSearch'],
    });
    expect(report.qualificationEligible).toBe(false);
    expect(report.reasons.join('\n')).toContain('web-tools-withheld');
  });

  it('fails when evidence is written into the subject workspace', () => {
    const report = buildTrialIntegrityReport({
      ...base(),
      artifactPath: '/tmp/trial/transcript.ndjson',
    });
    expect(report.qualificationEligible).toBe(false);
    expect(report.reasons.join('\n')).toContain('artifact-outside-workspace');
  });
});
