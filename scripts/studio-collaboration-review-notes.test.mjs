import assert from "node:assert/strict";
import { test } from "node:test";

import {
  createCollaborationCheckpointFromClient,
} from "../apps/studio/src/app/manuscript/collaboration-lab/studio-collaboration-checkpoint-bridge.ts";
import {
  createSyntheticManuscriptDraftFromCollaborationCheckpoint,
} from "../apps/studio/src/app/manuscript/collaboration-lab/studio-collaboration-manuscript-adapter.ts";
import {
  createCollaborationClients,
  createSyntheticCollaborationDocument,
  exportCollaborationSnapshot,
  summarizeCollaborationDocument,
} from "../apps/studio/src/app/manuscript/collaboration-lab/studio-collaboration-lab-model.ts";
import {
  applySyntheticSpanTag,
  listSyntheticSpanTags,
} from "../apps/studio/src/app/manuscript/collaboration-lab/studio-collaboration-span-model.ts";
import {
  createSyntheticPresenceState,
} from "../apps/studio/src/app/manuscript/collaboration-lab/studio-collaboration-presence-model.ts";
import {
  addSyntheticReviewNote,
  createSyntheticReviewNote,
  createSyntheticReviewNoteState,
  listSyntheticReviewNotesForBlock,
  listSyntheticReviewNotesForSpan,
  summarizeSyntheticReviewNotes,
  updateSyntheticReviewNoteStatus,
  validateSyntheticReviewNote,
  validateSyntheticReviewNoteState,
} from "../apps/studio/src/app/manuscript/collaboration-lab/studio-collaboration-review-note-model.ts";

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
      "Review note anchor span",
    ),
    true,
  );

  return charlie;
}

function createReviewStateWithNote() {
  const client = createSpanClient();
  const span = listSyntheticSpanTags(client)[0];
  const note = createSyntheticReviewNote(
    span,
    "charlie",
    "Synthetic review note for the anchored span.",
  );

  assert.ok(note);

  return {
    client,
    span,
    note,
    state: addSyntheticReviewNote(createSyntheticReviewNoteState(), note),
  };
}

function assertNoReviewNoteLeak(payload, noteBody) {
  const serialized = JSON.stringify(payload);

  assert.equal(serialized.includes(noteBody), false);
  assert.equal(serialized.includes("reviewNotes"), false);
  assert.equal(serialized.includes("Synthetic review note"), false);
}

test("creates and validates a synthetic review note for a span", () => {
  const { note } = createReviewStateWithNote();
  const validation = validateSyntheticReviewNote(note);

  assert.equal(validation.ok, true);
  assert.equal(note.status, "open");
  assert.equal(note.authorId, "charlie");
  assert.equal(note.spanId.startsWith("synthetic-span-"), true);
});

test("lists review notes by span and block", () => {
  const { state, span } = createReviewStateWithNote();

  assert.equal(listSyntheticReviewNotesForSpan(state, span.spanId).length, 1);
  assert.equal(listSyntheticReviewNotesForBlock(state, firstBlockId).length, 1);
});

test("updates review note status from open to addressed to archived", () => {
  const { state, note } = createReviewStateWithNote();
  const addressed = updateSyntheticReviewNoteStatus(
    state,
    note.noteId,
    "addressed",
    "homer",
  );
  const archived = updateSyntheticReviewNoteStatus(
    addressed,
    note.noteId,
    "archived",
    "charlie",
  );

  assert.equal(summarizeSyntheticReviewNotes(state).openCount, 1);
  assert.equal(summarizeSyntheticReviewNotes(addressed).addressedCount, 1);
  assert.equal(summarizeSyntheticReviewNotes(archived).archivedCount, 1);
  assert.equal(archived.notes[0].resolvedBy, "charlie");
  assert.ok(archived.notes[0].resolvedAt);
});

test("summarizes review notes by status", () => {
  const { state, note } = createReviewStateWithNote();
  const addressed = updateSyntheticReviewNoteStatus(
    state,
    note.noteId,
    "addressed",
    "homer",
  );
  const summary = summarizeSyntheticReviewNotes(addressed);

  assert.equal(summary.noteCount, 1);
  assert.equal(summary.openCount, 0);
  assert.equal(summary.addressedCount, 1);
  assert.equal(summary.archivedCount, 0);
  assert.equal(summary.notesBySpan[0].noteCount, 1);
  assert.equal(summary.notesByBlock[0].blockId, firstBlockId);
});

test("empty review note body is rejected", () => {
  const client = createSpanClient();
  const span = listSyntheticSpanTags(client)[0];

  assert.equal(createSyntheticReviewNote(span, "charlie", "   "), null);
});

test("unsafe review note markers are rejected", () => {
  const client = createSpanClient();
  const span = listSyntheticSpanTags(client)[0];
  const note = createSyntheticReviewNote(
    span,
    "homer",
    "Synthetic note with forbidden marker access_token.",
  );

  assert.ok(note);

  const validation = validateSyntheticReviewNote(note);

  assert.equal(validation.ok, false);
  assert.match(validation.errors.join("\n"), /access_token/i);
});

test("review notes do not mutate collaboration snapshot text", () => {
  const { client, state } = createReviewStateWithNote();
  const beforeText = summarizeCollaborationDocument(client).blocks.map(
    (block) => block.text,
  );
  const snapshot = exportCollaborationSnapshot(client);
  const afterText = snapshot.blocks.map((block) => block.text);

  assert.equal(validateSyntheticReviewNoteState(state).ok, true);
  assert.deepEqual(afterText, beforeText);
});

test("review notes are not included in presence state", () => {
  const { note } = createReviewStateWithNote();
  const presence = createSyntheticPresenceState();

  assertNoReviewNoteLeak(presence, note.body);
});

test("review notes are excluded from snapshots and checkpoints this pass", () => {
  const { client, note } = createReviewStateWithNote();
  const snapshot = exportCollaborationSnapshot(client);
  const checkpoint = createCollaborationCheckpointFromClient(client);

  assertNoReviewNoteLeak(snapshot, note.body);
  assertNoReviewNoteLeak(checkpoint, note.body);
});

test("review notes are not included in Manuscript adapter source text", () => {
  const { client, note } = createReviewStateWithNote();
  const checkpoint = createCollaborationCheckpointFromClient(client);
  const adapterPayload =
    createSyntheticManuscriptDraftFromCollaborationCheckpoint(checkpoint);
  const serializedDraft = JSON.stringify(adapterPayload.syntheticDraft.editorJson);

  assertNoReviewNoteLeak(adapterPayload, note.body);
  assert.equal(serializedDraft.includes(note.body), false);
});

test("review note state records no server writes or localStorage", () => {
  const { state } = createReviewStateWithNote();
  const validation = validateSyntheticReviewNoteState(state);

  assert.equal(validation.ok, true);
  assert.equal(state.safety.serverWrites, false);
  assert.equal(state.safety.localStorage, false);
  assert.equal(state.safety.sourceTextMutation, false);
  assert.equal(state.safety.productionManuscriptEditing, false);
  assert.equal(state.safety.durableAnnotation, false);
});
