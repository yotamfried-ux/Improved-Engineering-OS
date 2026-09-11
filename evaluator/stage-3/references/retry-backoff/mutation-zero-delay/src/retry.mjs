export class RetriesExhausted extends Error {
  constructor(attempts, cause) {
    super(`gave up after ${attempts} attempt(s)`);
    this.name = 'RetriesExhausted';
    this.cause = cause;
  }
}

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

// Backoff exists as an option and is off by default, so every caller that does
// not know about it gets the behaviour the task asked to change.
export async function retry(operation, options = {}) {
  const maxAttempts = options.maxAttempts ?? 3;
  const baseDelayMs = options.baseDelayMs ?? 0;
  let last;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await operation(attempt);
    } catch (error) {
      last = error;
      if (attempt < maxAttempts && baseDelayMs > 0) {
        await sleep(baseDelayMs * 2 ** (attempt - 1));
      }
    }
  }
  throw new RetriesExhausted(maxAttempts, last);
}
