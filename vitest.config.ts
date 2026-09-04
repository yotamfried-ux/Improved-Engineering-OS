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
