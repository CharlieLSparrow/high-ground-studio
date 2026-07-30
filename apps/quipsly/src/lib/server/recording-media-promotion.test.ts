/** @jest-environment node */

jest.mock("server-only", () => ({}));
jest.mock("@/auth", () => ({ auth: jest.fn() }));

import {
  promoteRecordingCaptureGroupToStudioMedia,
  recordingPromotionSyncEvidence,
  recordingSessionHandoffContext,
  resolveCaptureGroupPromotionPlan,
  resolveRecordingPromotionTarget,
} from "./recording-media-promotion";

describe("capture Session to Studio handoff boundary", () => {
  const room = {
    id: "room-1",
    projectId: "project-1",
    projectSlug: "legacy-high-ground",
    updatedAt: new Date("2026-07-19T08:00:00.000Z"),
    project: { id: "project-1", slug: "high-ground", name: "High Ground Odyssey" },
    tagLinks: [
      { tag: { id: "tag-proof", projectId: "project-1", slug: "proof-listen", label: "Proof listen", category: "workflow" } },
      { tag: { id: "tag-episode", projectId: "project-1", slug: "episode-4", label: "Episode 4", category: "meaning" } },
      { tag: { id: "foreign", projectId: "project-2", slug: "private", label: "Private", category: "meaning" } },
    ],
  };

  it("makes the canonical project relation authoritative over drifted legacy slugs", () => {
    expect(resolveRecordingPromotionTarget({ room, recordingAsset: { localManifestJson: {} } })).toEqual({
      nestSlug: "high-ground",
      source: "canonical-session-project",
      boundNestSlug: "high-ground",
      conflictNestSlug: null,
      legacySlugDrift: true,
    });
  });

  it("holds an explicit cross-project promotion instead of silently moving the recording", () => {
    expect(resolveRecordingPromotionTarget({
      requestedNestSlug: "coaching",
      room,
      recordingAsset: { localManifestJson: {} },
    })).toMatchObject({
      nestSlug: "",
      source: "canonical-project-conflict",
      boundNestSlug: "high-ground",
      conflictNestSlug: "coaching",
    });
  });

  it("holds a capture manifest that conflicts with the canonical Session project", () => {
    expect(resolveRecordingPromotionTarget({
      room,
      recordingAsset: { localManifestJson: { projectSlug: "coaching" } },
    })).toMatchObject({
      source: "binding-conflict",
      boundNestSlug: "high-ground",
      conflictNestSlug: "coaching",
    });
  });

  it("captures only same-project tag ids and labels as a provenance snapshot", () => {
    expect(recordingSessionHandoffContext(room)).toEqual({
      version: 1,
      source: "call-room-canonical-context",
      roomId: "room-1",
      roomUpdatedAt: "2026-07-19T08:00:00.000Z",
      projectId: "project-1",
      projectSlug: "high-ground",
      tagIds: ["tag-episode", "tag-proof"],
      tagSnapshot: [
        { id: "tag-episode", slug: "episode-4", label: "Episode 4", category: "meaning" },
        { id: "tag-proof", slug: "proof-listen", label: "Proof listen", category: "workflow" },
      ],
      canonicalTagSource: "/sessions/room-1",
    });
  });

  it("preserves normalized mobile take and review-only alignment evidence for the editor", () => {
    const alignment = {
      schema: "quipsly-capture-alignment-proposal-v1",
      status: "proposal-ready",
      captureGroupId: "take-1",
      sourceClockEvidence: "lowest-rtt-monotonic-projection",
      method: "lowest-rtt-monotonic-server-projection-v1",
      estimatedServerStartedAt: "2026-07-29T12:00:00.250Z",
      uncertaintyMilliseconds: 14,
      selectedClockSample: null,
      startBoundary: null,
      reportedWallStartAt: null,
      reportedWallVsMonotonicEstimateMilliseconds: null,
      sampleAccurateClaimed: false,
      reviewRequired: true,
      reviewGate: {
        waveformCorrelationRequired: true,
        driftReviewRequired: true,
        humanApprovalRequired: true,
      },
      reason: "Review the clock proposal against waveforms.",
    };
    const sync = recordingPromotionSyncEvidence({
      id: "recording-1",
      roomId: "room-1",
      participantId: "participant-1",
      checksum: "a".repeat(64),
      recordedStartedAt: new Date("2026-07-29T12:00:00.000Z"),
      recordedStoppedAt: new Date("2026-07-29T12:01:00.000Z"),
      durationSeconds: 60,
      segmentsJson: [{ index: 0, durationSeconds: 60 }],
      localManifestJson: {
        sessionId: "upload-1",
        captureGroupId: "take-1",
        capturePurpose: "podcast-av",
        recordingConsentId: "consent-1",
        checksumSha256: "b".repeat(64),
        storageGeneration: "42",
        reportedSourceProfile: {
          schemaVersion: 3,
          codec: "h264",
        },
        alignment,
      },
    }, "2026-07-29T12:02:00.000Z");

    expect(sync).toMatchObject({
      recordingAssetId: "recording-1",
      callRoomId: "room-1",
      participantId: "participant-1",
      recordingConsentId: "consent-1",
      capturePurpose: "podcast-av",
      captureGroupId: "take-1",
      uploadSessionId: "upload-1",
      expectedSha256: "b".repeat(64),
      storageGeneration: "42",
      recordingSegments: [{ index: 0, durationSeconds: 60 }],
      reportedSourceProfile: {
        schemaVersion: 3,
        codec: "h264",
      },
      alignment: {
        schema: "quipsly-capture-alignment-proposal-v1",
        sampleAccurateClaimed: false,
        reviewRequired: true,
      },
      promotedAt: "2026-07-29T12:02:00.000Z",
    });
  });

  it("drops a malformed alignment contract instead of promoting it as clock evidence", () => {
    const sync = recordingPromotionSyncEvidence({
      id: "recording-1",
      roomId: "room-1",
      localManifestJson: {
        promotion: {
          captureGroupId: "take-1",
          alignment: {
            schema: "quipsly-capture-alignment-proposal-v1",
            sampleAccurateClaimed: true,
            reviewRequired: false,
            reviewGate: {},
          },
        },
      },
    }, "2026-07-29T12:02:00.000Z");

    expect(sync).not.toHaveProperty("alignment");
    expect(sync.captureGroupId).toBe("take-1");
  });

  it("requires the exact reviewed capture-group source set before any handoff", () => {
    const sources = [
      {
        recordingAssetId: "video-front",
        captureGroupId: "take-1",
        status: "VERIFIED",
        recordedStartedAt: "2026-07-30T12:00:00.000Z",
      },
      {
        recordingAssetId: "audio-master",
        captureGroupId: "take-1",
        status: "VERIFIED",
        recordedStartedAt: "2026-07-30T12:00:01.000Z",
      },
      {
        recordingAssetId: "video-back",
        captureGroupId: "take-1",
        status: "VERIFIED",
        recordedStartedAt: "2026-07-30T12:03:00.000Z",
      },
    ];

    expect(resolveCaptureGroupPromotionPlan({
      captureGroupId: "take-1",
      expectedRecordingAssetIds: [
        "audio-master",
        "video-back",
        "video-front",
      ],
      sources,
    })).toMatchObject({
      ok: true,
      status: "capture-group-ready",
      actualRecordingAssetIds: [
        "audio-master",
        "video-back",
        "video-front",
      ],
      sources: [
        { recordingAssetId: "video-front" },
        { recordingAssetId: "audio-master" },
        { recordingAssetId: "video-back" },
      ],
    });

    expect(resolveCaptureGroupPromotionPlan({
      captureGroupId: "take-1",
      expectedRecordingAssetIds: ["audio-master", "video-front"],
      sources,
    })).toMatchObject({
      ok: false,
      status: "capture-group-source-set-changed",
      httpStatus: 409,
    });
  });

  it("holds the whole capture group when any source is not verified", () => {
    expect(resolveCaptureGroupPromotionPlan({
      captureGroupId: "take-1",
      expectedRecordingAssetIds: ["audio-master", "video-front"],
      sources: [
        {
          recordingAssetId: "audio-master",
          captureGroupId: "take-1",
          status: "VERIFIED",
        },
        {
          recordingAssetId: "video-front",
          captureGroupId: "take-1",
          status: "UPLOADING",
        },
      ],
    })).toMatchObject({
      ok: false,
      status: "capture-group-awaiting-verification",
      blockedRecordingAssetIds: ["video-front"],
    });
  });

  it("converges every verified source and reports idempotent partial truth", async () => {
    const assets = [
      {
        id: "video-front",
        roomId: "room-1",
        status: "VERIFIED",
        recordedStartedAt: new Date("2026-07-30T12:00:00.000Z"),
        localManifestJson: { captureGroupId: "take-1" },
      },
      {
        id: "audio-master",
        roomId: "room-1",
        status: "VERIFIED",
        recordedStartedAt: new Date("2026-07-30T12:00:01.000Z"),
        localManifestJson: { captureGroupId: "take-1" },
      },
    ];
    const prisma = {
      recordingAsset: {
        findMany: jest.fn().mockResolvedValue(assets),
      },
      mobileCaptureFinalizationReceipt: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    const promoteOne = jest.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: "already-promoted",
        message: "Already ready.",
        mediaAsset: { id: "media-video" },
      })
      .mockResolvedValueOnce({
        ok: true,
        status: "promoted",
        message: "Ready.",
        mediaAsset: { id: "media-audio" },
      });

    const result = await promoteRecordingCaptureGroupToStudioMedia({
      prisma,
      roomId: "room-1",
      captureGroupId: "take-1",
      expectedRecordingAssetIds: ["audio-master", "video-front"],
      actorUserId: "user-1",
      actorEmail: "user@example.test",
      nestSlug: "high-ground",
      episodeSlug: "episode-1",
      processingGate: jest.fn().mockResolvedValue({ allowed: true }),
      promoteOne: promoteOne as any,
    });

    expect(result).toMatchObject({
      ok: true,
      status: "capture-group-promoted",
      expectedSourceCount: 2,
      promotedSourceCount: 2,
      alreadyPromotedSourceCount: 1,
      failedSourceCount: 0,
      boundaries: {
        sourceSetMatched: true,
        originalSourcesMutated: false,
        copiedBlobs: false,
        alignmentRemainsProposal: true,
        humanSyncReviewRequired: true,
        retryIsIdempotent: true,
      },
    });
    expect(promoteOne).toHaveBeenCalledTimes(2);
    expect(promoteOne.mock.calls.map(([call]) => call.recordingAssetId)).toEqual([
      "video-front",
      "audio-master",
    ]);
    expect(prisma.recordingAsset.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          roomId: "room-1",
          room: {
            OR: expect.arrayContaining([
              {
                project: {
                  accessGrants: {
                    some: {
                      email: "user@example.test",
                      status: "ACTIVE",
                    },
                  },
                },
              },
            ]),
          },
        },
      }),
    );
  });

  it("preflights every source and writes nothing when one source is held", async () => {
    const assets = [
      {
        id: "video-front",
        roomId: "room-1",
        status: "VERIFIED",
        recordedStartedAt: new Date("2026-07-30T12:00:00.000Z"),
        localManifestJson: { captureGroupId: "take-1" },
      },
      {
        id: "audio-master",
        roomId: "room-1",
        status: "VERIFIED",
        recordedStartedAt: new Date("2026-07-30T12:00:01.000Z"),
        localManifestJson: { captureGroupId: "take-1" },
      },
    ];
    const prisma = {
      recordingAsset: {
        findMany: jest.fn().mockResolvedValue(assets),
      },
      mobileCaptureFinalizationReceipt: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    const processingGate = jest.fn()
      .mockResolvedValueOnce({ allowed: true })
      .mockResolvedValueOnce({
        allowed: false,
        errorCode: "CAPTURE_PROCESSING_HELD",
        error: "Audio source awaits consent release.",
      });
    const promoteOne = jest.fn();

    const result = await promoteRecordingCaptureGroupToStudioMedia({
      prisma,
      roomId: "room-1",
      captureGroupId: "take-1",
      expectedRecordingAssetIds: ["audio-master", "video-front"],
      actorUserId: "user-1",
      actorEmail: "user@example.test",
      processingGate: processingGate as any,
      promoteOne: promoteOne as any,
    });

    expect(result).toMatchObject({
      ok: false,
      status: "capture-group-processing-held",
      httpStatus: 409,
      expectedSourceCount: 2,
      blockedRecordingAssetIds: ["audio-master"],
      boundaries: {
        sourceSetMatched: true,
        promotedSourceCount: 0,
        originalSourcesMutated: false,
        copiedBlobs: false,
        partialResultHidden: false,
      },
    });
    expect(processingGate).toHaveBeenCalledTimes(2);
    expect(promoteOne).not.toHaveBeenCalled();
  });

  it("returns explicit retry-safe partial truth after a mid-group failure", async () => {
    const assets = [
      {
        id: "video-front",
        roomId: "room-1",
        status: "VERIFIED",
        recordedStartedAt: new Date("2026-07-30T12:00:00.000Z"),
        localManifestJson: { captureGroupId: "take-1" },
      },
      {
        id: "audio-master",
        roomId: "room-1",
        status: "VERIFIED",
        recordedStartedAt: new Date("2026-07-30T12:00:01.000Z"),
        localManifestJson: { captureGroupId: "take-1" },
      },
    ];
    const prisma = {
      recordingAsset: {
        findMany: jest.fn().mockResolvedValue(assets),
      },
      mobileCaptureFinalizationReceipt: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    const promoteOne = jest.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: "promoted",
        message: "Video ready.",
        mediaAsset: { id: "media-video" },
      })
      .mockResolvedValueOnce({
        ok: false,
        status: "promotion-held",
        message: "Audio promotion held.",
      });

    const result = await promoteRecordingCaptureGroupToStudioMedia({
      prisma,
      roomId: "room-1",
      captureGroupId: "take-1",
      expectedRecordingAssetIds: ["audio-master", "video-front"],
      actorUserId: "user-1",
      actorEmail: "user@example.test",
      processingGate: jest.fn().mockResolvedValue({ allowed: true }),
      promoteOne: promoteOne as any,
    });

    expect(result).toMatchObject({
      ok: false,
      status: "capture-group-partially-promoted",
      httpStatus: 409,
      expectedSourceCount: 2,
      promotedSourceCount: 1,
      alreadyPromotedSourceCount: 0,
      failedSourceCount: 1,
      results: [
        {
          recordingAssetId: "video-front",
          ok: true,
          mediaAssetId: "media-video",
        },
        {
          recordingAssetId: "audio-master",
          ok: false,
          status: "promotion-held",
          mediaAssetId: null,
        },
      ],
      boundaries: {
        partialResultHidden: false,
        retryIsIdempotent: true,
      },
    });
  });
});
