import { presentVoiceWritingTitle } from "./voice-writing-title";

describe("voice writing presentation titles", () => {
  it("replaces a legacy machine-purpose token with the writing itself", () => {
    expect(presentVoiceWritingTitle(
      "PERSONAL_NOTE",
      "A practical framework for calmer coaching conversations starts here.",
    )).toBe("A practical framework for calmer coaching conversations starts here");
  });

  it("falls back calmly when there is not enough writing for a title", () => {
    expect(presentVoiceWritingTitle("field_note", "Too short")).toBe("Voice note");
  });

  it("preserves ordinary authored titles", () => {
    expect(presentVoiceWritingTitle("Personal note", "Different words")).toBe("Personal note");
    expect(presentVoiceWritingTitle("Dissertation methods", "Different words")).toBe("Dissertation methods");
  });
});
