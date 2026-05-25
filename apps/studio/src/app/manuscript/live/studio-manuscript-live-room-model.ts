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
