import {
  voiceWritingDocumentStats,
  voiceWritingSectionCountLabel,
} from "./voice-writing-document-insights";

describe("voice writing document insights", () => {
  it("counts readable words without treating punctuation as content", () => {
    expect(voiceWritingDocumentStats("Homer’s paper — chapter 1. It can't wait.")).toEqual({
      wordCount: 7,
      estimatedReadingMinutes: 1,
    });
    expect(voiceWritingDocumentStats("   \n\t ")).toEqual({
      wordCount: 0,
      estimatedReadingMinutes: 0,
    });
  });

  it("uses a calm rounded-up reading estimate for long drafts", () => {
    const words = Array.from({ length: 401 }, (_, index) => `word${index}`).join(" ");
    expect(voiceWritingDocumentStats(words)).toEqual({
      wordCount: 401,
      estimatedReadingMinutes: 3,
    });
    expect(voiceWritingDocumentStats("one two three", 2).estimatedReadingMinutes).toBe(2);
  });

  it("labels a collapsed outline without awkward grammar", () => {
    expect(voiceWritingSectionCountLabel(0)).toBe("0 sections");
    expect(voiceWritingSectionCountLabel(1)).toBe("1 section");
    expect(voiceWritingSectionCountLabel(4)).toBe("4 sections");
  });
});
