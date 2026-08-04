/** @jest-environment node */

import {
  buildAudioMasteryTargetLocator,
  newAudioMasteryJob,
} from "@high-ground/quipsly-media-processing";

import { toPublicAudioMasteryStatus } from "./audio-mastery";

jest.mock("server-only", () => ({}));

const source = {
  assetId: "asset_privacy_001",
  provider: "local" as const,
  locator: "/private/quipsly/source.wav",
  generation: `sha256:${"a".repeat(64)}`,
  sha256: "a".repeat(64),
  sizeBytes: 48_000,
  contentType: "audio/wav",
};

const job = newAudioMasteryJob({
  jobId: "audio_mastery_privacy_001",
  projectId: "project_privacy_001",
  requestedByEmail: "private-editor@example.test",
  queuedAt: "2026-08-03T20:00:00.000Z",
  source,
  profileId: "apple-podcasts-dialogue-v1",
  target: {
    provider: "local",
    locator: buildAudioMasteryTargetLocator({
      assetId: source.assetId,
      sourceSha256: source.sha256,
      profileId: "apple-podcasts-dialogue-v1",
    }),
    contentType: "audio/wav",
    codec: "pcm_s24le",
    sampleRateHz: 48_000,
    variantKind: "audio-master-preview",
  },
});

describe("public audio mastery status", () => {
  it("does not expose private source, worker, hash, or requester fields", () => {
    const status = toPublicAudioMasteryStatus({
      id: job.jobId,
      status: "queued",
      inputJson: job,
      resultJson: null,
      error: null,
      updatedAt: new Date("2026-08-03T20:00:01.000Z"),
    });
    const serialized = JSON.stringify(status);
    expect(serialized).not.toContain(source.locator);
    expect(serialized).not.toContain(source.sha256);
    expect(serialized).not.toContain(job.requestedByEmail);
    expect(serialized).not.toContain("executionId");
    expect(serialized).not.toContain("providerSourceId");
  });

  it("fails closed when a completed row has no valid evidence receipt", () => {
    const status = toPublicAudioMasteryStatus({
      id: job.jobId,
      status: "completed",
      inputJson: job,
      resultJson: { state: "completed", receipt: { malformed: true } },
      error: null,
      updatedAt: new Date("2026-08-03T20:00:01.000Z"),
    });
    expect(status.status).toBe("failed");
    expect(status.error).toBe("Audio mastery evidence failed integrity validation.");
  });
});
