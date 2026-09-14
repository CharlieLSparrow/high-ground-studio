import { reconcileNoteText } from "./note-text-reconcile";

describe("exact collaborative note reconciliation", () => {
  it.each([
    ["Draft", "Draft", "New draft", "New draft"],
    ["Draft", "New draft", "Draft", "New draft"],
    ["Draft", "Same revision", "Same revision", "Same revision"],
    ["Agenda\nOne\nTwo", "Agenda\nFirst\nTwo", "Agenda\nOne\nSecond", "Agenda\nFirst\nSecond"],
    ["Beginning\nMiddle\nEnd", "Opening\nMiddle\nEnd", "Beginning\nMiddle\nEnd\nNext step", "Opening\nMiddle\nEnd\nNext step"],
    ["One\nTwo\nThree", "One\nThree", "First\nTwo\nThree", "First\nThree"],
    ["🌱 Plan\n☕ Break", "🌱 New plan\n☕ Break", "🌱 Plan\n☕ Rest", "🌱 New plan\n☕ Rest"],
  ])("preserves compatible edits %#", (base, local, remote, expected) => {
    expect(reconcileNoteText(base, local, remote)).toBe(expected);
    expect(reconcileNoteText(base, remote, local)).toBe(expected);
  });
  it.each([
    ["Call tomorrow", "Call Friday", "Call Monday"],
    ["Notes", "Notes from Casey", "Notes from Riley"],
    ["Two paths", "", "Three paths"],
  ])("keeps genuinely competing edits for comparison %#", (base, local, remote) => {
    expect(reconcileNoteText(base, local, remote)).toBeNull();
  });
  it("does not allow merged text to exceed the note limit", () => {
    const base = "a".repeat(19_998);
    expect(reconcileNoteText(base, `start${base}`, `${base}end`)).toBeNull();
  });
});
