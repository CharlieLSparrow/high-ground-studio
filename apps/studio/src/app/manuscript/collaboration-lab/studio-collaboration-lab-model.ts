import * as Y from "yjs";

import type { StudioCollaborationSpanTag } from "./studio-collaboration-span-model";

export const STUDIO_COLLABORATION_LAB_VERSION =
  "studio-collaboration-lab-v1";

export type StudioCollaborationActor = "Charlie" | "Homer" | "Synthetic";

export type StudioCollaborationLabTag = {
  id: string;
  label: string;
  actor: StudioCollaborationActor | string;
  createdAt: string;
};

export type StudioCollaborationLabBlock = {
  id: string;
  text: string;
  tags: StudioCollaborationLabTag[];
  updatedBy: StudioCollaborationActor | string;
  updatedAt: string;
};

export type StudioCollaborationLabSnapshot = {
  schemaVersion: typeof STUDIO_COLLABORATION_LAB_VERSION;
  exportedAt: string;
  title: string;
  blocks: StudioCollaborationLabBlock[];
  spans?: StudioCollaborationSpanTag[];
  safety: {
    syntheticDataOnly: true;
    serverWrites: false;
    localStorage: false;
    productionManuscriptEditing: false;
    autosave: false;
  };
};

export type StudioCollaborationClient = {
  name: string;
  doc: Y.Doc;
  updateCount: number;
  syncCount: number;
};

export type StudioCollaborationSummary = {
  clientName: string;
  title: string;
  blockCount: number;
  tagCount: number;
  spanCount: number;
  emptyBlockCount: number;
  updateCount: number;
  syncCount: number;
  stateVector: string;
  blocks: Array<{
    id: string;
    text: string;
    tags: string[];
  }>;
  spans: StudioCollaborationSpanTag[];
};

const SYNTHETIC_TITLE = "Synthetic Collaboration Lab Draft";
const ROOT_KEY = "studio-collaboration-lab";
const BLOCKS_KEY = "blocks";
const SPANS_KEY = "spans";
const TITLE_KEY = "title";

function nowIso() {
  return new Date().toISOString();
}

function encodeBytes(bytes: Uint8Array) {
  return [...bytes]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function createBlockMap(block: StudioCollaborationLabBlock) {
  const blockMap = new Y.Map<unknown>();
  const tagArray = new Y.Array<StudioCollaborationLabTag>();

  tagArray.push(block.tags.map((tag) => ({ ...tag })));
  blockMap.set("id", block.id);
  blockMap.set("text", block.text);
  blockMap.set("updatedBy", block.updatedBy);
  blockMap.set("updatedAt", block.updatedAt);
  blockMap.set("tags", tagArray);

  return blockMap;
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

function getBlockMap(doc: Y.Doc, blockId: string) {
  return getBlocks(doc).get(blockId) ?? null;
}

function getSpans(doc: Y.Doc) {
  const root = getRoot(doc);
  let spans = root.get(SPANS_KEY) as Y.Map<Y.Map<unknown>> | undefined;

  if (!spans) {
    spans = new Y.Map<Y.Map<unknown>>();
    root.set(SPANS_KEY, spans);
  }

  return spans;
}

function readTags(blockMap: Y.Map<unknown>) {
  const tags = blockMap.get("tags") as Y.Array<StudioCollaborationLabTag> | undefined;

  return tags?.toArray().map((tag) => ({ ...tag })) ?? [];
}

function readBlock(blockMap: Y.Map<unknown>): StudioCollaborationLabBlock {
  return {
    id: String(blockMap.get("id") ?? ""),
    text: String(blockMap.get("text") ?? ""),
    tags: readTags(blockMap),
    updatedBy: String(blockMap.get("updatedBy") ?? "Synthetic"),
    updatedAt: String(blockMap.get("updatedAt") ?? ""),
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

function readSpans(doc: Y.Doc) {
  return [...getSpans(doc).values()]
    .map(readSpan)
    .sort(
      (first, second) =>
        first.blockId.localeCompare(second.blockId) ||
        first.startOffset - second.startOffset ||
        first.endOffset - second.endOffset ||
        first.spanId.localeCompare(second.spanId),
    );
}

function normalizeTagId(tag: string) {
  return tag
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function createSyntheticBlocks(): StudioCollaborationLabBlock[] {
  const createdAt = "2026-05-22T12:00:00.000Z";

  return [
    {
      id: "synthetic-collab-block-1",
      text: "Synthetic opening note for a local collaboration lab.",
      tags: [],
      updatedBy: "Synthetic",
      updatedAt: createdAt,
    },
    {
      id: "synthetic-collab-block-2",
      text: "Synthetic middle block where Charlie and Homer can test convergence.",
      tags: [],
      updatedBy: "Synthetic",
      updatedAt: createdAt,
    },
    {
      id: "synthetic-collab-block-3",
      text: "Synthetic closing block kept separate from production manuscript data.",
      tags: [],
      updatedBy: "Synthetic",
      updatedAt: createdAt,
    },
  ];
}

function createDocFromSnapshot(snapshot: StudioCollaborationLabSnapshot) {
  const doc = new Y.Doc();
  const root = getRoot(doc);
  const blocks = getBlocks(doc);
  const spans = getSpans(doc);

  doc.transact(() => {
    root.set(TITLE_KEY, snapshot.title);

    for (const block of snapshot.blocks) {
      blocks.set(block.id, createBlockMap(block));
    }

    for (const span of snapshot.spans ?? []) {
      spans.set(span.spanId, createSpanMap(span));
    }
  });

  return doc;
}

export function createSyntheticCollaborationDocument(): StudioCollaborationLabSnapshot {
  return {
    schemaVersion: STUDIO_COLLABORATION_LAB_VERSION,
    exportedAt: "2026-05-22T12:00:00.000Z",
    title: SYNTHETIC_TITLE,
    blocks: createSyntheticBlocks(),
    spans: [],
    safety: {
      syntheticDataOnly: true,
      serverWrites: false,
      localStorage: false,
      productionManuscriptEditing: false,
      autosave: false,
    },
  };
}

export function createCollaborationClient(
  name: string,
  snapshot: StudioCollaborationLabSnapshot = createSyntheticCollaborationDocument(),
): StudioCollaborationClient {
  return {
    name,
    doc: createDocFromSnapshot(snapshot),
    updateCount: 0,
    syncCount: 0,
  };
}

export function createCollaborationClients(
  names: string[],
  snapshot: StudioCollaborationLabSnapshot = createSyntheticCollaborationDocument(),
) {
  const baselineDoc = createDocFromSnapshot(snapshot);
  const baselineUpdate = Y.encodeStateAsUpdate(baselineDoc);

  return names.map((name) => {
    const doc = new Y.Doc();

    Y.applyUpdate(doc, baselineUpdate);

    return {
      name,
      doc,
      updateCount: 0,
      syncCount: 0,
    };
  });
}

export function syncCollaborationClients(
  clientA: StudioCollaborationClient,
  clientB: StudioCollaborationClient,
) {
  const updateA = Y.encodeStateAsUpdate(clientA.doc);
  const updateB = Y.encodeStateAsUpdate(clientB.doc);

  Y.applyUpdate(clientB.doc, updateA);
  Y.applyUpdate(clientA.doc, updateB);
  clientA.syncCount += 1;
  clientB.syncCount += 1;

  return {
    clientA: summarizeCollaborationDocument(clientA),
    clientB: summarizeCollaborationDocument(clientB),
    converged:
      JSON.stringify(exportCollaborationSnapshot(clientA).blocks) ===
        JSON.stringify(exportCollaborationSnapshot(clientB).blocks) &&
      JSON.stringify(exportCollaborationSnapshot(clientA).spans ?? []) ===
        JSON.stringify(exportCollaborationSnapshot(clientB).spans ?? []),
  };
}

export function syncCollaborationClientToClient(
  source: StudioCollaborationClient,
  target: StudioCollaborationClient,
) {
  const update = Y.encodeStateAsUpdate(source.doc);

  Y.applyUpdate(target.doc, update);
  source.syncCount += 1;
  target.syncCount += 1;

  return {
    source: summarizeCollaborationDocument(source),
    target: summarizeCollaborationDocument(target),
    converged:
      JSON.stringify(exportCollaborationSnapshot(source).blocks) ===
        JSON.stringify(exportCollaborationSnapshot(target).blocks) &&
      JSON.stringify(exportCollaborationSnapshot(source).spans ?? []) ===
        JSON.stringify(exportCollaborationSnapshot(target).spans ?? []),
  };
}

export function applySyntheticTextEdit(
  client: StudioCollaborationClient,
  blockId: string,
  nextText: string,
) {
  const blockMap = getBlockMap(client.doc, blockId);

  if (!blockMap) {
    return false;
  }

  client.doc.transact(() => {
    blockMap.set("text", nextText);
    blockMap.set("updatedBy", client.name);
    blockMap.set("updatedAt", nowIso());
  });
  client.updateCount += 1;

  return true;
}

export function applySyntheticTag(
  client: StudioCollaborationClient,
  blockId: string,
  tag: string,
) {
  const blockMap = getBlockMap(client.doc, blockId);

  if (!blockMap) {
    return false;
  }

  const tagId = normalizeTagId(tag);

  if (!tagId) {
    return false;
  }

  const tags = blockMap.get("tags") as Y.Array<StudioCollaborationLabTag>;
  const existingTags = tags.toArray();

  if (existingTags.some((existingTag) => existingTag.id === tagId)) {
    return false;
  }

  tags.push([
    {
      id: tagId,
      label: tag.trim(),
      actor: client.name,
      createdAt: nowIso(),
    },
  ]);
  client.updateCount += 1;

  return true;
}

export function exportCollaborationSnapshot(
  client: StudioCollaborationClient,
): StudioCollaborationLabSnapshot {
  const root = getRoot(client.doc);
  const blocks = getBlocks(client.doc);

  return {
    schemaVersion: STUDIO_COLLABORATION_LAB_VERSION,
    exportedAt: nowIso(),
    title: String(root.get(TITLE_KEY) ?? SYNTHETIC_TITLE),
    blocks: [...blocks.values()]
      .map(readBlock)
      .sort((first, second) => first.id.localeCompare(second.id)),
    spans: readSpans(client.doc),
    safety: {
      syntheticDataOnly: true,
      serverWrites: false,
      localStorage: false,
      productionManuscriptEditing: false,
      autosave: false,
    },
  };
}

export function importCollaborationSnapshot(
  snapshot: StudioCollaborationLabSnapshot,
  name = "Imported synthetic client",
) {
  return createCollaborationClient(name, snapshot);
}

export function summarizeCollaborationDocument(
  client: StudioCollaborationClient,
): StudioCollaborationSummary {
  const snapshot = exportCollaborationSnapshot(client);
  const tagCount = snapshot.blocks.reduce(
    (count, block) => count + block.tags.length,
    0,
  );
  const spans = snapshot.spans ?? [];

  return {
    clientName: client.name,
    title: snapshot.title,
    blockCount: snapshot.blocks.length,
    tagCount,
    spanCount: spans.length,
    emptyBlockCount: snapshot.blocks.filter((block) => !block.text.trim()).length,
    updateCount: client.updateCount,
    syncCount: client.syncCount,
    stateVector: encodeBytes(Y.encodeStateVector(client.doc)),
    blocks: snapshot.blocks.map((block) => ({
      id: block.id,
      text: block.text,
      tags: block.tags.map((tag) => tag.label),
    })),
    spans,
  };
}

export function collaborationSummariesMatch(
  clientA: StudioCollaborationClient,
  clientB: StudioCollaborationClient,
) {
  const snapshotA = exportCollaborationSnapshot(clientA);
  const snapshotB = exportCollaborationSnapshot(clientB);

  return (
    JSON.stringify(snapshotA.blocks) === JSON.stringify(snapshotB.blocks) &&
    JSON.stringify(snapshotA.spans ?? []) === JSON.stringify(snapshotB.spans ?? [])
  );
}

export function assertSyntheticCollaborationSnapshot(
  snapshot: StudioCollaborationLabSnapshot,
) {
  const serialized = JSON.stringify(snapshot);
  const forbiddenMarkers = [
    "learning-to-lead.living",
    "real-manuscript-draft.docx",
    "apps/web/content",
    "ManuscriptBlock",
    "StoryDraft",
  ];

  return {
    ok:
      snapshot.schemaVersion === STUDIO_COLLABORATION_LAB_VERSION &&
      snapshot.safety.syntheticDataOnly === true &&
      snapshot.safety.serverWrites === false &&
      snapshot.safety.localStorage === false &&
      snapshot.safety.productionManuscriptEditing === false &&
      snapshot.safety.autosave === false &&
      forbiddenMarkers.every((marker) => !serialized.includes(marker)),
    forbiddenMarkers: forbiddenMarkers.filter((marker) =>
      serialized.includes(marker),
    ),
  };
}
