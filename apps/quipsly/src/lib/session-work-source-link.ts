import {
  readTranscriptDerivedGoalSource,
  readTranscriptDerivedNoteSource,
  readTranscriptDerivedTaskSource,
} from "@high-ground/quipsly-domain/transcript-derived-task";

/** Project an existing source pointer, never a room inferred from free-form text. */
export function sessionWorkSourceHref(roomId: string | null | undefined, sourceJson: unknown): string | null {
  if (!roomId || !sourceJson || typeof sourceJson !== "object" || Array.isArray(sourceJson)) return null;
  const source = sourceJson as Record<string, unknown>;
  if (source.roomId !== roomId) return null;

  const anchor = readTranscriptDerivedNoteSource(source)
    ?? readTranscriptDerivedTaskSource(source)
    ?? readTranscriptDerivedGoalSource(source);
  if (!anchor && source.origin !== "quipsly-session-follow-through") return null;

  // The player selects a source recording, so seek on its clock, not the assembled timeline.
  const at = anchor?.startSeconds
    ?? (typeof source.sourceStartSeconds === "number" ? source.sourceStartSeconds : source.startSeconds);
  const assetId = anchor?.recordingAssetId ?? source.recordingAssetId;
  const query = new URLSearchParams({ mode: "transcript" });
  if (typeof at === "number" && Number.isFinite(at) && at >= 0 && typeof assetId === "string" && assetId.trim()) {
    query.set("source", assetId);
    query.set("at", String(at));
  }
  // A whole-session recap has no single source moment. Open the combined transcript.
  return `/sessions/${encodeURIComponent(roomId)}?${query}`;
}
