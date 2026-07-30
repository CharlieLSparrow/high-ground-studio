/**
 * Chooses whether a retry may reuse a transcript job without violating the
 * append-only provider evidence boundary. Provider work itself belongs only
 * to the durable transcript worker.
 */
export function transcriptRetryDisposition(
  job: {
    status?: string | null;
    segmentCount?: number | null;
    wordCount?: number | null;
  } | null,
) {
  if (!job) return "CREATE" as const;
  if (!["HELD", "FAILED"].includes(job.status || "")) {
    return "REUSE" as const;
  }
  return Number(job.segmentCount || 0) > 0
    || Number(job.wordCount || 0) > 0
    ? "CREATE_VERSION" as const
    : "REQUEUE" as const;
}
