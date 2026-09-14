/** @jest-environment node */
import { recapCoversTake } from "./session-after-call-work";

const source = {roomId: "room", origin: "quipsly-session-follow-through", recordingAssetId: "coach",
  transcriptSources: [{recordingAssetId: "coach"}, {recordingAssetId: "client"}]};
it("binds the editable recap to exactly the current participant lanes", () => {
  expect(recapCoversTake(source, "room", ["coach", "client"])).toBe(true);
  expect(recapCoversTake(source, "room", ["coach"])).toBe(false);
  expect(recapCoversTake(source, "room", ["new-coach", "new-client"])).toBe(false);
  expect(recapCoversTake(source, "another-room", ["coach", "client"])).toBe(false);
  expect(recapCoversTake(source, "room", [])).toBe(false);
});
it("does not present a one-sided recap as the assembled conversation", () => {
  expect(recapCoversTake({...source, transcriptSources: []}, "room", ["coach", "client"])).toBe(false);
  expect(recapCoversTake({...source, transcriptSources: []}, "room", ["coach"])).toBe(true);
  expect(recapCoversTake({...source, origin: "manual-note"}, "room", ["coach", "client"])).toBe(false);
});
