import {recordingEditHistory, reduceRecordingEditHistory, type RecordingEditDraft} from "./recording-edit-history";

const initial: RecordingEditDraft = {
  selected: new Set(["audio"]), startSeconds: 0, endSeconds: 30, title: "Session",
  outputMediaKind: "audio", primaryVideoSourceId: "", excludedTranscriptKeys: new Set(),
};

it("undoes and redoes a multi-field edit atomically without changing sources", () => {
  const start = recordingEditHistory(initial);
  const edited = reduceRecordingEditHistory(start, {type: "change", at: 1, update: {outputMediaKind: "video", primaryVideoSourceId: "camera", selected: new Set(["audio", "camera"])}});
  expect(reduceRecordingEditHistory(edited, {type: "undo"}).present).toEqual(initial);
  expect(reduceRecordingEditHistory(reduceRecordingEditHistory(edited, {type: "undo"}), {type: "redo"}).present).toEqual(edited.present);
  expect(initial.selected).toEqual(new Set(["audio"]));
});

it("coalesces a short slider drag but separates later edits", () => {
  let state = recordingEditHistory(initial);
  state = reduceRecordingEditHistory(state, {type: "change", group: "start", at: 1000, update: {startSeconds: 1}});
  state = reduceRecordingEditHistory(state, {type: "change", group: "start", at: 1200, update: {startSeconds: 2}});
  state = reduceRecordingEditHistory(state, {type: "change", group: "start", at: 2200, update: {startSeconds: 3}});
  expect(state.past.map(draft => draft.startSeconds)).toEqual([0, 2]);
  expect(reduceRecordingEditHistory(state, {type: "undo"}).present.startSeconds).toBe(2);
});

it("preserves redo through no-ops and drops it for a new edit", () => {
  let state = reduceRecordingEditHistory(recordingEditHistory(initial), {type: "change", at: 1, update: {startSeconds: 2}});
  state = reduceRecordingEditHistory(state, {type: "undo"});
  expect(reduceRecordingEditHistory(state, {type: "change", at: 2, update: {selected: new Set(["audio"])}})).toBe(state);
  expect(reduceRecordingEditHistory(state, {type: "change", at: 3, update: {endSeconds: 20}}).future).toEqual([]);
});

it("resets history for a different baseline and bounds memory", () => {
  let state = recordingEditHistory(initial);
  for (let index = 1; index <= 150; index++) state = reduceRecordingEditHistory(state, {type: "change", at: index, update: {title: `Edit ${index}`}});
  expect(state.past).toHaveLength(100);
  expect(reduceRecordingEditHistory(state, {type: "reset", draft: initial})).toEqual(recordingEditHistory(initial));
});
