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
  readSessionSourceAlignments,
  sessionSourceAlignmentProcessorBinding,
  suggestSessionSourceAlignment,
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

function providerReferenceAsset(input: { roomId: string; startedAt?: string }) {
  return {
    id: "provider_reference_asset_123",
    roomId: input.roomId,
    kind: "SERVER_MIX",
    status: "VERIFIED",
    verifiedAt: new Date("2026-08-24T20:02:00.000Z"),
    recordedStartedAt: new Date(input.startedAt ?? "2026-08-24T20:00:00.100Z"),
    durationSeconds: 120,
    contentType: "audio/ogg",
    byteSize: BigInt(12_000_000),
    checksum: "c".repeat(64),
    storageBucket: "quipsly-media-test",
    storageObjectPath:
      "media-vault/recordings/livekit/room/commands/request-room-reference.ogg",
    localManifestJson: {
      schema: "quipsly-provider-recording-command-v1",
      source: "provider-recording-command-reservation",
      provider: "livekit",
      captureGroupId,
      providerRecordingMode: "audio-reference",
      providerRecordingIsOptionalWitness: true,
      localProtectedMastersRemainAuthoritative: true,
      providerProcessingDisposition: "RELEASED",
      exactBytesVerified: true,
      storageGeneration: "92831",
      verification: {
        status: "verified",
        storageBucket: "quipsly-media-test",
        storageObjectPath:
          "media-vault/recordings/livekit/room/commands/request-room-reference.ogg",
        exactGenerationRead: true,
        sha256: "c".repeat(64),
        metadata: { generation: "92831", size: "12000000" },
      },
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

  it("surfaces unavailable acoustic evidence as retained clock sync instead of a failed recording", async () => {
    const binding = (assetId: string, hash: string) => ({
      assetId,
      provider: "local" as const,
      locator: `/tmp/quipsly-local-media/${assetId}.m4a`,
      generation: "local-test",
      sha256: hash.repeat(64),
      sizeBytes: 10_000,
      contentType: "audio/mp4",
    });
    const job = newSessionAudioAlignmentJob({
      jobId: "session_alignment_silent123",
      roomId: "room_session_12345678",
      captureGroupId,
      requestedByUserId: "user_session_12345678",
      requestedByEmail: "coach@example.test",
      queuedAt: "2026-08-24T20:05:00.000Z",
      spine: binding("recording_spine_1234", "a"),
      target: binding("recording_target_123", "b"),
      proposal: {
        initialOffsetSeconds: 0.35,
        openingTargetSeconds: 1,
        laterTargetSeconds: 20,
        windowSeconds: 6,
        searchRadiusSeconds: 1,
        sampleRate: 12_000,
        minimumCorrelation: 0.78,
        minimumPeakMargin: 0.04,
      },
    });
    const row = {
      id: job.jobId,
      roomId: job.roomId,
      spineRecordingAssetId: job.spine.assetId,
      targetRecordingAssetId: job.target.assetId,
      status: "failed",
      inputJson: {
        ...job,
        sessionPlan: { clockAuthority: "capture-clock-proposal" },
      },
      resultJson: {
        state: "failed",
        failure: {
          code: "audio-alignment-evidence-unavailable",
          message: "Audio correlation reference is effectively silent.",
        },
      },
      error:
        "audio-alignment-evidence-unavailable: Audio correlation reference is effectively silent.",
      updatedAt: new Date("2026-08-24T20:06:00.000Z"),
      decisions: [],
    };
    const result = await readSessionSourceAlignments({
      prisma: {
        callRoom: {
          findFirst: jest.fn().mockResolvedValue({
            id: job.roomId,
            captureGroupId,
          }),
        },
        sessionAudioAlignmentJob: {
          findMany: jest.fn().mockResolvedValue([row]),
        },
        recordingAsset: { findMany: jest.fn().mockResolvedValue([]) },
        mobileCaptureFinalizationReceipt: {
          findMany: jest.fn().mockResolvedValue([]),
        },
      },
      roomId: job.roomId,
      actor: { id: "user_session_12345678", email: "coach@example.test" },
    });
    expect(result.alignments[0]).toMatchObject({
      status: "clock-synced",
      clockAuthority: "capture-clock-proposal",
      evidence: null,
      error: null,
      boundaries: {
        sourceBytesImmutable: true,
        sourceTimesMutated: false,
        analyzerPlacementApplied: false,
        reviewedPlacementActive: false,
        sampleAccurateClaimed: false,
      },
    });
    expect(result.alignments[0]?.notice).toMatch(/capture-clock sync remains active/i);
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

  it("binds repaired interrupted media to the verified lossless derivative", () => {
    expect(
      sessionSourceAlignmentProcessorBinding({
        id: "recording_interrupted_123",
        roomId: "room_session_12345678",
        durationSeconds: 6,
        recordedStartedAt: new Date("2026-08-24T20:00:00.000Z"),
        playback: {
          schema: "quipsly-session-protected-playback-v1",
          roomId: "room_session_12345678",
          recordingAssetId: "recording_interrupted_123",
          url: "/raw",
          sha256: "a".repeat(64),
          byteSize: 10_000,
          bucketName: "quipsly-local-development-vault",
          objectName: "media-vault/original.webm",
          generation: "123",
          contentType: "audio/webm",
          kind: "audio",
        },
        localManifestJson: {
          promotion: { providerSourceId: "/vault/repaired.webm" },
          interruptionRepair: {
            status: "verified",
            originalRemainsSourceTruth: true,
            derivative: {
              sha256: "b".repeat(64),
              sizeBytes: 10_321,
              bucketName: "quipsly-local-development-vault",
              objectName: "media-vault/repair/repaired.webm",
              generation: "124",
              contentType: "audio/webm",
            },
          },
        },
      }),
    ).toMatchObject({
      assetId: "recording_interrupted_123",
      provider: "local",
      locator: "/vault/repaired.webm",
      generation: "124",
      sha256: "b".repeat(64),
      sizeBytes: 10_321,
      contentType: "audio/webm",
    });
  });

  it("derives a free automatic suggestion from two released participant masters", async () => {
    const room = { id: "room_session_12345678", captureGroupId };
    const exactAsset = (input: {
      id: string;
      participantId: string;
      role: string;
      startedAt: string;
      hash: string;
      duration?: number;
    }) => ({
      id: input.id,
      roomId: room.id,
      participantId: input.participantId,
      participant: { role: input.role },
      durationSeconds: input.duration ?? 120,
      recordedStartedAt: new Date(input.startedAt),
      localManifestJson: {
        exactBytesVerified: true,
        storageGeneration: "123",
        captureGroupId,
        alignment: {
          schema: "quipsly-capture-alignment-proposal-v1",
          status: "proposal-ready",
          captureGroupId,
          estimatedServerStartedAt: input.startedAt,
          uncertaintyMilliseconds: 24,
          sampleAccurateClaimed: false,
          reviewRequired: true,
        },
      },
      status: "VERIFIED",
      contentType: "audio/mp4",
      byteSize: BigInt(10_000),
      checksum: input.hash.repeat(64),
      storageBucket: "quipsly-media-test",
      storageObjectPath: `media-vault/${input.id}.m4a`,
      verifiedAt: new Date("2026-08-24T20:02:00.000Z"),
    });
    const assets = [
      exactAsset({
        id: "recording_coach_resumed",
        participantId: "participant_coach_1",
        role: "COACH",
        startedAt: "2026-08-24T20:02:00.000Z",
        duration: 4,
        hash: "d",
      }),
      exactAsset({
        id: "recording_client_1234",
        participantId: "participant_client_1",
        role: "CLIENT",
        startedAt: "2026-08-24T20:00:00.350Z",
        hash: "b",
      }),
      exactAsset({
        id: "recording_coach_12345",
        participantId: "participant_coach_1",
        role: "COACH",
        startedAt: "2026-08-24T20:00:00.000Z",
        hash: "a",
      }),
      exactAsset({
        id: "recording_coach_older",
        participantId: "participant_coach_1",
        role: "COACH",
        startedAt: "2026-08-24T19:00:00.000Z",
        hash: "c",
      }),
    ];
    const receipt = (asset: (typeof assets)[number]) => ({
      uploadSessionId: `upload-${asset.id}`,
      roomId: room.id,
      recordingAssetId: asset.id,
      processingDisposition: "RELEASED",
      releasedAt: new Date("2026-08-24T20:03:00.000Z"),
      createdAt: new Date("2026-08-24T20:02:00.000Z"),
      metadataJson: {
        immutableUploadBinding: {
          roomId: room.id,
          bucketName: asset.storageBucket,
          objectName: asset.storageObjectPath,
          generation: "123",
          sha256: asset.checksum,
          sizeBytes: 10_000,
        },
      },
    });
    const result = await suggestSessionSourceAlignment({
      prisma: {
        recordingAsset: { findMany: jest.fn().mockResolvedValue(assets) },
        mobileCaptureFinalizationReceipt: {
          findMany: jest.fn().mockResolvedValue(assets.map(receipt)),
        },
      },
      room,
    });
    expect(result).toMatchObject({
      status: "ready",
      generatedAutomatically: true,
      acousticAnalysisStarted: false,
      spineRecordingAssetId: "recording_coach_12345",
      targetRecordingAssetId: "recording_client_1234",
      clockAuthority: "capture-clock-proposal",
      initialOffsetSeconds: 0.35,
      sharedReference: null,
    });
  });

  it("uses an exact provider room witness as an optional spine for every participant master", async () => {
    const room = { id: "room_session_12345678", captureGroupId };
    const participantAsset = (input: {
      id: string;
      participantId: string;
      role: string;
      startedAt: string;
      hash: string;
    }) => ({
      id: input.id,
      roomId: room.id,
      participantId: input.participantId,
      participant: { role: input.role },
      durationSeconds: 120,
      recordedStartedAt: new Date(input.startedAt),
      localManifestJson: {
        exactBytesVerified: true,
        storageGeneration: "123",
        captureGroupId,
        alignment: {
          schema: "quipsly-capture-alignment-proposal-v1",
          status: "proposal-ready",
          captureGroupId,
          estimatedServerStartedAt: input.startedAt,
          uncertaintyMilliseconds: 24,
          sampleAccurateClaimed: false,
          reviewRequired: true,
        },
      },
      status: "VERIFIED",
      contentType: "audio/mp4",
      byteSize: BigInt(10_000),
      checksum: input.hash.repeat(64),
      storageBucket: "quipsly-media-test",
      storageObjectPath: `media-vault/${input.id}.m4a`,
      verifiedAt: new Date("2026-08-24T20:02:00.000Z"),
    });
    const participants = [
      participantAsset({
        id: "recording_client_1234",
        participantId: "participant_client_1",
        role: "CLIENT",
        startedAt: "2026-08-24T20:00:00.350Z",
        hash: "b",
      }),
      participantAsset({
        id: "recording_coach_12345",
        participantId: "participant_coach_1",
        role: "COACH",
        startedAt: "2026-08-24T20:00:00.000Z",
        hash: "a",
      }),
    ];
    const provider = providerReferenceAsset({ roomId: room.id });
    const receipts = participants.map((asset) => ({
      uploadSessionId: `upload-${asset.id}`,
      roomId: room.id,
      recordingAssetId: asset.id,
      processingDisposition: "RELEASED",
      releasedAt: new Date("2026-08-24T20:03:00.000Z"),
      createdAt: new Date("2026-08-24T20:02:00.000Z"),
      metadataJson: {
        immutableUploadBinding: {
          roomId: room.id,
          bucketName: asset.storageBucket,
          objectName: asset.storageObjectPath,
          generation: "123",
          sha256: asset.checksum,
          sizeBytes: 10_000,
        },
      },
    }));
    const result = await suggestSessionSourceAlignment({
      prisma: {
        recordingAsset: {
          findMany: jest
            .fn()
            .mockResolvedValueOnce(participants)
            .mockResolvedValueOnce([provider]),
        },
        mobileCaptureFinalizationReceipt: {
          findMany: jest.fn().mockResolvedValue(receipts),
        },
      },
      room,
    });
    expect(result).toMatchObject({
      status: "ready",
      sharedReference: {
        recordingAssetId: provider.id,
        mode: "audio-reference",
        targets: [
          {
            recordingAssetId: "recording_coach_12345",
            initialOffsetSeconds: -0.1,
            processorCompatible: true,
          },
          {
            recordingAssetId: "recording_client_1234",
            initialOffsetSeconds: 0.25,
            processorCompatible: true,
          },
        ],
        boundaries: {
          participantMastersRemainAuthoritative: true,
          providerReferenceIsOptionalWitness: true,
          exactGenerationReadAndHashed: true,
          referenceCannotReplaceParticipantMaster: true,
        },
      },
    });
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

  it("lets an active measured placement return to automatic sync without a reason", async () => {
    const prisma = {
      $transaction: jest.fn().mockRejectedValue({ code: "P2034" }),
    };
    await expect(
      decideSessionSourceAlignment({
        prisma,
        roomId: "room_session_12345678",
        jobId: "session_alignment_12345678",
        requestId: "c78fd857-b13e-4c8b-b440-13cfcf6c704c",
        expectedRevision: 1,
        operation: "REVOKE",
        actor: { id: "user_session_12345678", email: "coach@example.test" },
      }),
    ).rejects.toMatchObject({ status: 409, code: "ALIGNMENT_DECISION_STALE" });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
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

  it("queues a generation-bound room reference against a released participant master", async () => {
    const room = { id: "room_session_12345678", captureGroupId };
    const provider = providerReferenceAsset({ roomId: room.id });
    const participant = {
      id: "recording_participant_123",
      roomId: room.id,
      kind: "LOCAL_AUDIO",
      durationSeconds: 120,
      recordedStartedAt: new Date("2026-08-24T20:00:00.350Z"),
      localManifestJson: {
        exactBytesVerified: true,
        storageGeneration: "123",
        captureGroupId,
        alignment: {
          schema: "quipsly-capture-alignment-proposal-v1",
          status: "proposal-ready",
          captureGroupId,
          estimatedServerStartedAt: "2026-08-24T20:00:00.350Z",
          uncertaintyMilliseconds: 24,
          sampleAccurateClaimed: false,
          reviewRequired: true,
        },
      },
      status: "VERIFIED",
      contentType: "audio/mp4",
      byteSize: BigInt(10_000),
      checksum: "b".repeat(64),
      storageBucket: "quipsly-media-test",
      storageObjectPath: "media-vault/recording_participant_123.m4a",
      verifiedAt: new Date("2026-08-24T20:02:00.000Z"),
    };
    const receipt = {
      uploadSessionId: "upload-recording-participant-123",
      roomId: room.id,
      recordingAssetId: participant.id,
      processingDisposition: "RELEASED",
      releasedAt: new Date("2026-08-24T20:03:00.000Z"),
      createdAt: new Date("2026-08-24T20:02:00.000Z"),
      metadataJson: {
        immutableUploadBinding: {
          roomId: room.id,
          bucketName: participant.storageBucket,
          objectName: participant.storageObjectPath,
          generation: "123",
          sha256: participant.checksum,
          sizeBytes: 10_000,
        },
      },
    };
    let saved: any = null;
    const prisma = {
      callRoom: { findFirst: jest.fn().mockResolvedValue(room) },
      recordingAsset: {
        findMany: jest.fn().mockResolvedValue([provider, participant]),
      },
      mobileCaptureFinalizationReceipt: {
        findMany: jest.fn().mockResolvedValue([receipt]),
      },
      sessionAudioAlignmentJob: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn(async ({ data }) => {
          saved = { ...data, createdAt: new Date(), updatedAt: new Date() };
          return saved;
        }),
        findUnique: jest.fn(async () => saved),
      },
    };
    mockEnsureCloudQueued.mockResolvedValue({
      status: "configuration-required",
    });
    const result = await queueSessionSourceAlignment({
      prisma,
      roomId: room.id,
      spineRecordingAssetId: provider.id,
      targetRecordingAssetId: participant.id,
      actor: { id: "user_session_12345678", email: "coach@example.test" },
    });
    expect(saved.inputJson.spine).toMatchObject({
      assetId: provider.id,
      provider: "gcs",
      generation: "92831",
      sha256: "c".repeat(64),
    });
    expect(saved.inputJson.target).toMatchObject({
      assetId: participant.id,
      provider: "gcs",
      generation: "123",
      sha256: "b".repeat(64),
    });
    expect(mockEnsureCloudQueued).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      status: "blocked",
      spineRecordingAssetId: provider.id,
      targetRecordingAssetId: participant.id,
    });
  });

  it("routes two local-vault exact sources to the local worker without cloud control", async () => {
    const room = { id: "room_session_local123", captureGroupId };
    const asset = (id: string, hash: string, offsetMs: number) => ({
      id,
      roomId: room.id,
      durationSeconds: 120,
      recordedStartedAt: new Date(1_787_601_600_000 + offsetMs),
      localManifestJson: {
        exactBytesVerified: true,
        storageGeneration: "123",
        captureGroupId,
        promotion: { providerSourceId: `/tmp/quipsly-local-media/${id}.m4a` },
        alignment: {
          schema: "quipsly-capture-alignment-proposal-v1",
          status: "proposal-ready",
          captureGroupId,
          estimatedServerStartedAt: new Date(
            1_787_601_600_000 + offsetMs,
          ).toISOString(),
          uncertaintyMilliseconds: 24,
          sampleAccurateClaimed: false,
          reviewRequired: true,
        },
      },
      status: "VERIFIED",
      contentType: "audio/mp4",
      byteSize: BigInt(10_000),
      checksum: hash.repeat(64),
      storageBucket: "quipsly-local-development-vault",
      storageObjectPath: `objects/${id}.m4a`,
      verifiedAt: new Date("2026-08-25T20:02:00.000Z"),
    });
    const assets = [
      asset("recording_local_spine_123", "a", 0),
      asset("recording_local_target_12", "b", 350),
    ];
    const receipts = assets.map((row) => ({
      uploadSessionId: `upload-${row.id}`,
      roomId: room.id,
      recordingAssetId: row.id,
      processingDisposition: "RELEASED",
      releasedAt: new Date("2026-08-25T20:03:00.000Z"),
      createdAt: new Date("2026-08-25T20:02:00.000Z"),
      metadataJson: {
        immutableUploadBinding: {
          roomId: room.id,
          bucketName: row.storageBucket,
          objectName: row.storageObjectPath,
          generation: "123",
          sha256: row.checksum,
          sizeBytes: 10_000,
        },
      },
    }));
    let saved: any = null;
    const prisma = {
      callRoom: { findFirst: jest.fn().mockResolvedValue(room) },
      recordingAsset: { findMany: jest.fn().mockResolvedValue(assets) },
      mobileCaptureFinalizationReceipt: {
        findMany: jest.fn().mockResolvedValue(receipts),
      },
      sessionAudioAlignmentJob: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn(async ({ data }) => {
          saved = { ...data, createdAt: new Date(), updatedAt: new Date() };
          return saved;
        }),
      },
    };
    const result = await queueSessionSourceAlignment({
      prisma,
      roomId: room.id,
      spineRecordingAssetId: assets[0]!.id,
      targetRecordingAssetId: assets[1]!.id,
      actor: { id: "user_session_local123", email: "coach@example.test" },
    });
    expect(saved.inputJson.spine).toMatchObject({
      provider: "local",
      locator: `/tmp/quipsly-local-media/${assets[0]!.id}.m4a`,
    });
    expect(saved.inputJson.target.provider).toBe("local");
    expect(mockEnsureCloudQueued).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      status: "queued",
      clockAuthority: "capture-clock-proposal",
    });
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
