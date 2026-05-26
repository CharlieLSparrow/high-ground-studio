import * as Y from "yjs";

import {
  createManuscriptDraftPlainText,
  MANUSCRIPT_SCHEMA_VERSION,
  type ManuscriptDraft,
  type ManuscriptEditorJson,
} from "../manuscript-editor-model";

export const STUDIO_MANUSCRIPT_LIVE_ROOM_SCHEMA_VERSION = 1;
export const STUDIO_MANUSCRIPT_LIVE_YTEXT_NAME = "manuscript";

export type StudioManuscriptLiveRoomTextStats = {
  words: number;
  characters: number;
};

export type StudioManuscriptLiveNotebookBlock = {
  id: string;
  index: number;
  kind: StudioManuscriptLiveNotebookSectionKind;
  label: string;
  text: string;
  wordCount: number;
  characterCount: number;
};

export type StudioManuscriptLiveNotebookSectionKind =
  | "note"
  | "decision"
  | "action-items"
  | "question"
  | "source-note";

export type StudioManuscriptLiveNotebookStarterKind =
  | "working-session"
  | "writing-pass"
  | "coaching-session";

export type StudioManuscriptLiveRoomSessionRecap = {
  decisions: string[];
  actionItems: string[];
  questions: string[];
  sourceNotes: string[];
  summaryText: string;
};

function normalizeLiveRoomText(text: string) {
  return String(text ?? "").replace(/\r\n?/g, "\n");
}

export function countLiveRoomTextStats(
  text: string,
): StudioManuscriptLiveRoomTextStats {
  const normalized = normalizeLiveRoomText(text).trim();

  return {
    words: normalized ? normalized.split(/\s+/).filter(Boolean).length : 0,
    characters: normalizeLiveRoomText(text).length,
  };
}

export function createLiveRoomYDocFromText(text: string) {
  const doc = new Y.Doc();
  const yText = doc.getText(STUDIO_MANUSCRIPT_LIVE_YTEXT_NAME);
  const normalized = normalizeLiveRoomText(text);

  if (normalized) {
    yText.insert(0, normalized);
  }

  return doc;
}

export function encodeLiveRoomDocStateUpdate(doc: Y.Doc) {
  return Y.encodeStateAsUpdate(doc);
}

export function applyLiveRoomUpdateToDoc(
  doc: Y.Doc,
  update: Uint8Array,
  origin: unknown = "remote",
) {
  Y.applyUpdate(doc, update, origin);
}

export function createLiveRoomStateUpdateFromText(text: string) {
  return encodeLiveRoomDocStateUpdate(createLiveRoomYDocFromText(text));
}

export function mergeLiveRoomUpdates(updates: Uint8Array[]) {
  if (!updates.length) {
    return createLiveRoomStateUpdateFromText("");
  }

  return Y.mergeUpdates(updates);
}

export function getLiveRoomTextFromUpdate(update: Uint8Array) {
  const doc = new Y.Doc();
  Y.applyUpdate(doc, update);

  return doc.getText(STUDIO_MANUSCRIPT_LIVE_YTEXT_NAME).toString();
}

export function encodeLiveRoomUpdateBase64(update: Uint8Array) {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(update).toString("base64");
  }

  let binary = "";
  update.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });

  return btoa(binary);
}

export function decodeLiveRoomUpdateBase64(value: string) {
  const normalized = String(value ?? "").trim();

  if (!normalized) {
    return null;
  }

  try {
    if (typeof Buffer !== "undefined") {
      return Uint8Array.from(Buffer.from(normalized, "base64"));
    }

    const binary = atob(normalized);
    const bytes = new Uint8Array(binary.length);

    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }

    return bytes;
  } catch {
    return null;
  }
}

export function applyTextAreaValueToYText(yText: Y.Text, nextValue: string) {
  const currentValue = yText.toString();
  const normalizedNextValue = normalizeLiveRoomText(nextValue);

  if (currentValue === normalizedNextValue) {
    return false;
  }

  let start = 0;

  while (
    start < currentValue.length &&
    start < normalizedNextValue.length &&
    currentValue[start] === normalizedNextValue[start]
  ) {
    start += 1;
  }

  let currentEnd = currentValue.length;
  let nextEnd = normalizedNextValue.length;

  while (
    currentEnd > start &&
    nextEnd > start &&
    currentValue[currentEnd - 1] === normalizedNextValue[nextEnd - 1]
  ) {
    currentEnd -= 1;
    nextEnd -= 1;
  }

  const removeLength = currentEnd - start;
  const insertText = normalizedNextValue.slice(start, nextEnd);

  if (removeLength > 0) {
    yText.delete(start, removeLength);
  }

  if (insertText) {
    yText.insert(start, insertText);
  }

  return true;
}

function splitLiveRoomTextIntoNotebookBlocks(text: string) {
  const normalized = normalizeLiveRoomText(text).trim();

  if (!normalized) {
    return [""];
  }

  return normalized
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);
}

function joinLiveRoomNotebookBlocks(blocks: string[]) {
  return normalizeLiveRoomText(
    blocks.map((block) => block.trim()).filter(Boolean).join("\n\n"),
  );
}

const notebookSectionHeadings: Record<
  StudioManuscriptLiveNotebookSectionKind,
  string
> = {
  note: "Note",
  decision: "Decision",
  "action-items": "Action Items",
  question: "Open Question",
  "source-note": "Source Note",
};

function normalizeNotebookHeading(line: string) {
  return line
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function isNotebookSectionHeading(line: string) {
  const normalized = normalizeNotebookHeading(line);

  return [
    "note",
    "notes",
    "decision",
    "decisions",
    "action",
    "actions",
    "action items",
    "commitment",
    "commitments",
    "next step",
    "next steps",
    "question",
    "questions",
    "open question",
    "open questions",
    "source",
    "sources",
    "source note",
    "source notes",
    "quote",
    "quotes",
    "citation",
    "citations",
  ].includes(normalized);
}

function createNotebookBlockLabel(text: string, index: number) {
  const firstLine = text
    .split("\n")
    .map((line) => line.trim())
    .find(Boolean);
  const fallback = `Section ${index + 1}`;
  const label = firstLine || fallback;

  return label.length > 62 ? `${label.slice(0, 61).trim()}...` : label;
}

function inferNotebookBlockKind(
  text: string,
): StudioManuscriptLiveNotebookSectionKind {
  const firstLine = text
    .split("\n")
    .map((line) => line.trim().toLowerCase())
    .find(Boolean);

  if (!firstLine) {
    return "note";
  }

  if (firstLine.includes("decision")) {
    return "decision";
  }

  if (
    firstLine.includes("action") ||
    firstLine.includes("commitment") ||
    firstLine.includes("next step")
  ) {
    return "action-items";
  }

  if (firstLine.includes("question")) {
    return "question";
  }

  if (
    firstLine.includes("source") ||
    firstLine.includes("quote") ||
    firstLine.includes("citation")
  ) {
    return "source-note";
  }

  return "note";
}

export function createLiveRoomNotebookBlocks(
  text: string,
): StudioManuscriptLiveNotebookBlock[] {
  return splitLiveRoomTextIntoNotebookBlocks(text).map((blockText, index) => {
    const stats = countLiveRoomTextStats(blockText);

    return {
      id: `live-notebook-block-${index}`,
      index,
      kind: inferNotebookBlockKind(blockText),
      label: createNotebookBlockLabel(blockText, index),
      text: blockText,
      wordCount: stats.words,
      characterCount: stats.characters,
    };
  });
}

export function updateLiveRoomNotebookBlockText(input: {
  text: string;
  blockIndex: number;
  blockText: string;
}) {
  const blocks = splitLiveRoomTextIntoNotebookBlocks(input.text);
  const blockIndex = Math.max(0, Math.floor(input.blockIndex));

  while (blocks.length <= blockIndex) {
    blocks.push("");
  }

  blocks[blockIndex] = normalizeLiveRoomText(input.blockText).trim();

  return joinLiveRoomNotebookBlocks(blocks);
}

export function updateLiveRoomNotebookBlockKind(input: {
  text: string;
  blockIndex: number;
  kind: StudioManuscriptLiveNotebookSectionKind;
}) {
  const blocks = splitLiveRoomTextIntoNotebookBlocks(input.text);
  const blockIndex = Math.max(0, Math.floor(input.blockIndex));

  while (blocks.length <= blockIndex) {
    blocks.push("");
  }

  const heading = notebookSectionHeadings[input.kind];
  const blockText = normalizeLiveRoomText(blocks[blockIndex] ?? "").trim();

  if (!blockText) {
    blocks[blockIndex] = createLiveRoomNotebookSectionText(input.kind);

    return joinLiveRoomNotebookBlocks(blocks);
  }

  const lines = blockText.split("\n");
  const firstContentLineIndex = lines.findIndex((line) => line.trim());

  if (firstContentLineIndex === -1) {
    blocks[blockIndex] = createLiveRoomNotebookSectionText(input.kind);

    return joinLiveRoomNotebookBlocks(blocks);
  }

  if (isNotebookSectionHeading(lines[firstContentLineIndex] ?? "")) {
    lines[firstContentLineIndex] = heading;
  } else if (input.kind !== "note") {
    lines.splice(firstContentLineIndex, 0, heading);
  }

  blocks[blockIndex] = lines.join("\n").trim();

  return joinLiveRoomNotebookBlocks(blocks);
}

export function createLiveRoomNotebookSectionText(
  kind: StudioManuscriptLiveNotebookSectionKind = "note",
) {
  if (kind === "decision") {
    return "Decision\nDecision:\nReason:\nOwner:\nFollow-up:";
  }

  if (kind === "action-items") {
    return "Action Items\n- Owner / task / due next";
  }

  if (kind === "question") {
    return "Open Question\nQuestion:\nContext:\nWhat would answer it?";
  }

  if (kind === "source-note") {
    return "Source Note\nSource:\nUseful quote or claim:\nHow it should be used:";
  }

  return "New working note";
}

export function appendLiveRoomNotebookBlock(
  text: string,
  blockText = createLiveRoomNotebookSectionText(),
) {
  const blocks = splitLiveRoomTextIntoNotebookBlocks(text);

  blocks.push(normalizeLiveRoomText(blockText).trim());

  return joinLiveRoomNotebookBlocks(blocks);
}

export function insertLiveRoomNotebookBlockAfter(input: {
  text: string;
  blockIndex: number;
  blockText?: string;
}) {
  const blocks = splitLiveRoomTextIntoNotebookBlocks(input.text);
  const insertIndex = Math.min(
    blocks.length,
    Math.max(0, Math.floor(input.blockIndex) + 1),
  );

  blocks.splice(
    insertIndex,
    0,
    normalizeLiveRoomText(
      input.blockText ?? createLiveRoomNotebookSectionText(),
    ).trim(),
  );

  return joinLiveRoomNotebookBlocks(blocks);
}

export function removeLiveRoomNotebookBlock(input: {
  text: string;
  blockIndex: number;
}) {
  const blocks = splitLiveRoomTextIntoNotebookBlocks(input.text);
  const blockIndex = Math.max(0, Math.floor(input.blockIndex));

  if (blocks.length <= 1) {
    return "";
  }

  blocks.splice(blockIndex, 1);

  return joinLiveRoomNotebookBlocks(blocks);
}

export function moveLiveRoomNotebookBlock(input: {
  text: string;
  blockIndex: number;
  direction: -1 | 1;
}) {
  const blocks = splitLiveRoomTextIntoNotebookBlocks(input.text);
  const blockIndex = Math.max(0, Math.floor(input.blockIndex));
  const nextIndex = blockIndex + input.direction;

  if (
    blockIndex < 0 ||
    blockIndex >= blocks.length ||
    nextIndex < 0 ||
    nextIndex >= blocks.length
  ) {
    return joinLiveRoomNotebookBlocks(blocks);
  }

  const [block] = blocks.splice(blockIndex, 1);

  blocks.splice(nextIndex, 0, block ?? "");

  return joinLiveRoomNotebookBlocks(blocks);
}

function cleanNotebookRecapLine(line: string) {
  return line
    .trim()
    .replace(/^[-*]\s+/, "")
    .replace(/^(Decision|Reason|Owner|Follow-up|Question|Context|Source):\s*/i, "")
    .replace(/^What would answer it\??:?\s*/i, "")
    .replace(/^Useful quote or claim:\s*/i, "")
    .replace(/^How it should be used:\s*/i, "")
    .trim();
}

function createNotebookRecapItems(blockText: string) {
  const [, ...bodyLines] = normalizeLiveRoomText(blockText).split("\n");

  return bodyLines.map(cleanNotebookRecapLine).filter(Boolean);
}

function formatNotebookRecapGroup(title: string, items: string[]) {
  if (!items.length) {
    return [`${title}\n- None captured yet.`];
  }

  return [`${title}`, ...items.map((item) => `- ${item}`)];
}

export function createLiveRoomSessionRecap(
  text: string,
): StudioManuscriptLiveRoomSessionRecap {
  const recap = createLiveRoomNotebookBlocks(text).reduce<
    Omit<StudioManuscriptLiveRoomSessionRecap, "summaryText">
  >(
    (currentRecap, block) => {
      const items = createNotebookRecapItems(block.text);

      if (block.kind === "decision") {
        currentRecap.decisions.push(...items);
      }

      if (block.kind === "action-items") {
        currentRecap.actionItems.push(...items);
      }

      if (block.kind === "question") {
        currentRecap.questions.push(...items);
      }

      if (block.kind === "source-note") {
        currentRecap.sourceNotes.push(...items);
      }

      return currentRecap;
    },
    {
      decisions: [],
      actionItems: [],
      questions: [],
      sourceNotes: [],
    },
  );

  return {
    ...recap,
    summaryText: [
      ...formatNotebookRecapGroup("Decisions", recap.decisions),
      "",
      ...formatNotebookRecapGroup("Action Items", recap.actionItems),
      "",
      ...formatNotebookRecapGroup("Open Questions", recap.questions),
      "",
      ...formatNotebookRecapGroup("Source Notes", recap.sourceNotes),
    ].join("\n"),
  };
}

function createSnapshotDescriptionPart(
  label: string,
  items: string[],
) {
  if (!items.length) {
    return "";
  }

  return `${label}(${items.length}): ${items[0]}`;
}

export function createLiveRoomSnapshotDescription(input: {
  roomId: string;
  recap: StudioManuscriptLiveRoomSessionRecap;
  maxLength?: number;
}) {
  const maxLength = Math.max(80, Math.floor(input.maxLength ?? 500));
  const baseDescription = `Manual checkpoint from live room ${input.roomId}.`;
  const recapParts = [
    createSnapshotDescriptionPart("D", input.recap.decisions),
    createSnapshotDescriptionPart("A", input.recap.actionItems),
    createSnapshotDescriptionPart("Q", input.recap.questions),
    createSnapshotDescriptionPart("S", input.recap.sourceNotes),
  ].filter(Boolean);

  if (!recapParts.length) {
    return baseDescription.slice(0, maxLength);
  }

  const description = `${baseDescription} Recap: ${recapParts.join("; ")}.`
    .replace(/\s+/g, " ")
    .trim();

  return description.length > maxLength
    ? `${description.slice(0, maxLength - 3).trim()}...`
    : description;
}

function formatNotebookBlockKindForPacket(
  kind: StudioManuscriptLiveNotebookSectionKind,
) {
  if (kind === "action-items") {
    return "Actions";
  }

  if (kind === "source-note") {
    return "Source";
  }

  if (kind === "decision") {
    return "Decision";
  }

  if (kind === "question") {
    return "Question";
  }

  return "Note";
}

export function createLiveRoomSessionPacket(input: {
  roomId: string;
  roomTitle: string;
  shareUrl?: string;
  text: string;
  generatedAt?: string;
}) {
  const text = normalizeLiveRoomText(input.text).trim();
  const blocks = createLiveRoomNotebookBlocks(text);
  const recap = createLiveRoomSessionRecap(text);
  const stats = countLiveRoomTextStats(text);
  const headerLines = [
    `# ${input.roomTitle || "Live room"} session packet`,
    `Room ID: ${input.roomId}`,
    input.shareUrl ? `Room link: ${input.shareUrl}` : "",
    `Generated: ${input.generatedAt ?? new Date().toISOString()}`,
    `Stats: ${stats.words} words, ${stats.characters} chars, ${blocks.length} sections`,
  ].filter(Boolean);
  const outlineLines = [
    "## Section outline",
    ...blocks.map(
      (block) =>
        `${block.index + 1}. [${formatNotebookBlockKindForPacket(
          block.kind,
        )}] ${block.label} (${block.wordCount} words)`,
    ),
  ];

  return [
    headerLines.join("\n"),
    outlineLines.join("\n"),
    ["## Structured recap", recap.summaryText].join("\n"),
    ["## Current text", text || "(empty)"].join("\n"),
  ].join("\n\n");
}

export function createLiveRoomNotebookStarterText(
  kind: StudioManuscriptLiveNotebookStarterKind,
) {
  if (kind === "writing-pass") {
    return joinLiveRoomNotebookBlocks([
      "Focus\nWhat are we trying to improve in this writing pass?",
      "Draft\nPaste or write the section we are working on here.",
      "Open Questions\nWhat needs a decision, source check, or follow-up?",
      "Action Items\n- Next concrete edit\n- Next source check\n- Next publishing step",
    ]);
  }

  if (kind === "coaching-session") {
    return joinLiveRoomNotebookBlocks([
      "Session Goal\nWhat should be clearer or easier by the end?",
      "Current Reality\nWhat is happening right now?",
      "Options\nWhat paths are available?",
      "Commitments\n- This week\n- Before next session\n- Support needed",
    ]);
  }

  return joinLiveRoomNotebookBlocks([
    "Agenda\nWhat needs attention today?",
    "Live Notes\nCapture the conversation here.",
    "Decisions\nWhat did we decide?",
    "Action Items\n- Owner / task / next check-in",
    "Parking Lot\nGood ideas that should not derail this session.",
  ]);
}

export function createLiveRoomTextFromManuscriptDraft(draft: ManuscriptDraft) {
  return normalizeLiveRoomText(createManuscriptDraftPlainText(draft));
}

function createParagraphNode(text: string, index: number): ManuscriptEditorJson {
  const trimmed = text.trim();

  return {
    type: "paragraph",
    attrs: {
      blockId: `live-room-block-${String(index + 1).padStart(4, "0")}`,
    },
    content: trimmed ? [{ type: "text", text: trimmed }] : undefined,
  };
}

export function createManuscriptDraftFromLiveRoomText(input: {
  title: string;
  text: string;
  timestamp: string;
}): ManuscriptDraft {
  const paragraphs = normalizeLiveRoomText(input.text)
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  return {
    schemaVersion: MANUSCRIPT_SCHEMA_VERSION,
    title: (input.title.trim() || "Live manuscript room").slice(0, 140),
    sourceFileName: null,
    importSummary: null,
    structureRegions: [],
    quoteReviews: {},
    editorJson: {
      type: "doc",
      content: (paragraphs.length ? paragraphs : [""]).map(createParagraphNode),
    },
    activeAuthorId: "homer",
    showAuthorColors: true,
    showSemanticColors: true,
    lastUpdatedAt: input.timestamp,
  };
}
