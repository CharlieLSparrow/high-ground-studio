/** @jest-environment node */

import { ensureMobileCaptureAudioAnalysisQueued } from "./mobile-capture-audio-analysis";
import { finalizeMobileCaptureDatabaseEvidence } from "./mobile-capture-resumable-finalization";
import {
  computeMobileCaptureObjectSha256,
  getMobileCaptureObjectEvidence,
  loadMobileCaptureResumableManifest,
  saveMobileCaptureResumableManifest,
} from "./mobile-capture-resumable-store";
import {
  authorizePersonalSelfCaptureSource,
  evaluateMobileCaptureProcessingAuthorization,
  isPersonalSelfCaptureProfile,
} from "./mobile-capture-processing-authorization";
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
jest.mock("./mobile-capture-processing-authorization", () => ({
  authorizePersonalSelfCaptureSource: jest.fn(),
  evaluateMobileCaptureProcessingAuthorization: jest.fn(),
  isPersonalSelfCaptureProfile: jest.fn(),
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
  processingDisposition: "eligible",
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
    jest.mocked(isPersonalSelfCaptureProfile).mockReturnValue(false);
    jest.mocked(authorizePersonalSelfCaptureSource).mockResolvedValue({
      ok: false,
      status: 409,
      error: "not a personal source",
    });
    jest.mocked(evaluateMobileCaptureProcessingAuthorization).mockResolvedValue({
      authorized: true,
      reasonCode: "READY",
      reason: "Ready",
      authorization: null,
      readiness: {
        eligibleForProcessing: true,
        allPartiesCurrentlyReady: true,
        allPartiesCurrentlyAllowTranscription: true,
        actorConsentId: "consent-1",
        startReceiptId: null,
        startConsentVersion: null,
      },
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
    jest.mocked(evaluateMobileCaptureProcessingAuthorization).mockResolvedValueOnce({
      authorized: false,
      reasonCode: "ALL_PARTY_CONSENT_REQUIRED",
      reason: "Waiting",
      authorization: null,
      readiness: {
        allPartiesCurrentlyReady: false,
        allPartiesCurrentlyAllowTranscription: false,
        actorConsentId: "consent-1",
      },
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

  it("does not turn current consent into authority for media that lacked a canonical START boundary", async () => {
    jest.mocked(evaluateMobileCaptureProcessingAuthorization).mockResolvedValueOnce({
      authorized: false,
      reasonCode: "IMMUTABLE_START_BINDING_REQUIRED",
      reason: "No START",
      authorization: null,
      readiness: {
        eligibleForProcessing: false,
        allPartiesCurrentlyReady: true,
        allPartiesCurrentlyAllowTranscription: true,
        actorConsentId: "consent-1",
        startReceiptId: null,
        startConsentVersion: null,
      },
    } as never);

    await expect(reconcileHeldMobileCaptureRelease({
      prisma: prisma(),
      receipt,
      now,
    })).resolves.toEqual({
      status: "recording-boundary-held",
      releasedMedia: false,
      releasedTranscript: false,
    });
    expect(getMobileCaptureObjectEvidence).not.toHaveBeenCalled();
    expect(finalizeMobileCaptureDatabaseEvidence).not.toHaveBeenCalled();
  });

  it("can release transcription after an already-authorized recording gains current transcript consent", async () => {
    const transcriptOnlyReceipt = {
      ...receipt,
      processingDisposition: "RELEASED",
    };
    jest.mocked(evaluateMobileCaptureProcessingAuthorization).mockResolvedValue({
      authorized: false,
      reasonCode: "IMMUTABLE_START_BINDING_REQUIRED",
      reason: "Consent changed",
      authorization: null,
      readiness: {
        eligibleForProcessing: false,
        allPartiesCurrentlyReady: true,
        allPartiesCurrentlyAllowTranscription: true,
        actorConsentId: "consent-1",
        startReceiptId: null,
        startConsentVersion: "later-transcript-consent-version",
      },
    } as never);

    await expect(reconcileHeldMobileCaptureRelease({
      prisma: prisma(),
      receipt: transcriptOnlyReceipt,
      now,
    })).resolves.toEqual({
      status: "released",
      releasedMedia: false,
      releasedTranscript: true,
    });
    expect(finalizeMobileCaptureDatabaseEvidence).toHaveBeenCalledWith(expect.objectContaining({
      processingDecision: expect.objectContaining({
        disposition: "RELEASED",
        releaseAudit: null,
        transcriptDisposition: "RELEASED",
      }),
    }));
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

  it("adds exact-source authority and releases a verified private local draft automatically", async () => {
    const personalManifest = {
      ...manifest,
      participantId: "participant-1",
      captureGroupId: receipt.captureId,
      capturePurpose: "PERSONAL_NOTE",
      sourceProfileJson: JSON.stringify({ captureAuthorityBasis: "local-draft" }),
      processingDisposition: "preservation-only",
      processingAuthorization: null,
    };
    jest.mocked(loadMobileCaptureResumableManifest).mockResolvedValue({
      manifest: personalManifest as never,
      generation: "7",
    });
    jest.mocked(isPersonalSelfCaptureProfile).mockReturnValue(true);
    jest.mocked(authorizePersonalSelfCaptureSource).mockResolvedValue({
      ok: true,
      authorization: {
        kind: "source-import",
        authorizationId: "47f0d0a5-e663-4c9b-b4ac-0f6ca31c39e8",
        consentVersion: "personal-consent",
        attestationVersion: "quipsly-personal-self-capture-2026-09-04",
      },
      readiness: {},
    } as never);

    await expect(reconcileHeldMobileCaptureRelease({
      prisma: prisma(),
      receipt,
      now,
    })).resolves.toMatchObject({
      status: "released",
      releasedMedia: true,
      releasedTranscript: true,
    });
    expect(saveMobileCaptureResumableManifest).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        processingDisposition: "eligible",
        processingAuthorization: expect.objectContaining({
          kind: "source-import",
        }),
      }),
      "7",
    );
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
    jest.mocked(evaluateMobileCaptureProcessingAuthorization)
      .mockResolvedValueOnce({
        authorized: true,
        reasonCode: "READY",
        reason: "Ready",
        authorization: null,
        readiness: {
          allPartiesCurrentlyReady: true,
          allPartiesCurrentlyAllowTranscription: true,
          actorConsentId: "consent-1",
          eligibleForProcessing: true,
          startReceiptId: null,
          startConsentVersion: null,
        },
      } as never)
      .mockResolvedValueOnce({
        authorized: false,
        reasonCode: "ALL_PARTY_CONSENT_REQUIRED",
        reason: "Revoked",
        authorization: null,
        readiness: {
          allPartiesCurrentlyReady: false,
          allPartiesCurrentlyAllowTranscription: false,
          actorConsentId: "consent-1",
        },
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
    jest.mocked(evaluateMobileCaptureProcessingAuthorization).mockResolvedValueOnce({
      authorized: false,
      reasonCode: "ALL_PARTY_CONSENT_REQUIRED",
      reason: "Waiting",
      authorization: null,
      readiness: {
        allPartiesCurrentlyReady: false,
        allPartiesCurrentlyAllowTranscription: false,
        actorConsentId: "consent-1",
      },
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
