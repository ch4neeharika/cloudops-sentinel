export interface BackoffOptions {
  attempt: number;
  baseMs: number;
  maxMs: number;
  jitterRatio?: number;
}

export function exponentialBackoffWithJitter(opts: BackoffOptions): number {
  const exp = Math.min(opts.maxMs, opts.baseMs * 2 ** Math.max(0, opts.attempt - 1));
  const jitterRatio = opts.jitterRatio ?? 0.2;
  const jitter = exp * jitterRatio * Math.random();
  return Math.round(exp + jitter);
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message = 'Operation timed out',
): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), timeoutMs);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export interface RetryOptions {
  maxAttempts: number;
  baseMs: number;
  maxMs: number;
  retryOn?: (err: unknown) => boolean;
}

export async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= options.maxAttempts; attempt += 1) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const retryable = options.retryOn ? options.retryOn(err) : true;
      if (!retryable || attempt === options.maxAttempts) {
        throw err;
      }
      await sleep(
        exponentialBackoffWithJitter({ attempt, baseMs: options.baseMs, maxMs: options.maxMs }),
      );
    }
  }
  throw lastError;
}
