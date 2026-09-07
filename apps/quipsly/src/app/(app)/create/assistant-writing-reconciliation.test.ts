import { keepLocalWriting } from "./assistant-writing-reconciliation";

it.each([
  ["old", "old", "rewritten", false],
  ["still typing", "old", "rewritten", true],
  ["", "old", "rewritten", true],
  ["rewritten", "old", "rewritten", false],
  ["local text", undefined, "rewritten", true],
])("reconciles local %s against committed %s and assistant %s", (local, committed, saved, keep) => {
  expect(keepLocalWriting(local as string, committed as string | undefined, saved as string)).toBe(keep);
});
