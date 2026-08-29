export type WritingViewMode = "writing" | "split" | "transcript";

export function voiceWritingViewLayout(
  viewMode: WritingViewMode,
  hasTimedTranscript: boolean,
) {
  return {
    showsWriting: viewMode !== "transcript" || !hasTimedTranscript,
    showsTranscript: hasTimedTranscript && viewMode !== "writing",
    usesSideBySideColumns: viewMode === "split" && hasTimedTranscript,
  };
}
