/** @jest-environment node */

import { newAudioSpectralEvidenceJob } from "@high-ground/quipsly-media-processing";

import { toPublicAudioSpectralStatus } from "./audio-spectral-evidence";

jest.mock("server-only", () => ({}));

const source = {
  assetId: "asset_spectral_privacy_001",
  provider: "local" as const,
  locator: "/private/quipsly/immutable-source.wav",
  generation: `sha256:${"a".repeat(64)}`,
  sha256: "a".repeat(64),
  sizeBytes: 123_456,
  contentType: "audio/wav",
};
const job = newAudioSpectralEvidenceJob({ jobId: "audio_spectral_privacy_001", projectId: "project_spectral_privacy_001", requestedByEmail: "private@example.test", queuedAt: "2026-08-04T15:00:00.000Z", source });

describe("public audio spectral evidence status", () => {
  it("never exposes source paths, hashes, requester identity, or pack locators", () => {
    const status = toPublicAudioSpectralStatus({ id: job.jobId, status: "queued", inputJson: job, resultJson: null, error: null, updatedAt: new Date() });
    const serialized = JSON.stringify(status);
    expect(serialized).not.toContain(source.locator);
    expect(serialized).not.toContain(source.sha256);
    expect(serialized).not.toContain(job.requestedByEmail);
    expect(serialized).not.toContain("locator");
  });

  it("fails closed when completed storage lacks a valid source-bound receipt", () => {
    const status = toPublicAudioSpectralStatus({ id: job.jobId, status: "completed", inputJson: job, resultJson: { receipt: { malformed: true } }, error: null, updatedAt: new Date() });
    expect(status.status).toBe("failed");
    expect(status.media).toBeNull();
    expect(status.pyramid).toBeNull();
    expect(status.error).toBe("Audio spectral evidence failed integrity validation.");
  });
});
