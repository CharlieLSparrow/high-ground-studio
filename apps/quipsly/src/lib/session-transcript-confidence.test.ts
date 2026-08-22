import { buildSessionTranscriptConfidence } from "./session-transcript-confidence";

const hash = "a".repeat(64);

function completeJob() {
  return {
    id: "job-1",
    status: "COMPLETED",
    assetId: "asset-1",
    sourceSha256: hash,
    segments: [
      { startSeconds: 0.2, endSeconds: 2.1, speakerLabel: "speaker_0", corrections: [], verifications: [{ id: "verified-1" }] },
      { startSeconds: 2.2, endSeconds: 5.4, speakerLabel: "speaker_1", corrections: [{ id: "correction-1" }], verifications: [] },
    ],
    speakerAttributions: [
      { providerSpeakerLabel: "speaker_0", status: "active" },
      { providerSpeakerLabel: "speaker_1", status: "active" },
    ],
    _count: { segments: 2, words: 14 },
  };
}

describe("session transcript confidence", () => {
  it("requires exact source, complete timing, reviewed text, and speaker identity before reviewed", () => {
    expect(buildSessionTranscriptConfidence({ job: completeJob(), asset: { id: "asset-1", checksum: hash }, processingAllowed: true })).toMatchObject({
      state: "REVIEWED",
      exactSourceBound: true,
      segmentTimingReady: true,
      wordEditingReady: true,
      speakerAttributionComplete: true,
      humanReviewComplete: true,
      segmentCount: 2,
      wordCount: 14,
    });
  });

  it("fails closed when completed text is bound to different bytes", () => {
    const job = completeJob();
    expect(buildSessionTranscriptConfidence({ job, asset: { id: "asset-1", checksum: "b".repeat(64) }, processingAllowed: true })).toMatchObject({
      state: "NEEDS_ATTENTION",
      exactSourceBound: false,
      wordEditingReady: false,
    });
  });

  it("distinguishes reviewable timed text from completed human review", () => {
    const job = completeJob();
    job.segments[1]!.corrections = [];
    job.speakerAttributions = job.speakerAttributions.slice(0, 1);
    expect(buildSessionTranscriptConfidence({ job, asset: { id: "asset-1", checksum: hash }, processingAllowed: true })).toMatchObject({
      state: "READY_TO_REVIEW",
      exactSourceBound: true,
      reviewedSegmentCount: 1,
      attributedSpeakerClusterCount: 1,
      speakerAttributionComplete: false,
    });
  });

  it("does not claim text editing when immutable word timing is absent", () => {
    const job = completeJob();
    job._count.words = 0;
    expect(buildSessionTranscriptConfidence({ job, asset: { id: "asset-1", checksum: hash }, processingAllowed: true })).toMatchObject({
      state: "REVIEWED",
      segmentTimingReady: true,
      wordEditingReady: false,
    });
  });
});
