/** @jest-environment node */

import type {
  MobileCaptureObjectEvidence,
  MobileCaptureResumableManifest,
} from "./mobile-capture-resumable-store";
import { attachCaptureMediaWithoutLostUpdate } from "./mobile-capture-resumable-finalization";

jest.mock("server-only", () => ({}));

function manifest(overrides: Partial<MobileCaptureResumableManifest> = {}) {
  return {
    actorUserId: "user_coach_001",
    actorEmail: "coach@example.test",
    projectId: "project_coaching_001",
    projectSlug: "coach-home",
    uploadSessionId: "8c951836-3337-467f-b0f5-eb8b57527ff8",
    captureId: "c54f2a32-d86a-4de7-a78f-f195df2a9c34",
    captureGroupId: "f9e56ff8-c389-4d16-a075-0ef591c64e76",
    callRoomId: "room_coaching_001",
    fileName: "coaching-session.m4a",
    contentType: "audio/mp4",
    sourceType: "audio",
    sha256: "a".repeat(64),
    episodeSlug: null,
    bucketName: "quipsly-media",
    objectName: "capture/coaching-session.m4a",
    ...overrides,
  } as MobileCaptureResumableManifest;
}

const objectEvidence = {
  bucketName: "quipsly-media",
  objectName: "capture/coaching-session.m4a",
  generation: "42",
  metageneration: "1",
  sizeBytes: 48_000,
  contentType: "audio/mp4",
  crc32c: null,
  md5Hash: null,
  customMetadata: {},
  storageBackend: "gcs",
  localFilePath: null,
} satisfies MobileCaptureObjectEvidence;

function transaction(priorManifest: Record<string, unknown> = {}) {
  return {
    recordingAsset: {
      findUnique: jest.fn().mockResolvedValue({ localManifestJson: priorManifest }),
      update: jest.fn().mockResolvedValue({}),
    },
    studioAssetAttachment: {
      upsert: jest.fn().mockResolvedValue({}),
    },
    studioWorkflowJob: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
    },
    studioEpisodeProduction: {
      findFirst: jest.fn(() => {
        throw new Error("A Session-only recording must not require an Episode lookup.");
      }),
    },
  };
}

const media = {
  source: {
    id: "source_coaching_001",
    providerSourceId: "gs://quipsly-media/capture/coaching-session.m4a#42",
  },
  mediaAsset: { id: "asset_coaching_001" },
  playbackUrl: "/api/ingest/media/source_coaching_001",
  captureRecords: {
    recordingAssetId: "recording_coaching_001",
    participantId: "participant_coach_001",
    consentId: "consent_coach_001",
    consentStatus: "GRANTED",
  },
  alignment: { status: "pending-evidence" } as never,
};

describe("Capture project attachment", () => {
  it("materializes a released coaching Session source without requiring an Episode", async () => {
    const prisma = transaction({ captureId: "existing-capture" });

    await attachCaptureMediaWithoutLostUpdate({
      transaction: prisma,
      manifest: manifest(),
      object: objectEvidence,
      ...media,
    });

    expect(prisma.studioAssetAttachment.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        projectId_assetId: {
          projectId: "project_coaching_001",
          assetId: "asset_coaching_001",
        },
      },
      create: expect.objectContaining({
        projectId: "project_coaching_001",
        assetId: "asset_coaching_001",
        source: "mobile-capture-finalization",
      }),
    }));
    expect(prisma.studioWorkflowJob.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        projectId: "project_coaching_001",
        assetId: "asset_coaching_001",
        type: "asset-register",
        status: "completed",
      }),
    });
    expect(prisma.recordingAsset.update).toHaveBeenCalledWith({
      where: { id: "recording_coaching_001" },
      data: {
        localManifestJson: expect.objectContaining({
          captureId: "existing-capture",
          promotion: expect.objectContaining({
            status: "promoted-to-studio-media",
            projectId: "project_coaching_001",
            nestSlug: "coach-home",
            episodeSlug: null,
            mediaAssetId: "asset_coaching_001",
            sourceId: "source_coaching_001",
            playbackUrl: "/api/ingest/media/source_coaching_001",
          }),
        }),
      },
    });
    expect(prisma.studioEpisodeProduction.findFirst).not.toHaveBeenCalled();
  });

  it("reuses the original promotion time and registration job on replay", async () => {
    const prisma = transaction({
      promotion: {
        promotedAt: "2026-08-22T12:00:00.000Z",
        preservedEvidence: true,
      },
    });
    prisma.studioWorkflowJob.findFirst.mockResolvedValue({
      id: "workflow_existing_001",
      inputJson: { preservedInput: true },
    });

    const result = await attachCaptureMediaWithoutLostUpdate({
      transaction: prisma,
      manifest: manifest(),
      object: objectEvidence,
      ...media,
    });

    expect(result.promotedAt).toBe("2026-08-22T12:00:00.000Z");
    expect(prisma.studioWorkflowJob.create).not.toHaveBeenCalled();
    expect(prisma.studioWorkflowJob.update).toHaveBeenCalledWith({
      where: { id: "workflow_existing_001" },
      data: expect.objectContaining({
        inputJson: expect.objectContaining({ preservedInput: true }),
        status: "completed",
      }),
    });
    const update = prisma.recordingAsset.update.mock.calls[0]?.[0];
    expect(update.data.localManifestJson.promotion).toMatchObject({
      promotedAt: "2026-08-22T12:00:00.000Z",
      preservedEvidence: true,
    });
  });
});
