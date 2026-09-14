export type TranscriptExportFormat = "txt" | "md" | "srt" | "vtt";
export type TranscriptExportPassage = {
  text: string;
  speakerLabel: string | null;
  startSeconds: number;
  endSeconds: number;
  programStartSeconds?: number;
  programEndSeconds?: number;
};
export type TranscriptExportOptions = {
  title: string;
  segments: readonly TranscriptExportPassage[];
  format: TranscriptExportFormat;
  timestamps?: boolean;
  speakers?: boolean;
  partial?: boolean;
};

export const PARTIAL_TRANSCRIPT_NOTICE = "Partial transcript: some participant recordings are not included yet. You can export an updated copy when they are ready.";
export function transcriptExportIsPartial(sessionTranscript?: { status?: string; pendingSourceCount?: number } | null) {
  return sessionTranscript?.status === "incomplete" || sessionTranscript?.status === "held" || (sessionTranscript?.pendingSourceCount ?? 0) > 0;
}

function clock(segment: TranscriptExportPassage) {
  const usesProgram = segment.programStartSeconds !== undefined || segment.programEndSeconds !== undefined;
  return usesProgram
    ? [segment.programStartSeconds, segment.programEndSeconds] as const
    : [segment.startSeconds, segment.endSeconds] as const;
}

export function transcriptHasSubtitleTiming(segments: readonly TranscriptExportPassage[]) {
  return segments.length > 0 && segments.every(segment => {
    const [start, end] = clock(segment);
    return typeof start === "number" && typeof end === "number"
      && Number.isFinite(start) && Number.isFinite(end) && start >= 0 && end > start
      && Math.round(end * 1000) > Math.round(start * 1000);
  });
}

function timestamp(seconds: number, separator = ".") {
  const milliseconds = Math.round(seconds * 1000);
  const hours = Math.floor(milliseconds / 3_600_000);
  const minutes = Math.floor(milliseconds / 60_000) % 60;
  const secs = Math.floor(milliseconds / 1000) % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}${separator}${String(milliseconds % 1000).padStart(3, "0")}`;
}

const markdownText = (value: string) => value.replace(/[\\`*_{}\[\]<>#!|]/g, "\\$&");
const cueText = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\s*\n\s*/g, " ").trim();

/** Export the effective transcript, not audit metadata or inferred listening claims.
 * Timing stays on the supplied Session/source clock; media edits need their own projection. */
export function createTranscriptExport(options: TranscriptExportOptions) {
  const {format, segments} = options;
  const title = `${options.title.trim() || "Quipsly transcript"}${options.partial ? " (partial)" : ""}`;
  const subtitles = format === "srt" || format === "vtt";
  if (subtitles && !transcriptHasSubtitleTiming(segments)) {
    throw new Error("Subtitle timing is unavailable for one or more passages. Download a text transcript instead.");
  }
  const speakers = options.speakers ?? true;
  const content = subtitles
    ? `${format === "vtt" ? "WEBVTT\n\n" : ""}${segments
      .filter(segment => segment.text.trim())
      .map((segment, index) => ({segment, index}))
      .sort((a, b) => clock(a.segment)[0]! - clock(b.segment)[0]! || a.index - b.index)
      .map(({segment}, index) => {
        const [start, end] = clock(segment);
        const speaker = speakers && segment.speakerLabel?.trim() ? `${segment.speakerLabel.trim()}: ` : "";
        return `${index + 1}\n${timestamp(start!, format === "srt" ? "," : ".")} --> ${timestamp(end!, format === "srt" ? "," : ".")}\n${cueText(speaker + segment.text)}\n`;
      }).join("\n")}`
    : [format === "md" ? `# ${markdownText(title.replace(/\s*\n\s*/g, " "))}` : title, "", ...(options.partial ? [PARTIAL_TRANSCRIPT_NOTICE, ""] : []), ...segments.flatMap(segment => {
      const [start] = clock(segment);
      const time = options.timestamps !== false && typeof start === "number" && Number.isFinite(start) && start >= 0 ? `[${timestamp(start)}]` : "";
      const speaker = speakers ? segment.speakerLabel?.trim() ?? "" : "";
      const heading = [time, format === "md" && speaker ? `**${markdownText(speaker)}**` : speaker].filter(Boolean).join(" ");
      return [heading, format === "md" ? markdownText(segment.text.trim()) : segment.text.trim(), ""].filter((line, index) => index !== 0 || line);
    })].join("\n");
  const slug = title.normalize("NFKD").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase().slice(0, 80) || "quipsly";
  const mimeType = {txt: "text/plain", md: "text/markdown", srt: "application/x-subrip", vtt: "text/vtt"}[format];
  return {content, filename: `${slug}-transcript.${format}`, mimeType: `${mimeType};charset=utf-8`};
}
