/** @jest-environment node */

import { ensureCaptureTranscriptProcessingQueued } from "./capture-transcript-processing";
import { ensureMobileCaptureTranscriptAutoqueued } from "./mobile-capture-transcript-autoqueue";
import type {
  MobileCaptureResumableFinalizationEvidence,
  MobileCaptureResumableManifest,
} from "./mobile-capture-resumable-store";

jest.mock("server-only", () => ({}));
jest.mock("./capture-transcript-processing", () => ({
  ensureCaptureTranscriptProcessingQueued: jest.fn(),
}));

function manifest(overrides: Partial<MobileCaptureResumableManifest> = {}) {
  return {
    actorUserId: "coach-user",
    actorEmail: "coach@example.test",
    sourceProfileJson: null,
    ...overrides,
  } as MobileCaptureResumableManifest;
}

function finalization(overrides: Partial<MobileCaptureResumableFinalizationEvidence> = {}) {
  return {
    processingDisposition: "RELEASED",
    transcriptDisposition: "RELEASED",
    transcriptJobId: "transcript-job-1",
    transcriptJobStatus: "QUEUED",
    ...overrides,
  } as MobileCaptureResumableFinalizationEvidence;
}

describe("automatic Capture transcription handoff", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(ensureCaptureTranscriptProcessingQueued).mockResolvedValue({
      status: "queued",
      transcriptJobId: "transcript-job-1",
      queueObjectName: "capture-transcripts/queue/transcript-job-1.json",
      manifestObjectName: "capture-transcripts/manifests/transcript-job-1.json",
      resultObjectName: "capture-transcripts/results/transcript-job-1.json",
      executionRequested: true,
    });
  });

  it("starts the durable worker outbox after an ordinary released upload", async () => {
    await expect(ensureMobileCaptureTranscriptAutoqueued({
      prisma: { name: "canonical-prisma" },
      manifest: manifest(),
      finalization: finalization(),
    })).resolves.toMatchObject({ status: "queued", executionRequested: true });

    expect(ensureCaptureTranscriptProcessingQueued).toHaveBeenCalledWith({
      prisma: { name: "canonical-prisma" },
      transcriptJobId: "transcript-job-1",
      actorUserId: "coach-user",
      actorEmail: "coach@example.test",
    });
  });

  it("retains the canonical fallback job without purchasing duplicate ASR when the device sidecar is expected", async () => {
    await expect(ensureMobileCaptureTranscriptAutoqueued({
      prisma: { name: "canonical-prisma" },
      manifest: manifest({ onDeviceTranscriptExpected: true }),
      finalization: finalization(),
    })).resolves.toMatchObject({
      status: "device-transcript-expected",
      transcriptJobId: "transcript-job-1",
      executionRequested: false,
    });

    expect(ensureCaptureTranscriptProcessingQueued).not.toHaveBeenCalled();
  });

  it.each([
    ["processing-held", finalization({ processingDisposition: "HELD" })],
    ["transcription-held", finalization({ transcriptDisposition: "HELD" })],
    ["transcript-job-missing", finalization({ transcriptJobId: null })],
    ["transcript-job-not-queueable", finalization({ transcriptJobStatus: "HELD" })],
  ])("does not bypass the %s boundary", async (status, evidence) => {
    await expect(ensureMobileCaptureTranscriptAutoqueued({
      prisma: {},
      manifest: manifest(),
      finalization: evidence,
    })).resolves.toMatchObject({ status, executionRequested: false });
    expect(ensureCaptureTranscriptProcessingQueued).not.toHaveBeenCalled();
  });

  it("waits for independently verified interruption repair", async () => {
    const sourceProfileJson = JSON.stringify({
      schema: "quipsly-source-profile-v1",
      interruptionRecovery: { mediaTailMayBeIncomplete: true },
    });
    await expect(ensureMobileCaptureTranscriptAutoqueued({
      prisma: {},
      manifest: manifest({ sourceProfileJson }),
      finalization: finalization(),
    })).resolves.toMatchObject({
      status: "interruption-repair-pending",
      executionRequested: false,
    });
    expect(ensureCaptureTranscriptProcessingQueued).not.toHaveBeenCalled();
  });

  it("starts the outbox after interruption repair is independently verified", async () => {
    const sourceProfileJson = JSON.stringify({
      interruptionRecovery: { mediaTailMayBeIncomplete: true },
    });
    await expect(ensureMobileCaptureTranscriptAutoqueued({
      prisma: {},
      manifest: manifest({ sourceProfileJson }),
      finalization: finalization(),
      interruptionRepairVerified: true,
    })).resolves.toMatchObject({ status: "queued", executionRequested: true });
    expect(ensureCaptureTranscriptProcessingQueued).toHaveBeenCalledTimes(1);
  });
});
