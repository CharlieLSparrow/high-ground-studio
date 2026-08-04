/** @jest-environment node */

import { newAudioSignalProfileJob } from "@high-ground/quipsly-media-processing";

import { toPublicAudioSignalProfileStatus } from "./audio-signal-profile";

jest.mock("server-only", () => ({}));

const source = {
  assetId: "asset_signal_privacy_001",
  provider: "local" as const,
  locator: "/private/quipsly/canon-source.mov",
  generation: `sha256:${"b".repeat(64)}`,
  sha256: "b".repeat(64),
  sizeBytes: 96_000,
  contentType: "video/quicktime",
};

const job = newAudioSignalProfileJob({
  jobId: "audio_signal_privacy_001",
  projectId: "project_signal_privacy_001",
  requestedByEmail: "private-editor@example.test",
  queuedAt: "2026-08-04T12:00:00.000Z",
  source,
});

describe("public audio signal profile status", () => {
  it("does not expose source locator, hash, requester, or worker identity", () => {
    const status = toPublicAudioSignalProfileStatus({ id: job.jobId, status: "queued", inputJson: job, resultJson: null, error: null, updatedAt: new Date() });
    const serialized = JSON.stringify(status);
    expect(serialized).not.toContain(source.locator);
    expect(serialized).not.toContain(source.sha256);
    expect(serialized).not.toContain(job.requestedByEmail);
    expect(serialized).not.toContain("executionId");
  });

  it("fails closed when a completed row lacks a valid complete-decode receipt", () => {
    const status = toPublicAudioSignalProfileStatus({ id: job.jobId, status: "completed", inputJson: job, resultJson: { receipt: { malformed: true } }, error: null, updatedAt: new Date() });
    expect(status.status).toBe("failed");
    expect(status.audioSignal).toBeNull();
    expect(status.error).toBe("Audio signal evidence failed integrity validation.");
  });
});
