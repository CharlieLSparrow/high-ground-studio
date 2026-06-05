import assert from "node:assert/strict";
import { test } from "node:test";

import {
  appendAnnotationEvent,
  createEmptyAnnotationEventLog,
  createReviewNoteBodyEditedEvent,
  createReviewNoteCreatedEvent,
  createReviewNoteStatusChangedEvent,
} from "../apps/quipsly/src/app/(app)/manuscript/collaboration-lab/studio-collaboration-annotation-event-log.ts";
import {
  compareMaterializedAnnotationStateToEventLog,
  createMaterializedAnnotationStateFromEventLog,
  createMaterializedAnnotationStateReference,
  listMaterializedAnnotationsByStatus,
  listMaterializedAnnotationsForBlock,
  listMaterializedAnnotationsForSpan,
  summarizeMaterializedAnnotationState,
  validateMaterializedAnnotationState,
  validateMaterializedAnnotationStateSourceLog,
} from "../apps/quipsly/src/app/(app)/manuscript/collaboration-lab/studio-collaboration-annotation-state.ts";
import {
  createCollaborationCheckpointFromClient,
} from "../apps/quipsly/src/app/(app)/manuscript/collaboration-lab/studio-collaboration-checkpoint-bridge.ts";
import {
  createCollaborationClients,
  createSyntheticCollaborationDocument,
  exportCollaborationSnapshot,
  summarizeCollaborationDocument,
} from "../apps/quipsly/src/app/(app)/manuscript/collaboration-lab/studio-collaboration-lab-model.ts";
import {
  applySyntheticSpanTag,
  listSyntheticSpanTags,
} from "../apps/quipsly/src/app/(app)/manuscript/collaboration-lab/studio-collaboration-span-model.ts";

const firstBlockId = "synthetic-collab-block-1";

function createSpanClient() {
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
      "Materialized annotation state span",
    ),
    true,
  );

  return charlie;
}

function createEventLogWithMaterializedNote() {
  const client = createSpanClient();
  const span = listSyntheticSpanTags(client)[0];
  const created = createReviewNoteCreatedEvent(
    span,
    "charlie",
    "Synthetic materialized annotation note.",
  );

  assert.ok(created);

  const edited = createReviewNoteBodyEditedEvent(
    created.noteId,
    "homer",
    "Synthetic materialized annotation note after edit.",
  );
  const addressed = createReviewNoteStatusChangedEvent(
    created.noteId,
    "homer",
    "addressed",
  );

  assert.ok(edited);
  assert.ok(addressed);

  const log = appendAnnotationEvent(
    appendAnnotationEvent(
      appendAnnotationEvent(createEmptyAnnotationEventLog(), created),
      edited,
    ),
    addressed,
  );

  return {
    client,
    span,
    created,
    edited,
    log,
  };
}

function assertNoMaterializedAnnotationLeak(payload, body) {
  const serialized = JSON.stringify(payload);

  assert.equal(serialized.includes(body), false);
  assert.equal(serialized.includes("studio-collaboration-annotation-state"), false);
  assert.equal(serialized.includes("materialized annotation"), false);
}

test("materializes annotation state from a valid event log", () => {
  const { edited, log } = createEventLogWithMaterializedNote();
  const state = createMaterializedAnnotationStateFromEventLog(log);
  const validation = validateMaterializedAnnotationState(state);

  assert.equal(validation.ok, true);
  assert.equal(state.summary.noteCount, 1);
  assert.equal(state.summary.addressedCount, 1);
  assert.equal(state.notes[0].body, edited.nextBody);
  assert.equal(state.safety.persistenceAdded, false);
  assert.equal(state.safety.serverWrites, false);
});

test("materialized state indexes annotations by span block and status", () => {
  const { span, log } = createEventLogWithMaterializedNote();
  const state = createMaterializedAnnotationStateFromEventLog(log);

  assert.equal(listMaterializedAnnotationsForSpan(state, span.spanId).length, 1);
  assert.equal(listMaterializedAnnotationsForBlock(state, firstBlockId).length, 1);
  assert.equal(listMaterializedAnnotationsByStatus(state, "addressed").length, 1);
  assert.equal(listMaterializedAnnotationsByStatus(state, "open").length, 0);
});

test("materialized state summary is detached and read-only for callers", () => {
  const { log } = createEventLogWithMaterializedNote();
  const state = createMaterializedAnnotationStateFromEventLog(log);
  const summary = summarizeMaterializedAnnotationState(state);

  summary.notesBySpan[0].noteCount = 99;

  assert.equal(state.summary.notesBySpan[0].noteCount, 1);
});

test("materialized state reference is safe for future checkpoints", () => {
  const { log } = createEventLogWithMaterializedNote();
  const state = createMaterializedAnnotationStateFromEventLog(log);
  const reference = createMaterializedAnnotationStateReference(state);

  assert.equal(reference.noteCount, 1);
  assert.equal(reference.addressedCount, 1);
  assert.equal(reference.manualSnapshotEmbedsAnnotations, false);
  assert.ok(reference.annotationStateVersion.startsWith("studio-annotation-state-"));
});

test("materialized state compares cleanly to its source event log", () => {
  const { log } = createEventLogWithMaterializedNote();
  const state = createMaterializedAnnotationStateFromEventLog(log);
  const comparison = compareMaterializedAnnotationStateToEventLog(state, log);

  assert.equal(comparison.matches, true);
  assert.deepEqual(comparison.details, []);
});

test("stale materialized state does not match a newer event log", () => {
  const { created, log } = createEventLogWithMaterializedNote();
  const state = createMaterializedAnnotationStateFromEventLog(log);
  const archived = createReviewNoteStatusChangedEvent(
    created.noteId,
    "charlie",
    "archived",
  );

  assert.ok(archived);

  const newerLog = appendAnnotationEvent(log, archived);
  const comparison = compareMaterializedAnnotationStateToEventLog(state, newerLog);

  assert.equal(comparison.matches, false);
  assert.match(comparison.details.join("\n"), /event count|latest event id|notes/);
});

test("materialized annotation state does not mutate source text", () => {
  const { client, log } = createEventLogWithMaterializedNote();
  const beforeText = summarizeCollaborationDocument(client).blocks.map(
    (block) => block.text,
  );

  createMaterializedAnnotationStateFromEventLog(log);

  const afterText = summarizeCollaborationDocument(client).blocks.map(
    (block) => block.text,
  );

  assert.deepEqual(afterText, beforeText);
});

test("materialized annotation state stays out of snapshots and checkpoints", () => {
  const { client, edited } = createEventLogWithMaterializedNote();
  const snapshot = exportCollaborationSnapshot(client);
  const checkpoint = createCollaborationCheckpointFromClient(client);

  assertNoMaterializedAnnotationLeak(snapshot, edited.nextBody);
  assertNoMaterializedAnnotationLeak(checkpoint, edited.nextBody);
});

test("unsafe marker in materialized state fails validation", () => {
  const { log } = createEventLogWithMaterializedNote();
  const state = createMaterializedAnnotationStateFromEventLog(log);
  const unsafe = {
    ...state,
    notes: [
      {
        ...state.notes[0],
        body: "Synthetic unsafe materialized note access_token.",
      },
    ],
  };
  const validation = validateMaterializedAnnotationState(unsafe);

  assert.equal(validation.ok, false);
  assert.match(validation.errors.join("\n"), /access_token/i);
});

test("unsafe materialized state safety flags fail validation", () => {
  const { log } = createEventLogWithMaterializedNote();
  const state = createMaterializedAnnotationStateFromEventLog(log);
  const unsafe = {
    ...state,
    safety: {
      ...state.safety,
      dbSchema: true,
    },
  };
  const validation = validateMaterializedAnnotationState(unsafe);

  assert.equal(validation.ok, false);
  assert.match(validation.errors.join("\n"), /dbSchema/);
});

test("invalid source event logs are rejected before materialization", () => {
  const invalidLog = {
    ...createEmptyAnnotationEventLog(),
    schemaVersion: "wrong",
  };
  const validation = validateMaterializedAnnotationStateSourceLog(invalidLog);

  assert.equal(validation.ok, false);
  assert.match(validation.errors.join("\n"), /schemaVersion/);
});
