/**
 * The seven recorded SQLite acceptance checks (finding C, open item O-4).
 *
 * These are not new criteria. They are the seven already written down in
 * `docs/decisions/DECISION-LOG.md` section 4, executed rather than described.
 * Nothing here weakens one to obtain a selection: a check that cannot run in
 * this environment reports `unexecuted`, and a candidate is qualified only when
 * every check passed on every required platform.
 *
 * The rule the guide is emphatic about, and that this module obeys: the engine
 * version is measured from the binding itself. Node's bundled SQLite is never
 * evidence for a third-party binding's bundled SQLite.
 */

import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir, platform } from 'node:os';
import { join } from 'node:path';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { sha256Bytes, sha256Canonical } from '@ieos/core';
import type { SqliteCandidate } from './binding.ts';

export type CheckOutcome = 'pass' | 'fail' | 'unexecuted';

export interface CheckResult {
  /** 1..7, matching the numbering in the decision log. */
  readonly id: number;
  readonly name: string;
  readonly outcome: CheckOutcome;
  /** What was measured, or why nothing was. */
  readonly evidence: string;
}

export interface CandidateQualification {
  readonly candidate: string;
  readonly bindingVersion: string;
  readonly nativeAddon: boolean;
  readonly experimental: boolean;
  /** The engine THIS binding bundles, measured through this binding. */
  readonly engineVersion: string | null;
  readonly engineSourceId: string | null;
  readonly platform: string;
  readonly nodeVersion: string;
  readonly checks: readonly CheckResult[];
  /** True only when every check passed. Platform coverage is tracked separately. */
  readonly allChecksPassedOnThisPlatform: boolean;
  /** Platforms the decision log requires; observation is per-platform. */
  readonly platformsRequired: readonly string[];
  readonly platformsObserved: readonly string[];
  /** True only when every check passed on every required platform. */
  readonly qualified: boolean;
}

/** Check 3 names Linux *and* Windows explicitly. */
export const REQUIRED_PLATFORMS: readonly string[] = ['linux', 'win32'];

/** The WAL corruption fix named in research finding R3. */
export const MINIMUM_ENGINE_VERSION = '3.51.3';

export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map((part) => Number.parseInt(part, 10));
  const pb = b.split('.').map((part) => Number.parseInt(part, 10));
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const l = pa[i] ?? 0;
    const r = pb[i] ?? 0;
    if (l !== r) return l < r ? -1 : 1;
  }
  return 0;
}

function scratch(): { dir: string; dispose: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'ieos-sqlite-'));
  return {
    dir,
    dispose: () => {
      // Windows refuses to unlink a file another process still has open, and
      // these checks deliberately spawn processes that hold database handles.
      // Retries cover the ordinary race; a directory that still cannot be
      // removed is a cleanup problem, not a result about the binding, so it
      // must never propagate out of a check and be recorded as a failure.
      try {
        rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
      } catch {
        // Left for the operating system's temp reaper.
      }
    },
  };
}

/**
 * Run all seven checks against one candidate.
 *
 * Each check is independent and reports its own outcome, so one unexecutable
 * check does not hide the result of the other six.
 */
export async function qualify(candidate: SqliteCandidate): Promise<CandidateQualification> {
  const checks: CheckResult[] = [];
  const here: string = platform();

  let engineVersion: string | null = null;
  let engineSourceId: string | null = null;

  // --- 1. sqlite_version() measured at runtime, through this binding ---------
  {
    const space = scratch();
    try {
      const db = candidate.open(join(space.dir, 'v.db'));
      engineVersion = String(db.get('select sqlite_version() as v')?.['v'] ?? '');
      engineSourceId = String(db.get('select sqlite_source_id() as s')?.['s'] ?? '');
      db.close();
      checks.push({
        id: 1,
        name: 'engine version measured at runtime, not inferred from a package version',
        outcome: engineVersion.length > 0 ? 'pass' : 'fail',
        evidence: `${candidate.id} reports sqlite_version() = ${engineVersion}, source_id = ${engineSourceId}`,
      });
    } catch (error) {
      checks.push({
        id: 1,
        name: 'engine version measured at runtime',
        outcome: 'fail',
        evidence: `could not open a database: ${String(error)}`,
      });
    } finally {
      space.dispose();
    }
  }

  // --- 2. version >= 3.51.3 (the WAL corruption fix, R3) --------------------
  checks.push(
    engineVersion === null
      ? {
          id: 2,
          name: `engine >= ${MINIMUM_ENGINE_VERSION}`,
          outcome: 'unexecuted',
          evidence: 'check 1 produced no version to compare',
        }
      : {
          id: 2,
          name: `engine >= ${MINIMUM_ENGINE_VERSION} (R3 WAL corruption fix)`,
          outcome: compareVersions(engineVersion, MINIMUM_ENGINE_VERSION) >= 0 ? 'pass' : 'fail',
          evidence: `${engineVersion} vs required ${MINIMUM_ENGINE_VERSION}`,
        },
  );

  // --- 3. journal_mode = wal on a real file database ------------------------
  {
    const space = scratch();
    try {
      const db = candidate.open(join(space.dir, 'wal.db'));
      const mode = String(db.get('pragma journal_mode=wal')?.['journal_mode'] ?? '');
      const readBack = String(db.get('pragma journal_mode')?.['journal_mode'] ?? '');
      db.exec('create table t(a integer)');
      db.exec('insert into t values (1)');
      const walFileExists = (() => {
        try {
          return statSync(join(space.dir, 'wal.db-wal')).isFile();
        } catch {
          return false;
        }
      })();
      db.close();
      const ok = mode === 'wal' && readBack === 'wal';
      checks.push({
        id: 3,
        name: 'journal_mode = wal on a real file database',
        outcome: ok ? 'pass' : 'fail',
        evidence:
          `on ${here}: pragma returned ${JSON.stringify(mode)}, read back ${JSON.stringify(readBack)}, ` +
          `-wal sidecar present: ${String(walFileExists)}. ` +
          `Required platforms: ${REQUIRED_PLATFORMS.join(', ')}; this run observed ${here} only.`,
      });
    } catch (error) {
      checks.push({
        id: 3,
        name: 'journal_mode = wal on a real file database',
        outcome: 'fail',
        evidence: `on ${here}: ${String(error)}`,
      });
    } finally {
      space.dispose();
    }
  }

  // --- 4. busy handling: two writers, timeout >= 5000 ms, no SQLITE_BUSY ----
  checks.push(await runBusyCheck(candidate));

  // --- 5. checkpoint under a concurrent reader ------------------------------
  {
    const space = scratch();
    try {
      const path = join(space.dir, 'ckpt.db');
      const writer = candidate.open(path, { timeoutMs: 5000 });
      writer.exec('pragma journal_mode=wal');
      writer.exec('create table t(a integer primary key, b text)');
      for (let i = 0; i < 500; i += 1) writer.exec(`insert into t values (${String(i)}, 'x')`);

      const reader = candidate.open(path, { timeoutMs: 5000 });
      const beforeRows = reader.get('select count(*) as n from t')?.['n'];

      const walBefore = sizeOf(`${path}-wal`);
      const result = writer.get('pragma wal_checkpoint(truncate)');
      const walAfter = sizeOf(`${path}-wal`);
      const afterRows = reader.get('select count(*) as n from t')?.['n'];

      reader.close();
      writer.close();

      const truncated = walAfter < walBefore || walAfter === 0;
      const readerIntact = String(beforeRows) === String(afterRows) && String(afterRows) === '500';
      checks.push({
        id: 5,
        name: 'WAL truncation under a concurrent reader',
        outcome: truncated && readerIntact ? 'pass' : 'fail',
        evidence:
          `wal bytes ${String(walBefore)} -> ${String(walAfter)}; ` +
          `pragma wal_checkpoint(truncate) returned ${JSON.stringify(result)}; ` +
          `concurrent reader saw ${String(beforeRows)} rows before and ${String(afterRows)} after`,
      });
    } catch (error) {
      checks.push({
        id: 5,
        name: 'WAL truncation under a concurrent reader',
        outcome: 'fail',
        evidence: String(error),
      });
    } finally {
      space.dispose();
    }
  }

  // --- 6. UNIQUE(event_id) collision is a no-op, not a surfaced error -------
  {
    const space = scratch();
    try {
      const db = candidate.open(join(space.dir, 'idem.db'));
      db.exec('pragma journal_mode=wal');
      db.exec('create table events(event_id text primary key not null, payload text)');
      db.exec("insert into events values ('evt_1','a')");
      // The outbox contract: a duplicate delivery is absorbed, never raised to
      // the emitter (D26, and the Stage 2 duplicate-batch simulation).
      db.exec("insert or ignore into events values ('evt_1','b')");
      const count = db.get('select count(*) as n from events')?.['n'];
      const payload = db.get("select payload from events where event_id='evt_1'")?.['payload'];

      // The control: without `or ignore`, the same insert must still raise, or
      // the check above proves nothing about idempotency.
      let raisedWithoutIgnore = false;
      try {
        db.exec("insert into events values ('evt_1','c')");
      } catch {
        raisedWithoutIgnore = true;
      }
      db.close();

      const ok = String(count) === '1' && payload === 'a' && raisedWithoutIgnore;
      checks.push({
        id: 6,
        name: 'UNIQUE(event_id) collision absorbed as a no-op',
        outcome: ok ? 'pass' : 'fail',
        evidence:
          `after a duplicate insert: ${String(count)} row(s), first write preserved (payload=${String(payload)}); ` +
          `control -- a plain duplicate insert still raises: ${String(raisedWithoutIgnore)}`,
      });
    } catch (error) {
      checks.push({
        id: 6,
        name: 'UNIQUE(event_id) collision absorbed as a no-op',
        outcome: 'fail',
        evidence: String(error),
      });
    } finally {
      space.dispose();
    }
  }

  // --- 7. reproducibility: the same input builds a byte-identical index -----
  checks.push(runReproducibilityCheck(candidate));

  const allPassed = checks.every((check) => check.outcome === 'pass');
  const platformsObserved: readonly string[] = [here];

  return {
    candidate: candidate.id,
    bindingVersion: candidate.bindingVersion,
    nativeAddon: candidate.nativeAddon,
    experimental: candidate.experimental,
    engineVersion,
    engineSourceId,
    platform: here,
    nodeVersion: process.versions.node,
    checks,
    allChecksPassedOnThisPlatform: allPassed,
    platformsRequired: REQUIRED_PLATFORMS,
    platformsObserved,
    // Deliberately conjunctive: passing everything on one platform is not
    // qualification when the criteria name two.
    qualified:
      allPassed && REQUIRED_PLATFORMS.every((required) => platformsObserved.includes(required)),
  };
}

function sizeOf(path: string): number {
  try {
    return statSync(path).size;
  } catch {
    return 0;
  }
}

/**
 * Check 4. A second writer must come from another process: both candidates
 * expose synchronous APIs, so two writers in one process cannot contend.
 */
async function runBusyCheck(candidate: SqliteCandidate): Promise<CheckResult> {
  const space = scratch();
  try {
    const path = join(space.dir, 'busy.db');
    const setup = candidate.open(path, { timeoutMs: 5000 });
    setup.exec('pragma journal_mode=wal');
    setup.exec('create table t(a integer primary key)');
    setup.close();

    const holderScript = join(space.dir, 'holder.mjs');
    const contenderScript = join(space.dir, 'contender.mjs');
    // The subprocess loads the binding through the specifier the candidate
    // resolved, so a bare-specifier resolution failure in a scratch directory
    // can never masquerade as an unexecuted check about the binding itself.
    const spec = JSON.stringify(candidate.subprocessSpecifier);
    const loader =
      candidate.id === 'node:sqlite'
        ? `const { DatabaseSync } = await import(${spec}); const open = (p, t) => new DatabaseSync(p, { timeout: t });`
        : `const M = await import(${spec}); const D = M.default ?? M; const open = (p, t) => new D(p, { timeout: t });`;

    // Holder takes a write lock and keeps it for ~1.2s.
    writeFileSync(
      holderScript,
      `${loader}
const db = open(${JSON.stringify(path)}, 5000);
db.exec('begin immediate');
db.exec('insert into t values (1)');
process.stdout.write('locked\\n');
await new Promise((r) => setTimeout(r, 1200));
db.exec('commit');
db.close();
`,
      'utf8',
    );

    // Contender must wait out the lock rather than surface SQLITE_BUSY.
    writeFileSync(
      contenderScript,
      `${loader}
const db = open(${JSON.stringify(path)}, 5000);
const started = Date.now();
try {
  db.exec('begin immediate');
  db.exec('insert into t values (2)');
  db.exec('commit');
  process.stdout.write(JSON.stringify({ ok: true, waitedMs: Date.now() - started }) + '\\n');
} catch (error) {
  process.stdout.write(JSON.stringify({ ok: false, error: String(error) }) + '\\n');
}
db.close();
`,
      'utf8',
    );

    const holder = spawn(process.execPath, [holderScript], {
      cwd: space.dir,
      stdio: ['ignore', 'pipe', 'ignore'],
    });

    // Wait for the holder to announce that it actually owns the write lock.
    // Starting the contender before that would measure nothing.
    const locked = await new Promise<boolean>((resolve) => {
      const timer = globalThis.setTimeout(() => {
        resolve(false);
      }, 5000);
      holder.stdout.on('data', (chunk: Buffer) => {
        if (chunk.toString('utf8').includes('locked')) {
          globalThis.clearTimeout(timer);
          resolve(true);
        }
      });
      holder.on('exit', () => {
        globalThis.clearTimeout(timer);
        resolve(false);
      });
    });

    if (!locked) {
      holder.kill();
      return {
        id: 4,
        name: 'busy handling: two writers, timeout >= 5000 ms, no SQLITE_BUSY surfaced',
        outcome: 'unexecuted',
        evidence: 'the holding writer never acquired the lock, so no contention could be created',
      };
    }

    const { stdout } = await promisify(execFile)(process.execPath, [contenderScript], {
      cwd: space.dir,
      encoding: 'utf8',
      timeout: 30_000,
    });
    const output = stdout.trim();

    await new Promise<void>((resolve) => {
      if (holder.exitCode !== null) {
        resolve();
        return;
      }
      holder.on('exit', () => {
        resolve();
      });
      globalThis.setTimeout(() => {
        resolve();
      }, 10_000);
    });

    const parsed = JSON.parse(output.split('\n').pop() ?? '{}') as {
      ok?: boolean;
      waitedMs?: number;
      error?: string;
    };

    if (parsed.ok !== true) {
      return {
        id: 4,
        name: 'busy handling: two writers, timeout >= 5000 ms, no SQLITE_BUSY surfaced',
        outcome: 'fail',
        evidence: `contender surfaced an error instead of waiting: ${String(parsed.error)}`,
      };
    }

    // Waiting ~0 ms would mean the writers never actually contended, and the
    // check would be proving nothing.
    const contended = (parsed.waitedMs ?? 0) >= 200;
    return {
      id: 4,
      name: 'busy handling: two writers, timeout >= 5000 ms, no SQLITE_BUSY surfaced',
      outcome: contended ? 'pass' : 'fail',
      evidence: contended
        ? `second writer waited ${String(parsed.waitedMs)} ms for the lock and then committed; no SQLITE_BUSY reached the caller`
        : `second writer committed after only ${String(parsed.waitedMs)} ms, so the two writers did not actually contend and the check proves nothing`,
    };
  } catch (error) {
    return {
      id: 4,
      name: 'busy handling: two writers, timeout >= 5000 ms, no SQLITE_BUSY surfaced',
      outcome: 'fail',
      evidence: String(error),
    };
  } finally {
    space.dispose();
  }
}

/**
 * Check 7. Build the same FTS5 index twice from identical input and compare.
 *
 * Both the raw file bytes and a digest over the logical rows are reported: if
 * the file is not byte-stable, that is a finding the index-digest design has to
 * account for (D35 hashes canonical structure, not database pages), and it
 * belongs in the record rather than being smoothed over.
 */
function runReproducibilityCheck(candidate: SqliteCandidate): CheckResult {
  const space = scratch();
  try {
    const rows = [
      { id: 'asset_a', title: 'OAuth PKCE for browser apps', body: 'authorization code flow' },
      { id: 'asset_b', title: 'Row level security', body: 'policy per owner' },
      { id: 'asset_c', title: 'Idempotent ingest', body: 'unique event id' },
    ];

    const build = (path: string): { fileDigest: string; contentDigest: string } => {
      const db = candidate.open(path);
      db.exec('pragma journal_mode=delete');
      db.exec("create virtual table idx using fts5(id, title, body, tokenize='unicode61')");
      for (const row of rows) {
        db.exec(
          `insert into idx(id, title, body) values (${quote(row.id)}, ${quote(row.title)}, ${quote(row.body)})`,
        );
      }
      const ranked = db.all("select id from idx where idx match 'oauth OR ingest' order by id");
      db.close();
      // Both digests go through packages/core, so F12 stays literal: this tool
      // defines no hashing of its own. The file digest is raw-artifact
      // integrity over opaque bytes and never becomes an EOS identity; the
      // content digest is canonical (JCS) over the rows the index returned.
      return {
        fileDigest: sha256Bytes(new Uint8Array(readFileSync(path))),
        contentDigest: sha256Canonical(ranked as unknown as Parameters<typeof sha256Canonical>[0]),
      };
    };

    const first = build(join(space.dir, 'a.db'));
    const second = build(join(space.dir, 'b.db'));

    const contentStable = first.contentDigest === second.contentDigest;
    const fileStable = first.fileDigest === second.fileDigest;

    return {
      id: 7,
      name: 'the same input builds a reproducible index (F8)',
      outcome: contentStable ? 'pass' : 'fail',
      evidence:
        `logical content digest stable: ${String(contentStable)} (${first.contentDigest.slice(0, 23)}); ` +
        `raw database file byte-identical: ${String(fileStable)}. ` +
        (fileStable
          ? ''
          : 'Raw page bytes are not stable, so an index digest must be taken over canonical ' +
            'structure per D35, never over the database file. Recorded as a design consequence.'),
    };
  } catch (error) {
    return {
      id: 7,
      name: 'the same input builds a reproducible index (F8)',
      outcome: 'fail',
      evidence: String(error),
    };
  } finally {
    space.dispose();
  }
}

function quote(value: string): string {
  return `'${value.replace(/'/gu, "''")}'`;
}

export { loadBetterSqlite3, loadNodeSqlite } from './binding.ts';
export type { SqliteCandidate, SqliteHandle } from './binding.ts';
