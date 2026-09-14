import {
  readTranscriptDerivedGoalSource,
  readTranscriptDerivedNoteSource,
  readTranscriptDerivedTaskSource,
} from "@high-ground/quipsly-domain/transcript-derived-task";

/** A validated transcript anchor opens its reading view and source-local time. */
export function transcriptSourceHref(source: { roomId: string; recordingAssetId: string; startSeconds: number; segmentId: string }) {
  const query = new URLSearchParams({ mode: "transcript", source: source.recordingAssetId, at: String(source.startSeconds) });
  return `/sessions/${encodeURIComponent(source.roomId)}?${query}#transcript-segment-${encodeURIComponent(source.segmentId)}`;
}

/** Session results already carry their canonical source; don't drop it in recap links. */
export function sessionResultSourceHref(roomId: string, source: {
  recordingAssetId?: string | null; sourceStartSeconds?: number | null;
  startSeconds: number | null; segmentId: string | null;
}) {
  const query = new URLSearchParams({mode: "transcript"});
  const at = source.sourceStartSeconds ?? source.startSeconds;
  if (source.recordingAssetId?.trim()) {
    query.set("source", source.recordingAssetId.trim());
    if (typeof at === "number" && Number.isFinite(at) && at >= 0 && at <= 86_400) query.set("at", String(at));
  }
  return `/sessions/${encodeURIComponent(roomId)}?${query}#transcript-segment-${encodeURIComponent(source.segmentId || "")}`;
}

/** Project an existing source pointer, never a room inferred from free-form text. */
export function sessionWorkSourceHref(roomId: string | null | undefined, sourceJson: unknown): string | null {
  if (!roomId || !sourceJson || typeof sourceJson !== "object" || Array.isArray(sourceJson)) return null;
  const source = sourceJson as Record<string, unknown>;
  if (source.roomId !== roomId) return null;
  if (source.schema === "quipsly-session-work-entry-v1" && typeof source.sourceMessageId === "string" && source.sourceMessageId.trim()) {
    const query = new URLSearchParams({mode: "conversation", message: source.sourceMessageId});
    return `/sessions/${encodeURIComponent(roomId)}?${query}#conversation-message-${encodeURIComponent(source.sourceMessageId)}`;
  }

  const anchor = readTranscriptDerivedNoteSource(source)
    ?? readTranscriptDerivedTaskSource(source)
    ?? readTranscriptDerivedGoalSource(source);
  if (!anchor && source.origin !== "quipsly-session-follow-through") return null;
  if (anchor) return transcriptSourceHref(anchor);

  // The player selects a source recording, so seek on its clock, not the assembled timeline.
  const at = typeof source.sourceStartSeconds === "number" ? source.sourceStartSeconds : source.startSeconds;
  const assetId = source.recordingAssetId;
  const query = new URLSearchParams({ mode: "transcript" });
  if (typeof assetId !== "string" || !assetId.trim()) return null;
  query.set("source", assetId);
  if (typeof at === "number" && Number.isFinite(at) && at >= 0) {
    query.set("at", String(at));
  }
  // A recap has no single moment, but still belongs to one recorded take. Its
  // source anchors the transcript assembly so a later call cannot replace it.
  return `/sessions/${encodeURIComponent(roomId)}?${query}`;
}
