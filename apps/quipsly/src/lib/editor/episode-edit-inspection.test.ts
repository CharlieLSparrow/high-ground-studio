import {
  episodeEditExecutionInspection,
  projectEpisodeEditExecutionWorker,
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
        timelineClock: "source",
        sourceStartSeconds: 2.25,
        sourceEndSeconds: 4.5,
        text: "Provider words stay unchanged.",
        speakerLabel: "Charlie",
      })],
    }));
  });

  it("uses reviewed Episode time while retaining immutable source-clock provenance", () => {
    expect(projectEpisodeEditTranscript({ transcript: [{
      id: "aligned-line",
      time: 102.5,
      duration: 2,
      sourceStartSeconds: 12.5,
      sourceEndSeconds: 14.5,
      text: "This line belongs at the reviewed Episode position.",
      sourceTranscriptJobId: "transcript-1",
      sourceSegmentId: "provider-segment-1",
      acceptedReviewId: "alignment-review-1",
    }] })).toEqual(expect.objectContaining({
      status: "available",
      segments: [expect.objectContaining({
        startSeconds: 102.5,
        endSeconds: 104.5,
        timelineClock: "episode",
        sourceStartSeconds: 12.5,
        sourceEndSeconds: 14.5,
        acceptedReviewId: "alignment-review-1",
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

  it("treats only a current capability heartbeat as an observed local executor", () => {
    const worker = projectEpisodeEditExecutionWorker({
      id: "worker-1",
      hostName: "quipsly-media-worker:Wall-E.local",
      status: "online",
      capabilities: {
        schema: "quipsly-execution-worker-capabilities-v1",
        executorKind: "local-mac",
        buildId: "build-1",
        jobTypes: ["episode-render-proof"],
        renderProfiles: ["episode-edit-proof-1280x720-24fps-v1"],
      },
      lastHeartbeatAt: new Date("2026-08-07T18:00:00.000Z"),
    }, new Date("2026-08-07T18:00:20.000Z"));
    expect(worker).toEqual(expect.objectContaining({ status: "online", executorKind: "local-mac" }));
    expect(episodeEditExecutionInspection([], worker ? [worker] : [])).toEqual(expect.objectContaining({
      native: expect.objectContaining({ status: "observed", detail: expect.stringContaining("24 fps") }),
      workers: [worker],
    }));
  });
});
