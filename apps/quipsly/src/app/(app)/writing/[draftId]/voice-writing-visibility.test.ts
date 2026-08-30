import {
  voiceWritingAudience,
  voiceWritingMoveVisibility,
  voiceWritingSourceBoundary,
} from "./voice-writing-visibility";

describe("voice writing audience", () => {
  it("keeps writing moved to My Nest personal", () => {
    expect(voiceWritingMoveVisibility({ isHome: true })).toBe("personal");
  });

  it("shares writing moved to another Nest", () => {
    expect(voiceWritingMoveVisibility({ isHome: false })).toBe("nest");
  });

  it("describes personal and shared writing without hiding the audience", () => {
    expect(voiceWritingAudience("personal")).toMatchObject({
      eyebrow: "Only you",
      label: "Only you",
      action: "Share with Nest members",
    });
    expect(voiceWritingAudience("nest")).toMatchObject({
      eyebrow: "Shared writing",
      label: "Nest members",
      action: "Make visible only to me",
    });
  });

  it("keeps the connected source recording private by default", () => {
    expect(voiceWritingSourceBoundary).toContain("unless you share it separately");
  });
});
