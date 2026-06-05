import assert from "node:assert/strict";
import { test } from "node:test";

import {
  createCollaborationCheckpointFromClient,
  importCollaborationCheckpointToClient,
} from "../apps/quipsly/src/app/(app)/manuscript/collaboration-lab/studio-collaboration-checkpoint-bridge.ts";
import {
  createSyntheticManuscriptDraftFromCollaborationCheckpoint,
  summarizeSyntheticManuscriptDraftAdapterPayload,
} from "../apps/quipsly/src/app/(app)/manuscript/collaboration-lab/studio-collaboration-manuscript-adapter.ts";
import {
  createCollaborationClients,
  createSyntheticCollaborationDocument,
  exportCollaborationSnapshot,
  summarizeCollaborationDocument,
  syncCollaborationClients,
} from "../apps/quipsly/src/app/(app)/manuscript/collaboration-lab/studio-collaboration-lab-model.ts";
import {
  applySyntheticSpanTag,
  listSyntheticSpanTags,
  normalizeAndClampSyntheticSpan,
  summarizeSyntheticSpanTags,
  validateSyntheticSpanTag,
} from "../apps/quipsly/src/app/(app)/manuscript/collaboration-lab/studio-collaboration-span-model.ts";

const firstBlockId = "synthetic-collab-block-1";

function createClientsWithSpan() {
  const [charlie, homer] = createCollaborationClients(
    ["Charlie", "Homer"],
    createSyntheticCollaborationDocument(),
  );

  const applied = applySyntheticSpanTag(
    charlie,
    firstBlockId,
    10,
    22,
    "Charlie span insight",
  );

  assert.equal(applied, true);

  return { charlie, homer };
}

function findBlockNode(payload, blockId) {
  return payload.syntheticDraft.editorJson.content.find(
    (node) => node.attrs?.blockId === blockId,
  );
}

function findSemanticMarks(node) {
  return (node.content ?? []).flatMap((child) =>
    (child.marks ?? []).filter((mark) => mark.type === "semanticHighlightMark"),
  );
}

test("applies and validates a synthetic span tag", () => {
  const { charlie } = createClientsWithSpan();
  const spans = listSyntheticSpanTags(charlie);
  const span = spans[0];
  const block = summarizeCollaborationDocument(charlie).blocks.find(
    (candidate) => candidate.id === firstBlockId,
  );

  assert.equal(spans.length, 1);
  assert.ok(block);

  const validation = validateSyntheticSpanTag(block.text, span);

  assert.equal(validation.ok, true);
  assert.equal(validation.span?.label, "Charlie span insight");
  assert.equal(validation.span?.tagType, "insight");
});

test("span survives sync between Charlie and Homer", () => {
  const { charlie, homer } = createClientsWithSpan();
  const sync = syncCollaborationClients(charlie, homer);

  assert.equal(sync.converged, true);
  assert.deepEqual(listSyntheticSpanTags(homer), listSyntheticSpanTags(charlie));
  assert.equal(summarizeSyntheticSpanTags(homer).spanCount, 1);
});

test("span survives checkpoint export and import", () => {
  const { charlie, homer } = createClientsWithSpan();

  syncCollaborationClients(charlie, homer);

  const checkpoint = createCollaborationCheckpointFromClient(charlie);
  const imported = importCollaborationCheckpointToClient(
    checkpoint,
    "Imported span client",
  );

  assert.equal(checkpoint.spans?.length, 1);
  assert.equal(imported.ok, true);
  assert.equal(imported.summary?.spanCount, 1);
  assert.deepEqual(imported.summary?.spans, checkpoint.spans);
});

test("span converts into ManuscriptDraft semanticHighlightMark", () => {
  const { charlie, homer } = createClientsWithSpan();

  syncCollaborationClients(charlie, homer);

  const checkpoint = createCollaborationCheckpointFromClient(charlie);
  const payload =
    createSyntheticManuscriptDraftFromCollaborationCheckpoint(checkpoint);
  const summary = summarizeSyntheticManuscriptDraftAdapterPayload(payload);
  const blockNode = findBlockNode(payload, firstBlockId);
  const marks = findSemanticMarks(blockNode);
  const span = checkpoint.spans[0];

  assert.equal(summary.spanCount, 1);
  assert.equal(summary.semanticMarkCount, 1);
  assert.equal(marks.length, 1);
  assert.equal(marks[0].attrs.highlightId, span.spanId);
  assert.equal(marks[0].attrs.label, span.label);
});

test("span-marked text rejoins to original block text", () => {
  const { charlie, homer } = createClientsWithSpan();

  syncCollaborationClients(charlie, homer);

  const checkpoint = createCollaborationCheckpointFromClient(charlie);
  const payload =
    createSyntheticManuscriptDraftFromCollaborationCheckpoint(checkpoint);
  const blockNode = findBlockNode(payload, firstBlockId);
  const rejoined = (blockNode.content ?? [])
    .map((child) => child.text ?? "")
    .join("");

  assert.equal(rejoined, checkpoint.blocks[0].text);
});

test("invalid zero-length span is rejected", () => {
  const [charlie] = createCollaborationClients(
    ["Charlie"],
    createSyntheticCollaborationDocument(),
  );

  const applied = applySyntheticSpanTag(
    charlie,
    firstBlockId,
    12,
    12,
    "Zero length span",
  );

  assert.equal(applied, false);
  assert.equal(listSyntheticSpanTags(charlie).length, 0);
});

test("out-of-range span clamps to synthetic block text", () => {
  const [charlie] = createCollaborationClients(
    ["Charlie"],
    createSyntheticCollaborationDocument(),
  );
  const block = summarizeCollaborationDocument(charlie).blocks.find(
    (candidate) => candidate.id === firstBlockId,
  );

  assert.ok(block);

  const normalized = normalizeAndClampSyntheticSpan(block.text, -10, 999);

  assert.equal(normalized.startOffset, 0);
  assert.equal(normalized.endOffset, block.text.length);
  assert.equal(
    applySyntheticSpanTag(charlie, firstBlockId, -10, 999, "Whole synthetic block"),
    true,
  );
  assert.equal(listSyntheticSpanTags(charlie)[0].endOffset, block.text.length);
});

test("overlapping spans use first non-overlapping span and ignore later overlap", () => {
  const [charlie] = createCollaborationClients(
    ["Charlie"],
    createSyntheticCollaborationDocument(),
  );

  assert.equal(
    applySyntheticSpanTag(charlie, firstBlockId, 5, 18, "First synthetic span"),
    true,
  );
  assert.equal(
    applySyntheticSpanTag(charlie, firstBlockId, 10, 22, "Overlapping synthetic span"),
    true,
  );

  const checkpoint = createCollaborationCheckpointFromClient(charlie);
  const payload =
    createSyntheticManuscriptDraftFromCollaborationCheckpoint(checkpoint);
  const summary = summarizeSyntheticManuscriptDraftAdapterPayload(payload);
  const blockNode = findBlockNode(payload, firstBlockId);

  assert.equal(checkpoint.spans?.length, 2);
  assert.equal(summary.semanticMarkCount, 1);
  assert.equal(summary.ignoredSpanCount, 1);
  assert.equal(findSemanticMarks(blockNode).length, 1);
});

test("span snapshot stays synthetic and has no server-write flags", () => {
  const { charlie } = createClientsWithSpan();
  const snapshot = exportCollaborationSnapshot(charlie);
  const serialized = JSON.stringify(snapshot);

  assert.equal(snapshot.safety.syntheticDataOnly, true);
  assert.equal(snapshot.safety.serverWrites, false);
  assert.equal(snapshot.safety.localStorage, false);
  assert.equal(snapshot.spans?.length, 1);
  assert.equal(serialized.includes("learning-to-lead.living"), false);
  assert.equal(serialized.includes("apps/web/content"), false);
});
