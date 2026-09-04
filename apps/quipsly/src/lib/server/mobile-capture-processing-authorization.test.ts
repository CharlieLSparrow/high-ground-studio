/** @jest-environment node */

import { evaluateMobileCaptureRoomReadiness } from "./mobile-capture-room-readiness";
import {
  authorizeExternalSourceImport,
  authorizePersonalSelfCaptureSource,
  evaluateMobileCaptureProcessingAuthorization,
  EXTERNAL_SOURCE_IMPORT_ATTESTATION_VERSION,
  isExternalSourceImportProfile,
  isPersonalSelfCaptureProfile,
  mobileCaptureHoldRecoveryPolicy,
  PERSONAL_SELF_CAPTURE_ATTESTATION_VERSION,
} from "./mobile-capture-processing-authorization";

jest.mock("server-only", () => ({}));
jest.mock("./mobile-capture-room-readiness", () => ({
  evaluateMobileCaptureRoomReadiness: jest.fn(),
}));

const binding = {
  uploadSessionId: "8c951836-3337-467f-b0f5-eb8b57527ff8",
  captureId: "c54f2a32-d86a-4de7-a78f-f195df2a9c34",
  captureGroupId: "f9e56ff8-c389-4d16-a075-0ef591c64e76",
  callRoomId: "room-1",
  actorUserId: "coach-1",
  participantId: "participant-1",
  recordingConsentId: "consent-1",
  sourceType: "audio" as const,
  sha256: "a".repeat(64),
  expectedSizeBytes: 48_000,
  fileName: "shure-session.wav",
};
const authorizationRecord = {
  id: "c0fd32d1-c014-4ac8-8b4c-f9f279ec9512",
  ...binding,
  roomId: binding.callRoomId,
  sizeBytes: BigInt(binding.expectedSizeBytes),
  consentVersion: "consent-at-import",
  attestationVersion: EXTERNAL_SOURCE_IMPORT_ATTESTATION_VERSION,
};
const readiness = {
  eligibleForProcessing: false,
  allPartiesCurrentlyReady: true,
  allPartiesCurrentlyAllowTranscription: true,
  actorConsentId: binding.recordingConsentId,
  consentVersion: "consent-at-import",
  startReceiptId: null,
  startConsentVersion: null,
  consentVersions: [{ consentId: binding.recordingConsentId }],
};

function prisma(record: any = authorizationRecord) {
  return {
    callRoom: {
      findUnique: jest.fn().mockResolvedValue({
        purpose: "PERSONAL_NOTE",
        createdByUserId: binding.actorUserId,
        metadataJson: {
          personalSelfCapture: true,
          otherAudibleParticipantsAllowed: false,
        },
        participants: [{
          id: binding.participantId,
          userId: binding.actorUserId,
          role: "HOST",
        }],
      }),
    },
    captureSourceImportAuthorization: {
      upsert: jest.fn().mockResolvedValue(record),
      findUnique: jest.fn().mockResolvedValue(record),
    },
  };
}

function externalManifest(overrides: Record<string, unknown> = {}) {
  return {
    ...binding,
    actorEmail: "coach@example.test",
    projectId: "project-1",
    projectSlug: "coach-home",
    callRoomId: binding.callRoomId,
    participantId: binding.participantId,
    recordingConsentId: binding.recordingConsentId,
    sourceType: binding.sourceType,
    expectedSizeBytes: binding.expectedSizeBytes,
    processingDisposition: "eligible",
    processingAuthorization: {
      kind: "source-import",
      authorizationId: authorizationRecord.id,
      consentVersion: authorizationRecord.consentVersion,
      attestationVersion: EXTERNAL_SOURCE_IMPORT_ATTESTATION_VERSION,
    },
    startReceiptId: null,
    consentVersion: authorizationRecord.consentVersion,
    ...overrides,
  } as never;
}

describe("Capture processing authorization", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(evaluateMobileCaptureRoomReadiness).mockResolvedValue(readiness as never);
  });

  it("recognizes only the canonical browser external-source profile", () => {
    expect(isExternalSourceImportProfile(JSON.stringify({
      kind: "quipsly-nest-external-recording-import-v1",
      clientKind: "web",
    }))).toBe(true);
    expect(isExternalSourceImportProfile(JSON.stringify({
      kind: "quipsly-nest-external-recording-import-v1",
    }))).toBe(false);
    expect(isExternalSourceImportProfile("not-json")).toBe(false);
  });

  it("recognizes only an iOS local-draft source in a personal-note purpose", () => {
    const profile = JSON.stringify({ captureAuthorityBasis: "local-draft" });
    expect(isPersonalSelfCaptureProfile(profile, "PERSONAL_NOTE")).toBe(true);
    expect(isPersonalSelfCaptureProfile(profile, "COACHING")).toBe(false);
    expect(isPersonalSelfCaptureProfile(JSON.stringify({
      captureAuthorityBasis: "authoritative-refresh",
    }), "PERSONAL_NOTE")).toBe(false);
  });

  it("describes automatic recovery without inventing a review step", () => {
    expect(mobileCaptureHoldRecoveryPolicy({
      processingAuthorization: {
        kind: "source-import",
        authorizationId: authorizationRecord.id,
        consentVersion: authorizationRecord.consentVersion,
        attestationVersion: EXTERNAL_SOURCE_IMPORT_ATTESTATION_VERSION,
      },
      processingHeld: true,
      transcriptHeld: true,
    })).toEqual({
      processing: { explicitReleaseRequired: false, automaticRecovery: true },
      transcript: { explicitReleaseRequired: false, automaticRecovery: true },
    });
    expect(mobileCaptureHoldRecoveryPolicy({
      processingAuthorization: {
        kind: "capture-start",
        authorizationId: "a997b05a-bcc5-4329-ab2f-5561277d660c",
        consentVersion: "start-consent-version",
      },
      processingHeld: false,
      transcriptHeld: true,
    }).transcript).toEqual({
      explicitReleaseRequired: false,
      automaticRecovery: true,
    });
  });

  it("requires the import button's explicit source-time attestation", async () => {
    const client = prisma();
    await expect(authorizeExternalSourceImport({
      prisma: client,
      binding,
      explicitlyAttested: false,
      uploadOrigin: "https://nest.quipsly.com",
    })).resolves.toMatchObject({ ok: false, status: 400 });
    expect(evaluateMobileCaptureRoomReadiness).not.toHaveBeenCalled();
    expect(client.captureSourceImportAuthorization.upsert).not.toHaveBeenCalled();
  });

  it("creates an append-only authorization bound to the exact external source", async () => {
    const client = prisma();
    await expect(authorizeExternalSourceImport({
      prisma: client,
      binding,
      explicitlyAttested: true,
      uploadOrigin: "https://nest.quipsly.com",
    })).resolves.toMatchObject({
      ok: true,
      authorization: {
        kind: "source-import",
        authorizationId: authorizationRecord.id,
        consentVersion: "consent-at-import",
      },
    });
    expect(client.captureSourceImportAuthorization.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { uploadSessionId: binding.uploadSessionId },
      create: expect.objectContaining({
        roomId: binding.callRoomId,
        sha256: binding.sha256,
        sizeBytes: BigInt(binding.expectedSizeBytes),
        attestationVersion: EXTERNAL_SOURCE_IMPORT_ATTESTATION_VERSION,
      }),
      update: {},
    }));
  });

  it("authorizes a private one-person local draft without a review queue", async () => {
    const personalRecord = {
      ...authorizationRecord,
      attestationVersion: PERSONAL_SELF_CAPTURE_ATTESTATION_VERSION,
    };
    const client = prisma(personalRecord);
    await expect(authorizePersonalSelfCaptureSource({
      prisma: client,
      binding,
      sourceProfileJson: JSON.stringify({
        captureAuthorityBasis: "local-draft",
      }),
      capturePurpose: "PERSONAL_NOTE",
    })).resolves.toMatchObject({
      ok: true,
      authorization: {
        kind: "source-import",
        attestationVersion: PERSONAL_SELF_CAPTURE_ATTESTATION_VERSION,
      },
    });
    expect(client.captureSourceImportAuthorization.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          actorUserId: binding.actorUserId,
          participantId: binding.participantId,
          attestationVersion: PERSONAL_SELF_CAPTURE_ATTESTATION_VERSION,
        }),
        update: {},
      }),
    );
  });

  it("rejects personal-note automation when another participant is present", async () => {
    const client = prisma();
    client.callRoom.findUnique.mockResolvedValue({
      purpose: "PERSONAL_NOTE",
      createdByUserId: binding.actorUserId,
      metadataJson: {
        personalSelfCapture: true,
        otherAudibleParticipantsAllowed: false,
      },
      participants: [
        { id: binding.participantId, userId: binding.actorUserId, role: "HOST" },
        { id: "participant-2", userId: "other-user", role: "GUEST" },
      ],
    });
    await expect(authorizePersonalSelfCaptureSource({
      prisma: client,
      binding,
      sourceProfileJson: JSON.stringify({ captureAuthorityBasis: "local-draft" }),
      capturePurpose: "PERSONAL_NOTE",
    })).resolves.toMatchObject({ ok: false, status: 409 });
    expect(client.captureSourceImportAuthorization.upsert).not.toHaveBeenCalled();
  });

  it("accepts an exact imported source while current recording permission remains ready", async () => {
    const client = prisma();
    jest.mocked(evaluateMobileCaptureRoomReadiness).mockResolvedValue({
      ...readiness,
      consentVersion: "later-expanded-transcript-choice",
    } as never);
    await expect(evaluateMobileCaptureProcessingAuthorization({
      prisma: client,
      manifest: externalManifest(),
    })).resolves.toMatchObject({ authorized: true, reasonCode: "READY" });
  });

  it("accepts the distinct exact-source authorization used by a private personal recording", async () => {
    const personalRecord = {
      ...authorizationRecord,
      attestationVersion: PERSONAL_SELF_CAPTURE_ATTESTATION_VERSION,
    };
    const client = prisma(personalRecord);
    await expect(evaluateMobileCaptureProcessingAuthorization({
      prisma: client,
      manifest: externalManifest({
        processingAuthorization: {
          kind: "source-import",
          authorizationId: personalRecord.id,
          consentVersion: personalRecord.consentVersion,
          attestationVersion: PERSONAL_SELF_CAPTURE_ATTESTATION_VERSION,
        },
      }),
    })).resolves.toMatchObject({ authorized: true, reasonCode: "READY" });
  });

  it("rejects a manifest that substitutes a different supported attestation for the database record", async () => {
    const personalRecord = {
      ...authorizationRecord,
      attestationVersion: PERSONAL_SELF_CAPTURE_ATTESTATION_VERSION,
    };
    await expect(evaluateMobileCaptureProcessingAuthorization({
      prisma: prisma(personalRecord),
      manifest: externalManifest(),
    })).resolves.toMatchObject({
      authorized: false,
      reasonCode: "SOURCE_IMPORT_AUTHORIZATION_MISMATCH",
    });
  });

  it("fails closed when any exact source binding differs", async () => {
    const client = prisma({
      ...authorizationRecord,
      sha256: "b".repeat(64),
    });
    await expect(evaluateMobileCaptureProcessingAuthorization({
      prisma: client,
      manifest: externalManifest(),
    })).resolves.toMatchObject({
      authorized: false,
      reasonCode: "SOURCE_IMPORT_AUTHORIZATION_MISMATCH",
    });
  });

  it("keeps live capture authority tied to the exact START and consent snapshot", async () => {
    jest.mocked(evaluateMobileCaptureRoomReadiness).mockResolvedValue({
      ...readiness,
      eligibleForProcessing: true,
      startReceiptId: "a997b05a-bcc5-4329-ab2f-5561277d660c",
      startConsentVersion: "start-consent-version",
    } as never);
    const live = externalManifest({
      startReceiptId: "a997b05a-bcc5-4329-ab2f-5561277d660c",
      consentVersion: "start-consent-version",
      processingAuthorization: {
        kind: "capture-start",
        authorizationId: "a997b05a-bcc5-4329-ab2f-5561277d660c",
        consentVersion: "start-consent-version",
      },
    });
    await expect(evaluateMobileCaptureProcessingAuthorization({
      prisma: prisma(),
      manifest: live,
    })).resolves.toMatchObject({ authorized: true });

    jest.mocked(evaluateMobileCaptureRoomReadiness).mockResolvedValue({
      ...readiness,
      eligibleForProcessing: false,
      startReceiptId: "a997b05a-bcc5-4329-ab2f-5561277d660c",
      startConsentVersion: "changed-consent-version",
    } as never);
    await expect(evaluateMobileCaptureProcessingAuthorization({
      prisma: prisma(),
      manifest: live,
    })).resolves.toMatchObject({
      authorized: false,
      reasonCode: "IMMUTABLE_START_BINDING_REQUIRED",
    });
  });
});
