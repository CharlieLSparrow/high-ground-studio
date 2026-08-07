/** @jest-environment node */

import { getPrismaClient } from "@/lib/prisma";
import { mapMobileCaptureSessionsForUser } from "@/lib/server/mobile-capture-sessions";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";

import { GET } from "./route";

jest.mock("@/lib/prisma", () => ({ getPrismaClient: jest.fn() }));
jest.mock("@/lib/server/mobile-capture-sessions", () => ({
  mapMobileCaptureSessionsForUser: jest.fn(() => []),
}));
jest.mock("@/lib/server/quipsly-session", () => ({
  getQuipslySessionFromRequest: jest.fn(),
}));

describe("mobile Capture review digest", () => {
  beforeEach(() => jest.clearAllMocks());

  it("stops before private reads when signed out", async () => {
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue(null as any);

    const response = await GET(new Request("http://localhost/api/mobile/capture/review-digest"));

    expect(response.status).toBe(401);
    expect(getPrismaClient).not.toHaveBeenCalled();
  });

  it("keeps Nest access-grant sessions visible to the same iPhone actor", async () => {
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue({
      user: {
        id: "user-1",
        primaryEmail: " Producer@Example.com ",
        name: "Producer",
        isStaff: false,
      },
    } as any);
    const findMany = jest.fn().mockResolvedValue([]);
    jest.mocked(getPrismaClient).mockReturnValue({
      callRoom: { findMany },
      mobileCaptureFinalizationReceipt: { findMany: jest.fn() },
    } as any);

    const response = await GET(new Request("http://localhost/api/mobile/capture/review-digest"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        OR: expect.arrayContaining([
          {
            project: {
              accessGrants: {
                some: {
                  email: "producer@example.com",
                  status: "ACTIVE",
                },
              },
            },
          },
        ]),
      },
    }));
    expect(mapMobileCaptureSessionsForUser).toHaveBeenCalledWith({
      rooms: [],
      userId: "user-1",
      finalizationReceipts: [],
    });
    expect(payload).toMatchObject({
      ok: true,
      packetKind: "quipsly-mobile-capture-review-digest-v1",
      digest: { sessionCount: 0 },
      boundaries: { sideEffectFree: true },
    });
  });

  it("keeps a staff Finish queue relationship-scoped instead of loading every tenant room", async () => {
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue({
      user: {
        id: "staff-1",
        primaryEmail: "staff@example.com",
        name: "Staff producer",
        isStaff: true,
      },
    } as any);
    const findMany = jest.fn().mockResolvedValue([]);
    jest.mocked(getPrismaClient).mockReturnValue({
      callRoom: { findMany },
      mobileCaptureFinalizationReceipt: { findMany: jest.fn() },
    } as any);

    const response = await GET(new Request("http://localhost/api/mobile/capture/review-digest"));

    expect(response.status).toBe(200);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        OR: expect.arrayContaining([
          { createdByUserId: "staff-1" },
          { participants: { some: { userId: "staff-1", accessStatus: "ACTIVE" } } },
        ]),
      },
    }));
  });

  it("preserves substantial recording evidence in the iPhone digest", async () => {
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue({
      user: {
        id: "user-1",
        primaryEmail: "producer@example.com",
        name: "Producer",
        isStaff: false,
      },
    } as any);
    jest.mocked(getPrismaClient).mockReturnValue({
      callRoom: { findMany: jest.fn().mockResolvedValue([]) },
      mobileCaptureFinalizationReceipt: { findMany: jest.fn() },
    } as any);
    jest.mocked(mapMobileCaptureSessionsForUser).mockReturnValue([{
      id: "room-1",
      callRoomId: "room-1",
      title: "Episode review",
      recordingCount: 1,
      contentReadiness: {
        status: "substantial",
        captureAssetCount: 1,
        substantialRecordingCount: 1,
      },
    }] as any);

    const response = await GET(new Request("http://localhost/api/mobile/capture/review-digest"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.digest).toMatchObject({
      sessionCount: 1,
      capturePlumbingEvidence: 1,
      substantialRecordingEvidence: 1,
      sessions: [{
        callRoomId: "room-1",
        contentReadiness: {
          status: "substantial",
          substantialRecordingCount: 1,
        },
      }],
    });
  });

  it("ranks endpoint recovery ahead of transcription from the canonical Session topology", async () => {
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue({
      user: { id: "user-1", primaryEmail: "producer@example.com", name: "Producer", isStaff: false },
    } as any);
    const exactStorage = {
      byteSize: BigInt(1024),
      checksum: "a".repeat(64),
      storageBucket: "quipsly-test-media",
      storageObjectPath: "media-vault/test/source.m4a",
    };
    const room = {
      id: "room-recovery",
      participants: [{
        id: "participant-1",
        userId: "user-1",
        displayName: "Producer",
        email: "producer@example.com",
        role: "HOST",
      }],
      participantProviderGrants: [],
      participantPreflightReceipts: [],
      endpointQueueReceipts: [{
        id: "queue-1",
        participantId: "participant-1",
        clientInstanceId: "ios-installation",
        clientKind: "ios",
        deviceLabel: "Quipsly Capture · iPhone",
        queueRevision: BigInt(2),
        queueState: "NOT_EMPTY",
        localSourceCount: 2,
        pendingSourceCount: 1,
        failedSourceCount: 0,
        observedCaptureIds: ["capture-1", "capture-2"],
        recordingAssetIds: ["asset-1"],
        latestLocalMutationAt: new Date("2026-08-06T18:00:00.000Z"),
        reconciledAt: new Date("2026-08-06T18:00:01.000Z"),
        createdAt: new Date("2026-08-06T18:00:01.000Z"),
      }],
      expectedSources: [{
        id: "expected-1",
        participantId: "participant-1",
        label: "iPhone audio master",
        sourceKind: "AUDIO",
        retentionRole: "REQUIRED_MASTER",
        status: "ACTIVE",
        expectedClientKind: "ios",
        expectedDeviceLabel: "iPhone",
        recordingAssetId: "asset-1",
        captureId: "capture-1",
        revision: 1,
        latestReason: null,
        createdAt: new Date("2026-08-06T17:00:00.000Z"),
        updatedAt: new Date("2026-08-06T17:59:00.000Z"),
      }],
      stateReceipts: [],
      recordingConsents: [],
      recordingAssets: [{
        id: "asset-1",
        roomId: "room-recovery",
        participantId: "participant-1",
        kind: "LOCAL_AUDIO",
        status: "VERIFIED",
        fileName: "source.m4a",
        verifiedAt: new Date("2026-08-06T17:58:00.000Z"),
        localManifestJson: {
          captureId: "capture-1",
          exactBytesVerified: true,
          storageGeneration: "1785990000000",
          reportedSourceProfile: { clientKind: "ios" },
        },
        ...exactStorage,
      }],
      transcriptJobs: [],
      notes: [],
      actionItems: [],
    };
    const finalization = {
      uploadSessionId: "upload-1",
      captureId: "capture-1",
      roomId: "room-recovery",
      actorUserId: "user-1",
      recordingAssetId: "asset-1",
      processingDisposition: "RELEASED",
      transcriptDisposition: "RELEASED",
      updatedAt: new Date("2026-08-06T17:59:00.000Z"),
      metadataJson: {
        immutableUploadBinding: {
          uploadSessionId: "upload-1",
          captureId: "capture-1",
          roomId: "room-recovery",
          actorUserId: "user-1",
          sha256: "a".repeat(64),
          sizeBytes: 1024,
          bucketName: "quipsly-test-media",
          objectName: "media-vault/test/source.m4a",
          generation: "1785990000000",
        },
      },
    };
    jest.mocked(getPrismaClient).mockReturnValue({
      callRoom: { findMany: jest.fn().mockResolvedValue([room]) },
      mobileCaptureFinalizationReceipt: { findMany: jest.fn().mockResolvedValue([finalization]) },
    } as any);
    jest.mocked(mapMobileCaptureSessionsForUser).mockReturnValue([{
      id: "room-recovery",
      callRoomId: "room-recovery",
      title: "Episode recording",
      purpose: "PODCAST",
      recordingCount: 1,
      latestRecordingMediaAssetId: "media-1",
      latestTranscriptStatus: "NOT_STARTED",
      actionPacket: { capabilities: { canRunTranscript: true } },
      lifecycle: { checks: [] },
    }] as any);

    const response = await GET(new Request("http://localhost/api/mobile/capture/review-digest"));
    const payload = await response.json();

    expect(payload.digest).toMatchObject({
      recoveryOpen: 1,
      safeToLeave: 0,
      finishActions: [{
        callRoomId: "room-recovery",
        kind: "confirm-endpoint-drain",
        priority: 5,
        sourceExitReadiness: {
          state: "SERVER_COPY_COMPLETE_DEVICE_CONFIRMATION_REQUIRED",
          serverSafeRequiredSourceCount: 1,
          requiredSourceCount: 1,
          endpointQueueCount: 1,
          drainedEndpointCount: 0,
          safeToLeaveAllEndpoints: false,
          missingPlannedSources: [],
          sourceHolds: [],
          endpointQueues: [{
            clientInstanceId: "ios-installation",
            deviceLabel: "Quipsly Capture · iPhone",
            queueRevision: "2",
            queueState: "NOT_EMPTY",
            pendingSourceCount: 1,
            failedSourceCount: 0,
          }],
        },
      }],
      sessions: [{
        callRoomId: "room-recovery",
        sourceExitReadiness: {
          state: "SERVER_COPY_COMPLETE_DEVICE_CONFIRMATION_REQUIRED",
        },
      }],
    });
  });

  it("ranks explicit post-capture actions without performing them", async () => {
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue({
      user: { id: "user-1", primaryEmail: "producer@example.com", name: "Producer", isStaff: false },
    } as any);
    jest.mocked(getPrismaClient).mockReturnValue({
      callRoom: { findMany: jest.fn().mockResolvedValue([]) },
      mobileCaptureFinalizationReceipt: { findMany: jest.fn() },
    } as any);
    jest.mocked(mapMobileCaptureSessionsForUser).mockReturnValue([
      {
        id: "room-review",
        callRoomId: "room-review",
        title: "Coaching follow-up",
        purpose: "COACHING",
        recordingCount: 1,
        latestRecordingMediaAssetId: "media-1",
        latestTranscriptStatus: "COMPLETED",
        coachingPacketStatus: "READY_FOR_REVIEW",
        actionPacket: { capabilities: { canReviewPacket: true } },
        lifecycle: { checks: [] },
      },
      {
        id: "room-promote",
        callRoomId: "room-promote",
        title: "Episode source",
        purpose: "PODCAST",
        recordingCount: 1,
        latestRecordingMediaAssetId: null,
        actionPacket: { capabilities: { canPromoteRecordingToMedia: true } },
        lifecycle: { checks: [] },
      },
      {
        id: "room-transcript",
        callRoomId: "room-transcript",
        title: "Interview source",
        purpose: "PODCAST",
        recordingCount: 1,
        latestRecordingMediaAssetId: "media-2",
        latestTranscriptStatus: "NOT_STARTED",
        actionPacket: { capabilities: { canRunTranscript: true } },
        lifecycle: { checks: [] },
      },
    ] as any);

    const response = await GET(new Request("http://localhost/api/mobile/capture/review-digest"));
    const payload = await response.json();

    expect(payload.boundaries).toMatchObject({ sideEffectFree: true, noRecordingStarted: true });
    expect(payload.digest.needsFinish).toBe(3);
    expect(payload.digest.finishActions.map((action: any) => [action.callRoomId, action.kind, action.priority])).toEqual([
      ["room-promote", "promote-recording", 10],
      ["room-transcript", "run-transcript", 20],
      ["room-review", "review-packet", 40],
    ]);
  });

  it("counts the whole queue while returning a bounded list and reviews an existing packet before rebuilding", async () => {
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue({
      user: { id: "user-1", primaryEmail: "coach@example.com", name: "Coach", isStaff: false },
    } as any);
    jest.mocked(getPrismaClient).mockReturnValue({
      callRoom: { findMany: jest.fn().mockResolvedValue([]) },
      mobileCaptureFinalizationReceipt: { findMany: jest.fn() },
    } as any);
    jest.mocked(mapMobileCaptureSessionsForUser).mockReturnValue(Array.from({ length: 10 }, (_, index) => ({
      id: `room-${index}`,
      callRoomId: `room-${index}`,
      title: `Coaching session ${index}`,
      purpose: "COACHING",
      recordingCount: 1,
      latestRecordingMediaAssetId: `media-${index}`,
      latestTranscriptStatus: "COMPLETED",
      coachingPacketStatus: "READY_FOR_REVIEW",
      actionPacket: { capabilities: { canBuildPacket: true, canReviewPacket: true } },
      lifecycle: { checks: [] },
    })) as any);

    const response = await GET(new Request("http://localhost/api/mobile/capture/review-digest"));
    const payload = await response.json();

    expect(payload.digest.needsFinish).toBe(10);
    expect(payload.digest.finishActions).toHaveLength(8);
    expect(payload.digest.finishActions.every((action: any) => action.kind === "review-packet")).toBe(true);
  });
});
