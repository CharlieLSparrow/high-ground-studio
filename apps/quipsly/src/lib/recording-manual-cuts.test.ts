import {parseRecordingManualCuts} from "./recording-manual-cuts";
import {serializeRecordingEdit, restoreRecordingEdit} from "./recording-edit-draft";
import {recordingEditHistory, reduceRecordingEditHistory} from "./recording-edit-history";
import {recordingEditKey} from "./recording-edit-sync";

test("manual cuts survive save, reload and undo without changing source selection", () => {
  const original = {selected: new Set(["source"]), startSeconds: 0, endSeconds: 30, title: "Session", outputMediaKind: "audio" as const, primaryVideoSourceId: "", excludedTranscriptKeys: new Set<string>()};
  const manualCuts = [{startSeconds: 3, endSeconds: 8}];
  const edited = reduceRecordingEditHistory(recordingEditHistory(original), {type: "change", at: 1, update: {manualCuts}});
  expect(restoreRecordingEdit(serializeRecordingEdit(edited.present, true))).toMatchObject({manualCuts, selected: original.selected});
  expect(recordingEditKey(serializeRecordingEdit(edited.present, true))).not.toEqual(recordingEditKey(serializeRecordingEdit(original, true)));
  const undone = reduceRecordingEditHistory(edited, {type: "undo"});
  expect(undone.present).toEqual(original);
  expect(reduceRecordingEditHistory(undone, {type: "redo"}).present.manualCuts).toEqual(manualCuts);
});

test.each([null, "3-8", [{startSeconds: "3", endSeconds: 8}], [{startSeconds: -1, endSeconds: 8}], [{startSeconds: 3, endSeconds: Infinity}], [{startSeconds: 8, endSeconds: 3}], [{startSeconds: 0, endSeconds: 31}], Array(501).fill({startSeconds: 1, endSeconds: 2})])("rejects invalid or unbounded cuts %#", value => {
  expect(() => parseRecordingManualCuts(value, 30)).toThrow(RangeError);
});

test("legacy drafts have no cuts and arbitrary metadata is not persisted", () => {
  expect(parseRecordingManualCuts(undefined, 30)).toEqual([]);
  expect(parseRecordingManualCuts([{startSeconds: 3, endSeconds: 8, actor: "someone-else"}], 30)).toEqual([{startSeconds: 3, endSeconds: 8}]);
});
