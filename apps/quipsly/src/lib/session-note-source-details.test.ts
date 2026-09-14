import {sessionNoteSourceDetails} from "./session-note-source-details";

it("links a whole-session recap without inventing a source timestamp", () => {
  expect(sessionNoteSourceDetails("room", {roomId: "room", recordingAssetId: "recording", origin: "quipsly-session-follow-through", automaticallyCreated: true}))
    .toMatchObject({originLabel: "From the transcript", sourceHref: "/sessions/room?mode=transcript&source=recording", sourceAnchor: null});
});
it("does not expose a source from another session", () => {
  expect(sessionNoteSourceDetails("room", {roomId: "other", origin: "quipsly-session-follow-through", automaticallyCreated: true}))
    .toMatchObject({originLabel: "Session note", sourceHref: null, sourceAnchor: null, lastMergedSource: null});
});
it("distinguishes conversation work from a transcript recap", () => {
  expect(sessionNoteSourceDetails("room", {roomId: "room", schema: "quipsly-session-work-entry-v1", sourceMessageId: "message"}))
    .toMatchObject({originLabel: "From conversation", sourceHref: "/sessions/room?mode=conversation&message=message#conversation-message-message"});
});
