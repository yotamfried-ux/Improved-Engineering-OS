import { pathToFileURL } from 'node:url';

/**
 * A candidate SQLite binding, behind the smallest interface the seven recorded
 * acceptance checks need.
 *
 * The point of the adapter is that the checks are written once and run against
 * every candidate identically. A check that had to be re-written per binding
 * would be comparing two check implementations, not two bindings.
 */

export interface SqliteHandle {
  exec(sql: string): void;
  /** First row, or undefined. */
  get(sql: string): Record<string, unknown> | undefined;
  all(sql: string): Record<string, unknown>[];
  close(): void;
}

export interface SqliteCandidate {
  /** Package or module identifier, exactly as it would be pinned. */
  readonly id: string;
  /** Resolved version of the binding itself, not of the engine it bundles. */
  readonly bindingVersion: string;
  /** True when the binding is a native addon requiring a build or a prebuild. */
  readonly nativeAddon: boolean;
  /** True when the runtime still marks the API experimental. */
  readonly experimental: boolean;
  /**
   * The specifier a *subprocess* must use to load this binding.
   *
   * Check 4 needs a second writer in another process, and that process cannot
   * resolve a bare specifier from a scratch directory. Carrying the resolved
   * specifier here is what stops that harness limitation from being reported as
   * an unexecuted check about the binding.
   */
  readonly subprocessSpecifier: string;
  open(path: string, options?: { readonly timeoutMs?: number }): SqliteHandle;
}

/** `node:sqlite` — built into Node 24, no dependency, no native build step. */
export async function loadNodeSqlite(): Promise<SqliteCandidate> {
  const mod = (await import('node:sqlite')) as unknown as {
    DatabaseSync: new (
      path: string,
      options?: { timeout?: number },
    ) => {
      exec(sql: string): void;
      prepare(sql: string): { get(): unknown; all(): unknown[] };
      close(): void;
    };
  };

  return {
    id: 'node:sqlite',
    bindingVersion: process.versions.node,
    subprocessSpecifier: 'node:sqlite',
    nativeAddon: false,
    // Node 24 still emits an ExperimentalWarning for node:sqlite. Recorded as a
    // fact about the candidate rather than assumed either way.
    experimental: true,
    open(path, options) {
      const db = new mod.DatabaseSync(
        path,
        options?.timeoutMs === undefined ? {} : { timeout: options.timeoutMs },
      );
      return {
        exec: (sql) => {
          db.exec(sql);
        },
        get: (sql) => db.prepare(sql).get() as Record<string, unknown> | undefined,
        all: (sql) => db.prepare(sql).all() as Record<string, unknown>[],
        close: () => {
          db.close();
        },
      };
    },
  };
}

/**
 * `better-sqlite3` — the guide's D18.5 choice. A native addon.
 *
 * Loaded dynamically and only if resolvable: adding it as a dependency would be
 * adopting the candidate before it has been qualified, which is the decision
 * this whole module exists to inform.
 */
export async function loadBetterSqlite3(moduleSpecifier?: string): Promise<SqliteCandidate | null> {
  // Specifier built at runtime: `better-sqlite3` is deliberately NOT a
  // dependency of this repository, so a static import would be a type error
  // and, worse, would amount to adopting a candidate in order to qualify it.
  //
  // A bare specifier resolves relative to THIS module, which is inside a
  // repository that does not depend on it. `moduleSpecifier` lets a caller
  // point the qualification at an installation elsewhere -- "qualify the
  // binding at this location" is exactly what this tool is for.
  const specifier = moduleSpecifier ?? 'better' + '-sqlite3';
  let mod: unknown;
  try {
    mod = (await import(specifier)) as unknown;
  } catch {
    return null;
  }

  const Database = ((mod as { default?: unknown }).default ?? mod) as new (
    path: string,
    options?: { timeout?: number },
  ) => {
    exec(sql: string): void;
    prepare(sql: string): { get(): unknown; all(): unknown[] };
    close(): void;
  };

  let bindingVersion = 'unknown';
  try {
    const manifest =
      moduleSpecifier === undefined
        ? 'better' + '-sqlite3/package.json'
        : new URL('./package.json', resolveDirectoryUrl(moduleSpecifier)).href;
    const pkg = (await import(manifest, { with: { type: 'json' } })) as {
      default?: { version?: string };
    };
    bindingVersion = pkg.default?.version ?? 'unknown';
  } catch {
    bindingVersion = 'unknown';
  }

  return {
    id: 'better-sqlite3',
    bindingVersion,
    subprocessSpecifier: specifier,
    nativeAddon: true,
    experimental: false,
    open(path, options) {
      const db = new Database(
        path,
        options?.timeoutMs === undefined ? {} : { timeout: options.timeoutMs },
      );
      return {
        exec: (sql) => {
          db.exec(sql);
        },
        get: (sql) => db.prepare(sql).get() as Record<string, unknown> | undefined,
        all: (sql) => db.prepare(sql).all() as Record<string, unknown>[],
        close: () => {
          db.close();
        },
      };
    },
  };
}

/** The package root of a module specifier given as a path or file URL. */
function resolveDirectoryUrl(specifier: string): string {
  const url = specifier.startsWith('file:') ? new URL(specifier) : pathToFileURL(specifier);
  // .../better-sqlite3/lib/index.js -> .../better-sqlite3/
  const marker = '/lib/';
  const index = url.href.lastIndexOf(marker);
  return index === -1 ? new URL('./', url).href : `${url.href.slice(0, index)}/`;
}
