import {
  AlignmentType,
  Document,
  Footer,
  Header,
  HeadingLevel,
  Packer,
  PageNumber,
  Paragraph,
  TextRun,
} from "docx";

import type {
  VoiceWritingMark,
  VoiceWritingRichText,
} from "@/lib/voice-writing-contract";
import { normalizeMobileVoiceWritingRichText } from "@/lib/server/mobile-voice-writing";

export const VOICE_WRITING_DOCX_SCHEMA = "quipsly-voice-writing-docx-v1";

export class VoiceWritingDocxError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
    this.name = "VoiceWritingDocxError";
  }
}

export type VoiceWritingDocxInput = {
  title: string;
  body: string;
  richText?: VoiceWritingRichText | null;
};

export type VoiceWritingDocxDocument = {
  schema: typeof VOICE_WRITING_DOCX_SCHEMA;
  title: string;
  body: string;
  richText: VoiceWritingRichText | null;
};

function title(value: unknown) {
  return typeof value === "string"
    ? value.replace(/\s+/g, " ").trim().slice(0, 320)
    : "";
}

export function buildVoiceWritingDocxDocument(value: unknown): VoiceWritingDocxDocument {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new VoiceWritingDocxError(
      "The writing is not valid JSON.",
      400,
      "VOICE_WRITING_EXPORT_INVALID",
    );
  }
  const input = value as Record<string, unknown>;
  const body = typeof input.body === "string"
    ? input.body.replace(/\r\n?/g, "\n").slice(0, 200_000)
    : "";
  if (!body.trim()) {
    throw new VoiceWritingDocxError(
      "Speak or write something before sharing a Word document.",
      400,
      "VOICE_WRITING_EXPORT_EMPTY",
    );
  }
  const richText = normalizeMobileVoiceWritingRichText(input.richText, body);
  if (richText === undefined) {
    throw new VoiceWritingDocxError(
      "The writing format does not match its text.",
      400,
      "VOICE_WRITING_EXPORT_FORMAT_INVALID",
    );
  }
  return {
    schema: VOICE_WRITING_DOCX_SCHEMA,
    title: title(input.title) || "Voice note",
    body,
    richText,
  };
}

function runsForLine(
  line: string,
  startUtf16: number,
  marks: VoiceWritingMark[],
): TextRun[] {
  if (!line) return [];
  const endUtf16 = startUtf16 + line.length;
  const applicable = marks.filter((mark) =>
    mark.startUtf16 < endUtf16 && mark.endUtf16 > startUtf16,
  );
  const boundaries = new Set([0, line.length]);
  for (const mark of applicable) {
    boundaries.add(Math.max(0, mark.startUtf16 - startUtf16));
    boundaries.add(Math.min(line.length, mark.endUtf16 - startUtf16));
  }
  const ordered = [...boundaries].sort((left, right) => left - right);
  const runs: TextRun[] = [];
  for (let index = 0; index < ordered.length - 1; index += 1) {
    const start = ordered[index] ?? 0;
    const end = ordered[index + 1] ?? start;
    if (end <= start) continue;
    const absoluteStart = startUtf16 + start;
    const absoluteEnd = startUtf16 + end;
    const active = new Set(applicable
      .filter((mark) => mark.startUtf16 <= absoluteStart && mark.endUtf16 >= absoluteEnd)
      .map((mark) => mark.kind));
    runs.push(new TextRun({
      text: line.slice(start, end),
      bold: active.has("bold"),
      italics: active.has("italic"),
      underline: active.has("underline") ? {} : undefined,
      strike: active.has("strikethrough"),
    }));
  }
  return runs;
}

function paragraphsFor(document: VoiceWritingDocxDocument) {
  const marks = document.richText?.marks ?? [];
  const structures = document.richText?.structures ?? [];
  let offset = 0;
  return document.body.split("\n").map((line) => {
    const lineStart = offset;
    const lineEnd = lineStart + line.length;
    offset = lineEnd + 1;
    const structure = structures.find((candidate) =>
      candidate.startUtf16 === lineStart && candidate.endUtf16 === lineEnd,
    );
    const isBullet = line.startsWith("• ");
    const visibleLine = isBullet ? line.slice(2) : line;
    const visibleStart = lineStart + (isBullet ? 2 : 0);
    return new Paragraph({
      ...(structure ? {
        heading: structure.kind === "heading"
          ? HeadingLevel.HEADING_1
          : HeadingLevel.HEADING_2,
      } : {}),
      ...(isBullet ? { bullet: { level: 0 } } : {}),
      children: runsForLine(visibleLine, visibleStart, marks),
      spacing: structure
        ? { before: 220, after: 100 }
        : { after: line ? 100 : 180, line: 288 },
    });
  });
}

export function voiceWritingDocxFileName(document: VoiceWritingDocxDocument) {
  const safeTitle = document.title
    .replace(/[^a-z0-9 ._()-]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 96) || "Voice note";
  return `${safeTitle}.docx`;
}

export async function renderVoiceWritingDocx(document: VoiceWritingDocxDocument) {
  const wordDocument = new Document({
    creator: "Quipsly",
    title: document.title,
    subject: "Writing created from voice in Quipsly",
    description: document.schema,
    styles: {
      default: {
        document: { run: { font: "Aptos", size: 23, color: "202124" } },
        heading1: {
          run: { font: "Aptos Display", size: 36, bold: true, color: "24382F" },
          paragraph: { spacing: { before: 240, after: 100 } },
        },
        heading2: {
          run: { font: "Aptos Display", size: 29, bold: true, color: "365448" },
          paragraph: { spacing: { before: 200, after: 80 } },
        },
      },
    },
    sections: [{
      properties: {
        page: { margin: { top: 900, right: 900, bottom: 900, left: 900 } },
      },
      headers: {
        default: new Header({
          children: [new Paragraph({
            alignment: AlignmentType.RIGHT,
            children: [new TextRun({
              text: "QUIPSLY",
              bold: true,
              color: "61756C",
              size: 16,
            })],
          })],
        }),
      },
      footers: {
        default: new Footer({
          children: [new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({ text: "Page ", color: "708078", size: 16 }),
              new TextRun({ children: [PageNumber.CURRENT], color: "708078", size: 16 }),
            ],
          })],
        }),
      },
      children: [
        new Paragraph({
          heading: HeadingLevel.TITLE,
          children: [new TextRun({ text: document.title, bold: true })],
          spacing: { after: 360 },
        }),
        ...paragraphsFor(document),
      ],
    }],
  });
  return Packer.toBuffer(wordDocument);
}
