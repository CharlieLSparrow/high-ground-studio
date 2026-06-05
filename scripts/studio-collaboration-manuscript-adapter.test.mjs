import assert from "node:assert/strict";
import { test } from "node:test";

import {
  applySyntheticTag,
  applySyntheticTextEdit,
  createCollaborationClients,
  createSyntheticCollaborationDocument,
  summarizeCollaborationDocument,
  syncCollaborationClients,
} from "../apps/quipsly/src/app/(app)/manuscript/collaboration-lab/studio-collaboration-lab-model.ts";
import {
  createCollaborationCheckpointFromClient,
  importCollaborationCheckpointToClient,
} from "../apps/quipsly/src/app/(app)/manuscript/collaboration-lab/studio-collaboration-checkpoint-bridge.ts";
import {
  compareCollaborationCheckpointToManuscriptDraft,
  createCollaborationCheckpointFromSyntheticManuscriptDraft,
  createSyntheticManuscriptDraftFromCollaborationCheckpoint,
  summarizeSyntheticManuscriptDraftAdapterPayload,
  validateSyntheticManuscriptDraftAdapterPayload,
} from "../apps/quipsly/src/app/(app)/manuscript/collaboration-lab/studio-collaboration-manuscript-adapter.ts";
import {
  collectBlockSummaries,
  safeManuscriptDraft,
} from "../apps/quipsly/src/app/(app)/manuscript/manuscript-editor-model.ts";

const firstBlockId = "synthetic-collab-block-1";
const secondBlockId = "synthetic-collab-block-2";
const thirdBlockId = "synthetic-collab-block-3";

function createCheckpoint() {
  const [charlie, homer] = createCollaborationClients(
    ["Charlie", "Homer"],
    createSyntheticCollaborationDocument(),
  );

  applySyntheticTextEdit(
    charlie,
    firstBlockId,
    "Synthetic Charlie adapter text.",
  );
  applySyntheticTextEdit(
    homer,
    secondBlockId,
    "Synthetic Homer adapter text.",
  );
  applySyntheticTag(charlie, firstBlockId, "Charlie adapter tag");
  applySyntheticTag(homer, firstBlockId, "Homer adapter tag");
  syncCollaborationClients(charlie, homer);

  return createCollaborationCheckpointFromClient(charlie);
}

test("converts a synthetic collaboration checkpoint into a Manuscript Desk adapter payload", () => {
  const checkpoint = createCheckpoint();
  const payload =
    createSyntheticManuscriptDraftFromCollaborationCheckpoint(checkpoint);
  const validation = validateSyntheticManuscriptDraftAdapterPayload(payload);
  const safeDraft = safeManuscriptDraft(payload.syntheticDraft);

  assert.equal(validation.ok, true);
  assert.equal(
    payload.adapterVersion,
    "studio-collaboration-manuscript-adapter-v1",
  );
  assert.equal(payload.source, "collaboration-checkpoint");
  assert.ok(safeDraft);
  assert.equal(payload.syntheticDraft.schemaVersion, 1);
  assert.equal(payload.syntheticDraft.sourceFileName, null);
  assert.equal(payload.syntheticDraft.importSummary, null);
  assert.deepEqual(payload.syntheticDraft.structureRegions, []);
  assert.deepEqual(payload.syntheticDraft.quoteReviews, {});
});

test("adapter payload preserves block count text and tags", () => {
  const checkpoint = createCheckpoint();
  const payload =
    createSyntheticManuscriptDraftFromCollaborationCheckpoint(checkpoint);
  const summary = summarizeSyntheticManuscriptDraftAdapterPayload(payload);
  const firstBlock = payload.blocks.find((block) => block.id === firstBlockId);
  const draftBlockSummaries = collectBlockSummaries(
    payload.syntheticDraft.editorJson,
  );

  assert.equal(summary.blockCount, checkpoint.blocks.length);
  assert.equal(summary.draftBlockCount, checkpoint.blocks.length);
  assert.equal(summary.tagCount, 2);
  assert.equal(firstBlock?.text, "Synthetic Charlie adapter text.");
  assert.deepEqual(
    firstBlock?.tags.map((tag) => tag.label).sort(),
    ["Charlie adapter tag", "Homer adapter tag"],
  );
  assert.deepEqual(
    draftBlockSummaries.map((block) => block.blockId),
    checkpoint.blocks.map((block) => block.id),
  );
});

test("empty blocks survive the adapter payload", () => {
  const [charlie, homer] = createCollaborationClients(
    ["Charlie", "Homer"],
    createSyntheticCollaborationDocument(),
  );

  applySyntheticTextEdit(charlie, thirdBlockId, "");
  syncCollaborationClients(charlie, homer);

  const checkpoint = createCollaborationCheckpointFromClient(charlie);
  const payload =
    createSyntheticManuscriptDraftFromCollaborationCheckpoint(checkpoint);
  const validation = validateSyntheticManuscriptDraftAdapterPayload(payload);

  assert.equal(validation.ok, true);
  assert.equal(validation.summary?.emptyBlockCount, 1);
  assert.equal(payload.blocks.find((block) => block.id === thirdBlockId)?.text, "");
});

test("adapter rejects real-content and secret markers", () => {
  const payload =
    createSyntheticManuscriptDraftFromCollaborationCheckpoint(createCheckpoint());

  payload.blocks[0].text = "Synthetic unsafe marker learning-to-lead.living.";
  const realContentValidation =
    validateSyntheticManuscriptDraftAdapterPayload(payload);

  assert.equal(realContentValidation.ok, false);
  assert.match(realContentValidation.errors.join("\n"), /forbidden/i);

  const secretPayload =
    createSyntheticManuscriptDraftFromCollaborationCheckpoint(createCheckpoint());

  secretPayload.blocks[0].text = "Synthetic unsafe marker access_token.";
  const secretValidation =
    validateSyntheticManuscriptDraftAdapterPayload(secretPayload);

  assert.equal(secretValidation.ok, false);
  assert.match(secretValidation.errors.join("\n"), /access_token/i);
});

test("adapter rejects unsafe production flags", () => {
  const payload =
    createSyntheticManuscriptDraftFromCollaborationCheckpoint(createCheckpoint());

  const validation = validateSyntheticManuscriptDraftAdapterPayload({
    ...payload,
    safety: {
      ...payload.safety,
      productionSnapshot: true,
      productionImport: true,
      serverWrites: true,
    },
  });

  assert.equal(validation.ok, false);
  assert.match(validation.errors.join("\n"), /productionSnapshot/i);
  assert.match(validation.errors.join("\n"), /productionImport/i);
  assert.match(validation.errors.join("\n"), /serverWrites/i);
});

test("adapter payload converts back into a collaboration checkpoint and client", () => {
  const originalCheckpoint = createCheckpoint();
  const payload =
    createSyntheticManuscriptDraftFromCollaborationCheckpoint(originalCheckpoint);
  const comparison = compareCollaborationCheckpointToManuscriptDraft(
    originalCheckpoint,
    payload,
  );
  const roundtrip =
    createCollaborationCheckpointFromSyntheticManuscriptDraft(payload);

  assert.equal(comparison.matches, true);
  assert.equal(roundtrip.ok, true);
  assert.ok(roundtrip.checkpoint);

  const imported = importCollaborationCheckpointToClient(
    roundtrip.checkpoint,
    "Imported adapter client",
  );

  assert.equal(imported.ok, true);
  assert.deepEqual(
    imported.summary?.blocks,
    originalCheckpoint.blocks.map((block) => ({
      id: block.id,
      text: block.text,
      tags: block.tags.map((tag) => tag.label),
    })),
  );
});

test("modifying roundtripped client does not mutate original adapter payload", () => {
  const payload =
    createSyntheticManuscriptDraftFromCollaborationCheckpoint(createCheckpoint());
  const roundtrip =
    createCollaborationCheckpointFromSyntheticManuscriptDraft(payload);

  assert.ok(roundtrip.checkpoint);

  const imported = importCollaborationCheckpointToClient(
    roundtrip.checkpoint,
    "Imported adapter isolation client",
  );

  assert.ok(imported.client);
  applySyntheticTextEdit(
    imported.client,
    firstBlockId,
    "Synthetic imported adapter-only edit.",
  );

  assert.notEqual(
    summarizeCollaborationDocument(imported.client).blocks.find(
      (block) => block.id === firstBlockId,
    )?.text,
    payload.blocks.find((block) => block.id === firstBlockId)?.text,
  );
});

test("invalid adapter version fails validation", () => {
  const payload =
    createSyntheticManuscriptDraftFromCollaborationCheckpoint(createCheckpoint());
  const validation = validateSyntheticManuscriptDraftAdapterPayload({
    ...payload,
    adapterVersion: "studio-collaboration-manuscript-adapter-v0",
  });

  assert.equal(validation.ok, false);
  assert.match(validation.errors.join("\n"), /version/i);
});

test("adapter records no server writes", () => {
  const payload =
    createSyntheticManuscriptDraftFromCollaborationCheckpoint(createCheckpoint());

  assert.equal(payload.safety.serverWrites, false);
  assert.equal(payload.safety.localStorage, false);
  assert.equal(payload.safety.productionManuscriptEditing, false);
  assert.equal(payload.safety.autosave, false);
});
