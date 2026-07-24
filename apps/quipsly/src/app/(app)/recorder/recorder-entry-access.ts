export type RecorderEntryAccessState = "allowed" | "denied" | "unavailable";

export function classifyRecorderEntryAccess(state: { mode: string; status?: string | null }): RecorderEntryAccessState {
  if (state.mode === "database") return "allowed";
  if (state.status === "auth-required" || state.status === "access-denied") return "denied";
  return "unavailable";
}
