import { readLastTranscriptMergedNoteSource, readTranscriptDerivedNoteSource } from "@high-ground/quipsly-domain/transcript-derived-task";
import { sessionWorkSourceHref } from "./session-work-source-link";

/** Shared presentation of canonical note provenance in the full workspace and
 * call editor. Never manufacture a timestamp for a whole-session recap. */
export function sessionNoteSourceDetails(roomId: string, sourceJson: unknown) {
  const source = sourceJson && typeof sourceJson === "object" && !Array.isArray(sourceJson)
    ? sourceJson as Record<string, unknown> : {};
  const anchor = readTranscriptDerivedNoteSource(sourceJson);
  const merged = readLastTranscriptMergedNoteSource(sourceJson);
  const sourceHref = sessionWorkSourceHref(roomId, sourceJson);
  return {
    originLabel: sourceHref && source.schema === "quipsly-session-work-entry-v1" && typeof source.sourceMessageId === "string" ? "From conversation"
      : sourceHref && source.automaticallyCreated === true ? "From the transcript"
      : anchor?.roomId === roomId ? "From the transcript"
      : source.schema === "quipsly-session-context-v2" ? "Session plan" : "Session note",
    sourceAnchor: anchor?.roomId === roomId ? anchor : null,
    sourceHref,
    lastMergedSource: merged?.sourceAnchor.roomId === roomId ? merged : null,
  };
}
