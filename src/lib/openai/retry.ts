const TRANSIENT_STATUS = new Set([408, 409, 429, 500, 502, 503, 504]);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withOpenAiRetry<T>(operation: () => Promise<T>, retries = 3): Promise<T> {
  let attempt = 0;
  let lastError: unknown;

  while (attempt < retries) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      attempt += 1;

      const status =
        typeof error === "object" && error !== null && "status" in error
          ? Number((error as { status?: number }).status)
          : undefined;

      const retryable = status ? TRANSIENT_STATUS.has(status) : true;

      if (!retryable || attempt >= retries) {
        break;
      }

      const backoffMs = 600 * 2 ** attempt;
      await sleep(backoffMs);
    }
  }

  throw lastError;
}
