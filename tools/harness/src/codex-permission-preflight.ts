import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

export interface CodexPermissionProbeEvidence {
  readonly status: 'PASS';
  readonly method: 'model-free-sandbox';
  readonly profile: 'ieos-stage3';
}

export interface CodexPermissionProbeProcessResult {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly errorMessage?: string;
}

const PROBE_OK = 'IEOS_CODEX_PERMISSION_PROBE_OK';
const OUTSIDE_READ_EXIT = 41;

export function codexPermissionOverrides(
  platform: NodeJS.Platform = process.platform,
): string[] {
  return [
    'default_permissions="ieos-stage3"',
    'permissions.ieos-stage3.extends=":workspace"',
    'permissions.ieos-stage3.filesystem.":root"="deny"',
    'permissions.ieos-stage3.filesystem.":minimal"="read"',
    'permissions.ieos-stage3.filesystem.":tmpdir"="deny"',
    'permissions.ieos-stage3.filesystem.":slash_tmp"="deny"',
    'permissions.ieos-stage3.network.enabled=false',
    ...(platform === 'win32' ? ['windows.sandbox="elevated"'] : []),
  ];
}

export function codexPermissionConfigArgs(
  platform: NodeJS.Platform = process.platform,
): string[] {
  return codexPermissionOverrides(platform).flatMap((value) => ['-c', value]);
}

const PROBE_SCRIPT = String.raw`
const fs = require('node:fs');
const path = require('node:path');
const [outsidePath, workspace] = process.argv.slice(1);
let outsideReadable = false;
try {
  fs.readFileSync(outsidePath, 'utf8');
  outsideReadable = true;
} catch {}
if (outsideReadable) {
  process.stderr.write('outside-workspace read succeeded\\n');
  process.exit(41);
}
const marker = path.join(workspace, 'ieos-permission-probe.txt');
try {
  fs.writeFileSync(marker, 'workspace-write-ok\\n', 'utf8');
  if (fs.readFileSync(marker, 'utf8') !== 'workspace-write-ok\\n') process.exit(42);
  fs.rmSync(marker, { force: true });
} catch (error) {
  process.stderr.write('workspace read/write failed: ' + String(error) + '\\n');
  process.exit(42);
}
process.stdout.write('IEOS_CODEX_PERMISSION_PROBE_OK\\n');
`;

export function codexPermissionProbeArgs(options: {
  readonly workspaceRoot: string;
  readonly outsidePath: string;
  readonly platform?: NodeJS.Platform;
  readonly nodeExecutable?: string;
}): string[] {
  return [
    'sandbox',
    ...codexPermissionConfigArgs(options.platform),
    '-c',
    'check_for_update_on_startup=false',
    '-P',
    'ieos-stage3',
    '-C',
    options.workspaceRoot,
    '--',
    options.nodeExecutable ?? process.execPath,
    '-e',
    PROBE_SCRIPT,
    options.outsidePath,
    options.workspaceRoot,
  ];
}

export function validateCodexPermissionProbeResult(
  result: CodexPermissionProbeProcessResult,
): CodexPermissionProbeEvidence {
  if (result.status === OUTSIDE_READ_EXIT) {
    throw new Error(
      'Codex permission preflight failed: the sandbox could read the synthetic file outside the workspace',
    );
  }
  if (result.errorMessage !== undefined) {
    throw new Error(`Codex permission preflight could not start: ${result.errorMessage}`);
  }
  if (result.status !== 0) {
    throw new Error(
      `Codex permission preflight failed with status ${String(result.status)}: ${result.stderr.trim() || 'no diagnostic'}`,
    );
  }
  if (!result.stdout.includes(PROBE_OK)) {
    throw new Error(
      'Codex permission preflight did not produce its success marker; refusing to infer filesystem confinement',
    );
  }
  return { status: 'PASS', method: 'model-free-sandbox', profile: 'ieos-stage3' };
}

/**
 * Model-free runtime capability check. It exercises Codex's local sandbox only:
 * no prompt, authentication, MCP server, inference request, or campaign record.
 */
export function assertCodexPermissionBoundary(options: {
  readonly eosRoot: string;
  readonly executable?: string;
  readonly platform?: NodeJS.Platform;
}): CodexPermissionProbeEvidence {
  const parent = dirname(resolve(options.eosRoot));
  const probeRoot = mkdtempSync(join(parent, '.ieos-codex-permission-probe-'));
  const workspaceRoot = join(probeRoot, 'workspace');
  const privateRoot = join(probeRoot, 'private');
  const codexHome = join(probeRoot, 'codex-home');
  mkdirSync(workspaceRoot);
  mkdirSync(privateRoot);
  mkdirSync(codexHome);
  const outsidePath = join(privateRoot, 'must-not-read.txt');
  writeFileSync(outsidePath, 'IEOS_OUTSIDE_WORKSPACE_SECRET\\n', 'utf8');

  try {
    const run = spawnSync(
      options.executable ?? 'codex',
      codexPermissionProbeArgs({
        workspaceRoot,
        outsidePath,
        ...(options.platform === undefined ? {} : { platform: options.platform }),
      }),
      {
        cwd: workspaceRoot,
        encoding: 'utf8',
        windowsHide: true,
        env: {
          ...process.env,
          CODEX_HOME: codexHome,
          DISABLE_AUTOUPDATER: '1',
        },
      },
    );
    return validateCodexPermissionProbeResult({
      status: run.status,
      stdout: run.stdout ?? '',
      stderr: run.stderr ?? '',
      ...(run.error === undefined ? {} : { errorMessage: run.error.message }),
    });
  } finally {
    rmSync(probeRoot, { recursive: true, force: true });
  }
}
