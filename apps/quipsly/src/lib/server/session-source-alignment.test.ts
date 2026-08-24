const mockEnsureCloudQueued = jest.fn();

jest.mock("@/lib/server/audio-source-alignment-cloud", () => ({
  ensureSessionAudioSourceAlignmentCloudQueued: (...args: unknown[]) =>
    mockEnsureCloudQueued(...args),
}));

import {
  buildSessionReviewedPlacement,
  buildSessionSourceAlignmentPlan,
  decideSessionSourceAlignment,
  queueSessionSourceAlignment,
  SessionSourceAlignmentError,
} from "./session-source-alignment";
import {
  newAudioAlignmentResult,
  newSessionAudioAlignmentJob,
  parseAudioAlignmentEvidence,
} from "@high-ground/quipsly-media-processing";

const captureGroupId = "ddfbb57c-7b7e-4a38-83a7-46ab27b51d82";

function candidate(input: {
  id: string;
  start: string;
  duration?: number;
  estimatedStart?: string | null;
  uncertainty?: number;
}) {
  return {
    id: input.id,
    roomId: "room_session_12345678",
    durationSeconds: input.duration ?? 120,
    recordedStartedAt: new Date(input.start),
    localManifestJson:
      input.estimatedStart === null
        ? {}
        : {
            alignment: {
              schema: "quipsly-capture-alignment-proposal-v1",
              status: "proposal-ready",
              captureGroupId,
              estimatedServerStartedAt: input.estimatedStart ?? input.start,
              uncertaintyMilliseconds: input.uncertainty ?? 24,
              sampleAccurateClaimed: false,
              reviewRequired: true,
            },
          },
    playback: {
      schema: "quipsly-session-protected-playback-v1" as const,
      roomId: "room_session_12345678",
      recordingAssetId: input.id,
      url: `/api/sessions/room/recordings/${input.id}/media`,
      sha256: "a".repeat(64),
      byteSize: 10_000,
      bucketName: "quipsly-media-test",
      objectName: `media-vault/${input.id}.m4a`,
      generation: "123",
      contentType: "audio/mp4",
      kind: "audio" as const,
    },
  };
}

describe("Session exact-source audio alignment planning", () => {
  beforeEach(() => {
    mockEnsureCloudQueued.mockReset();
  });
  it("turns two monotonic clock proposals into two bounded waveform checks", () => {
    const plan = buildSessionSourceAlignmentPlan({
      captureGroupId,
      spine: candidate({
        id: "recording_spine_1234",
        start: "2026-08-24T20:00:00.000Z",
      }),
      target: candidate({
        id: "recording_target_123",
        start: "2026-08-24T20:00:00.350Z",
      }),
    });
    expect(plan.clockAuthority).toBe("capture-clock-proposal");
    expect(plan.initialOffsetSeconds).toBe(0.35);
    expect(plan.proposal.openingTargetSeconds).toBeGreaterThanOrEqual(0);
    expect(plan.proposal.laterTargetSeconds).toBeGreaterThan(
      plan.proposal.openingTargetSeconds,
    );
    expect(
      plan.proposal.laterTargetSeconds + plan.proposal.windowSeconds,
    ).toBeLessThanOrEqual(120);
    expect(plan.boundaries).toEqual({
      exactSourceBytesBound: true,
      sourceTimesMutated: false,
      sampleAccurateClaimed: false,
      resultIsReviewEvidenceOnly: true,
    });
  });

  it("keeps wall-clock fallback visible instead of pretending it is capture evidence", () => {
    const plan = buildSessionSourceAlignmentPlan({
      captureGroupId,
      spine: candidate({
        id: "recording_spine_1234",
        start: "2026-08-24T20:00:00.000Z",
        estimatedStart: null,
      }),
      target: candidate({
        id: "recording_target_123",
        start: "2026-08-24T20:00:01.250Z",
        estimatedStart: null,
      }),
    });
    expect(plan.clockAuthority).toBe("reported-wall-clock-fallback");
    expect(plan.initialOffsetSeconds).toBe(1.25);
    expect(plan.proposal.searchRadiusSeconds).toBeGreaterThanOrEqual(1);
  });

  it("fails closed when retained overlap cannot support opening and drift checks", () => {
    expect(() =>
      buildSessionSourceAlignmentPlan({
        captureGroupId,
        spine: candidate({
          id: "recording_spine_1234",
          start: "2026-08-24T20:00:00.000Z",
          duration: 5,
        }),
        target: candidate({
          id: "recording_target_123",
          start: "2026-08-24T20:00:04.000Z",
          duration: 5,
        }),
      }),
    ).toThrow(SessionSourceAlignmentError);
  });

  it("rejects cross-room and duplicate source identities", () => {
    const spine = candidate({
      id: "recording_spine_1234",
      start: "2026-08-24T20:00:00.000Z",
    });
    expect(() =>
      buildSessionSourceAlignmentPlan({ captureGroupId, spine, target: spine }),
    ).toThrow("two different");
    expect(() =>
      buildSessionSourceAlignmentPlan({
        captureGroupId,
        spine,
        target: {
          ...candidate({
            id: "recording_target_123",
            start: "2026-08-24T20:00:00.000Z",
          }),
          roomId: "another_room_123456",
        },
      }),
    ).toThrow("same private Session");
  });

  it("turns concurrent decision conflicts into a refreshable client conflict", async () => {
    const prisma = {
      $transaction: jest.fn().mockRejectedValue({ code: "P2034" }),
    };
    await expect(
      decideSessionSourceAlignment({
        prisma,
        roomId: "room_session_12345678",
        jobId: "session_alignment_12345678",
        requestId: "ddfbb57c-7b7e-4a38-83a7-46ab27b51d82",
        expectedRevision: 0,
        operation: "APPROVE",
        actor: { id: "user_session_12345678", email: "coach@example.test" },
      }),
    ).rejects.toMatchObject({ status: 409, code: "ALIGNMENT_DECISION_STALE" });
  });

  it("queues only released exact-byte sources from the same canonical take", async () => {
    const room = { id: "room_session_12345678", captureGroupId };
    const asset = (id: string) => ({
      id,
      roomId: room.id,
      durationSeconds: 120,
      recordedStartedAt: new Date("2026-08-24T20:00:00.000Z"),
      localManifestJson: {
        exactBytesVerified: true,
        storageGeneration: "123",
        captureGroupId,
        alignment: {
          schema: "quipsly-capture-alignment-proposal-v1",
          status: "proposal-ready",
          captureGroupId,
          estimatedServerStartedAt: "2026-08-24T20:00:00.000Z",
          uncertaintyMilliseconds: 24,
          sampleAccurateClaimed: false,
          reviewRequired: true,
        },
      },
      status: "VERIFIED",
      contentType: "audio/mp4",
      byteSize: BigInt(10_000),
      checksum: "a".repeat(64),
      storageBucket: "quipsly-media-test",
      storageObjectPath: `media-vault/${id}.m4a`,
      verifiedAt: new Date("2026-08-24T20:02:00.000Z"),
    });
    const assets = [
      asset("recording_spine_1234"),
      asset("recording_target_123"),
    ];
    assets[1]!.recordedStartedAt = new Date("2026-08-24T20:00:00.350Z");
    assets[1]!.localManifestJson.alignment.estimatedServerStartedAt =
      "2026-08-24T20:00:00.350Z";
    const receipt = (recordingAssetId: string) => ({
      uploadSessionId: "d3f46170-a5d4-46dc-b26c-eae19e88ce85",
      roomId: room.id,
      recordingAssetId,
      processingDisposition: "RELEASED",
      releasedAt: new Date("2026-08-24T20:03:00.000Z"),
      createdAt: new Date("2026-08-24T20:02:00.000Z"),
      metadataJson: {
        immutableUploadBinding: {
          roomId: room.id,
          bucketName: "quipsly-media-test",
          objectName: `media-vault/${recordingAssetId}.m4a`,
          generation: "123",
          sha256: "a".repeat(64),
          sizeBytes: 10_000,
        },
      },
    });
    const created: any[] = [];
    const prisma = {
      callRoom: { findFirst: jest.fn().mockResolvedValue(room) },
      recordingAsset: { findMany: jest.fn().mockResolvedValue(assets) },
      mobileCaptureFinalizationReceipt: {
        findMany: jest
          .fn()
          .mockResolvedValue(assets.map((row) => receipt(row.id))),
      },
      sessionAudioAlignmentJob: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn(async ({ data }) => {
          const row = { ...data, createdAt: new Date(), updatedAt: new Date() };
          created.push(row);
          return row;
        }),
        findUnique: jest.fn(async () => created[0]),
      },
    };
    mockEnsureCloudQueued.mockResolvedValue({
      status: "configuration-required",
    });
    const result = await queueSessionSourceAlignment({
      prisma,
      roomId: room.id,
      spineRecordingAssetId: assets[0]!.id,
      targetRecordingAssetId: assets[1]!.id,
      actor: { id: "user_session_12345678", email: "coach@example.test" },
    });
    expect(
      prisma.mobileCaptureFinalizationReceipt.findMany,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          recordingAssetId: { in: [assets[0]!.id, assets[1]!.id] },
          processingDisposition: "RELEASED",
        },
      }),
    );
    expect(created[0].roomId).toBe(room.id);
    expect(created[0].inputJson.kind).toBe(
      "quipsly-session-audio-alignment-job-v1",
    );
    expect(created[0].inputJson.projectId).toBeUndefined();
    expect(result.status).toBe("blocked");
    expect(result.clockAuthority).toBe("capture-clock-proposal");
  });

  it("normalizes a negative measured offset into a reversible source trim", () => {
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
      jobId: "session_alignment_negative123",
      roomId: "room_session_12345678",
      captureGroupId,
      requestedByUserId: "user_session_12345678",
      requestedByEmail: "coach@example.test",
      queuedAt: "2026-08-24T20:05:00.000Z",
      spine: binding("recording_spine_1234", "a"),
      target: binding("recording_target_123", "b"),
      proposal: {
        initialOffsetSeconds: -0.35,
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
        expectedSpineStartSeconds: 9.65,
        measuredSpineStartSeconds: 9.65,
        measuredOffsetSeconds: -0.35,
        normalizedCorrelation: 0.97,
        secondBestCorrelation: 0.2,
        peakMargin: 0.77,
      },
      later: {
        targetStartSeconds: 70,
        expectedSpineStartSeconds: 69.65,
        measuredSpineStartSeconds: 69.652,
        measuredOffsetSeconds: -0.348,
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
    expect(buildSessionReviewedPlacement(job, result)).toMatchObject({
      signedOffsetSeconds: -0.35,
      targetTimelineStartSeconds: 0,
      targetSourceTrimSeconds: 0.35,
      residualDriftMilliseconds: 2,
      correctionApplied: false,
      sourceBytesMutated: false,
      timelineDecisionReversible: true,
      sampleAccurateClaimed: false,
    });
  });
});
