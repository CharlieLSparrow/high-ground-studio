import {
  normalizeSessionPurpose,
  sessionExperienceForPurpose,
} from "./session-experience";

describe("session experience", () => {
  it("uses the canonical CallRoom purpose instead of title heuristics", () => {
    expect(sessionExperienceForPurpose("PODCAST")).toMatchObject({
      kind: "episode",
      captureProfile: "episode",
      defaultCamera: true,
    });
    expect(sessionExperienceForPurpose("COACHING")).toMatchObject({
      kind: "coaching",
      captureProfile: "coaching",
      defaultCamera: false,
    });
  });

  it("keeps research and internal meetings distinct while using the audio-first capture profile", () => {
    expect(sessionExperienceForPurpose("RESEARCH_INTERVIEW")).toMatchObject({
      kind: "research",
      captureProfile: "coaching",
    });
    expect(sessionExperienceForPurpose("INTERNAL_MEETING")).toMatchObject({
      kind: "meeting",
      captureProfile: "coaching",
    });
  });

  it("normalizes calendar aliases without silently turning unknown values into podcast episodes", () => {
    expect(normalizeSessionPurpose("PODCAST_PRODUCTION")).toBe("PODCAST");
    expect(normalizeSessionPurpose("unknown future purpose")).toBe("COACHING");
  });
});
