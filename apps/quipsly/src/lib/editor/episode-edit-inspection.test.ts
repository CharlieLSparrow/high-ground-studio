import {
  episodeEditExecutionInspection,
  projectEpisodeEditProcessingJob,
  projectEpisodeEditTranscript,
} from "./episode-edit-inspection";

describe("Episode edit inspection projections", () => {
  it("projects canonical source-clock transcript evidence without changing provider words", () => {
    expect(projectEpisodeEditTranscript({ transcript: [{
      id: "line-1",
      sourceStartSeconds: 2.25,
      sourceEndSeconds: 4.5,
      text: "Provider words stay unchanged.",
      speaker: "Charlie",
      reviewStatus: "human-reviewed",
      sourceTranscriptJobId: "transcript-1",
      sourceSegmentId: "segment-1",
    }] })).toEqual(expect.objectContaining({
      status: "available",
      sourceFormat: "transcript",
      segmentCount: 1,
      reviewedSegmentCount: 1,
      segments: [expect.objectContaining({
        id: "line-1",
        startSeconds: 2.25,
        endSeconds: 4.5,
        text: "Provider words stay unchanged.",
        speakerLabel: "Charlie",
      })],
    }));
  });

  it("supports retained block and nested timeline shapes", () => {
    expect(projectEpisodeEditTranscript({ blocks: [{ time: 5, duration: 2, body: "Legacy block" }] }))
      .toEqual(expect.objectContaining({ status: "available", sourceFormat: "blocks", segmentCount: 1 }));
    expect(projectEpisodeEditTranscript({ timeline: { transcript: [{ startSeconds: 8, endSeconds: 9, text: "Nested" }] } }))
      .toEqual(expect.objectContaining({ status: "available", sourceFormat: "timeline.transcript", segmentCount: 1 }));
  });

  it("refuses to invent timing for malformed transcript rows", () => {
    expect(projectEpisodeEditTranscript({ transcript: [{ id: "words-only", text: "No clock" }] }))
      .toEqual(expect.objectContaining({
        status: "unavailable",
        sourceFormat: "transcript",
        segmentCount: 0,
        reason: expect.stringContaining("No timing was inferred"),
      }));
  });

  it("classifies only explicit worker providers and exposes the native heartbeat boundary", () => {
    const job = projectEpisodeEditProcessingJob({
      id: "job-1",
      type: "episode-program-delivery",
      status: "completed",
      inputJson: { source: { provider: "local" } },
      resultJson: null,
      updatedAt: new Date("2026-08-07T08:00:00.000Z"),
      completedAt: new Date("2026-08-07T08:01:00.000Z"),
      error: null,
    });
    expect(job).toEqual(expect.objectContaining({ lane: "local-worker", provider: "local" }));
    expect(episodeEditExecutionInspection([job])).toEqual(expect.objectContaining({
      native: expect.objectContaining({ status: "available-unobserved", detail: expect.stringContaining("heartbeat") }),
      jobs: [job],
    }));
  });
});
