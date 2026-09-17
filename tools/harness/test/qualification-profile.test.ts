import { readFileSync } from 'node:fs';
import { createServer, type AddressInfo } from 'node:net';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  openPlatformQualificationProxy,
  qualificationEnvironmentSource,
  qualificationProfileFor,
  qualificationTrialPolicy,
  runQualificationProcess,
} from '../src/qualification-profile.ts';
import { windowsBashDirectory } from '../src/git-bash.ts';

describe('Stage 3 qualification profiles', () => {
  it('makes native Windows the personal-v1 profile without claiming kernel boundaries', () => {
    const policy = qualificationTrialPolicy({
      platform: 'win32',
      workspaceRoot: 'C:\\trial',
      evaluatorRoot: 'C:\\evaluator',
      allowedHosts: ['api.anthropic.com:443'],
      allowedExecutables: ['claude'],
      allowedEnvironment: ['PATH', 'IEOS_RUN_ID'],
      ipcTarget: '\\\\.\\pipe\\ieos-test',
    });
    expect(qualificationProfileFor('win32')).toBe('windows-personal-v1');
    expect(policy.requiredBoundaries).toEqual(['filesystem', 'environment']);
    expect(policy.network.mode).toBe('unrestricted');
    expect(policy.filesystem.declaredUnixSockets).toEqual([]);
  });

  it('keeps all four boundaries mandatory on the optional Linux profile', () => {
    const policy = qualificationTrialPolicy({
      platform: 'linux',
      workspaceRoot: '/tmp/trial',
      evaluatorRoot: '/repo/evaluator',
      allowedHosts: ['api.anthropic.com:443'],
      allowedExecutables: ['claude'],
      allowedEnvironment: ['PATH', 'IEOS_RUN_ID'],
      ipcTarget: '/tmp/ieos.sock',
    });
    expect(qualificationProfileFor('linux')).toBe('linux-namespace-v1');
    expect(policy.requiredBoundaries).toEqual(['filesystem', 'environment', 'process', 'network']);
    expect(policy.filesystem.declaredUnixSockets).toEqual(['/tmp/ieos.sock']);
  });

  it('normalizes the small Windows environment instead of inheriting it', () => {
    const source = qualificationEnvironmentSource({
      platform: 'win32',
      env: {
        Path: 'C:\\tools',
        USERPROFILE: 'C:\\Users\\owner',
        IEOS_INSTALLATION_TOKEN: 'must-not-leak',
      },
      trusted: { IEOS_RUN_ID: 'run_test' },
    });
    expect(source['PATH']).toBe('C:\\tools');
    expect(source['HOME']).toBe('C:\\Users\\owner');
    expect(source['IEOS_INSTALLATION_TOKEN']).toBeUndefined();
    expect(source['IEOS_RUN_ID']).toBe('run_test');
  });

  it('runs the Windows profile directly with only the supplied environment', async () => {
    const result = await runQualificationProcess({
      platform: 'win32',
      command: [
        process.execPath,
        '-e',
        'process.stdout.write(process.env.TEST_VALUE ?? "missing")',
      ],
      cwd: process.cwd(),
      environment: { TEST_VALUE: 'present' },
      allowedHosts: [],
      deniedRoots: [],
      timeoutSeconds: 5,
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toBe('present');
    expect(result.observations).toBeNull();
  });
});

describe.skipIf(process.platform !== 'win32')('Windows qualification IPC', () => {
  it('opens a real named pipe instead of requiring an AF_UNIX mount', async () => {
    const fetch = (() =>
      Promise.resolve(
        new Response(JSON.stringify({ data: { ok: true } }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      )) as typeof globalThis.fetch;
    const proxy = await openPlatformQualificationProxy({
      platform: 'win32',
      runId: 'run_windows_pipe_test',
      config: {
        endpoint: 'https://plane.invalid/ingest',
        serviceToken: 'service-secret',
        installationToken: 'installation-secret',
        serviceCredentialSource: 'environment',
        credentialSource: 'environment',
      },
      fetch,
    });
    try {
      expect(proxy.transport).toBe('windows-named-pipe');
      expect(proxy.sourcePath).toBe(proxy.targetPath);
      expect(proxy.targetPath).toMatch(/^\\\\\.\\pipe\\ieos-/u);
    } finally {
      await proxy.close();
    }
  });

  it('keeps the host proxy answering while the trial runs (live canary regression)', async () => {
    // The first live Windows canary ran its child with spawnSync. That blocked
    // the host event loop the named-pipe proxy lives on, so every hook flush
    // timed out and no event ever reached the Evidence Plane.
    const fetch = (() =>
      Promise.resolve(
        new Response(JSON.stringify({ data: { ok: true } }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      )) as typeof globalThis.fetch;
    const proxy = await openPlatformQualificationProxy({
      platform: 'win32',
      runId: 'run_windows_pipe_live',
      config: {
        endpoint: 'https://plane.invalid/ingest',
        serviceToken: 'service-secret',
        installationToken: 'installation-secret',
        serviceCredentialSource: 'environment',
        credentialSource: 'environment',
      },
      fetch,
    });
    try {
      const result = await runQualificationProcess({
        platform: 'win32',
        command: [process.execPath, '-e', ASK_PROXY],
        cwd: process.cwd(),
        environment: { ...SOCKET_BASE, IEOS_INGEST_SOCKET: proxy.targetPath },
        allowedHosts: [],
        deniedRoots: [],
        timeoutSeconds: 10,
      });
      expect(result.timedOut).toBe(false);
      expect(result.stdout).toBe('{"ok":true,"reachable":true}');
      expect(result.status).toBe(0);
    } finally {
      await proxy.close();
    }
  });
});

/** Winsock cannot initialise in a child without SystemRoot, so the trial allowlist carries it. */
const SOCKET_BASE: Record<string, string> =
  process.env['SystemRoot'] === undefined ? {} : { SystemRoot: process.env['SystemRoot'] };

/** A trial child that asks the host proxy one question and prints the reply. */
const ASK_PROXY = `
const socket = require('node:net').connect(process.env.IEOS_INGEST_SOCKET);
let reply = '';
socket.setTimeout(3000, () => { process.stdout.write('no reply'); process.exit(3); });
socket.on('connect', () => socket.write(JSON.stringify({ op: 'isReachable' }) + '\\n'));
socket.on('data', (chunk) => { reply += chunk; });
socket.on('end', () => { process.stdout.write(reply.trim()); process.exit(0); });
`;

describe('the host process stays responsive while a trial runs', () => {
  it('lets the trial reach a server living in the host process', async () => {
    const server = createServer((socket) => {
      // The child exits as soon as it reads the reply, which can reset the socket.
      socket.on('error', () => undefined);
      socket.end('pong\n');
    });
    await new Promise<void>((listening) => server.listen(0, '127.0.0.1', listening));
    const { port } = server.address() as AddressInfo;
    try {
      const result = await runQualificationProcess({
        platform: 'win32',
        command: [
          process.execPath,
          '-e',
          `const s = require('node:net').connect(${String(port)}, '127.0.0.1');
           s.setTimeout(3000, () => process.exit(3));
           s.on('data', (d) => { process.stdout.write(String(d).trim()); process.exit(0); });`,
        ],
        cwd: process.cwd(),
        environment: SOCKET_BASE,
        allowedHosts: [],
        deniedRoots: [],
        timeoutSeconds: 10,
      });
      expect(result.stdout).toBe('pong');
      expect(result.status).toBe(0);
    } finally {
      await new Promise<void>((closed) => server.close(() => closed()));
    }
  });

  it('kills a trial that outlives its budget and says so', async () => {
    const result = await runQualificationProcess({
      platform: 'win32',
      command: [process.execPath, '-e', 'setInterval(() => {}, 1000)'],
      cwd: process.cwd(),
      environment: SOCKET_BASE,
      allowedHosts: [],
      deniedRoots: [],
      timeoutSeconds: 1,
    });
    expect(result.timedOut).toBe(true);
    expect(result.status).not.toBe(0);
  });

  it('gives the trial no stdin to be rescued through (T6)', async () => {
    const result = await runQualificationProcess({
      platform: 'win32',
      command: [
        process.execPath,
        '-e',
        `let n = 0; process.stdin.on('data', (d) => { n += d.length; });
         process.stdin.on('end', () => process.stdout.write('stdin-closed:' + n));`,
      ],
      cwd: process.cwd(),
      environment: SOCKET_BASE,
      allowedHosts: [],
      deniedRoots: [],
      timeoutSeconds: 10,
    });
    expect(result.stdout).toBe('stdin-closed:0');
  });
});

describe('a trial gets the bash that understands its paths (win32)', () => {
  // On a machine with WSL, `C:\Windows\System32\bash.exe` shadows Git's bash on
  // PATH. A fixture running `bash script.sh` then hands a `C:\...` path to a
  // Linux filesystem. GitHub's runners have no WSL, so CI resolved the right
  // bash and stayed green while four graders failed on the owner's machine.
  const GIT_CORE = 'C:\\Program Files\\Git\\mingw64\\libexec\\git-core';

  it('resolves Git bash from `git --exec-path`', () => {
    const directory = windowsBashDirectory({
      platform: 'win32',
      gitExecPath: () => GIT_CORE,
      exists: (candidate) => candidate === 'C:\\Program Files\\Git\\bin\\bash.exe',
    });
    expect(directory).toBe('C:\\Program Files\\Git\\bin');
  });

  it('falls back to usr\\bin, which is where some Git builds put it', () => {
    const directory = windowsBashDirectory({
      platform: 'win32',
      gitExecPath: () => GIT_CORE,
      exists: (candidate) => candidate === 'C:\\Program Files\\Git\\usr\\bin\\bash.exe',
    });
    expect(directory).toBe('C:\\Program Files\\Git\\usr\\bin');
  });

  it('accepts the forward slashes `git --exec-path` actually prints', () => {
    const directory = windowsBashDirectory({
      platform: 'win32',
      gitExecPath: () => 'C:/Program Files/Git/mingw64/libexec/git-core',
      exists: (candidate) => candidate === 'C:\\Program Files\\Git\\bin\\bash.exe',
    });
    expect(directory).toBe('C:\\Program Files\\Git\\bin');
  });

  it('reports nothing rather than guessing when git or bash is absent', () => {
    expect(
      windowsBashDirectory({ platform: 'win32', gitExecPath: () => undefined, exists: () => true }),
    ).toBeUndefined();
    expect(
      windowsBashDirectory({ platform: 'win32', gitExecPath: () => GIT_CORE, exists: () => false }),
    ).toBeUndefined();
    // Not a Windows problem, so not a Windows answer.
    expect(
      windowsBashDirectory({ platform: 'linux', gitExecPath: () => GIT_CORE }),
    ).toBeUndefined();
  });

  it('puts that directory first in the trial PATH, ahead of System32', () => {
    const source = qualificationEnvironmentSource({
      platform: 'win32',
      env: { PATH: 'C:\\Windows\\System32;C:\\other', PATHEXT: '.COM;.EXE' },
      trusted: {},
      bashDirectory: 'C:\\Program Files\\Git\\bin',
    });
    expect(source['PATH']).toBe('C:\\Program Files\\Git\\bin;C:\\Windows\\System32;C:\\other');
  });

  it('does not add the directory twice when it is already there', () => {
    const source = qualificationEnvironmentSource({
      platform: 'win32',
      env: { PATH: 'C:\\Program Files\\Git\\bin;C:\\Windows\\System32' },
      trusted: {},
      bashDirectory: 'C:\\Program Files\\Git\\bin',
    });
    expect(source['PATH']).toBe('C:\\Program Files\\Git\\bin;C:\\Windows\\System32');
  });

  it('is not resolved inside the environment builder, which must stay pure', () => {
    // Resolving it there reached for the host's own git and broke the
    // neighbouring test that asserts the builder does not inherit host state.
    // Windows CI caught it; Linux did not, because `bash.exe` is absent there.
    const source = qualificationEnvironmentSource({
      platform: 'win32',
      env: { PATH: 'C:\\tools' },
      trusted: {},
    });
    expect(source['PATH']).toBe('C:\\tools');

    // The assertion above passes on Linux either way, because `bash.exe` is
    // never found there -- which is exactly how the defect reached Windows CI.
    // So the structure is asserted too: the builder holds no resolver to call.
    const here = dirname(fileURLToPath(import.meta.url));
    const profileSource = readFileSync(join(here, '..', 'src', 'qualification-profile.ts'), 'utf8');
    // Anchored on statements inside the body: the options type's closing brace
    // also sits at column 0, so slicing to the first `\n}` covers the type
    // declaration and nothing that runs.
    const bodyStart = profileSource.indexOf('const source: Record<string, string | undefined>');
    const bodyEnd = profileSource.indexOf('return source;', bodyStart);
    expect(bodyStart).toBeGreaterThan(-1);
    expect(bodyEnd).toBeGreaterThan(bodyStart);
    const body = profileSource
      .slice(bodyStart, bodyEnd)
      .split('\n')
      .filter((line) => {
        const text = line.trimStart();
        return !text.startsWith('*') && !text.startsWith('//') && !text.startsWith('/*');
      })
      .join('\n');
    expect(body.length).toBeGreaterThan(200);
    expect(body).not.toContain('windowsBashDirectory(');
  });

  it('also reaches the evaluator checks, which run on the host and not in a trial', () => {
    // Where this actually bit. Four graders failed on the owner's machine while
    // Windows CI stayed green, and fixing the trial's PATH did not help them:
    // `runCheck` spawns the hidden-condition script on the host, and several of
    // those scripts shell out to `bash`. The checks are graded content under
    // `evaluator/`, so the environment they are handed is what gets corrected.
    const here = dirname(fileURLToPath(import.meta.url));
    const bankSource = readFileSync(join(here, '..', 'src', 'task-bank.ts'), 'utf8');
    expect(bankSource.length).toBeGreaterThan(1000);
    expect(bankSource).toContain('env: checkEnvironment()');
    expect(bankSource).toContain('windowsBashDirectory()');
  });

  it('is supplied by every trial the harness actually starts', () => {
    // A third call site that forgot it would put the WSL launcher back without
    // failing anything, so the call sites are asserted rather than trusted.
    const here = dirname(fileURLToPath(import.meta.url));
    for (const cli of ['stage3-canary-cli.ts', 'stage3-cli.ts']) {
      const source = readFileSync(join(here, '..', 'src', cli), 'utf8');
      expect(source.length).toBeGreaterThan(500);
      expect(source).toContain('bashDirectory: windowsBashDirectory()');
    }
  });

  it('leaves a Linux trial PATH alone', () => {
    const source = qualificationEnvironmentSource({
      platform: 'linux',
      env: { PATH: '/usr/bin:/bin' },
      trusted: {},
      bashDirectory: 'C:\\Program Files\\Git\\bin',
    });
    expect(source['PATH']).toBe('/usr/bin:/bin');
  });
});
