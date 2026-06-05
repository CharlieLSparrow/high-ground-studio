import assert from "node:assert/strict";
import { test } from "node:test";

import {
  applySyntheticTag,
  applySyntheticTextEdit,
  assertSyntheticCollaborationSnapshot,
  collaborationSummariesMatch,
  createCollaborationClient,
  createCollaborationClients,
  createSyntheticCollaborationDocument,
  exportCollaborationSnapshot,
  importCollaborationSnapshot,
  summarizeCollaborationDocument,
  syncCollaborationClients,
} from "../apps/quipsly/src/app/(app)/manuscript/collaboration-lab/studio-collaboration-lab-model.ts";

const firstBlockId = "synthetic-collab-block-1";
const secondBlockId = "synthetic-collab-block-2";
const thirdBlockId = "synthetic-collab-block-3";

function createPair() {
  const snapshot = createSyntheticCollaborationDocument();
  const [charlie, homer] = createCollaborationClients(
    ["Charlie", "Homer"],
    snapshot,
  );

  return {
    charlie,
    homer,
  };
}

test("two Studio collaboration clients start from the same synthetic manuscript", () => {
  const { charlie, homer } = createPair();

  assert.equal(collaborationSummariesMatch(charlie, homer), true);
  assert.equal(summarizeCollaborationDocument(charlie).blockCount, 3);
  assert.equal(summarizeCollaborationDocument(homer).tagCount, 0);
});

test("different block text edits converge after sync", () => {
  const { charlie, homer } = createPair();

  assert.equal(
    applySyntheticTextEdit(
      charlie,
      firstBlockId,
      "Synthetic Charlie edit for convergence testing.",
    ),
    true,
  );
  assert.equal(
    applySyntheticTextEdit(
      homer,
      secondBlockId,
      "Synthetic Homer edit for convergence testing.",
    ),
    true,
  );

  const syncResult = syncCollaborationClients(charlie, homer);
  const charlieSummary = summarizeCollaborationDocument(charlie);
  const homerSummary = summarizeCollaborationDocument(homer);

  assert.equal(syncResult.converged, true);
  assert.equal(collaborationSummariesMatch(charlie, homer), true);
  assert.deepEqual(charlieSummary.blocks, homerSummary.blocks);
  assert.match(
    charlieSummary.blocks.find((block) => block.id === firstBlockId)?.text ?? "",
    /Charlie edit/,
  );
  assert.match(
    charlieSummary.blocks.find((block) => block.id === secondBlockId)?.text ?? "",
    /Homer edit/,
  );
});

test("tags from both Studio collaboration clients survive sync", () => {
  const { charlie, homer } = createPair();

  assert.equal(applySyntheticTag(charlie, firstBlockId, "Charlie synthetic tag"), true);
  assert.equal(applySyntheticTag(homer, firstBlockId, "Homer synthetic tag"), true);

  syncCollaborationClients(charlie, homer);

  const tags =
    summarizeCollaborationDocument(charlie).blocks.find(
      (block) => block.id === firstBlockId,
    )?.tags ?? [];

  assert.deepEqual(tags.sort(), [
    "Charlie synthetic tag",
    "Homer synthetic tag",
  ]);
});

test("exported collaboration snapshot imports into a new client with same summary", () => {
  const { charlie, homer } = createPair();

  applySyntheticTextEdit(charlie, firstBlockId, "Synthetic exported text.");
  applySyntheticTag(homer, secondBlockId, "Synthetic imported tag");
  syncCollaborationClients(charlie, homer);

  const snapshot = exportCollaborationSnapshot(charlie);
  const imported = importCollaborationSnapshot(snapshot, "Imported synthetic client");

  assert.equal(assertSyntheticCollaborationSnapshot(snapshot).ok, true);
  assert.deepEqual(
    summarizeCollaborationDocument(imported).blocks,
    summarizeCollaborationDocument(charlie).blocks,
  );
});

test("concurrent edits to the same block do not crash and converge to one value", () => {
  const { charlie, homer } = createPair();

  applySyntheticTextEdit(charlie, thirdBlockId, "Synthetic Charlie same-block edit.");
  applySyntheticTextEdit(homer, thirdBlockId, "Synthetic Homer same-block edit.");
  syncCollaborationClients(charlie, homer);

  const charlieBlock = summarizeCollaborationDocument(charlie).blocks.find(
    (block) => block.id === thirdBlockId,
  );
  const homerBlock = summarizeCollaborationDocument(homer).blocks.find(
    (block) => block.id === thirdBlockId,
  );

  assert.equal(collaborationSummariesMatch(charlie, homer), true);
  assert.equal(charlieBlock?.text, homerBlock?.text);
  assert.match(charlieBlock?.text ?? "", /Synthetic (Charlie|Homer) same-block edit/);
});

test("empty synthetic blocks are retained and reported", () => {
  const { charlie, homer } = createPair();

  assert.equal(applySyntheticTextEdit(charlie, secondBlockId, ""), true);
  syncCollaborationClients(charlie, homer);

  const summary = summarizeCollaborationDocument(homer);

  assert.equal(summary.emptyBlockCount, 1);
  assert.equal(
    summary.blocks.find((block) => block.id === secondBlockId)?.text,
    "",
  );
});

test("missing block edits are rejected without changing the document", () => {
  const { charlie } = createPair();
  const before = summarizeCollaborationDocument(charlie);

  assert.equal(
    applySyntheticTextEdit(charlie, "missing-synthetic-block", "Synthetic miss."),
    false,
  );
  assert.equal(
    applySyntheticTag(charlie, "missing-synthetic-block", "Synthetic miss"),
    false,
  );

  assert.deepEqual(summarizeCollaborationDocument(charlie).blocks, before.blocks);
});

test("collaboration snapshots contain only synthetic data and no server-write flags", () => {
  const { charlie } = createPair();
  const snapshot = exportCollaborationSnapshot(charlie);
  const safety = assertSyntheticCollaborationSnapshot(snapshot);

  assert.equal(safety.ok, true);
  assert.deepEqual(safety.forbiddenMarkers, []);
  assert.equal(snapshot.safety.serverWrites, false);
  assert.equal(snapshot.safety.localStorage, false);
  assert.equal(snapshot.safety.autosave, false);
  assert.equal(snapshot.safety.productionManuscriptEditing, false);
});
