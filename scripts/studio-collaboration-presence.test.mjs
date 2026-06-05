import assert from "node:assert/strict";
import { test } from "node:test";

import {
  createCollaborationCheckpointFromClient,
} from "../apps/quipsly/src/app/(app)/manuscript/collaboration-lab/studio-collaboration-checkpoint-bridge.ts";
import {
  createSyntheticManuscriptDraftFromCollaborationCheckpoint,
} from "../apps/quipsly/src/app/(app)/manuscript/collaboration-lab/studio-collaboration-manuscript-adapter.ts";
import {
  createCollaborationClients,
  createSyntheticCollaborationDocument,
  exportCollaborationSnapshot,
} from "../apps/quipsly/src/app/(app)/manuscript/collaboration-lab/studio-collaboration-lab-model.ts";
import {
  applySyntheticSpanTag,
  listSyntheticSpanTags,
} from "../apps/quipsly/src/app/(app)/manuscript/collaboration-lab/studio-collaboration-span-model.ts";
import {
  createSyntheticPresenceState,
  isSyntheticPresenceStale,
  listPresenceForBlock,
  listPresenceForSpan,
  markSyntheticPresenceForBlock,
  markSyntheticPresenceForSpan,
  summarizeSyntheticPresence,
  updateSyntheticPresenceActor,
  validateSyntheticPresenceState,
} from "../apps/quipsly/src/app/(app)/manuscript/collaboration-lab/studio-collaboration-presence-model.ts";

const firstBlockId = "synthetic-collab-block-1";

function createClientWithSpan() {
  const [charlie] = createCollaborationClients(
    ["Charlie"],
    createSyntheticCollaborationDocument(),
  );

  assert.equal(
    applySyntheticSpanTag(
      charlie,
      firstBlockId,
      10,
      22,
      "Presence span insight",
    ),
    true,
  );

  return charlie;
}

function assertSerializedPayloadExcludesPresence(payload, lastAction) {
  const serialized = JSON.stringify(payload);

  assert.equal(serialized.includes('"presence"'), false);
  assert.equal(serialized.includes("activeBlockId"), false);
  assert.equal(serialized.includes("activeSpanId"), false);
  assert.equal(serialized.includes(lastAction), false);
}

test("creates default Charlie and Homer synthetic presence", () => {
  const presence = createSyntheticPresenceState();
  const validation = validateSyntheticPresenceState(presence);
  const summary = summarizeSyntheticPresence(presence);

  assert.equal(validation.ok, true);
  assert.equal(summary.actorCount, 2);
  assert.equal(summary.activeBlockPresenceCount, 0);
  assert.equal(summary.activeSpanPresenceCount, 0);
  assert.deepEqual(
    summary.actors.map((actor) => actor.actorId),
    ["charlie", "homer"],
  );
});

test("marks Charlie active on a synthetic block", () => {
  const presence = markSyntheticPresenceForBlock(
    createSyntheticPresenceState(),
    "charlie",
    firstBlockId,
    "editing",
    "Charlie is editing a synthetic block.",
  );
  const blockPresence = listPresenceForBlock(presence, firstBlockId);
  const summary = summarizeSyntheticPresence(presence);

  assert.equal(blockPresence.length, 1);
  assert.equal(blockPresence[0].displayName, "Charlie");
  assert.equal(blockPresence[0].currentMode, "editing");
  assert.equal(summary.activeBlockPresenceCount, 1);
});

test("marks Homer active on a synthetic span", () => {
  const spanId = "synthetic-span-presence-check";
  const presence = markSyntheticPresenceForSpan(
    createSyntheticPresenceState(),
    "homer",
    spanId,
    "reviewing",
    "Homer is reviewing a synthetic span.",
  );
  const spanPresence = listPresenceForSpan(presence, spanId);
  const summary = summarizeSyntheticPresence(presence);

  assert.equal(spanPresence.length, 1);
  assert.equal(spanPresence[0].displayName, "Homer");
  assert.equal(spanPresence[0].currentMode, "reviewing");
  assert.equal(summary.activeSpanPresenceCount, 1);
});

test("stale detection works with deterministic timestamps", () => {
  const presence = createSyntheticPresenceState("2026-05-22T12:00:00.000Z");

  assert.equal(
    isSyntheticPresenceStale(
      presence.actors.charlie,
      "2026-05-22T12:04:59.000Z",
    ),
    false,
  );
  assert.equal(
    isSyntheticPresenceStale(
      presence.actors.charlie,
      "2026-05-22T12:05:01.000Z",
    ),
    true,
  );
});

test("invalid presence markers are rejected", () => {
  const presence = markSyntheticPresenceForBlock(
    createSyntheticPresenceState(),
    "charlie",
    "learning-to-lead.living",
    "editing",
    "Synthetic unsafe marker check.",
  );
  const validation = validateSyntheticPresenceState(presence);

  assert.equal(validation.ok, false);
  assert.match(validation.errors.join("\n"), /forbidden/i);
});

test("invalid presence safety flags are rejected", () => {
  const presence = createSyntheticPresenceState();
  const validation = validateSyntheticPresenceState({
    ...presence,
    safety: {
      ...presence.safety,
      documentContent: true,
      localStorage: true,
    },
  });

  assert.equal(validation.ok, false);
  assert.match(validation.errors.join("\n"), /documentContent/i);
  assert.match(validation.errors.join("\n"), /localStorage/i);
});

test("presence is not included in collaboration snapshot", () => {
  const [charlie] = createCollaborationClients(
    ["Charlie"],
    createSyntheticCollaborationDocument(),
  );
  const lastAction = "Charlie synthetic presence should stay ephemeral.";
  const presence = markSyntheticPresenceForBlock(
    createSyntheticPresenceState(),
    "charlie",
    firstBlockId,
    "tagging",
    lastAction,
  );
  const snapshot = exportCollaborationSnapshot(charlie);

  assert.equal(validateSyntheticPresenceState(presence).ok, true);
  assertSerializedPayloadExcludesPresence(snapshot, lastAction);
});

test("presence is not included in collaboration checkpoint", () => {
  const [charlie] = createCollaborationClients(
    ["Charlie"],
    createSyntheticCollaborationDocument(),
  );
  const lastAction = "Homer synthetic checkpoint exclusion check.";
  const presence = markSyntheticPresenceForBlock(
    createSyntheticPresenceState(),
    "homer",
    firstBlockId,
    "reading",
    lastAction,
  );
  const checkpoint = createCollaborationCheckpointFromClient(charlie);

  assert.equal(validateSyntheticPresenceState(presence).ok, true);
  assertSerializedPayloadExcludesPresence(checkpoint, lastAction);
});

test("presence is not included in Manuscript adapter payload", () => {
  const charlie = createClientWithSpan();
  const span = listSyntheticSpanTags(charlie)[0];
  const lastAction = "Homer synthetic adapter exclusion check.";
  const presence = markSyntheticPresenceForSpan(
    createSyntheticPresenceState(),
    "homer",
    span.spanId,
    "reviewing",
    lastAction,
  );
  const checkpoint = createCollaborationCheckpointFromClient(charlie);
  const payload =
    createSyntheticManuscriptDraftFromCollaborationCheckpoint(checkpoint);

  assert.equal(validateSyntheticPresenceState(presence).ok, true);
  assertSerializedPayloadExcludesPresence(payload, lastAction);
});

test("presence actor updates remain immutable and local-only", () => {
  const presence = createSyntheticPresenceState();
  const updated = updateSyntheticPresenceActor(presence, "charlie", {
    currentMode: "tagging",
    lastAction: "Charlie is tagging in React state only.",
    activeBlockId: firstBlockId,
  });

  assert.equal(presence.actors.charlie.currentMode, "reading");
  assert.equal(updated.actors.charlie.currentMode, "tagging");
  assert.equal(updated.safety.serverWrites, false);
  assert.equal(updated.safety.localStorage, false);
  assert.equal(updated.safety.durableSnapshot, false);
});
