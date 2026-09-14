import { defineConfig } from 'vitest/config';

/**
 * Determinism is a Stage 0 acceptance criterion, so the runner is configured for
 * it explicitly: no concurrency inside a file, no shuffling, and no retries that
 * could turn a flaky result into a pass.
 */

/**
 * Timeouts for the projects whose tests drive the real filesystem, real SQLite
 * files or real subprocesses.
 *
 * A timeout is a liveness backstop -- it answers "is this hung?" -- and it is
 * the one part of a test that is not a claim about the code. Vitest's 5s default
 * is sized for an idle Linux machine. These suites create temp trees, build
 * SQLite databases with FTS5 shadow tables and then delete them again, and on a
 * two-core Windows runner with a virus scanner in the path that work costs an
 * order of magnitude more. When such a suite is scheduled alongside
 * `sqlite-qualification` -- which deliberately spawns writer processes and holds
 * a real lock for over a second -- the default leaves no headroom, and a test
 * that asserts a digest property can lose on wall clock instead of on its
 * assertion. That is a false failure: it reports scheduling pressure as a
 * determinism defect, which is exactly the kind of untrue signal this repository
 * exists to keep out of its evidence.
 *
 * Raising the backstop weakens no assertion. Every digest, ordering and
 * containment claim these suites make is checked identically; only the point at
 * which the runner gives up waiting moves.
 */
const REAL_IO = { testTimeout: 30_000, hookTimeout: 30_000 } as const;
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'core',
          root: './packages/core',
          include: ['test/**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        test: {
          name: 'harness',
          root: './tools/harness',
          include: ['test/**/*.test.ts'],
          environment: 'node',
          ...REAL_IO,
        },
      },
      {
        test: {
          name: 'contracts-gen',
          root: './tools/contracts-gen',
          include: ['test/**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        test: {
          name: 'capability-seed',
          root: './tools/capability-seed',
          include: ['test/**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        test: {
          name: 'sqlite-qualification',
          root: './tools/sqlite-qualification',
          include: ['test/**/*.test.ts'],
          environment: 'node',
          // Check 4 spawns a second writer process and waits out a real lock.
          testTimeout: 60_000,
          hookTimeout: REAL_IO.hookTimeout,
        },
      },
      {
        test: {
          name: 'snapshot-emit',
          root: './tools/snapshot-emit',
          include: ['test/**/*.test.ts'],
          environment: 'node',
          ...REAL_IO,
        },
      },
      {
        test: {
          name: 'cli',
          root: './packages/adapters/cli',
          include: ['test/**/*.test.ts'],
          environment: 'node',
          ...REAL_IO,
        },
      },
      {
        test: {
          name: 'claude-code',
          root: './packages/adapters/claude-code',
          include: ['test/**/*.test.ts'],
          environment: 'node',
          ...REAL_IO,
        },
      },
      {
        test: {
          name: 'mcp',
          root: './packages/adapters/mcp',
          include: ['test/**/*.test.ts'],
          environment: 'node',
          ...REAL_IO,
        },
      },
      {
        test: {
          name: 'resolver',
          root: './packages/resolver',
          include: ['test/**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        test: {
          name: 'releases',
          root: './packages/releases',
          include: ['test/**/*.test.ts'],
          environment: 'node',
          ...REAL_IO,
        },
      },
      {
        test: {
          name: 'evidence-plane',
          root: './supabase',
          include: ['tests/**/*.test.ts'],
          environment: 'node',
          // Database-backed files reset the same `public` schema. Running two
          // of them concurrently would make one test destroy the other's
          // subject and turn a security assertion into a scheduler race.
          fileParallelism: false,
          ...REAL_IO,
        },
      },
      {
        test: {
          name: 'evidence-derivation',
          root: './packages/evidence-derivation',
          include: ['test/**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        test: {
          name: 'telemetry',
          root: './packages/telemetry',
          include: ['test/**/*.test.ts'],
          environment: 'node',
          ...REAL_IO,
        },
      },
      {
        test: {
          name: 'store-sqlite',
          root: './packages/store-sqlite',
          include: ['test/**/*.test.ts'],
          environment: 'node',
          ...REAL_IO,
        },
      },
      {
        test: {
          name: 'seed-import',
          root: './tools/seed-import',
          include: ['test/**/*.test.ts'],
          environment: 'node',
          ...REAL_IO,
        },
      },
      {
        test: {
          name: 'qualification-report',
          root: './tools/qualification-report',
          include: ['test/**/*.test.ts'],
          environment: 'node',
          ...REAL_IO,
        },
      },
      {
        test: {
          name: 'fitness',
          root: './fitness',
          include: ['checks/**/*.test.ts'],
          environment: 'node',
          // Fitness checks walk the repository tree; they are cheap but not parallel-safe
          // with each other's process CWD assumptions.
          fileParallelism: false,
        },
      },
    ],
    sequence: { shuffle: false, concurrent: false },
    retry: 0,
  },
});
