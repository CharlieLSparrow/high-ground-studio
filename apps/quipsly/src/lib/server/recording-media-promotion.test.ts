/** @jest-environment node */

jest.mock("server-only", () => ({}));
jest.mock("@/auth", () => ({ auth: jest.fn() }));

import {
  recordingPromotionSyncEvidence,
  recordingSessionHandoffContext,
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
});
