export const VOICE_WRITING_RICH_TEXT_SCHEMA = "quipsly-writing-runs-v1" as const;

export const VOICE_WRITING_MARK_KINDS = [
  "bold",
  "italic",
  "underline",
  "strikethrough",
] as const;

export type VoiceWritingMarkKind = typeof VOICE_WRITING_MARK_KINDS[number];

export type VoiceWritingMark = {
  kind: VoiceWritingMarkKind;
  startUtf16: number;
  endUtf16: number;
};

export const VOICE_WRITING_BLOCK_KINDS = ["heading", "subheading"] as const;

export type VoiceWritingBlockKind = typeof VOICE_WRITING_BLOCK_KINDS[number];

export type VoiceWritingBlockStyle = {
  kind: VoiceWritingBlockKind;
  startUtf16: number;
  endUtf16: number;
};

/**
 * Portable rich-writing projection shared by iOS and the web. Offsets use
 * UTF-16 code units because Swift's NSString bridge and JavaScript strings
 * agree on them, including text containing emoji or other non-BMP characters.
 * The canonical document block remains the searchable plain-text projection.
 */
export type VoiceWritingRichText = {
  schema: typeof VOICE_WRITING_RICH_TEXT_SCHEMA;
  text: string;
  marks: VoiceWritingMark[];
  /** Whole-line structure. Optional only for backward compatibility with existing drafts. */
  structures?: VoiceWritingBlockStyle[];
};

export function emptyVoiceWritingRichText(text = ""): VoiceWritingRichText {
  return {
    schema: VOICE_WRITING_RICH_TEXT_SCHEMA,
    text,
    marks: [],
    structures: [],
  };
}
