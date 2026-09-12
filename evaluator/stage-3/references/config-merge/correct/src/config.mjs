import { readFileSync } from 'node:fs';
import { deepMerge } from './merge.mjs';

export const DEFAULTS = {
  server: { host: '127.0.0.1', port: 8080, keepAliveMs: 5000 },
  logging: { level: 'info', destination: 'stdout' },
  retries: 3,
};

/**
 * Load the user's config and overlay it on the defaults.
 *
 * The defect was here, not in `deepMerge`: a spread replaces `server` wholesale,
 * so a user file naming one key under it dropped the rest. The README said the
 * opposite.
 */
export function loadConfig(path) {
  const user = JSON.parse(readFileSync(path, 'utf8'));
  return deepMerge(DEFAULTS, user);
}
