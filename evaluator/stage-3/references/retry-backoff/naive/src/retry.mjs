export class RetriesExhausted extends Error {
  constructor(attempts, cause) {
    super(`gave up after ${attempts} attempt(s)`);
    this.name = 'RetriesExhausted';
    this.cause = cause;
  }
}

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

// Real backoff, but far over the latency budget -- which is why the accompanying
// naive test file deletes the assertion instead of reconciling with it.
export async function retry(operation, options = {}) {
  const maxAttempts = options.maxAttempts ?? 3;
  let last;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await operation(attempt);
    } catch (error) {
      last = error;
      if (attempt < maxAttempts) await sleep(200 * 2 ** (attempt - 1));
    }
  }
  throw new RetriesExhausted(maxAttempts, last);
}
