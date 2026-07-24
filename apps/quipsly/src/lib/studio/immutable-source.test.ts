import {
  assertMutableWritingBlock,
  isImmutableTranscriptSourceExternalId,
} from "./immutable-source";

describe("immutable transcript writing evidence", () => {
  it("recognizes only the canonical transcript source block identity", () => {
    expect(isImmutableTranscriptSourceExternalId("transcript:job-1:segment-1")).toBe(true);
    expect(isImmutableTranscriptSourceExternalId("transcript-draft:job-1:segment-1")).toBe(false);
    expect(isImmutableTranscriptSourceExternalId("annotation:source-1")).toBe(false);
    expect(isImmutableTranscriptSourceExternalId(null)).toBe(false);
  });

  it("rejects body mutations for transcript source evidence", () => {
    expect(() => assertMutableWritingBlock("transcript:job-1:segment-1")).toThrow(
      "Transcript source evidence is immutable",
    );
    expect(() => assertMutableWritingBlock("transcript-draft:job-1:segment-1")).not.toThrow();
  });
});
