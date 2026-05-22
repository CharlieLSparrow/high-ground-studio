import assert from "node:assert/strict";
import { test } from "node:test";

import {
  applySyntheticTag,
  applySyntheticTextEdit,
  createCollaborationClients,
  createSyntheticCollaborationDocument,
  summarizeCollaborationDocument,
  syncCollaborationClients,
} from "../apps/studio/src/app/manuscript/collaboration-lab/studio-collaboration-lab-model.ts";
import {
  createCollaborationCheckpointFromClient,
  createCollaborationCheckpointFromSnapshot,
  importCollaborationCheckpointToClient,
  summarizeCollaborationCheckpoint,
  validateCollaborationCheckpoint,
} from "../apps/studio/src/app/manuscript/collaboration-lab/studio-collaboration-checkpoint-bridge.ts";

const firstBlockId = "synthetic-collab-block-1";
const secondBlockId = "synthetic-collab-block-2";
const thirdBlockId = "synthetic-collab-block-3";

function createSyncedClient() {
  const [charlie, homer] = createCollaborationClients(
    ["Charlie", "Homer"],
    createSyntheticCollaborationDocument(),
  );

  applySyntheticTextEdit(
    charlie,
    firstBlockId,
    "Synthetic Charlie checkpoint text.",
  );
  applySyntheticTextEdit(
    homer,
    secondBlockId,
    "Synthetic Homer checkpoint text.",
  );
  applySyntheticTag(charlie, firstBlockId, "Charlie checkpoint tag");
  applySyntheticTag(homer, firstBlockId, "Homer checkpoint tag");
  syncCollaborationClients(charlie, homer);

  return charlie;
}

test("creates and validates a synthetic collaboration checkpoint from a Yjs client", () => {
  const client = createSyncedClient();
  const checkpoint = createCollaborationCheckpointFromClient(client);
  const validation = validateCollaborationCheckpoint(checkpoint);
  const summary = summarizeCollaborationCheckpoint(checkpoint);

  assert.equal(validation.ok, true);
  assert.equal(checkpoint.checkpointVersion, "studio-collaboration-checkpoint-v1");
  assert.equal(checkpoint.source, "collaboration-lab");
  assert.equal(summary.blockCount, 3);
  assert.equal(summary.tagCount, 2);
  assert.ok(summary.stateVector.length > 0);
});

test("checkpoint has explicit local-only safety flags and warnings", () => {
  const checkpoint = createCollaborationCheckpointFromClient(createSyncedClient());

  assert.equal(checkpoint.safety.syntheticDataOnly, true);
  assert.equal(checkpoint.safety.serverWrites, false);
  assert.equal(checkpoint.safety.localStorage, false);
  assert.equal(checkpoint.safety.productionManuscriptEditing, false);
  assert.equal(checkpoint.safety.autosave, false);
  assert.equal(checkpoint.safety.productionSnapshot, false);
  assert.match(checkpoint.warnings.join("\n"), /Not a production manuscript snapshot/);
  assert.match(checkpoint.warnings.join("\n"), /Not autosave/);
});

test("checkpoint rejects real-content and secret markers", () => {
  const checkpoint = createCollaborationCheckpointFromClient(createSyncedClient());

  checkpoint.blocks[0].text = "Synthetic unsafe marker learning-to-lead.living.";
  const realContentValidation = validateCollaborationCheckpoint(checkpoint);

  assert.equal(realContentValidation.ok, false);
  assert.match(realContentValidation.errors.join("\n"), /forbidden/i);

  const secretCheckpoint = createCollaborationCheckpointFromClient(createSyncedClient());

  secretCheckpoint.blocks[0].text = "Synthetic unsafe marker access_token.";
  const secretValidation = validateCollaborationCheckpoint(secretCheckpoint);

  assert.equal(secretValidation.ok, false);
  assert.match(secretValidation.errors.join("\n"), /access_token/i);
});

test("checkpoint imports into a new collaboration client with matching summary", () => {
  const original = createSyncedClient();
  const checkpoint = createCollaborationCheckpointFromClient(original);
  const imported = importCollaborationCheckpointToClient(
    checkpoint,
    "Imported checkpoint client",
  );

  assert.equal(imported.ok, true);
  assert.deepEqual(
    imported.summary?.blocks,
    summarizeCollaborationDocument(original).blocks,
  );
});

test("tags survive checkpoint roundtrip", () => {
  const checkpoint = createCollaborationCheckpointFromClient(createSyncedClient());
  const imported = importCollaborationCheckpointToClient(checkpoint);
  const tags =
    imported.summary?.blocks.find((block) => block.id === firstBlockId)?.tags ?? [];

  assert.deepEqual(tags.sort(), [
    "Charlie checkpoint tag",
    "Homer checkpoint tag",
  ]);
});

test("empty blocks survive checkpoint roundtrip", () => {
  const [charlie, homer] = createCollaborationClients(
    ["Charlie", "Homer"],
    createSyntheticCollaborationDocument(),
  );

  applySyntheticTextEdit(charlie, thirdBlockId, "");
  syncCollaborationClients(charlie, homer);

  const checkpoint = createCollaborationCheckpointFromClient(charlie);
  const imported = importCollaborationCheckpointToClient(checkpoint);

  assert.equal(summarizeCollaborationCheckpoint(checkpoint).emptyBlockCount, 1);
  assert.equal(imported.summary?.emptyBlockCount, 1);
  assert.equal(
    imported.summary?.blocks.find((block) => block.id === thirdBlockId)?.text,
    "",
  );
});

test("modifying imported checkpoint client does not mutate original client", () => {
  const original = createSyncedClient();
  const checkpoint = createCollaborationCheckpointFromClient(original);
  const imported = importCollaborationCheckpointToClient(checkpoint);

  assert.ok(imported.client);
  applySyntheticTextEdit(
    imported.client,
    firstBlockId,
    "Synthetic imported-only edit.",
  );

  assert.notEqual(
    summarizeCollaborationDocument(imported.client).blocks.find(
      (block) => block.id === firstBlockId,
    )?.text,
    summarizeCollaborationDocument(original).blocks.find(
      (block) => block.id === firstBlockId,
    )?.text,
  );
});

test("invalid checkpoint version fails", () => {
  const checkpoint = createCollaborationCheckpointFromClient(createSyncedClient());
  const validation = validateCollaborationCheckpoint({
    ...checkpoint,
    checkpointVersion: "studio-collaboration-checkpoint-v0",
  });

  assert.equal(validation.ok, false);
  assert.match(validation.errors.join("\n"), /version/i);
});

test("unsafe safety flags fail", () => {
  const checkpoint = createCollaborationCheckpointFromClient(createSyncedClient());
  const validation = validateCollaborationCheckpoint({
    ...checkpoint,
    safety: {
      ...checkpoint.safety,
      serverWrites: true,
      productionSnapshot: true,
    },
  });

  assert.equal(validation.ok, false);
  assert.match(validation.errors.join("\n"), /serverWrites/i);
  assert.match(validation.errors.join("\n"), /productionSnapshot/i);
});

test("checkpoint can be created from a synthetic lab snapshot", () => {
  const snapshot = createSyntheticCollaborationDocument();
  const checkpoint = createCollaborationCheckpointFromSnapshot(snapshot);
  const validation = validateCollaborationCheckpoint(checkpoint);

  assert.equal(validation.ok, true);
  assert.equal(validation.summary?.blockCount, snapshot.blocks.length);
  assert.equal(checkpoint.safety.serverWrites, false);
});
