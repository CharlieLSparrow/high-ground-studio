import { newAudioSignalProfileJob } from "@high-ground/quipsly-media-processing";

import { episodeAudioProcessingEvidence } from "./episode-audio-processing-evidence";

const source = {
  assetId: "asset_0001",
  provider: "local" as const,
  locator: "/retained/audio.wav",
  generation: "local-generation-1",
  sha256: "a".repeat(64),
  sizeBytes: 48_000,
  contentType: "audio/wav",
};

describe("episodeAudioProcessingEvidence", () => {
  it("keeps absent work explicitly not queued", () => {
    expect(episodeAudioProcessingEvidence([])).toMatchObject({
      signal: { jobId: null, status: "not-queued", integrityVerified: false },
      transcript: { jobId: null, status: "not-queued", integrityVerified: false },
      alignment: { jobId: null, status: "not-queued", integrityVerified: false },
      mastery: { jobId: null, status: "not-queued", integrityVerified: false },
    });
  });

  it("validates queued exact-source contracts without pretending a result exists", () => {
    const job = newAudioSignalProfileJob({
      jobId: "signal_job_0001",
      projectId: "project_0001",
      requestedByEmail: "producer@example.com",
      queuedAt: "2026-08-06T12:00:00.000Z",
      source,
    });
    expect(episodeAudioProcessingEvidence([{
      id: job.jobId,
      type: "audio-signal-profile",
      status: "queued",
      inputJson: job,
      resultJson: null,
      updatedAt: new Date("2026-08-06T12:00:00.000Z"),
    }]).signal).toMatchObject({
      jobId: "signal_job_0001",
      status: "queued",
      integrityVerified: true,
      durationSeconds: null,
      observationCount: 0,
    });
  });

  it("fails closed when a completed row has no valid result receipt", () => {
    const evidence = episodeAudioProcessingEvidence([{
      id: "signal_job_0002",
      type: "audio-signal-profile",
      status: "completed",
      inputJson: { kind: "not-a-real-contract" },
      resultJson: {},
      updatedAt: new Date("2026-08-06T12:00:00.000Z"),
    }]);
    expect(evidence.signal).toMatchObject({
      status: "failed",
      integrityVerified: false,
      error: "Audio signal evidence failed integrity validation.",
    });
  });
});
