/** @jest-environment node */

import { ensureMobileCaptureAudioAnalysisQueued } from "./mobile-capture-audio-analysis";
import { finalizeMobileCaptureDatabaseEvidence } from "./mobile-capture-resumable-finalization";
import {
  computeMobileCaptureObjectSha256,
  getMobileCaptureObjectEvidence,
  loadMobileCaptureResumableManifest,
  saveMobileCaptureResumableManifest,
} from "./mobile-capture-resumable-store";
import { evaluateMobileCaptureRoomReadiness } from "./mobile-capture-room-readiness";
import {
  AUTOMATIC_CAPTURE_RELEASE_REASON,
  reconcileHeldMobileCaptureRelease,
  runHeldMobileCaptureReleaseMaintenance,
} from "./mobile-capture-held-release-worker";

jest.mock("server-only", () => ({}));
jest.mock("./mobile-capture-audio-analysis", () => ({
  ensureMobileCaptureAudioAnalysisQueued: jest.fn(),
}));
jest.mock("./mobile-capture-resumable-finalization", () => ({
  finalizeMobileCaptureDatabaseEvidence: jest.fn(),
}));
jest.mock("./mobile-capture-resumable-store", () => ({
  computeMobileCaptureObjectSha256: jest.fn(),
  getMobileCaptureObjectEvidence: jest.fn(),
  loadMobileCaptureResumableManifest: jest.fn(),
  saveMobileCaptureResumableManifest: jest.fn(),
}));
jest.mock("./mobile-capture-room-readiness", () => ({
  evaluateMobileCaptureRoomReadiness: jest.fn(),
}));

const now = new Date("2026-09-01T12:00:00.000Z");
const receipt = {
  uploadSessionId: "8c951836-3337-467f-b0f5-eb8b57527ff8",
  captureId: "c54f2a32-d86a-4de7-a78f-f195df2a9c34",
  roomId: "room-1",
  actorUserId: "coach-1",
  processingDisposition: "HELD",
  transcriptDisposition: "HELD",
  releaseReason: null,
  transcriptReleaseReason: null,
  metadataJson: {},
};
const manifest = {
  uploadSessionId: receipt.uploadSessionId,
  captureId: receipt.captureId,
  callRoomId: receipt.roomId,
  actorUserId: receipt.actorUserId,
  recordingConsentId: "consent-1",
  sourceType: "audio",
  status: "verified",
  verification: {
    generation: "42",
    verifiedSizeBytes: 48_000,
    computedSha256: "a".repeat(64),
    crc32c: null,
    md5Hash: null,
  },
  sha256: "a".repeat(64),
  bucketName: "quipsly-media",
  objectName: "capture/source.m4a",
  startReceiptId: null,
  consentVersion: null,
  updatedAt: "2026-09-01T11:00:00.000Z",
  finalization: {
    processingDisposition: "HELD",
    transcriptDisposition: "HELD",
  },
};
const objectEvidence = {
  generation: "42",
  sizeBytes: 48_000,
  crc32c: null,
  md5Hash: null,
  storageBackend: "gcs",
};

function prisma() {
  return {
    mobileCaptureFinalizationReceipt: {
      findMany: jest.fn().mockResolvedValue([receipt]),
      findUnique: jest.fn().mockResolvedValue({ metadataJson: {} }),
      update: jest.fn().mockResolvedValue({}),
    },
  };
}

describe("automatic held Capture release", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(loadMobileCaptureResumableManifest).mockResolvedValue({
      manifest: manifest as never,
      generation: "7",
    });
    jest.mocked(evaluateMobileCaptureRoomReadiness).mockResolvedValue({
      allPartiesCurrentlyReady: true,
      allPartiesCurrentlyAllowTranscription: true,
      actorConsentId: "consent-1",
    } as never);
    jest.mocked(getMobileCaptureObjectEvidence).mockResolvedValue(objectEvidence as never);
    jest.mocked(computeMobileCaptureObjectSha256).mockResolvedValue({
      streamedBytes: 48_000,
      sha256: "a".repeat(64),
    });
    jest.mocked(finalizeMobileCaptureDatabaseEvidence).mockResolvedValue({
      processingDisposition: "RELEASED",
      transcriptDisposition: "RELEASED",
    } as never);
    jest.mocked(saveMobileCaptureResumableManifest).mockImplementation(async (saved) => ({
      manifest: saved,
      generation: "8",
    }));
    jest.mocked(ensureMobileCaptureAudioAnalysisQueued).mockResolvedValue({ status: "queued" } as never);
  });

  it("waits silently while any participant has not granted ordinary in-app consent", async () => {
    jest.mocked(evaluateMobileCaptureRoomReadiness).mockResolvedValueOnce({
      allPartiesCurrentlyReady: false,
      allPartiesCurrentlyAllowTranscription: false,
      actorConsentId: "consent-1",
    } as never);

    await expect(reconcileHeldMobileCaptureRelease({
      prisma: prisma(),
      receipt,
      now,
    })).resolves.toEqual({
      status: "waiting-for-consent",
      releasedMedia: false,
      releasedTranscript: false,
    });
    expect(getMobileCaptureObjectEvidence).not.toHaveBeenCalled();
    expect(finalizeMobileCaptureDatabaseEvidence).not.toHaveBeenCalled();
  });

  it("releases media and transcription automatically after consent converges and exact bytes reverify", async () => {
    const client = prisma();

    await expect(reconcileHeldMobileCaptureRelease({
      prisma: client,
      receipt,
      now,
    })).resolves.toEqual({
      status: "released",
      releasedMedia: true,
      releasedTranscript: true,
    });
    expect(finalizeMobileCaptureDatabaseEvidence).toHaveBeenCalledWith(expect.objectContaining({
      prisma: client,
      actorIsStaff: true,
      processingDecision: expect.objectContaining({
        disposition: "RELEASED",
        transcriptDisposition: "RELEASED",
        releaseAudit: {
          releasedByUserId: "coach-1",
          releaseReason: AUTOMATIC_CAPTURE_RELEASE_REASON,
          releasedAt: now.toISOString(),
        },
        transcriptReleaseAudit: {
          releasedByUserId: "coach-1",
          releaseReason: AUTOMATIC_CAPTURE_RELEASE_REASON,
          releasedAt: now.toISOString(),
        },
      }),
    }));
    expect(saveMobileCaptureResumableManifest).toHaveBeenCalledWith(
      expect.objectContaining({
        finalization: expect.objectContaining({
          processingDisposition: "RELEASED",
          transcriptDisposition: "RELEASED",
        }),
      }),
      "7",
    );
    expect(client.mobileCaptureFinalizationReceipt.update).toHaveBeenCalledWith({
      where: { uploadSessionId: receipt.uploadSessionId },
      data: {
        metadataJson: {
          automaticRelease: expect.objectContaining({
            controlManifestStatus: "ready",
          }),
        },
      },
    });
  });

  it("uses immutable GCS generation and CRC32C evidence without redownloading a current source", async () => {
    jest.mocked(loadMobileCaptureResumableManifest).mockResolvedValueOnce({
      manifest: {
        ...manifest,
        verification: {
          ...manifest.verification,
          crc32c: "ImIEBA==",
        },
      } as never,
      generation: "7",
    });
    jest.mocked(getMobileCaptureObjectEvidence).mockResolvedValueOnce({
      ...objectEvidence,
      crc32c: "ImIEBA==",
    } as never);

    await expect(reconcileHeldMobileCaptureRelease({
      prisma: prisma(),
      receipt,
      now,
    })).resolves.toMatchObject({ status: "released" });
    expect(computeMobileCaptureObjectSha256).not.toHaveBeenCalled();
    expect(finalizeMobileCaptureDatabaseEvidence).toHaveBeenCalledTimes(1);
  });

  it("never releases when the retained object no longer matches its immutable receipt", async () => {
    jest.mocked(computeMobileCaptureObjectSha256).mockResolvedValueOnce({
      streamedBytes: 48_000,
      sha256: "b".repeat(64),
    });

    await expect(reconcileHeldMobileCaptureRelease({
      prisma: prisma(),
      receipt,
      now,
    })).resolves.toEqual({
      status: "source-integrity-failed",
      releasedMedia: false,
      releasedTranscript: false,
    });
    expect(finalizeMobileCaptureDatabaseEvidence).not.toHaveBeenCalled();
  });

  it("honors a consent revocation that arrives while a long source is being rehashed", async () => {
    jest.mocked(evaluateMobileCaptureRoomReadiness)
      .mockResolvedValueOnce({
        allPartiesCurrentlyReady: true,
        allPartiesCurrentlyAllowTranscription: true,
        actorConsentId: "consent-1",
      } as never)
      .mockResolvedValueOnce({
        allPartiesCurrentlyReady: false,
        allPartiesCurrentlyAllowTranscription: false,
        actorConsentId: "consent-1",
      } as never);

    await expect(reconcileHeldMobileCaptureRelease({
      prisma: prisma(),
      receipt,
      now,
    })).resolves.toEqual({
      status: "waiting-for-consent",
      releasedMedia: false,
      releasedTranscript: false,
    });
    expect(computeMobileCaptureObjectSha256).toHaveBeenCalledTimes(1);
    expect(finalizeMobileCaptureDatabaseEvidence).not.toHaveBeenCalled();
  });

  it("isolates one recovery failure and keeps the maintenance pass observable", async () => {
    const client = prisma();
    jest.mocked(loadMobileCaptureResumableManifest).mockRejectedValueOnce(
      new Error("temporary storage outage"),
    );

    await expect(runHeldMobileCaptureReleaseMaintenance({
      prisma: client,
      limit: 8,
      now,
    })).resolves.toMatchObject({
      scanned: 1,
      attempted: 1,
      releasedMedia: 0,
      releasedTranscripts: 0,
      failed: 1,
    });
  });

  it("rotates consent-waiting receipts so one old Session cannot starve newer recoveries", async () => {
    const client = prisma();
    jest.mocked(evaluateMobileCaptureRoomReadiness).mockResolvedValueOnce({
      allPartiesCurrentlyReady: false,
      allPartiesCurrentlyAllowTranscription: false,
      actorConsentId: "consent-1",
    } as never);

    await expect(runHeldMobileCaptureReleaseMaintenance({
      prisma: client,
      limit: 8,
      now,
    })).resolves.toMatchObject({ waiting: 1, failed: 0 });
    expect(client.mobileCaptureFinalizationReceipt.update).toHaveBeenCalledWith({
      where: { uploadSessionId: receipt.uploadSessionId },
      data: {
        metadataJson: {
          automaticRelease: expect.objectContaining({
            lastCheckStatus: "waiting-for-consent",
            lastCheckedAt: now.toISOString(),
          }),
        },
      },
    });
  });
});
