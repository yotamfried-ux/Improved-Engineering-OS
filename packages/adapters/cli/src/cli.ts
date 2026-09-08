/**
 * `ieos` -- the command entry point.
 *
 * The composition root for the CLI: this is where the adapter is allowed to
 * touch the filesystem, the environment and the clock, and where the pure
 * pieces (`doctor.ts`, `init.ts`, `@ieos/core`) are wired to them. Keeping the
 * decisions pure and the I/O here is what makes every branch above testable
 * without arranging the world into that state.
 */

import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import {
  CONTRACT_REGISTRY,
  classifySessionKind,
  mintId,
  readSessionMarkers,
  sha256Text,
  type Clock,
  type RandomSource,
  type SessionKind,
} from '@ieos/core';
import {
  IndexUnavailableError,
  openOutbox,
  SqliteKnowledgeIndex,
  SqliteOutbox,
  SqliteRunStateStore,
} from '@ieos/store-sqlite';
import { DEFAULT_ORIGIN_CLASS, runSchema, type RunRecord } from '@ieos/core';
import { deriveAttribution, investigate, renderInvestigation } from '@ieos/evidence-derivation';
import {
  buildRuntimeReport,
  formatRuntimeReport,
  observeHooks,
  type RuntimeObservations,
} from './doctor.ts';
import { REGISTERED_EVENTS } from '@ieos/adapter-claude-code';
import { COMMANDS, describeCommand, isCommand, isImplemented } from './commands.ts';
import {
  AuthError,
  CREDENTIALS_MODE,
  credentialsFor,
  enrolmentStatement,
  mintToken,
  protectionOf,
  revocationStatement,
  rotationStatement,
  tokenHashLiteral,
  type Credentials,
} from './auth.ts';
import {
  BEGIN_MARKER,
  END_MARKER,
  HOOK_ENTRY,
  MCP_SERVER_ENTRY,
  mergeCodexToml,
  mergeClaudeSettings,
  mergeMcpJson,
  planFootprint,
  spliceMarkedBlock,
} from './init.ts';

/**
 * The composition root supplies the real clock and randomness.
 *
 * `packages/core` mints ids through injected ports precisely so identity is
 * deterministic under test; this is the one place that hands it the real thing.
 */
const systemClock: Clock = {
  nowMs: () => Date.now(),
  nowIso: () => new Date().toISOString(),
};
const systemRandom: RandomSource = { bytes: (length) => new Uint8Array(randomBytes(length)) };

const args = process.argv.slice(2);
const command = args[0] ?? '';
const flag = (name: string): string | undefined => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};

const repoRoot = resolve(flag('--eos-root') ?? process.cwd());
const indexPath = flag('--index') ?? join(repoRoot, 'knowledge.sqlite');

function usage(): string {
  const lines = ['usage: ieos <command> [options]', ''];
  for (const name of COMMANDS) lines.push(`  ${name.padEnd(9)} ${describeCommand(name)}`);
  lines.push('', 'options:');
  lines.push('  --eos-root <path>  the EOS source checkout (default: cwd)');
  lines.push('  --index <path>     the compiled knowledge index');
  lines.push('  --project <path>   target project root, for `init` and project checks in `doctor`');
  return `${lines.join('\n')}\n`;
}

function markedBlock(text: string): string | null {
  const begin = text.indexOf(BEGIN_MARKER);
  const end = text.indexOf(END_MARKER);
  if (begin === -1 || end === -1 || end < begin) return null;
  return text.slice(begin, end + END_MARKER.length);
}

function observeBootstrap(projectRoot: string): RuntimeObservations['bootstrap'] {
  const installationPath = join(projectRoot, '.ieos', 'installation.json');
  if (!existsSync(installationPath)) return { state: 'uninstalled' };

  let expectedHash: string;
  try {
    const installation = JSON.parse(readFileSync(installationPath, 'utf8')) as {
      bootstrap_template_hash?: unknown;
    };
    if (
      typeof installation.bootstrap_template_hash !== 'string' ||
      !/^sha256:[0-9a-f]{64}$/u.test(installation.bootstrap_template_hash)
    ) {
      return {
        state: 'drifted',
        detail: '.ieos/installation.json has no valid bootstrap_template_hash',
      };
    }
    expectedHash = installation.bootstrap_template_hash;
  } catch {
    return { state: 'drifted', detail: '.ieos/installation.json is not valid JSON' };
  }

  const problems: string[] = [];
  for (const name of ['AGENTS.md', 'CLAUDE.md'] as const) {
    const path = join(projectRoot, name);
    if (!existsSync(path)) {
      problems.push(`${name} is missing`);
      continue;
    }
    const block = markedBlock(readFileSync(path, 'utf8'));
    if (block === null) {
      problems.push(`${name} is missing a complete IEOS marker block`);
      continue;
    }
    const actualHash = sha256Text(block);
    if (actualHash !== expectedHash) {
      problems.push(`${name} IEOS block hash ${actualHash} != ${expectedHash}`);
    }
  }

  return problems.length === 0
    ? { state: 'healthy', detail: `AGENTS.md and CLAUDE.md match ${expectedHash}` }
    : { state: 'drifted', detail: problems.join('; ') };
}

/** Observe the runtime. Every failure is caught and reported, never thrown. */
async function observeRuntime(): Promise<RuntimeObservations> {
  let sqliteAvailable = true;
  try {
    await import('node:sqlite');
  } catch {
    sqliteAvailable = false;
  }

  let indexDigest: string | null = null;
  let indexProblem: string | null = null;
  const indexPresent = existsSync(indexPath);
  if (indexPresent && sqliteAvailable) {
    try {
      const index = await SqliteKnowledgeIndex.open(indexPath);
      indexDigest = await index.indexDigest();
      index.close();
    } catch (error) {
      indexProblem =
        error instanceof IndexUnavailableError
          ? error.message
          : `could not read the index: ${String(error)}`;
    }
  }

  const sessionKind: SessionKind = classifySessionKind(
    readSessionMarkers(process.env, process.env['IEOS_SESSION_KIND'] as SessionKind | undefined),
  );

  // D22 puts the installation credential and the ingest endpoint at Stage 2.
  // Until one is configured there is nothing to reach, and saying so is more
  // useful than probing an address nobody set.
  const endpoint = process.env['IEOS_INGEST_URL'];
  const ingest: RuntimeObservations['ingest'] =
    endpoint === undefined || endpoint === ''
      ? { state: 'unconfigured' }
      : { state: 'unreachable', endpoint, reason: 'ingest probing arrives at Stage 2 (D22)' };

  const projectRoot = resolve(flag('--project') ?? process.cwd());

  return {
    indexDigest,
    indexProblem,
    indexPresentButUnusable: indexPresent && indexDigest === null,
    contracts: CONTRACT_REGISTRY.map((entry) => ({ name: entry.name, version: '1' })),
    sessionKind,
    ingest,
    sqliteAvailable,
    bootstrap: observeBootstrap(projectRoot),
    hooks: observeHooks(readIfPresent(join(projectRoot, '.claude', 'settings.json')), HOOK_ENTRY, [
      ...REGISTERED_EVENTS,
    ]),
    lastRuns: await observeLastRuns(join(projectRoot, '.ieos', 'outbox.sqlite')),
  };
}

function readIfPresent(path: string): string | null {
  return existsSync(path) ? readFileSync(path, 'utf8') : null;
}

/**
 * The runs this machine recorded, for `doctor`'s last-run row (D23).
 *
 * An unreadable store yields no runs rather than an error: doctor exists to
 * report the state of things, and failing to open one file must not stop it
 * reporting the other nine.
 */
async function observeLastRuns(outboxPath: string): Promise<RuntimeObservations['lastRuns']> {
  if (!existsSync(outboxPath)) return [];
  try {
    const db = await openOutbox(outboxPath);
    try {
      return new SqliteRunStateStore(db).recent(5).map((run) => ({
        runId: run.runId,
        telemetryState: run.telemetryState,
        startedAt: run.startedAt,
      }));
    } finally {
      db.close();
    }
  } catch {
    return [];
  }
}

async function runDoctor(): Promise<number> {
  const report = buildRuntimeReport(await observeRuntime());
  process.stdout.write(formatRuntimeReport(report));
  return report.ok ? 0 : 1;
}

function existingIdentity(
  projectRoot: string,
): { readonly installationId: string; readonly projectId: string } | null {
  const installationPath = join(projectRoot, '.ieos', 'installation.json');
  if (!existsSync(installationPath)) return null;

  let installation: { installation_id?: unknown; project_id?: unknown };
  try {
    installation = JSON.parse(readFileSync(installationPath, 'utf8')) as {
      installation_id?: unknown;
      project_id?: unknown;
    };
  } catch {
    throw new Error(
      '.ieos/installation.json exists but is not valid JSON. Refusing to mint a new identity over an existing installation.',
    );
  }

  if (
    typeof installation.installation_id !== 'string' ||
    !installation.installation_id.startsWith('inst_') ||
    typeof installation.project_id !== 'string' ||
    !installation.project_id.startsWith('proj_')
  ) {
    throw new Error(
      '.ieos/installation.json exists but does not contain valid installation_id/project_id values. Refusing to replace an existing identity implicitly.',
    );
  }

  return {
    installationId: installation.installation_id,
    projectId: installation.project_id,
  };
}

async function runInit(): Promise<number> {
  const projectRoot = resolve(flag('--project') ?? process.cwd());
  if (projectRoot === repoRoot) {
    process.stderr.write(
      'refusing to initialise the EOS checkout as its own target project.\n' +
        'Pass --project <path> pointing at the repository you want to register.\n',
    );
    return 2;
  }

  let indexDigest: string | null = null;
  try {
    const index = await SqliteKnowledgeIndex.open(indexPath);
    indexDigest = await index.indexDigest();
    index.close();
  } catch {
    // An uninitialised index is expected at Stage 1; the footprint records null
    // rather than a digest it did not observe.
  }

  let identity: { readonly installationId: string; readonly projectId: string };
  try {
    identity = existingIdentity(projectRoot) ?? {
      installationId: mintId('inst', systemClock, systemRandom),
      projectId: mintId('proj', systemClock, systemRandom),
    };
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return 2;
  }

  const files = planFootprint({
    sourceCheckout: repoRoot,
    indexDigest,
    installationId: identity.installationId,
    projectId: identity.projectId,
    mcpCommand: process.execPath,
    // The project root travels in the arguments: the MCP server binds every
    // context snapshot to the project's HEAD commit, and it must not infer that
    // from whatever directory the agent happened to launch it in.
    mcpArgs: [join(repoRoot, MCP_SERVER_ENTRY), '--eos-root', repoRoot, '--project', projectRoot],
    hookArgs: [join(repoRoot, HOOK_ENTRY), '--eos-root', repoRoot, '--project', projectRoot],
    withHooks: args.includes('--with-hooks'),
  });

  for (const file of files) {
    const target = join(projectRoot, file.path);
    mkdirSync(dirname(target), { recursive: true });
    const exists = existsSync(target);
    const existing = exists ? readFileSync(target, 'utf8') : '';

    // The profile belongs to the target project after first creation. It contains
    // user-owned spec fields, so rerunning init must never reset those fields to
    // the bootstrap defaults. If it is missing, recreate it with the preserved
    // project identity.
    if (file.path === '.ieos/profile.yaml' && exists) {
      process.stdout.write('  kept   .ieos/profile.yaml\n');
      continue;
    }

    let content: string;
    switch (file.mode) {
      case 'merge-markers':
        content = spliceMarkedBlock(existing, file.content);
        break;
      case 'merge-json':
        content = mergeMcpJson(existing, file.content);
        break;
      case 'merge-hooks':
        content = mergeClaudeSettings(existing, file.content);
        break;
      case 'merge-toml':
        content = mergeCodexToml(existing, file.content);
        break;
      default:
        content = file.content;
    }
    writeFileSync(target, content, 'utf8');
    process.stdout.write(`  ${file.mode === 'replace' ? 'wrote  ' : 'merged '} ${file.path}\n`);
  }
  process.stdout.write(`\nfootprint written to ${projectRoot}\n`);
  if (!args.includes('--with-hooks')) {
    // Named rather than merely absent. Telemetry that nobody knew was optional
    // produces empty runs and a puzzled owner.
    process.stdout.write(
      '\nTelemetry hooks were NOT installed. `ieos init --with-hooks` registers the four\n' +
        'hooks the primary agent calls (SessionStart, PostToolUse, Stop, SessionEnd) in\n' +
        '.claude/settings.json. Without them nothing observes a run, and `ieos investigate`\n' +
        'will have no timeline to show.\n',
    );
  }
  return 0;
}

/**
 * `ieos investigate <run_id>` (guide Stage 2, T-03).
 *
 * Reads the LOCAL outbox and derives attribution from it. Two limits come with
 * that, and both are printed rather than left for the reader to discover:
 *
 *   Events already acknowledged by the Evidence Plane are gone from the outbox,
 *   because the outbox deletes only on durable acknowledgement. So this shows
 *   what is still local. Stage 7's server-side investigation reads the plane and
 *   sees the whole run.
 *
 *   `origin_class` is not something this side knows. D36 puts classification in
 *   a record a service principal writes, and the client is not one, so the run
 *   is presented as the default (`operational`) with the reason stated. A local
 *   guess at a stronger class is exactly the claim D36 exists to make
 *   impossible.
 */
async function runInvestigate(): Promise<number> {
  const runId = args[1];
  if (runId === undefined || runId.startsWith('-')) {
    process.stderr.write('usage: ieos investigate <run_id> [--outbox <path>]\n');
    return 2;
  }
  const outboxPath = flag('--outbox') ?? join(repoRoot, '.ieos', 'outbox.sqlite');
  if (!existsSync(outboxPath)) {
    // Not an empty success: "no outbox" and "a run with no events" are
    // different answers, and only one of them means the run happened.
    process.stderr.write(
      `no telemetry outbox at ${outboxPath}. Nothing has been recorded on this machine yet, ` +
        'so there is no run to investigate.\n',
    );
    return 4;
  }

  const db = await openOutbox(outboxPath);
  try {
    const outbox = new SqliteOutbox(db);
    const all = await outbox.pending(Number.MAX_SAFE_INTEGER);
    const events = all.filter((event) => event.run_id === runId);
    const localState = new SqliteRunStateStore(db).get(runId);

    if (events.length === 0 && localState === undefined) {
      process.stderr.write(
        `run ${runId} is not in the local outbox. It may have been flushed to the ` +
          'Evidence Plane already, or it may never have run here.\n',
      );
      return 4;
    }

    const run: RunRecord = runSchema.parse({
      schema_version: '1',
      stability: 'development',
      introduced_in: '0.1.0',
      deprecated_in: null,
      replacement: null,
      migration_path: null,
      run_id: runId,
      owner_id: 'local',
      registered_by: null,
      origin_class: DEFAULT_ORIGIN_CLASS,
      holdout_state: null,
      eval_set_version: null,
      simulation_id: null,
      registered_at: null,
      first_event_at: localState?.startedAt ?? events[0]?.time.occurred_at ?? null,
      telemetry_state: localState?.telemetryState ?? null,
      qualification_eligible: localState?.qualificationEligible ?? null,
    });

    const rows = deriveAttribution({ events, run, derivedAt: systemClock.nowIso() });
    process.stdout.write(renderInvestigation(investigate({ run, events, rows })));
    process.stdout.write(
      '\nread from the local outbox only. Events already acknowledged by the Evidence Plane ' +
        'are no longer here, and origin_class is shown as the D36 default because a client ' +
        'cannot classify its own run.\n',
    );
    return 0;
  } finally {
    db.close();
  }
}

/**
 * `ieos auth enroll|rotate|revoke` (D22.1).
 *
 * The token is minted here, written to a 0600 file, and shown once. What is
 * NOT here is any call to the Evidence Plane: writing a `principals` row is an
 * owner-authenticated action, and giving this command a credential able to
 * perform it would put a privileged key on every machine that runs `ieos` --
 * the exact thing D22 is built to avoid. So it prints the statement for the
 * owner to apply, carrying the token HASH and never the token.
 */
async function runAuth(): Promise<number> {
  const subcommand = args[1] ?? '';
  const credentialsPath = flag('--credentials') ?? join(repoRoot, '.ieos', 'credentials.json');
  const installationId =
    flag('--installation') ??
    readInstallationId(credentialsPath) ??
    mintId('inst', systemClock, systemRandom);

  try {
    switch (subcommand) {
      case 'enroll':
      case 'rotate': {
        const ownerId = flag('--owner');
        if (subcommand === 'enroll' && ownerId === undefined) {
          // The owner id is a fact about the project, not something a tool may
          // pick. Refusing is better than emitting a statement with a
          // placeholder someone would paste unedited.
          process.stderr.write(
            'usage: ieos auth enroll --owner <supabase auth user uuid> [--label <name>]\n',
          );
          return 2;
        }
        if (existsSync(credentialsPath) && subcommand === 'enroll') {
          process.stderr.write(
            `${credentialsPath} already exists. Use \`ieos auth rotate\` to replace the token ` +
              'without minting a second installation identity.\n',
          );
          return 4;
        }

        const token = mintToken(systemRandom);
        const credentials = credentialsFor({
          installationId,
          token,
          nowIso: systemClock.nowIso(),
        });
        mkdirSync(dirname(credentialsPath), { recursive: true });
        writeFileSync(credentialsPath, `${JSON.stringify(credentials, null, 2)}\n`, {
          encoding: 'utf8',
          mode: CREDENTIALS_MODE,
        });
        // Written with the mode AND chmodded: `writeFileSync`'s mode applies
        // only when it creates the file, so a rotation over an existing
        // world-readable file would keep the old permissions.
        chmodSync(credentialsPath, CREDENTIALS_MODE);

        const statement =
          subcommand === 'enroll'
            ? enrolmentStatement({
                installationId,
                ownerId: ownerId as string,
                tokenHash: tokenHashLiteral(token),
                expiresAt: credentials.expires_at,
                label: flag('--label') ?? null,
              })
            : rotationStatement({
                installationId,
                tokenHash: tokenHashLiteral(token),
                expiresAt: credentials.expires_at,
              });

        // Checked, not assumed. On Windows chmod only toggles read-only, so a
        // file written 0600 reports 0666 and the mode protects nothing; saying
        // "mode 0600" there would tell the owner they have a guarantee they do
        // not.
        const protection = protectionOf(statSync(credentialsPath).mode, process.platform);
        process.stdout.write(`installation: ${installationId}\n`);
        process.stdout.write(
          `credential:   ${credentialsPath}` +
            (protection.enforced ? ' (mode 0600)' : ' (permissions NOT enforced)') +
            '\n',
        );
        process.stdout.write(`expires:      ${credentials.expires_at}\n\n`);
        process.stdout.write('Apply this against your Evidence Plane, as the owner:\n\n');
        process.stdout.write(`${statement}\n\n`);
        // The token itself is deliberately absent from this output. It is in
        // the credential file, shown once, and printing it here would put it in
        // a terminal scrollback and a CI log.
        process.stdout.write(
          'The statement carries the token HASH. The token is in the credential file above ' +
            'and is not printed; copy it from there for a remote environment secret.\n',
        );
        if (!protection.enforced) {
          process.stderr.write(`\nWARNING: ${protection.reason ?? ''}\n`);
        }
        return 0;
      }

      case 'revoke': {
        process.stdout.write('Apply this against your Evidence Plane, as the owner:\n\n');
        process.stdout.write(`${revocationStatement(installationId)}\n\n`);
        if (existsSync(credentialsPath)) {
          rmSync(credentialsPath, { force: true });
          process.stdout.write(`removed ${credentialsPath}\n`);
        }
        // Revocation is not complete until the statement runs. Saying so is the
        // difference between a command that revoked and one that prepared a
        // revocation, and an owner who confuses them believes a token is dead.
        process.stdout.write(
          'The local credential is gone. The installation is NOT revoked until the statement ' +
            'above has run against the Evidence Plane.\n',
        );
        return 0;
      }

      default:
        process.stderr.write('usage: ieos auth <enroll|rotate|revoke> [options]\n');
        return 2;
    }
  } catch (error) {
    if (error instanceof AuthError) {
      process.stderr.write(`${error.message}\n`);
      return 4;
    }
    throw error;
  }
}

/** The installation this machine already has, if any. */
function readInstallationId(credentialsPath: string): string | undefined {
  if (!existsSync(credentialsPath)) return undefined;
  try {
    const parsed = JSON.parse(readFileSync(credentialsPath, 'utf8')) as Partial<Credentials>;
    return typeof parsed.installation_id === 'string' ? parsed.installation_id : undefined;
  } catch {
    return undefined;
  }
}

function notYetImplemented(name: string): number {
  // Deliberately an error, not an empty success. A command that exits 0 having
  // done nothing is indistinguishable from one that worked, and an agent
  // calling it would treat the silence as an answer.
  process.stderr.write(
    `\`ieos ${name}\` is not implemented yet.\n` +
      `${describeCommand(name as never)}\n` +
      'The Agent Contract lands over MCP first; the CLI half follows in this stage.\n',
  );
  return 3;
}

const exitCode = await (async (): Promise<number> => {
  if (command === '' || command === '--help' || command === '-h') {
    process.stdout.write(usage());
    return command === '' ? 2 : 0;
  }
  if (!isCommand(command)) {
    process.stderr.write(`unknown command ${JSON.stringify(command)}\n\n${usage()}`);
    return 2;
  }
  // The declaration is checked against the dispatch rather than trusted:
  // `IMPLEMENTED_COMMANDS` is what `ieos init` writes into a user's repository,
  // so a command listed there but not wired here would put a false claim in
  // someone else's AGENTS.md.
  if (!isImplemented(command)) return notYetImplemented(command);
  switch (command) {
    case 'doctor':
      return await runDoctor();
    case 'init':
      return await runInit();
    case 'investigate':
      return await runInvestigate();
    case 'auth':
      return await runAuth();
    default:
      process.stderr.write(
        `\`ieos ${command}\` is listed as implemented but has no handler. ` +
          'That is a defect in this build, not a missing feature.\n',
      );
      return 70;
  }
})();

process.exit(exitCode);
