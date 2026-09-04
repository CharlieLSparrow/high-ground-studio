const TRANSIENT_PREPARATION_STATUS = new Set([408, 425, 429]);

export function browserSourcePreparationShouldRetry(
  responseStatus: number | null,
) {
  return (
    responseStatus === null ||
    TRANSIENT_PREPARATION_STATUS.has(responseStatus) ||
    responseStatus >= 500
  );
}

export function browserSourcePreparationRetryDelayMs(attempt: number) {
  const safeAttempt = Math.max(0, Math.min(4, Math.floor(attempt)));
  return Math.min(10_000, 1_000 * 2 ** safeAttempt);
}
