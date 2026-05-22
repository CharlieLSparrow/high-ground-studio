import * as Y from "yjs";

import type {
  StudioCollaborationClient,
  StudioCollaborationSummary,
} from "./studio-collaboration-lab-model";

export type StudioCollaborationSpanTag = {
  spanId: string;
  blockId: string;
  startOffset: number;
  endOffset: number;
  label: string;
  actor: string;
  createdAt: string;
  tagType: "insight";
  note: string;
};

export type StudioCollaborationSpanValidation = {
  ok: boolean;
  span: StudioCollaborationSpanTag | null;
  errors: string[];
  warnings: string[];
};

export type StudioCollaborationSpanSummary = {
  spanCount: number;
  invalidSpanCount: number;
  spansByBlock: Array<{
    blockId: string;
    spanCount: number;
    labels: string[];
  }>;
};

const ROOT_KEY = "studio-collaboration-lab";
const BLOCKS_KEY = "blocks";
const SPANS_KEY = "spans";

function nowIso() {
  return new Date().toISOString();
}

function normalizeSpanId(input: {
  blockId: string;
  startOffset: number;
  endOffset: number;
  label: string;
  actor: string;
}) {
  const labelPart = input.label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  const actorPart = input.actor
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);

  return [
    "synthetic-span",
    input.blockId,
    input.startOffset,
    input.endOffset,
    labelPart || "tag",
    actorPart || "actor",
  ].join("-");
}

function getRoot(doc: Y.Doc) {
  return doc.getMap<unknown>(ROOT_KEY);
}

function getBlocks(doc: Y.Doc) {
  const root = getRoot(doc);
  let blocks = root.get(BLOCKS_KEY) as Y.Map<Y.Map<unknown>> | undefined;

  if (!blocks) {
    blocks = new Y.Map<Y.Map<unknown>>();
    root.set(BLOCKS_KEY, blocks);
  }

  return blocks;
}

function getSpanMap(doc: Y.Doc) {
  const root = getRoot(doc);
  let spans = root.get(SPANS_KEY) as Y.Map<Y.Map<unknown>> | undefined;

  if (!spans) {
    spans = new Y.Map<Y.Map<unknown>>();
    root.set(SPANS_KEY, spans);
  }

  return spans;
}

function readSpan(spanMap: Y.Map<unknown>): StudioCollaborationSpanTag {
  return {
    spanId: String(spanMap.get("spanId") ?? ""),
    blockId: String(spanMap.get("blockId") ?? ""),
    startOffset: Number(spanMap.get("startOffset") ?? 0),
    endOffset: Number(spanMap.get("endOffset") ?? 0),
    label: String(spanMap.get("label") ?? ""),
    actor: String(spanMap.get("actor") ?? ""),
    createdAt: String(spanMap.get("createdAt") ?? ""),
    tagType: "insight",
    note: String(spanMap.get("note") ?? ""),
  };
}

function createSpanMap(span: StudioCollaborationSpanTag) {
  const spanMap = new Y.Map<unknown>();

  spanMap.set("spanId", span.spanId);
  spanMap.set("blockId", span.blockId);
  spanMap.set("startOffset", span.startOffset);
  spanMap.set("endOffset", span.endOffset);
  spanMap.set("label", span.label);
  spanMap.set("actor", span.actor);
  spanMap.set("createdAt", span.createdAt);
  spanMap.set("tagType", span.tagType);
  spanMap.set("note", span.note);

  return spanMap;
}

export function normalizeAndClampSyntheticSpan(
  blockText: string,
  startOffset: number,
  endOffset: number,
) {
  const textLength = blockText.length;
  const normalizedStart = Number.isFinite(startOffset)
    ? Math.floor(startOffset)
    : 0;
  const normalizedEnd = Number.isFinite(endOffset) ? Math.floor(endOffset) : 0;
  const orderedStart = Math.min(normalizedStart, normalizedEnd);
  const orderedEnd = Math.max(normalizedStart, normalizedEnd);

  return {
    startOffset: Math.max(0, Math.min(textLength, orderedStart)),
    endOffset: Math.max(0, Math.min(textLength, orderedEnd)),
    textLength,
  };
}

export function validateSyntheticSpanTag(
  blockText: string,
  span: StudioCollaborationSpanTag,
): StudioCollaborationSpanValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const normalized = normalizeAndClampSyntheticSpan(
    blockText,
    span.startOffset,
    span.endOffset,
  );

  if (!span.spanId.trim()) {
    errors.push("Span id is required.");
  }

  if (!span.blockId.trim()) {
    errors.push("Span blockId is required.");
  }

  if (!span.label.trim()) {
    errors.push("Span label is required.");
  }

  if (!span.actor.trim()) {
    errors.push("Span actor is required.");
  }

  if (span.tagType !== "insight") {
    errors.push("Synthetic span tagType must be insight.");
  }

  if (normalized.startOffset !== span.startOffset) {
    warnings.push("Span startOffset was clamped to the block text.");
  }

  if (normalized.endOffset !== span.endOffset) {
    warnings.push("Span endOffset was clamped to the block text.");
  }

  if (normalized.startOffset === normalized.endOffset) {
    errors.push("Synthetic spans must cover at least one character.");
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    span:
      errors.length === 0
        ? {
            ...span,
            startOffset: normalized.startOffset,
            endOffset: normalized.endOffset,
          }
        : null,
  };
}

export function createSyntheticSpanTag(
  blockId: string,
  startOffset: number,
  endOffset: number,
  label: string,
  actor: string,
): StudioCollaborationSpanTag | null {
  const normalizedLabel = label.trim();
  const normalizedActor = actor.trim();

  if (!blockId.trim() || !normalizedLabel || !normalizedActor) {
    return null;
  }

  return {
    spanId: normalizeSpanId({
      blockId,
      startOffset,
      endOffset,
      label: normalizedLabel,
      actor: normalizedActor,
    }),
    blockId,
    startOffset,
    endOffset,
    label: normalizedLabel,
    actor: normalizedActor,
    createdAt: nowIso(),
    tagType: "insight",
    note: `Synthetic span tag from ${normalizedActor}.`,
  };
}

export function listSyntheticSpanTags(client: StudioCollaborationClient) {
  return [...getSpanMap(client.doc).values()]
    .map(readSpan)
    .sort(
      (first, second) =>
        first.blockId.localeCompare(second.blockId) ||
        first.startOffset - second.startOffset ||
        first.endOffset - second.endOffset ||
        first.spanId.localeCompare(second.spanId),
    );
}

export function applySyntheticSpanTag(
  client: StudioCollaborationClient,
  blockId: string,
  startOffset: number,
  endOffset: number,
  label: string,
) {
  const blockMap = getBlocks(client.doc).get(blockId);

  if (!blockMap) {
    return false;
  }

  const blockText = String(blockMap.get("text") ?? "");
  const normalized = normalizeAndClampSyntheticSpan(
    blockText,
    startOffset,
    endOffset,
  );
  const span = createSyntheticSpanTag(
    blockId,
    normalized.startOffset,
    normalized.endOffset,
    label,
    client.name,
  );

  if (!span) {
    return false;
  }

  const validation = validateSyntheticSpanTag(blockText, span);

  if (!validation.ok || !validation.span) {
    return false;
  }

  const spans = getSpanMap(client.doc);

  if (spans.has(validation.span.spanId)) {
    return false;
  }

  client.doc.transact(() => {
    spans.set(validation.span!.spanId, createSpanMap(validation.span!));
  });
  client.updateCount += 1;

  return true;
}

export function replaceSyntheticSpanTags(
  client: StudioCollaborationClient,
  spans: StudioCollaborationSpanTag[],
) {
  const spanMap = getSpanMap(client.doc);

  client.doc.transact(() => {
    spanMap.clear();

    for (const span of spans) {
      spanMap.set(span.spanId, createSpanMap(span));
    }
  });
}

export function summarizeSyntheticSpanTags(client: StudioCollaborationClient) {
  const blocks = getBlocks(client.doc);
  const spans = listSyntheticSpanTags(client);
  const invalidSpans = spans.filter((span) => {
    const blockText = String(blocks.get(span.blockId)?.get("text") ?? "");

    return !validateSyntheticSpanTag(blockText, span).ok;
  });
  const byBlock = new Map<string, string[]>();

  for (const span of spans) {
    const labels = byBlock.get(span.blockId) ?? [];

    labels.push(span.label);
    byBlock.set(span.blockId, labels);
  }

  return {
    spanCount: spans.length,
    invalidSpanCount: invalidSpans.length,
    spansByBlock: [...byBlock.entries()]
      .map(([blockId, labels]) => ({
        blockId,
        spanCount: labels.length,
        labels,
      }))
      .sort((first, second) => first.blockId.localeCompare(second.blockId)),
  } satisfies StudioCollaborationSpanSummary;
}

export function collaborationSpanSummariesMatch(
  clientA: StudioCollaborationClient,
  clientB: StudioCollaborationClient,
) {
  return (
    JSON.stringify(listSyntheticSpanTags(clientA)) ===
    JSON.stringify(listSyntheticSpanTags(clientB))
  );
}

export function addSpanSummaryToCollaborationSummary<
  T extends StudioCollaborationSummary,
>(summary: T, client: StudioCollaborationClient) {
  const spanSummary = summarizeSyntheticSpanTags(client);

  return {
    ...summary,
    spanCount: spanSummary.spanCount,
    invalidSpanCount: spanSummary.invalidSpanCount,
  };
}
