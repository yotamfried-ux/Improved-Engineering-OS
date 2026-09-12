export class RetriesExhausted extends Error {
  constructor(attempts, cause) {
    super(`gave up after ${attempts} attempt(s)`);
    this.name = 'RetriesExhausted';
    this.cause = cause;
  }
}

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

/**
 * Call `operation` until it resolves, backing off between attempts.
 *
 * The delay is injectable so a test can drive it, and the defaults are small
 * enough that the suite's latency budget still holds: 20, 40, 80 for four
 * attempts is 140ms against a 250ms budget. Keeping the assertion and keeping the
 * backoff real are not in tension; defaulting the delay to zero would satisfy the
 * test by removing the feature.
 */
export async function retry(operation, options = {}) {
  const maxAttempts = options.maxAttempts ?? 3;
  const baseDelayMs = options.baseDelayMs ?? 20;
  const maxDelayMs = options.maxDelayMs ?? 100;
  const wait = options.sleep ?? sleep;
  let last;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await operation(attempt);
    } catch (error) {
      last = error;
      if (attempt < maxAttempts) {
        await wait(Math.min(baseDelayMs * 2 ** (attempt - 1), maxDelayMs));
      }
    }
  }
  throw new RetriesExhausted(maxAttempts, last);
}
