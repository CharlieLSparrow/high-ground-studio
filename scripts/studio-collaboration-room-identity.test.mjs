import assert from "node:assert/strict";
import { test } from "node:test";

import {
  appendAnnotationEvent,
  createEmptyAnnotationEventLog,
  createReviewNoteCreatedEvent,
  createReviewNoteStatusChangedEvent,
} from "../apps/quipsly/src/app/(app)/manuscript/collaboration-lab/studio-collaboration-annotation-event-log.ts";
import {
  createMaterializedAnnotationStateFromEventLog,
  createMaterializedAnnotationStateReference,
} from "../apps/quipsly/src/app/(app)/manuscript/collaboration-lab/studio-collaboration-annotation-state.ts";
import {
  attachAnnotationStreamToRoom,
  canParticipantCreateCheckpoint,
  canParticipantModifyAnnotations,
  createAnnotationStreamIdentity,
  createCheckpointAnnotationReference,
  createSyntheticCollaborationRoomIdentity,
  summarizeCollaborationRoomIdentity,
  validateCollaborationRoomIdentity,
} from "../apps/quipsly/src/app/(app)/manuscript/collaboration-lab/studio-collaboration-room-identity.ts";
import {
  createCollaborationClients,
  createSyntheticCollaborationDocument,
} from "../apps/quipsly/src/app/(app)/manuscript/collaboration-lab/studio-collaboration-lab-model.ts";
import {
  applySyntheticSpanTag,
  listSyntheticSpanTags,
} from "../apps/quipsly/src/app/(app)/manuscript/collaboration-lab/studio-collaboration-span-model.ts";

function createMaterializedReference() {
  const [charlie] = createCollaborationClients(
    ["Charlie"],
    createSyntheticCollaborationDocument(),
  );

  assert.equal(
    applySyntheticSpanTag(
      charlie,
      "synthetic-collab-block-1",
      10,
      22,
      "Room identity annotation span",
    ),
    true,
  );

  const span = listSyntheticSpanTags(charlie)[0];
  const created = createReviewNoteCreatedEvent(
    span,
    "charlie",
    "Synthetic room identity annotation note.",
  );

  assert.ok(created);

  const addressed = createReviewNoteStatusChangedEvent(
    created.noteId,
    "homer",
    "addressed",
  );

  assert.ok(addressed);

  const log = appendAnnotationEvent(
    appendAnnotationEvent(createEmptyAnnotationEventLog(), created),
    addressed,
  );
  const state = createMaterializedAnnotationStateFromEventLog(log);

  return createMaterializedAnnotationStateReference(state);
}

test("creates and validates a synthetic collaboration room identity", () => {
  const room = createSyntheticCollaborationRoomIdentity();
  const validation = validateCollaborationRoomIdentity(room);
  const summary = summarizeCollaborationRoomIdentity(room);

  assert.equal(validation.ok, true);
  assert.equal(room.safety.serverWrites, false);
  assert.equal(room.safety.dbSchema, false);
  assert.equal(room.checkpointPolicy.autosave, false);
  assert.equal(summary.participantCount, 2);
  assert.equal(summary.canCharlieCheckpoint, true);
  assert.equal(summary.canHomerCheckpoint, false);
});

test("room roles separate annotation modification from checkpoint authority", () => {
  const room = createSyntheticCollaborationRoomIdentity();

  assert.equal(canParticipantModifyAnnotations(room, "charlie"), true);
  assert.equal(canParticipantModifyAnnotations(room, "homer"), true);
  assert.equal(canParticipantCreateCheckpoint(room, "charlie"), true);
  assert.equal(canParticipantCreateCheckpoint(room, "homer"), false);
});

test("creates annotation stream identity from materialized annotation state", () => {
  const room = createSyntheticCollaborationRoomIdentity();
  const reference = createMaterializedReference();
  const stream = createAnnotationStreamIdentity(room, reference);
  const nextRoom = attachAnnotationStreamToRoom(room, stream);
  const validation = validateCollaborationRoomIdentity(nextRoom);
  const summary = summarizeCollaborationRoomIdentity(nextRoom);

  assert.equal(validation.ok, true);
  assert.equal(stream.materializedStateVersion, reference.annotationStateVersion);
  assert.equal(stream.publicContent, false);
  assert.equal(summary.annotationStreamCount, 1);
});

test("rejects attaching mismatched annotation stream identities", () => {
  const room = createSyntheticCollaborationRoomIdentity();
  const otherRoom = createSyntheticCollaborationRoomIdentity({
    manuscriptId: "synthetic-other-manuscript",
  });
  const stream = createAnnotationStreamIdentity(otherRoom, createMaterializedReference());
  const nextRoom = attachAnnotationStreamToRoom(room, stream);

  assert.equal(nextRoom.annotationStreams.length, 0);
});

test("creates safe checkpoint annotation references", () => {
  const room = createSyntheticCollaborationRoomIdentity();
  const materializedReference = createMaterializedReference();
  const stream = createAnnotationStreamIdentity(room, materializedReference);
  const checkpointReference = createCheckpointAnnotationReference(
    room,
    stream,
    materializedReference,
  );

  assert.ok(checkpointReference);
  assert.equal(checkpointReference.embedsAnnotationBodies, false);
  assert.equal(checkpointReference.manualSnapshotMutation, false);
  assert.equal(
    checkpointReference.annotationStateVersion,
    materializedReference.annotationStateVersion,
  );
});

test("checkpoint annotation reference rejects stale materialized version mismatch", () => {
  const room = createSyntheticCollaborationRoomIdentity();
  const materializedReference = createMaterializedReference();
  const stream = {
    ...createAnnotationStreamIdentity(room, materializedReference),
    materializedStateVersion: "stale-version",
  };
  const checkpointReference = createCheckpointAnnotationReference(
    room,
    stream,
    materializedReference,
  );

  assert.equal(checkpointReference, null);
});

test("room identity rejects public content and provider flags", () => {
  const room = createSyntheticCollaborationRoomIdentity();
  const unsafe = {
    ...room,
    safety: {
      ...room.safety,
      yjsProviderServer: true,
    },
    annotationStreams: [
      {
        ...createAnnotationStreamIdentity(room, createMaterializedReference()),
        publicContent: true,
      },
    ],
  };
  const validation = validateCollaborationRoomIdentity(unsafe);

  assert.equal(validation.ok, false);
  assert.match(validation.errors.join("\n"), /yjsProviderServer|publicContent/);
});

test("room identity rejects real content and secret markers", () => {
  const room = createSyntheticCollaborationRoomIdentity({
    title: "Synthetic title with access_token marker",
  });
  const validation = validateCollaborationRoomIdentity(room);

  assert.equal(validation.ok, false);
  assert.match(validation.errors.join("\n"), /access_token/);
});
