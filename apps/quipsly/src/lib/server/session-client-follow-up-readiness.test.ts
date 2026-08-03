/** @jest-environment node */

import {
  CLIENT_FOLLOW_UP_MANIFEST_SCHEMA,
  CLIENT_FOLLOW_UP_SCHEMA,
  clientFollowUpDraftReadiness,
  clientFollowUpSha256,
} from "./session-client-follow-up";

function fixture() {
  const roomId = "room-1";
  const recipientUserId = "client-1";
  const note = {
    id: "note-1",
    title: "Practice evidence",
    body: "Bring one concrete example.",
    kind: "FOLLOW_UP",
    sourceJson: null,
    updatedAt: new Date("2026-08-03T12:00:00.000Z"),
    _count: { revisions: 1 },
  };
  const body: Record<string, any> = {
    schema: CLIENT_FOLLOW_UP_SCHEMA,
    title: "Coaching follow-up",
    intro: null,
    session: { id: roomId, title: "Coaching Session", scheduledStart: null },
    notes: [{
      id: note.id,
      title: note.title,
      body: note.body,
      kind: note.kind,
      sourceAnchor: null,
    }],
    goals: [],
    tasks: [],
    nextSessionFocus: null,
  };
  const sourceManifest = {
    schema: CLIENT_FOLLOW_UP_MANIFEST_SCHEMA,
    roomId,
    recipientUserId,
    records: {
      notes: [{
        id: note.id,
        revisionCount: 1,
        updatedAt: note.updatedAt.toISOString(),
        sourceAnchor: null,
        contentSha256: clientFollowUpSha256({
          title: note.title,
          body: note.body,
          kind: note.kind,
          sourceAnchor: null,
        }),
      }],
      goals: [],
      tasks: [],
    },
    boundaries: { snapshotHashCanonical: true },
  };
  return {
    output: {
      id: "follow-up-1",
      roomId,
      recipientUserId,
      status: "DRAFT",
      revision: 2,
      bodyJson: body,
      sourceManifestJson: sourceManifest,
      contentSha256: clientFollowUpSha256(body),
    },
    records: { notes: [note], goals: [], tasks: [] },
  };
}

describe("client follow-up release readiness", () => {
  it("allows only an intact draft whose selected canonical records still match", () => {
    expect(clientFollowUpDraftReadiness(fixture())).toEqual({
      status: "READY",
      releaseAllowed: true,
      checkedRevision: 2,
      selectedCount: 1,
      changedCount: 0,
      changes: [],
    });
  });

  it("identifies changed and no-longer-eligible canonical records", () => {
    const changed = fixture();
    changed.records.notes[0].body = "A later canonical edit.";
    expect(clientFollowUpDraftReadiness(changed)).toMatchObject({
      status: "SOURCE_CHANGED",
      releaseAllowed: false,
      changedCount: 1,
      changes: [{
        kind: "NOTE",
        id: "note-1",
        label: "Practice evidence",
        reason: "CONTENT_CHANGED",
      }],
    });

    const ineligible = fixture();
    ineligible.records.notes = [];
    expect(clientFollowUpDraftReadiness(ineligible)).toMatchObject({
      releaseAllowed: false,
      changes: [{ kind: "NOTE", id: "note-1", reason: "NO_LONGER_ELIGIBLE" }],
    });
  });

  it("fails closed when the frozen body, manifest, or selection integrity changes", () => {
    const tamperedBody = fixture();
    tamperedBody.output.bodyJson.intro = "Changed without replacing the hash.";
    expect(clientFollowUpDraftReadiness(tamperedBody)).toMatchObject({
      releaseAllowed: false,
      changes: expect.arrayContaining([
        expect.objectContaining({ kind: "FOLLOW_UP", reason: "SNAPSHOT_INVALID" }),
      ]),
    });

    const mismatchedSelection = fixture();
    mismatchedSelection.output.bodyJson.notes = [];
    mismatchedSelection.output.contentSha256 = clientFollowUpSha256(mismatchedSelection.output.bodyJson);
    expect(clientFollowUpDraftReadiness(mismatchedSelection)).toMatchObject({
      releaseAllowed: false,
      changes: expect.arrayContaining([
        expect.objectContaining({ kind: "FOLLOW_UP", reason: "SELECTION_MISMATCH" }),
      ]),
    });
  });
});
