import { defineConfig } from 'vitest/config';

/**
 * Determinism is a Stage 0 acceptance criterion, so the runner is configured for
 * it explicitly: no concurrency inside a file, no shuffling, and no retries that
 * could turn a flaky result into a pass.
 */
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
        },
      },
      {
        test: {
          name: 'snapshot-emit',
          root: './tools/snapshot-emit',
          include: ['test/**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        test: {
          name: 'cli',
          root: './packages/adapters/cli',
          include: ['test/**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        test: {
          name: 'mcp',
          root: './packages/adapters/mcp',
          include: ['test/**/*.test.ts'],
          environment: 'node',
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
        },
      },
      {
        test: {
          name: 'store-sqlite',
          root: './packages/store-sqlite',
          include: ['test/**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        test: {
          name: 'qualification-report',
          root: './tools/qualification-report',
          include: ['test/**/*.test.ts'],
          environment: 'node',
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
