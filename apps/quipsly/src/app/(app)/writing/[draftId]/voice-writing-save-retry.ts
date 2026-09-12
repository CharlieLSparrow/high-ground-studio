const RETRY_DELAYS_MS = [2_000, 5_000, 15_000];

/** Bound automatic recovery; a rejected command needs a new user action, not a loop. */
export function writingSaveRetryDelay(attempt: number, status?: number, retryAfter?: string | null, now = Date.now()): number | null {
  const delay = RETRY_DELAYS_MS[attempt - 1];
  if (delay === undefined || (status !== undefined && status !== 408 && status !== 429 && status < 500)) return null;
  if (!retryAfter?.trim()) return delay;
  const value = retryAfter.trim();
  const requestedDelay = /^\d+$/.test(value) ? Number(value) * 1000 : Date.parse(value) - now;
  // Avoid overflowing browser timers or retrying sooner than a very long server hold.
  if (requestedDelay > 2_147_483_647) return null;
  return Number.isFinite(requestedDelay) ? Math.max(delay, requestedDelay) : delay;
}
