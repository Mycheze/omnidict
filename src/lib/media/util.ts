export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Capped exponential backoff shared by the media API clients */
export function backoffDelay(attempt: number): number {
  return Math.min(10000, 2 ** attempt * 1000);
}
