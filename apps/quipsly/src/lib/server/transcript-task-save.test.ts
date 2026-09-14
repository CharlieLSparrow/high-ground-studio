import { planTranscriptTaskSave, readTranscriptTaskFields, readTranscriptTaskSave } from "./transcript-task-save";

const original = { title: "Write one page", detail: "Start tomorrow" };
const revised = { ...original, title: "Write two pages" };

test("multiple lost replies use the last applied client revision", () => {
  expect(planTranscriptTaskSave({ previous: { revision: 0, fields: original }, revision: 1,
    desired: revised, current: original })).toEqual({ kind: "amend", fields: revised });
  const latest = { ...revised, title: "Write three pages" };
  expect(planTranscriptTaskSave({ previous: { revision: 1, fields: revised }, revision: 2,
    desired: latest, current: revised })).toEqual({ kind: "amend", fields: latest });
});

test("unchanged fields retain other edits and exact retries never overwrite canonical state", () => {
  const current = { ...original, detail: "Added in the browser" };
  expect(planTranscriptTaskSave({ previous: { revision: 0, fields: original }, revision: 3,
    desired: revised, current })).toEqual({ kind: "amend", fields: { ...revised, detail: current.detail } });
  expect(planTranscriptTaskSave({ previous: { revision: 0, fields: original }, revision: 0,
    desired: original, current: { title: "Edited elsewhere", detail: null } })).toEqual({ kind: "replay" });
});

test("rejects stale, reused, and overlapping revisions without discarding either version", () => {
  for (const [revision, desired, current] of [
    [0, original, revised], [1, original, revised],
    [2, { ...revised, title: "New title" }, { ...revised, title: "Other edit" }],
  ] as const) {
    expect(planTranscriptTaskSave({ previous: { revision: 1, fields: revised }, revision, desired, current }))
      .toEqual({ kind: "conflict" });
  }
});

test("normalizes fields, allows clearing details, and rejects rather than truncates writing", () => {
  expect(readTranscriptTaskFields({ title: " One page ", detail: "   " })).toEqual({ title: "One page", detail: null });
  for (const value of [{ title: " " }, { title: "a".repeat(501) }, { title: "A", detail: "b".repeat(5001) },
    { title: "A", detail: 4 }]) expect(readTranscriptTaskFields(value)).toBeNull();
  for (const revision of [-1, 0.1, "1", Number.MAX_SAFE_INTEGER + 1]) {
    expect(readTranscriptTaskSave({ revision, original })).toBeNull();
  }
  expect(planTranscriptTaskSave({ previous: { revision: 0, fields: original }, revision: 1,
    desired: { ...original, detail: null }, current: original })).toEqual({ kind: "amend", fields: { ...original, detail: null } });
});
