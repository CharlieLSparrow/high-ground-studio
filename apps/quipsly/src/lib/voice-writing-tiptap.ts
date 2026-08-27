import type { JSONContent } from "@tiptap/core";

import {
  VOICE_WRITING_MARK_KINDS,
  VOICE_WRITING_RICH_TEXT_SCHEMA,
  emptyVoiceWritingRichText,
  type VoiceWritingMark,
  type VoiceWritingMarkKind,
  type VoiceWritingRichText,
} from "@/lib/voice-writing-contract";

const TIPTAP_MARK_BY_PORTABLE: Record<VoiceWritingMarkKind, string> = {
  bold: "bold",
  italic: "italic",
  underline: "underline",
  strikethrough: "strike",
};

const PORTABLE_MARK_BY_TIPTAP = new Map(
  Object.entries(TIPTAP_MARK_BY_PORTABLE).map(([kind, mark]) => [mark, kind as VoiceWritingMarkKind]),
);

function normalizedRichText(value: VoiceWritingRichText | null | undefined, fallbackText: string) {
  if (!value || value.schema !== VOICE_WRITING_RICH_TEXT_SCHEMA || value.text !== fallbackText) {
    return emptyVoiceWritingRichText(fallbackText);
  }
  return value;
}

function inlineContentForLine(
  line: string,
  lineStart: number,
  marks: VoiceWritingMark[],
): JSONContent[] | undefined {
  if (!line) return undefined;
  const lineEnd = lineStart + line.length;
  const applicable = marks.filter((mark) => mark.startUtf16 < lineEnd && mark.endUtf16 > lineStart);
  const boundaries = new Set([0, line.length]);
  for (const mark of applicable) {
    boundaries.add(Math.max(0, mark.startUtf16 - lineStart));
    boundaries.add(Math.min(line.length, mark.endUtf16 - lineStart));
  }
  const ordered = [...boundaries].sort((left, right) => left - right);
  const content: JSONContent[] = [];
  for (let index = 0; index < ordered.length - 1; index += 1) {
    const start = ordered[index] ?? 0;
    const end = ordered[index + 1] ?? start;
    if (end <= start) continue;
    const segmentStart = lineStart + start;
    const segmentEnd = lineStart + end;
    const active = VOICE_WRITING_MARK_KINDS.filter((kind) => applicable.some((mark) =>
      mark.kind === kind && mark.startUtf16 <= segmentStart && mark.endUtf16 >= segmentEnd,
    ));
    content.push({
      type: "text",
      text: line.slice(start, end),
      ...(active.length ? { marks: active.map((kind) => ({ type: TIPTAP_MARK_BY_PORTABLE[kind] })) } : {}),
    });
  }
  return content.length ? content : undefined;
}

/** Convert the iPhone/web portable run model into a small, native Tiptap doc. */
export function voiceWritingRichTextToTiptap(
  value: VoiceWritingRichText | null | undefined,
  fallbackText: string,
): JSONContent {
  const richText = normalizedRichText(value, fallbackText);
  let offset = 0;
  const paragraphs = richText.text.split("\n").map((line) => {
    const paragraph: JSONContent = {
      type: "paragraph",
      content: inlineContentForLine(line, offset, richText.marks),
    };
    offset += line.length + 1;
    return paragraph;
  });
  return { type: "doc", content: paragraphs.length ? paragraphs : [{ type: "paragraph" }] };
}

type Serializer = {
  text: string;
  marks: VoiceWritingMark[];
};

function appendText(target: Serializer, text: string, marks: JSONContent["marks"]) {
  if (!text) return;
  const startUtf16 = target.text.length;
  target.text += text;
  const endUtf16 = target.text.length;
  for (const mark of marks ?? []) {
    const kind = PORTABLE_MARK_BY_TIPTAP.get(String(mark.type || ""));
    if (kind) target.marks.push({ kind, startUtf16, endUtf16 });
  }
}

function appendInline(target: Serializer, node: JSONContent) {
  if (node.type === "text") {
    appendText(target, node.text ?? "", node.marks);
    return;
  }
  if (node.type === "hardBreak") {
    target.text += "\n";
    return;
  }
  for (const child of node.content ?? []) appendInline(target, child);
}

function appendBlock(target: Serializer, node: JSONContent, orderedIndex = 1) {
  if (node.type === "bulletList" || node.type === "orderedList") {
    (node.content ?? []).forEach((child, index) => {
      if (index > 0) target.text += "\n";
      target.text += node.type === "bulletList" ? "• " : `${orderedIndex + index}. `;
      appendBlock(target, child, orderedIndex + index);
    });
    return;
  }
  if (node.type === "listItem") {
    (node.content ?? []).forEach((child, index) => {
      if (index > 0) target.text += "\n  ";
      appendBlock(target, child, orderedIndex);
    });
    return;
  }
  if (node.type === "horizontalRule") {
    target.text += "—";
    return;
  }
  appendInline(target, node);
}

function mergeMarks(text: string, marks: VoiceWritingMark[]) {
  const result: VoiceWritingMark[] = [];
  const sorted = [...marks].sort((left, right) => left.kind.localeCompare(right.kind)
    || left.startUtf16 - right.startUtf16
    || left.endUtf16 - right.endUtf16);
  for (const mark of sorted) {
    const previous = result.at(-1);
    const gap = previous?.kind === mark.kind ? text.slice(previous.endUtf16, mark.startUtf16) : "";
    if (previous && previous.kind === mark.kind
      && (mark.startUtf16 <= previous.endUtf16 || /^\n+$/.test(gap))) {
      previous.endUtf16 = Math.max(previous.endUtf16, mark.endUtf16);
    } else {
      result.push({ ...mark });
    }
  }
  return result.sort((left, right) => left.startUtf16 - right.startUtf16
    || left.endUtf16 - right.endUtf16
    || left.kind.localeCompare(right.kind));
}

/**
 * Serialize the deliberately small writing surface back to the shared format.
 * Unknown pasted blocks remain readable plain text instead of becoming an
 * opaque web-only document.
 */
export function tiptapToVoiceWritingRichText(document: JSONContent): VoiceWritingRichText {
  const serialized: Serializer = { text: "", marks: [] };
  (document.content ?? []).forEach((block, index) => {
    if (index > 0) serialized.text += "\n";
    appendBlock(serialized, block);
  });
  return {
    schema: VOICE_WRITING_RICH_TEXT_SCHEMA,
    text: serialized.text,
    marks: mergeMarks(serialized.text, serialized.marks),
  };
}
