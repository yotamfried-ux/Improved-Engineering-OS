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

  it('states the failure it found rather than the condition it wanted', () => {
    // A reason is copied verbatim into the Stage 3 report evidence column, so
    // evidence that asserts the passing condition beside a FAIL is a report
    // that contradicts itself.
    const inside = buildTrialIntegrityReport({
      ...base(),
      artifactPath: '/tmp/trial/transcript.ndjson',
    });
    expect(inside.reasons.join('\n')).toContain('is inside the agent workspace');
    expect(inside.reasons.join('\n')).not.toContain('is stored outside');

    const mismatched = buildTrialIntegrityReport({
      ...base(),
      environment: { ...base().environment, IEOS_INGEST_SOCKET: 'someone-elses-pipe' },
    });
    expect(mismatched.qualificationEligible).toBe(false);
    expect(mismatched.reasons.join('\n')).toContain('does not match');

    const unselected = buildTrialIntegrityReport({
      ...base(),
      environment: { ...base().environment, IEOS_INGEST_SOCKET: '' },
      ipcTarget: '',
    });
    expect(unselected.qualificationEligible).toBe(false);
    expect(unselected.reasons.join('\n')).toContain('no host-proxy IPC address');
  });
});
