import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  findingFor,
  namespaceFindings,
  namespaceTrialPolicy,
  NS_TRIAL_SCRIPT,
  type NamespaceObservations,
} from '../src/index.ts';

const socketPath = '/tmp/ieos-stage3-ingest.sock';

function observations(
  overrides: Partial<NamespaceObservations> = {},
): NamespaceObservations {
  return {
    denied_roots: '/repo/evaluator',
    denied_entries_visible: 0,
    allowlist: 'api.anthropic.com(203.0.113.10):443',
    control_host: '93.184.216.34:443',
    control_result: 'refused:ETIMEDOUT',
    interfaces: 'lo,tap0',
    pid_namespace_self: 1,
    pid_namespace_visible_processes: 1,
    ipc_socket_declared: false,
    ipc_socket_declared_path: '',
    ipc_socket_mounted_path: '',
    ipc_socket_path_matches: false,
    ipc_socket_is_unix: false,
    ...overrides,
  };
}

const cleanSocket = (): NamespaceObservations =>
  observations({
    ipc_socket_declared: true,
    ipc_socket_declared_path: socketPath,
    ipc_socket_mounted_path: socketPath,
    ipc_socket_path_matches: true,
    ipc_socket_is_unix: true,
  });

describe('the Stage 3 ingest socket is an explicit IPC grant, not a silent boundary change', () => {
  it('records the socket in the isolation policy', () => {
    const policy = namespaceTrialPolicy({
      workspaceRoot: '/trial',
      evaluatorRoot: '/repo/evaluator',
      allowedHosts: ['api.anthropic.com:443'],
      declaredUnixSockets: [socketPath],
    });
    expect(policy.filesystem.declaredUnixSockets).toEqual([socketPath]);
    expect(policy.network.allowedHosts).toEqual(['api.anthropic.com:443']);
  });

  it('proves filesystem and network only when all three socket facts are true', () => {
    const findings = namespaceFindings(cleanSocket());
    expect(findingFor({ findings }, 'filesystem')?.verdict).toBe('proven');
    expect(findingFor({ findings }, 'filesystem')?.evidence).toContain('policy-declared');
    expect(findingFor({ findings }, 'network')?.verdict).toBe('proven');
    expect(findingFor({ findings }, 'network')?.evidence).toContain('AF_UNIX IPC');
  });

  it('fails T3 when a socket is mounted without being declared', () => {
    const findings = namespaceFindings(
      observations({
        ipc_socket_mounted_path: socketPath,
        ipc_socket_is_unix: true,
      }),
    );
    expect(findingFor({ findings }, 'filesystem')?.verdict).toBe('violated');
    expect(findingFor({ findings }, 'filesystem')?.evidence).toContain(
      'without a policy declaration',
    );
  });

  it('fails T3 when the policy declares a socket but no mount exists', () => {
    const findings = namespaceFindings(
      observations({
        ipc_socket_declared: true,
        ipc_socket_declared_path: socketPath,
      }),
    );
    expect(findingFor({ findings }, 'filesystem')?.verdict).toBe('violated');
    expect(findingFor({ findings }, 'filesystem')?.evidence).toContain('no socket was mounted');
  });

  it('fails T3 when the mount lands at a different path', () => {
    const findings = namespaceFindings({
      ...cleanSocket(),
      ipc_socket_mounted_path: '/tmp/other.sock',
      ipc_socket_path_matches: false,
    });
    expect(findingFor({ findings }, 'filesystem')?.verdict).toBe('violated');
    expect(findingFor({ findings }, 'filesystem')?.evidence).toContain('/tmp/other.sock');
  });

  it('fails T3 when the thing at the declared path is not a Unix socket', () => {
    const findings = namespaceFindings({ ...cleanSocket(), ipc_socket_is_unix: false });
    expect(findingFor({ findings }, 'filesystem')?.verdict).toBe('violated');
    expect(findingFor({ findings }, 'filesystem')?.evidence).toContain('was not a Unix socket');
  });

  it('does not let working IPC soften the network boundary', () => {
    const findings = namespaceFindings({
      ...cleanSocket(),
      control_result: 'reached',
    });
    expect(findingFor({ findings }, 'filesystem')?.verdict).toBe('proven');
    expect(findingFor({ findings }, 'network')?.verdict).toBe('violated');
  });

  it('pins the shell mechanism that produces the three observations', () => {
    const source = readFileSync(NS_TRIAL_SCRIPT, 'utf8');
    expect(source).toContain('--declare-unix-socket');
    expect(source).toContain('--mount-unix-socket');
    expect(source).toContain('mount --bind "$NS_SOCKET_SOURCE" "$NS_SOCKET_TARGET"');
    expect(source).toContain('[ -S "$NS_SOCKET_DECLARED" ]');
    expect(source).toContain('"ipc_socket_declared"');
    expect(source).toContain('"ipc_socket_path_matches"');
    expect(source).toContain('"ipc_socket_is_unix"');
    expect(source).toContain('iptables -P OUTPUT DROP');
  });
});
