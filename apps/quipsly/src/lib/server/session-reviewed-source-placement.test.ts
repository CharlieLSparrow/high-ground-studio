/** @jest-environment node */

import { createHash } from "node:crypto";

jest.mock("server-only", () => ({}));

import {
  newAudioAlignmentResult,
  newSessionAudioAlignmentJob,
  parseAudioAlignmentEvidence,
} from "@high-ground/quipsly-media-processing";
import { buildSessionReviewedPlacement } from "./session-source-alignment";
import {
  readSessionReviewedSourcePlacements,
  SessionReviewedSourcePlacementError,
} from "./session-reviewed-source-placement";

const roomId = "room_session_12345678";
const captureGroupId = "ddfbb57c-7b7e-4a38-83a7-46ab27b51d82";

function fixture(operation: "APPROVE" | "REVOKE" = "APPROVE") {
  const binding = (assetId: string, hash: string) => ({
    assetId,
    provider: "gcs" as const,
    locator: `gcs://quipsly-media-test/media-vault/${assetId}.m4a?generation=123`,
    generation: "123",
    sha256: hash.repeat(64),
    sizeBytes: 10_000,
    contentType: "audio/mp4",
  });
  const job = newSessionAudioAlignmentJob({
    jobId: "session_alignment_reviewed123",
    roomId,
    captureGroupId,
    requestedByUserId: "user_session_12345678",
    requestedByEmail: "coach@example.test",
    queuedAt: "2026-08-24T20:05:00.000Z",
    spine: binding("recording_spine_1234", "a"),
    target: binding("recording_target_123", "b"),
    proposal: {
      initialOffsetSeconds: 0.35,
      openingTargetSeconds: 10,
      laterTargetSeconds: 70,
      windowSeconds: 6,
      searchRadiusSeconds: 1,
      sampleRate: 12_000,
      minimumCorrelation: 0.78,
      minimumPeakMargin: 0.04,
    },
  });
  const evidence = parseAudioAlignmentEvidence({
    kind: "quipsly-audio-alignment-evidence-v1",
    createdAt: "2026-08-24T20:06:00.000Z",
    spine: job.spine,
    target: job.target,
    analyzer: {
      algorithm: "normalized-fft-cross-correlation-v1",
      sampleRate: 12_000,
      windowSeconds: 6,
      searchRadiusSeconds: 1,
      ffmpegVersion: "ffmpeg test",
    },
    opening: {
      targetStartSeconds: 10,
      expectedSpineStartSeconds: 10.35,
      measuredSpineStartSeconds: 10.35,
      measuredOffsetSeconds: 0.35,
      normalizedCorrelation: 0.97,
      secondBestCorrelation: 0.2,
      peakMargin: 0.77,
    },
    later: {
      targetStartSeconds: 70,
      expectedSpineStartSeconds: 70.35,
      measuredSpineStartSeconds: 70.352,
      measuredOffsetSeconds: 0.352,
      normalizedCorrelation: 0.96,
      secondBestCorrelation: 0.18,
      peakMargin: 0.78,
    },
    drift: {
      observationIntervalSeconds: 60,
      residualDriftMilliseconds: 2,
      observedPartsPerMillion: 33.333333,
    },
    qualification: {
      minimumCorrelation: 0.78,
      minimumPeakMargin: 0.04,
      qualifiedForAuthorizedAgentReview: true,
      reason: "Distinct peaks.",
    },
    boundaries: {
      sampleAccurateClaimed: false,
      sourceBytesMutated: false,
      timelinePlacementApplied: false,
      personOrDelegatedApprovalStillRequired: true,
    },
  });
  const result = newAudioAlignmentResult({
    jobId: job.jobId,
    completedAt: "2026-08-24T20:06:01.000Z",
    evidence,
    worker: {
      executionId: "execution_session_123",
      buildId: "test",
      imageDigest: null,
      attempt: 1,
    },
  });
  const placement = buildSessionReviewedPlacement(job, result);
  const asset = (assetId: string, hash: string) => ({
    id: assetId,
    roomId,
    status: "VERIFIED",
    contentType: "audio/mp4",
    byteSize: BigInt(10_000),
    checksum: hash.repeat(64),
    storageBucket: "quipsly-media-test",
    storageObjectPath: `media-vault/${assetId}.m4a`,
    verifiedAt: new Date("2026-08-24T20:02:00.000Z"),
    localManifestJson: { exactBytesVerified: true, storageGeneration: "123" },
  });
  const receipt = (recordingAssetId: string, hash: string) => ({
    uploadSessionId: "d3f46170-a5d4-46dc-b26c-eae19e88ce85",
    roomId,
    recordingAssetId,
    processingDisposition: "RELEASED",
    releasedAt: new Date("2026-08-24T20:03:00.000Z"),
    createdAt: new Date("2026-08-24T20:02:00.000Z"),
    metadataJson: {
      immutableUploadBinding: {
        roomId,
        bucketName: "quipsly-media-test",
        objectName: `media-vault/${recordingAssetId}.m4a`,
        generation: "123",
        sha256: hash.repeat(64),
        sizeBytes: 10_000,
      },
    },
  });
  const row = {
    id: job.jobId,
    roomId,
    status: "completed",
    inputJson: job,
    resultJson: { receipt: result },
    updatedAt: new Date(),
    decisions: [
      {
        id: `decision-${operation.toLowerCase()}`,
        operation,
        resultSha256: createHash("sha256")
          .update(JSON.stringify(result))
          .digest("hex"),
        placementJson: placement,
        createdAt: new Date("2026-08-24T20:07:00.000Z"),
      },
    ],
  };
  return {
    job,
    row,
    placement,
    assets: [asset(job.spine.assetId, "a"), asset(job.target.assetId, "b")],
    receipts: [
      receipt(job.spine.assetId, "a"),
      receipt(job.target.assetId, "b"),
    ],
  };
}

describe("reviewed Session source placements", () => {
  it("loads an active approval only while result and current exact bytes agree", async () => {
    const data = fixture();
    const prisma = {
      sessionAudioAlignmentJob: {
        findMany: jest.fn().mockResolvedValue([data.row]),
      },
      recordingAsset: { findMany: jest.fn().mockResolvedValue(data.assets) },
      mobileCaptureFinalizationReceipt: {
        findMany: jest.fn().mockResolvedValue(data.receipts),
      },
    };
    await expect(
      readSessionReviewedSourcePlacements({
        prisma,
        roomId,
        recordingAssetIds: [data.job.spine.assetId, data.job.target.assetId],
      }),
    ).resolves.toEqual([data.placement]);
  });

  it("holds assembly when an active approval's result binding is stale", async () => {
    const data = fixture();
    data.row.decisions[0]!.resultSha256 = "0".repeat(64);
    const prisma = {
      sessionAudioAlignmentJob: {
        findMany: jest.fn().mockResolvedValue([data.row]),
      },
      recordingAsset: { findMany: jest.fn().mockResolvedValue(data.assets) },
      mobileCaptureFinalizationReceipt: {
        findMany: jest.fn().mockResolvedValue(data.receipts),
      },
    };
    await expect(
      readSessionReviewedSourcePlacements({
        prisma,
        roomId,
        recordingAssetIds: [data.job.spine.assetId, data.job.target.assetId],
      }),
    ).rejects.toBeInstanceOf(SessionReviewedSourcePlacementError);
  });

  it("ignores a revoked decision and leaves the provisional clock available", async () => {
    const data = fixture("REVOKE");
    const prisma = {
      sessionAudioAlignmentJob: {
        findMany: jest.fn().mockResolvedValue([data.row]),
      },
      recordingAsset: { findMany: jest.fn() },
      mobileCaptureFinalizationReceipt: { findMany: jest.fn() },
    };
    await expect(
      readSessionReviewedSourcePlacements({
        prisma,
        roomId,
        recordingAssetIds: [data.job.spine.assetId, data.job.target.assetId],
      }),
    ).resolves.toEqual([]);
    expect(prisma.recordingAsset.findMany).not.toHaveBeenCalled();
  });

  it("does not resurrect an older approval after a newer decision revokes the pair", async () => {
    const approved = fixture("APPROVE");
    approved.row.decisions[0]!.createdAt = new Date("2026-08-24T20:07:00.000Z");
    const revoked = fixture("REVOKE");
    revoked.row.id = "session_alignment_reviewed456";
    revoked.row.decisions[0]!.createdAt = new Date("2026-08-24T20:08:00.000Z");
    const prisma = {
      sessionAudioAlignmentJob: {
        findMany: jest.fn().mockResolvedValue([approved.row, revoked.row]),
      },
      recordingAsset: { findMany: jest.fn() },
      mobileCaptureFinalizationReceipt: { findMany: jest.fn() },
    };
    await expect(
      readSessionReviewedSourcePlacements({
        prisma,
        roomId,
        recordingAssetIds: [
          approved.job.spine.assetId,
          approved.job.target.assetId,
        ],
      }),
    ).resolves.toEqual([]);
  });
});
