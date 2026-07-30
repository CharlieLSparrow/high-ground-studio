import {
  assertMutableWritingBlock,
  isImmutableAnnotationEvidenceExternalId,
  isImmutableSourceEvidenceExternalId,
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

  it("pins canonical Research evidence without freezing its separate response block", () => {
    expect(isImmutableAnnotationEvidenceExternalId("annotation-evidence:source-1")).toBe(true);
    expect(isImmutableAnnotationEvidenceExternalId("annotation-response:source-1")).toBe(false);
    expect(isImmutableSourceEvidenceExternalId("annotation-evidence:source-1")).toBe(true);
    expect(isImmutableSourceEvidenceExternalId("transcript:job-1:segment-1")).toBe(true);
    expect(isImmutableSourceEvidenceExternalId("annotation:source-1")).toBe(false);
    expect(() => assertMutableWritingBlock("annotation-evidence:source-1")).toThrow(
      "Research source evidence is immutable",
    );
    expect(() => assertMutableWritingBlock("annotation-response:source-1")).not.toThrow();
  });
});
