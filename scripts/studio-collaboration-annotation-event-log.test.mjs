import assert from "node:assert/strict";
import { test } from "node:test";

import {
  appendAnnotationEvent,
  createAnnotationEventLogReference,
  createEmptyAnnotationEventLog,
  createReviewNoteBodyEditedEvent,
  createReviewNoteCreatedEvent,
  createReviewNoteStatusChangedEvent,
  replayAnnotationEventLog,
  summarizeAnnotationEventLog,
  validateAnnotationEvent,
  validateAnnotationEventLog,
} from "../apps/quipsly/src/app/(app)/manuscript/collaboration-lab/studio-collaboration-annotation-event-log.ts";
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
      "Annotation event-log span",
    ),
    true,
  );

  return charlie;
}

function createEventLogWithNote() {
  const client = createSpanClient();
  const span = listSyntheticSpanTags(client)[0];
  const created = createReviewNoteCreatedEvent(
    span,
    "charlie",
    "Synthetic annotation event-log note.",
  );

  assert.ok(created);

  const log = appendAnnotationEvent(createEmptyAnnotationEventLog(), created);

  return {
    client,
    span,
    created,
    log,
  };
}

function assertNoAnnotationEventLeak(payload, eventBody) {
  const serialized = JSON.stringify(payload);

  assert.equal(serialized.includes(eventBody), false);
  assert.equal(serialized.includes("review-note-created"), false);
  assert.equal(serialized.includes("synthetic-annotation-event"), false);
}

test("creates and validates an empty synthetic annotation event log", () => {
  const log = createEmptyAnnotationEventLog();
  const validation = validateAnnotationEventLog(log);

  assert.equal(validation.ok, true);
  assert.equal(log.events.length, 0);
  assert.equal(log.safety.serverWrites, false);
  assert.equal(log.safety.localStorage, false);
  assert.equal(log.safety.dbSchema, false);
});

test("creates a review-note event and replays it into materialized annotation state", () => {
  const { created, log } = createEventLogWithNote();
  const eventValidation = validateAnnotationEvent(created);
  const replay = replayAnnotationEventLog(log);

  assert.equal(eventValidation.ok, true);
  assert.equal(replay.ok, true);
  assert.equal(replay.summary.noteCount, 1);
  assert.equal(replay.summary.openCount, 1);
  assert.equal(replay.state.notes[0].body, created.body);
  assert.equal(replay.state.safety.durableAnnotation, false);
});

test("body edit events replay without mutating source text", () => {
  const { client, created, log } = createEventLogWithNote();
  const beforeText = summarizeCollaborationDocument(client).blocks.map(
    (block) => block.text,
  );
  const edited = createReviewNoteBodyEditedEvent(
    created.noteId,
    "homer",
    "Synthetic edited annotation event-log note.",
  );

  assert.ok(edited);

  const nextLog = appendAnnotationEvent(log, edited);
  const replay = replayAnnotationEventLog(nextLog);
  const afterText = summarizeCollaborationDocument(client).blocks.map(
    (block) => block.text,
  );

  assert.equal(replay.ok, true);
  assert.equal(replay.state.notes[0].body, edited.nextBody);
  assert.deepEqual(afterText, beforeText);
});

test("status events replay addressed and archived states", () => {
  const { created, log } = createEventLogWithNote();
  const addressed = createReviewNoteStatusChangedEvent(
    created.noteId,
    "homer",
    "addressed",
  );
  const archived = createReviewNoteStatusChangedEvent(
    created.noteId,
    "charlie",
    "archived",
  );

  assert.ok(addressed);
  assert.ok(archived);

  const nextLog = appendAnnotationEvent(
    appendAnnotationEvent(log, addressed),
    archived,
  );
  const replay = replayAnnotationEventLog(nextLog);

  assert.equal(replay.ok, true);
  assert.equal(replay.summary.archivedCount, 1);
  assert.equal(replay.state.notes[0].status, "archived");
  assert.equal(replay.state.notes[0].resolvedBy, "charlie");
});

test("partial replay models rollback to an earlier annotation version", () => {
  const { created, log } = createEventLogWithNote();
  const addressed = createReviewNoteStatusChangedEvent(
    created.noteId,
    "homer",
    "addressed",
  );

  assert.ok(addressed);

  const nextLog = appendAnnotationEvent(log, addressed);
  const beforeStatusChange = replayAnnotationEventLog(nextLog, {
    throughEventIndex: 1,
  });
  const afterStatusChange = replayAnnotationEventLog(nextLog);

  assert.equal(beforeStatusChange.summary.openCount, 1);
  assert.equal(afterStatusChange.summary.addressedCount, 1);
  assert.equal(beforeStatusChange.eventLogSummary.latestEventId, created.eventId);
});

test("duplicate event ids are not appended", () => {
  const { created, log } = createEventLogWithNote();
  const duplicateLog = appendAnnotationEvent(log, created);

  assert.equal(duplicateLog.events.length, 1);
  assert.equal(summarizeAnnotationEventLog(duplicateLog).eventCount, 1);
});

test("events referencing missing notes fail replay", () => {
  const edit = createReviewNoteBodyEditedEvent(
    "missing-synthetic-note",
    "charlie",
    "Synthetic edit without create event.",
  );

  assert.ok(edit);

  const log = appendAnnotationEvent(createEmptyAnnotationEventLog(), edit);
  const replay = replayAnnotationEventLog(log);

  assert.equal(replay.ok, false);
  assert.match(replay.errors.join("\n"), /missing note/);
});

test("unsafe markers are rejected from annotation events", () => {
  const { span } = createEventLogWithNote();
  const unsafe = createReviewNoteCreatedEvent(
    span,
    "homer",
    "Synthetic note with forbidden marker access_token.",
  );

  assert.ok(unsafe);

  const validation = validateAnnotationEvent(unsafe);
  const log = appendAnnotationEvent(createEmptyAnnotationEventLog(), unsafe);

  assert.equal(validation.ok, false);
  assert.match(validation.errors.join("\n"), /access_token/i);
  assert.equal(log.events.length, 0);
});

test("annotation event log references are safe for future snapshots", () => {
  const { log } = createEventLogWithNote();
  const reference = createAnnotationEventLogReference(log);

  assert.equal(reference.eventCount, 1);
  assert.equal(reference.checkpointMetadataPrimaryStore, false);
  assert.equal(reference.manualSnapshotEmbedsEvents, false);
  assert.ok(reference.annotationStateVersion.startsWith("annotation-state-"));
});

test("event logs stay out of collaboration snapshots and checkpoints", () => {
  const { client, created } = createEventLogWithNote();
  const snapshot = exportCollaborationSnapshot(client);
  const checkpoint = createCollaborationCheckpointFromClient(client);

  assertNoAnnotationEventLeak(snapshot, created.body);
  assertNoAnnotationEventLeak(checkpoint, created.body);
});

test("invalid event log safety flags fail validation", () => {
  const unsafeLog = {
    ...createEmptyAnnotationEventLog(),
    safety: {
      ...createEmptyAnnotationEventLog().safety,
      serverWrites: true,
    },
  };
  const validation = validateAnnotationEventLog(unsafeLog);

  assert.equal(validation.ok, false);
  assert.match(validation.errors.join("\n"), /serverWrites/);
});
