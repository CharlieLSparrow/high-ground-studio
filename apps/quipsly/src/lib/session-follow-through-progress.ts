export type SessionFollowThroughProgress = {
  state: "PROCESSING" | "RETRYING" | "FAILED" | "READY";
  message: string;
  canRetry: boolean;
};

/** Only product progress leaves the processing boundary. Provider diagnostics,
 * generated payloads and credentials are not part of a Session status. */
export function sessionFollowThroughProgress(
  value: { status: string; attemptCount: number; errorCode: string | null } | null | undefined,
  canManage: boolean,
  requested = false,
): SessionFollowThroughProgress | null {
  if (requested && (!value || value.status === "materialized"))
    value = { status: "queued", attemptCount: 0, errorCode: null };
  if (!value) return null;
  if (value.status === "materialized") return { state: "READY", message: "Session notes, tasks, and goals are ready.", canRetry: false };
  if (["queued", "running", "completed"].includes(value.status)) return {
    state: "PROCESSING", message: "Preparing notes, tasks, and goals. You can keep working or leave this page.", canRetry: false,
  };
  if (value.status !== "failed") return null;
  const retryable = !["INVALID_SOURCE", "INPUT_TOO_LARGE"].includes(value.errorCode || "");
  if (retryable && value.attemptCount < 3) return {
    state: "RETRYING", message: "Automatic notes hit a temporary problem. Quipsly will try again; your saved work is still available.", canRetry: false,
  };
  return { state: "FAILED",
    message: "Automatic notes couldn’t finish. Your recording, transcript, and saved work are still available.",
    canRetry: canManage && retryable,
  };
}
