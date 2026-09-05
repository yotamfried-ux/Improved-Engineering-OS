/**
 * `ieos` -- the command entry point.
 *
 * The composition root for the CLI: this is where the adapter is allowed to
 * touch the filesystem, the environment and the clock, and where the pure
 * pieces (`doctor.ts`, `init.ts`, `@ieos/core`) are wired to them. Keeping the
 * decisions pure and the I/O here is what makes every branch above testable
 * without arranging the world into that state.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import {
  CONTRACT_REGISTRY,
  classifySessionKind,
  mintId,
  readSessionMarkers,
  type Clock,
  type RandomSource,
  type SessionKind,
} from '@ieos/core';
import { IndexUnavailableError, SqliteKnowledgeIndex } from '@ieos/store-sqlite';
import { buildRuntimeReport, formatRuntimeReport, type RuntimeObservations } from './doctor.ts';
import { COMMANDS, describeCommand, isCommand, isImplemented } from './commands.ts';
import {
  MCP_SERVER_ENTRY,
  mergeCodexToml,
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
  lines.push('  --project <path>   target project root, for `init`');
  return `${lines.join('\n')}\n`;
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

  return {
    indexDigest,
    indexProblem,
    indexPresentButUnusable: indexPresent && indexDigest === null,
    contracts: CONTRACT_REGISTRY.map((entry) => ({ name: entry.name, version: '1' })),
    sessionKind,
    ingest,
    sqliteAvailable,
  };
}

async function runDoctor(): Promise<number> {
  const report = buildRuntimeReport(await observeRuntime());
  process.stdout.write(formatRuntimeReport(report));
  return report.ok ? 0 : 1;
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

  const files = planFootprint({
    sourceCheckout: repoRoot,
    indexDigest,
    installationId: mintId('inst', systemClock, systemRandom),
    projectId: mintId('proj', systemClock, systemRandom),
    mcpCommand: process.execPath,
    // The project root travels in the arguments: the MCP server binds every
    // context snapshot to the project's HEAD commit, and it must not infer that
    // from whatever directory the agent happened to launch it in.
    mcpArgs: [join(repoRoot, MCP_SERVER_ENTRY), '--eos-root', repoRoot, '--project', projectRoot],
  });

  for (const file of files) {
    const target = join(projectRoot, file.path);
    mkdirSync(dirname(target), { recursive: true });
    const existing = existsSync(target) ? readFileSync(target, 'utf8') : '';

    let content: string;
    switch (file.mode) {
      case 'merge-markers':
        content = spliceMarkedBlock(existing, file.content);
        break;
      case 'merge-json':
        content = mergeMcpJson(existing, file.content);
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
  return 0;
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
    default:
      process.stderr.write(
        `\`ieos ${command}\` is listed as implemented but has no handler. ` +
          'That is a defect in this build, not a missing feature.\n',
      );
      return 70;
  }
})();

process.exit(exitCode);
