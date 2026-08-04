/** @jest-environment node */

import { buildAudioTreatmentTargetLocator, newAudioTreatmentJob } from "@high-ground/quipsly-media-processing";

import { toPublicAudioTreatmentStatus } from "./audio-treatment";

jest.mock("server-only", () => ({}));

const source = { assetId: "asset_treatment_privacy_001", provider: "local" as const, locator: "/private/quipsly/source.wav", generation: `sha256:${"a".repeat(64)}`, sha256: "a".repeat(64), sizeBytes: 48_000, contentType: "audio/wav" };
const job = newAudioTreatmentJob({
  jobId: "audio_treatment_privacy_001",
  projectId: "project_treatment_privacy_001",
  requestedByEmail: "private-editor@example.test",
  queuedAt: "2026-08-04T12:00:00.000Z",
  source,
  triggerDiagnosisId: "diagnosis_treatment_privacy_001",
  profileId: "dc-rumble-correction-v1",
  target: { provider: "local", locator: buildAudioTreatmentTargetLocator({ assetId: source.assetId, sourceSha256: source.sha256, profileId: "dc-rumble-correction-v1" }), contentType: "audio/wav", codec: "pcm_s24le", sampleRateHz: 48_000, variantKind: "audio-treatment-preview" },
});

describe("public audio treatment status", () => {
  it("does not expose private source, hash, target, requester, or worker authority", () => {
    const status = toPublicAudioTreatmentStatus({ id: job.jobId, status: "queued", inputJson: job, resultJson: null, error: null, updatedAt: new Date("2026-08-04T12:00:01.000Z") });
    const serialized = JSON.stringify(status);
    expect(serialized).not.toContain(source.locator);
    expect(serialized).not.toContain(source.sha256);
    expect(serialized).not.toContain(job.target.locator);
    expect(serialized).not.toContain(job.requestedByEmail);
    expect(serialized).not.toContain("executionId");
  });

  it("fails closed when a completed row has no valid evidence receipt", () => {
    const status = toPublicAudioTreatmentStatus({ id: job.jobId, status: "completed", inputJson: job, resultJson: { state: "completed", receipt: { malformed: true } }, error: null, updatedAt: new Date("2026-08-04T12:00:01.000Z") });
    expect(status.status).toBe("failed");
    expect(status.error).toBe("Audio treatment evidence failed integrity validation.");
  });
});
