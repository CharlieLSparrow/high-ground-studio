/** @jest-environment node */

jest.mock("server-only", () => ({}));
jest.mock("./mobile-capture-processing-policy.js", () => ({
  mobileCaptureProcessingGateFromEvidence: jest.fn(() => ({ allowed: true })),
}));

import { createHash } from "node:crypto";

import { mobileCaptureProcessingGateFromEvidence } from "./mobile-capture-processing-policy.js";
import {
  acknowledgeTranscriptCorrectionImpact,
  attributeTranscriptSpeaker,
  confirmTranscriptSegmentAsIs,
  createTranscriptCorrection,
  readTranscriptCorrectionDesk,
  readTranscriptCorrectionImpactSummary,
  TRANSCRIPT_CORRECTION_SCHEMA,
  TRANSCRIPT_CORRECTION_IMPACT_REVIEW_SCHEMA,
  TRANSCRIPT_SPEAKER_ATTRIBUTION_SCHEMA,
  TranscriptCorrectionError,
} from "./transcript-corrections";

const actor = { id: "user-1", email: "producer@example.com", isStaff: false };
const providerText = "We should ship the proof watch tomorrow.";
const providerSpeakerLabel = "Speaker 0";

function sha256(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function recordingAsset(promoted = true) {
  return {
    id: "asset-1",
    roomId: "room-1",
    kind: "SERVER_MIX",
    status: "VERIFIED",
    fileName: "session.m4a",
    durationSeconds: 120,
    storageObjectPath: "recordings/session.m4a",
    localManifestJson: promoted ? {
      promotion: {
        sourceId: "source-1",
        playbackUrl: "/api/ingest/media/source-1",
        mediaKind: "audio",
      },
    } : {},
  };
}

function segment(corrections: any[] = [], verifications: any[] = []) {
  return {
    id: "segment-1",
    text: providerText,
    speakerLabel: providerSpeakerLabel,
    startSeconds: 12,
    endSeconds: 18,
    confidence: 0.71,
    words: [{
      id: "word-1",
      providerWordIndex: 0,
      startSeconds: 12,
      endSeconds: 12.35,
      word: "We",
      punctuatedWord: "We",
      confidence: 0.99,
      speakerLabel: providerSpeakerLabel,
      channel: 0,
    }],
    corrections,
    verifications,
  };
}

function speakerSnapshotSha256(segments = [segment()]) {
  const evidence = segments.map((entry) => ({
    id: entry.id,
    startSeconds: entry.startSeconds,
    endSeconds: entry.endSeconds,
    textSha256: sha256(entry.text),
  }));
  return sha256(JSON.stringify({ providerSpeakerLabel, evidence }));
}

function participant() {
  return {
    id: "participant-1",
    userId: "speaker-user-1",
    displayName: "Charlie",
    email: "charlie@example.com",
    role: "HOST",
    user: { name: "Charles Sparrow", primaryEmail: "charlie@example.com" },
  };
}

function accessibleRoom(options: { promoted?: boolean; corrections?: any[]; verifications?: any[]; speakerAttributions?: any[] } = {}) {
  return {
    id: "room-1",
    title: "Episode review",
    projectId: "project-1",
    participants: [participant()],
    transcriptJobs: [{
      id: "job-1",
      status: "COMPLETED",
      asset: recordingAsset(options.promoted !== false),
      speakerAttributions: options.speakerAttributions ?? [],
      segments: [segment(options.corrections, options.verifications)],
    }],
  };
}

function correctionRecord(data: Record<string, any>, revisions: any[] = []) {
  const now = new Date("2026-07-19T05:00:00.000Z");
  return {
    id: data.id ?? "correction-1",
    createdAt: now,
    updatedAt: now,
    reviewedAt: data.reviewedAt ?? null,
    reviewNote: data.reviewNote ?? null,
    ...data,
    revisions,
  };
}

function mutationHarness(options: { promoted?: boolean; active?: { id: string } | null; existingVerification?: any | null } = {}) {
  let created: any = null;
  let verificationCreated: any = null;
  const revisionCreate = jest.fn(async ({ data }: any) => ({ id: `revision-${data.revision}`, ...data, createdAt: new Date() }));
  const tx = {
    $queryRaw: jest.fn(async () => [{ lock: null }]),
    transcriptCorrection: {
      findFirst: jest.fn(async () => options.active ?? null),
      create: jest.fn(async ({ data }: any) => {
        created = correctionRecord({ id: "correction-1", ...data });
        return created;
      }),
      update: jest.fn(async ({ where, data }: any) => correctionRecord({ id: where.id, ...data })),
      findUnique: jest.fn(async () => created ? { ...created, revisions: [{ revision: 1, operation: created.status === "accepted" ? "created-and-accepted-after-playback" : "ai-proposal-created", createdAt: new Date() }] } : null),
    },
    transcriptCorrectionRevision: {
      create: revisionCreate,
      count: jest.fn(async () => 1),
    },
    transcriptSegmentVerification: {
      findFirst: jest.fn(async () => options.existingVerification ?? null),
      create: jest.fn(async ({ data }: any) => {
        verificationCreated = { id: "verification-1", ...data, createdAt: new Date("2026-08-01T23:30:00.000Z") };
        return verificationCreated;
      }),
    },
  };
  const prisma = {
    callRoom: {
      findFirst: jest.fn(async () => accessibleRoom({ promoted: options.promoted })),
      findUnique: jest.fn(async () => ({ id: "room-1", participants: [], recordingConsents: [] })),
    },
    mobileCaptureFinalizationReceipt: { findMany: jest.fn(async () => [{ id: "receipt-1" }]) },
    transcriptCorrection: {
      findUnique: jest.fn(async () => null),
      findFirst: jest.fn(async () => options.active ?? null),
    },
    transcriptSegmentVerification: {
      findUnique: jest.fn(async () => null),
    },
    $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
  };
  return { prisma, tx, revisionCreate };
}

function speakerMutationHarness(options: { active?: any | null; replay?: any | null } = {}) {
  let created: any = null;
  const currentSegments = [segment()];
  const tx = {
    $queryRaw: jest.fn(async () => [{ lock: null }]),
    transcriptJob: {
      findFirst: jest.fn(async () => ({ id: "job-1", asset: recordingAsset(), segments: currentSegments })),
    },
    callRoom: {
      findUnique: jest.fn(async () => ({ id: "room-1", participants: [], recordingConsents: [] })),
    },
    mobileCaptureFinalizationReceipt: { findMany: jest.fn(async () => [{ id: "receipt-1" }]) },
    callParticipant: {
      findFirst: jest.fn(async () => ({ id: "participant-1" })),
    },
    transcriptSpeakerAttribution: {
      findFirst: jest.fn(async () => options.active ?? null),
      update: jest.fn(async ({ where, data }: any) => ({ ...options.active, id: where.id, ...data })),
      create: jest.fn(async ({ data }: any) => {
        created = { id: "attribution-1", ...data, createdAt: new Date(), updatedAt: new Date() };
        return created;
      }),
    },
  };
  const prisma = {
    callRoom: {
      findFirst: jest.fn(async () => accessibleRoom()),
      findUnique: jest.fn(async () => ({ id: "room-1", participants: [], recordingConsents: [] })),
    },
    mobileCaptureFinalizationReceipt: { findMany: jest.fn(async () => [{ id: "receipt-1" }]) },
    transcriptSpeakerAttribution: {
      findUnique: jest.fn(async () => options.replay ?? null),
      findFirst: jest.fn(async () => created ?? options.active ?? null),
    },
    $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
  };
  return { prisma, tx };
}

function impactReviewHarness(options: { artifactUpdatedAt?: Date; artifact?: any | null; active?: any | null } = {}) {
  const artifactUpdatedAt = options.artifactUpdatedAt ?? new Date("2026-08-06T18:00:00.000Z");
  const active = options.active === undefined ? {
    id: "correction-current",
    correctedText: "We should ship the proof watch on Thursday.",
    correctedSpeakerLabel: providerSpeakerLabel,
  } : options.active;
  const artifact = options.artifact === undefined ? {
    id: "task-1",
    roomId: "room-1",
    title: "Publish the delivery plan",
    status: "OPEN",
    assignedUserId: actor.id,
    updatedAt: artifactUpdatedAt,
    sourceJson: {
      transcriptJobId: "job-1",
      segmentId: "segment-1",
      acceptedCorrectionId: null,
      effectiveTextSnapshot: providerText,
      effectiveSpeakerLabelSnapshot: providerSpeakerLabel,
    },
    evidenceReceipts: [],
  } : options.artifact;
  const receiptCreate = jest.fn(async ({ data }: any) => ({ ...data, createdAt: new Date() }));
  const state = {
    callRoom: {
      findFirst: jest.fn(async () => accessibleRoom()),
      findUnique: jest.fn(async () => ({ id: "room-1", participants: [], recordingConsents: [] })),
    },
    mobileCaptureFinalizationReceipt: { findMany: jest.fn(async () => [{ id: "receipt-1" }]) },
    transcriptCorrection: { findFirst: jest.fn(async () => active) },
    transcriptSpeakerAttribution: { findFirst: jest.fn(async () => null) },
    actionItem: { findFirst: jest.fn(async () => artifact) },
  };
  const tx = {
    ...state,
    $queryRaw: jest.fn(async () => [{ lock: null }]),
    actionItemEvidenceReceipt: { create: receiptCreate },
  };
  const prisma = {
    ...state,
    $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
  };
  return { prisma, tx, receiptCreate, artifactUpdatedAt };
}

describe("transcript correction desk", () => {
  it("projects bounded downstream correction impact for the Session finishing cockpit", async () => {
    const accepted = {
      id: "correction-current",
      correctedText: "We should ship the proof watch on Thursday.",
      correctedSpeakerLabel: providerSpeakerLabel,
    };
    const prisma = {
      callRoom: {
        findFirst: jest.fn(async () => ({
          id: "room-1",
          notes: [{
            id: "note-1",
            title: "Delivery plan",
            kind: "DECISION",
            visibility: "SESSION_SHARED",
            authorUserId: actor.id,
            updatedAt: new Date("2026-08-06T18:00:00.000Z"),
            sourceJson: {
              transcriptJobId: "job-1",
              segmentId: "segment-1",
              acceptedCorrectionId: null,
              effectiveTextSnapshot: providerText,
              effectiveSpeakerLabelSnapshot: providerSpeakerLabel,
            },
            revisions: [],
          }],
          actionItems: [],
          goals: [],
          outputs: [],
          transcriptJobs: [{
            id: "job-1",
            status: "COMPLETED",
            asset: recordingAsset(),
            speakerAttributions: [],
            segments: [{
              id: "segment-1",
              speakerLabel: providerSpeakerLabel,
              startSeconds: 12,
              endSeconds: 18,
              text: providerText,
              corrections: [accepted],
            }],
          }],
        })),
        findUnique: jest.fn(async () => ({ id: "room-1", participants: [], recordingConsents: [] })),
      },
      mobileCaptureFinalizationReceipt: { findMany: jest.fn(async () => [{ id: "receipt-1" }]) },
    };

    const result = await readTranscriptCorrectionImpactSummary({ prisma, roomId: "room-1", actor });

    expect(result).toMatchObject({
      available: true,
      held: false,
      transcriptJobId: "job-1",
      counts: {
        needsReview: 1,
        affectedArtifacts: 1,
        ownerResolvable: 1,
        textChanged: 1,
        speakerChanged: 0,
        receiptOnly: 0,
      },
      items: [{
        segmentId: "segment-1",
        artifactKind: "note",
        artifactId: "note-1",
        canAcknowledge: true,
        textChanged: true,
        segmentHref: "/sessions/room-1?mode=transcript#transcript-impact-segment-1",
      }],
    });
    expect(prisma.callRoom.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      select: expect.objectContaining({
        notes: expect.objectContaining({
          where: { OR: [{ authorUserId: actor.id }, { visibility: { in: ["SESSION_SHARED", "CLIENT_SAFE"] } }] },
        }),
        outputs: expect.objectContaining({
          where: { OR: [{ createdByUserId: actor.id }, { recipientUserId: actor.id }] },
        }),
      }),
    }));
  });

  it("appends an owner-only keep-as-written receipt after exact correction comparison", async () => {
    const { prisma, tx, receiptCreate, artifactUpdatedAt } = impactReviewHarness();
    const result = await acknowledgeTranscriptCorrectionImpact({
      prisma,
      actor,
      roomId: "room-1",
      transcriptJobId: "job-1",
      segmentId: "segment-1",
      artifactKind: "task",
      artifactId: "task-1",
      clientRequestId: "impact-review-task-1",
      expectedArtifactUpdatedAt: artifactUpdatedAt.toISOString(),
      expectedAcceptedCorrectionId: "correction-current",
      expectedEffectiveText: "We should ship the proof watch on Thursday.",
      expectedEffectiveSpeakerLabel: providerSpeakerLabel,
      confirmedContentStillValid: true,
    });

    expect(result).toMatchObject({
      ok: true,
      idempotentReplay: false,
      receipt: {
        schema: TRANSCRIPT_CORRECTION_IMPACT_REVIEW_SCHEMA,
        decision: "KEEP_CONTENT",
        artifactKind: "task",
        artifactId: "task-1",
        acceptedCorrectionId: "correction-current",
        effectiveTextSnapshot: "We should ship the proof watch on Thursday.",
        boundaries: { contentChanged: false, externalDelivery: false, publication: false },
      },
    });
    expect(tx.$queryRaw).toHaveBeenCalledTimes(2);
    expect(receiptCreate).toHaveBeenCalledWith({ data: expect.objectContaining({
      id: "impact-review-task-1",
      actionItemId: "task-1",
      actorUserId: actor.id,
      kind: "TRANSCRIPT_CORRECTION_IMPACT_REVIEW",
      evidenceJson: expect.objectContaining({ schema: TRANSCRIPT_CORRECTION_IMPACT_REVIEW_SCHEMA }),
    }) });
  });

  it("fails before mutation when the linked item changed during comparison", async () => {
    const { prisma } = impactReviewHarness();
    await expect(acknowledgeTranscriptCorrectionImpact({
      prisma,
      actor,
      roomId: "room-1",
      transcriptJobId: "job-1",
      segmentId: "segment-1",
      artifactKind: "task",
      artifactId: "task-1",
      clientRequestId: "impact-review-stale",
      expectedArtifactUpdatedAt: "2026-08-06T17:59:00.000Z",
      expectedAcceptedCorrectionId: "correction-current",
      expectedEffectiveText: "We should ship the proof watch on Thursday.",
      expectedEffectiveSpeakerLabel: providerSpeakerLabel,
      confirmedContentStillValid: true,
    })).rejects.toMatchObject({ status: 409, code: "STALE_IMPACT_ARTIFACT" });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("requires current ownership before resolving downstream transcript impact", async () => {
    const { prisma, artifactUpdatedAt } = impactReviewHarness({ artifact: null });
    await expect(acknowledgeTranscriptCorrectionImpact({
      prisma,
      actor,
      roomId: "room-1",
      transcriptJobId: "job-1",
      segmentId: "segment-1",
      artifactKind: "task",
      artifactId: "task-1",
      clientRequestId: "impact-review-not-owner",
      expectedArtifactUpdatedAt: artifactUpdatedAt.toISOString(),
      expectedAcceptedCorrectionId: "correction-current",
      expectedEffectiveText: "We should ship the proof watch on Thursday.",
      expectedEffectiveSpeakerLabel: providerSpeakerLabel,
      confirmedContentStillValid: true,
    })).rejects.toMatchObject({ status: 403, code: "IMPACT_REVIEW_OWNER_REQUIRED" });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("selects only the requested RecordingAsset transcript inside the accessible Session", async () => {
    const prisma = {
      callRoom: {
        findFirst: jest.fn(async () => accessibleRoom()),
        findUnique: jest.fn(async () => ({ id: "room-1", participants: [], recordingConsents: [] })),
      },
      mobileCaptureFinalizationReceipt: { findMany: jest.fn(async () => [{ id: "receipt-1" }]) },
    };

    const result = await readTranscriptCorrectionDesk({
      prisma,
      roomId: "room-1",
      recordingAssetId: "asset-1",
      actor,
    });

    expect(result.transcriptJobId).toBe("job-1");
    expect(prisma.callRoom.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      select: expect.objectContaining({
        transcriptJobs: expect.objectContaining({ where: { assetId: "asset-1" }, take: 1 }),
      }),
    }));
  });

  it("projects isolated source ownership as speaker identity without rewriting provider evidence", async () => {
    const room: any = accessibleRoom();
    room.transcriptJobs[0].resultJson = {
      processingControl: {
        routing: {
          schema: "quipsly-transcript-routing-summary-v1",
          sourceTopology: "participant-isolated",
          participantLabel: "Scott Sparrow",
          speakerAuthority: "source-binding",
          providerOutputRemainsImmutable: true,
        },
      },
    };
    room.transcriptJobs[0]._count = { words: 1 };
    room.transcriptJobs[0].asset.participantId = "participant-scott";
    room.transcriptJobs[0].segments = [{
      ...segment(),
      speakerLabel: null,
      words: [{ ...segment().words[0], speakerLabel: null }],
    }];
    const prisma = {
      callRoom: {
        findFirst: jest.fn(async () => room),
        findUnique: jest.fn(async () => ({ id: "room-1", participants: [], recordingConsents: [] })),
      },
      mobileCaptureFinalizationReceipt: { findMany: jest.fn(async () => [{ id: "receipt-1" }]) },
    };

    const result = await readTranscriptCorrectionDesk({
      prisma,
      roomId: "room-1",
      recordingAssetId: "asset-1",
      actor,
    });

    expect(result.segments[0]).toMatchObject({
      speakerLabel: "Scott Sparrow",
      providerSpeakerLabel: null,
      speakerAuthority: "source-binding",
      sourceBoundParticipantId: "participant-scott",
    });
    expect(result.processing?.routing).toMatchObject({
      sourceTopology: "participant-isolated",
      participantLabel: "Scott Sparrow",
      speakerAuthority: "source-binding",
      providerOutputRemainsImmutable: true,
    });
  });

  it("projects correction impact from accessible canonical provenance without exposing private notes", async () => {
    const accepted = correctionRecord({
      id: "correction-current",
      segmentId: "segment-1",
      origin: "human",
      status: "accepted",
      correctedText: "We should ship the proof watch on Thursday.",
      correctedSpeakerLabel: providerSpeakerLabel,
      reviewedAt: new Date("2026-08-06T18:00:00.000Z"),
      reason: "Corrected the delivery day.",
    });
    const prisma = {
      callRoom: {
        findFirst: jest.fn(async () => ({
          ...accessibleRoom({ corrections: [accepted] }),
          notes: [{
            id: "note-1",
            title: "Delivery plan",
            kind: "DECISION",
            visibility: "SESSION_SHARED",
            sourceJson: {
              transcriptJobId: "job-1",
              segmentId: "segment-1",
              acceptedCorrectionId: null,
            },
          }],
          actionItems: [],
          goals: [],
          outputs: [],
        })),
        findUnique: jest.fn(async () => ({ id: "room-1", participants: [], recordingConsents: [] })),
      },
      mobileCaptureFinalizationReceipt: { findMany: jest.fn(async () => [{ id: "receipt-1" }]) },
    };

    const result = await readTranscriptCorrectionDesk({ prisma, roomId: "room-1", actor });

    expect(result.segments[0].downstreamImpacts).toEqual([
      expect.objectContaining({
        artifactId: "note-1",
        artifactKind: "note",
        label: "Delivery plan",
        state: "needs-review",
      }),
    ]);
    expect(result.impactCoverage).toMatchObject({
      source: "canonical-provenance-projection",
      automaticRegeneration: false,
    });
    expect(prisma.callRoom.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      select: expect.objectContaining({
        notes: expect.objectContaining({
          where: {
            OR: [
              { authorUserId: actor.id },
              { visibility: { in: ["SESSION_SHARED", "CLIENT_SAFE"] } },
            ],
          },
        }),
      }),
    }));
  });

  it("fails closed instead of falling back when an exact source has no accessible transcript", async () => {
    const prisma = {
      callRoom: { findFirst: jest.fn(async () => ({ ...accessibleRoom(), transcriptJobs: [] })) },
    };

    await expect(readTranscriptCorrectionDesk({
      prisma,
      roomId: "room-1",
      recordingAssetId: "asset-outside-room",
      actor,
    })).rejects.toMatchObject({ status: 404, code: "SOURCE_TRANSCRIPT_NOT_FOUND" });
  });

  it("applies one current speaker identity without claiming any turn's words were reviewed", async () => {
    const attribution = {
      id: "attribution-1",
      providerSpeakerLabel,
      participantId: "participant-1",
      participantUserIdSnapshot: "speaker-user-1",
      participantDisplaySnapshot: "Charlie",
      providerSnapshotSha256: speakerSnapshotSha256(),
      sampleSegmentIdsJson: ["segment-1"],
      reviewedAt: new Date("2026-08-03T18:00:00.000Z"),
    };
    const prisma = {
      callRoom: {
        findFirst: jest.fn(async () => accessibleRoom({ speakerAttributions: [attribution] })),
        findUnique: jest.fn(async () => ({ id: "room-1", participants: [], recordingConsents: [] })),
      },
      mobileCaptureFinalizationReceipt: { findMany: jest.fn(async () => [{ id: "receipt-1" }]) },
    };

    const result = await readTranscriptCorrectionDesk({ prisma, roomId: "room-1", actor });

    expect(result.speakerGroups).toEqual([expect.objectContaining({
      providerSpeakerLabel,
      turnCount: 1,
      providerSnapshotSha256: speakerSnapshotSha256(),
      attribution: expect.objectContaining({ schema: TRANSCRIPT_SPEAKER_ATTRIBUTION_SCHEMA, attributedLabel: "Charlie" }),
    })]);
    expect(result.segments[0]).toMatchObject({
      speakerLabel: "Charlie",
      providerSpeakerLabel,
      acceptedCorrection: null,
      acceptedVerification: null,
      speakerAttribution: expect.objectContaining({ id: "attribution-1" }),
      words: [expect.objectContaining({ speakerLabel: providerSpeakerLabel })],
    });
    expect(result.boundaries).toMatchObject({ speakerIdentitySeparateFromWordReview: true });
  });

  it("resolves reviewed overlays without mutating provider words or media anchors", async () => {
    const accepted = correctionRecord({
      id: "accepted-1",
      segmentId: "segment-1",
      origin: "human",
      status: "accepted",
      correctedText: "We should ship the proof-watch tomorrow.",
      correctedSpeakerLabel: "Charlie",
      reason: "Verified against playback",
    }, [{ revision: 1, operation: "created-and-accepted-after-playback", createdAt: new Date() }]);
    const prisma = {
      callRoom: {
        findFirst: jest.fn(async () => accessibleRoom({ corrections: [accepted] })),
        findUnique: jest.fn(async () => ({ id: "room-1", participants: [], recordingConsents: [] })),
      },
      mobileCaptureFinalizationReceipt: { findMany: jest.fn(async () => [{ id: "receipt-1" }]) },
      studioMediaAsset: {
        findFirst: jest.fn(async () => ({
          id: "media-1",
          assetAttachments: [{ project: { slug: "episode-review" } }],
        })),
      },
    };

    const result = await readTranscriptCorrectionDesk({ prisma, roomId: "room-1", actor });

    expect(prisma.callRoom.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        OR: expect.arrayContaining([
          { project: { accessGrants: { some: { email: "producer@example.com", status: "ACTIVE" } } } },
        ]),
      }),
    }));
    expect(result.playback).toMatchObject({ sourceId: "source-1", url: "/api/ingest/media/source-1" });
    expect(result.spectralContext).toEqual({
      projectSlug: "episode-review",
      assetId: "media-1",
      sourceId: "source-1",
    });
    expect(prisma.studioMediaAsset.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        url: "/api/ingest/media/source-1",
        assetAttachments: { some: { projectId: "project-1" } },
      },
    }));
    expect(result.recording).toMatchObject({
      id: "asset-1",
      status: "VERIFIED",
      fileName: "session.m4a",
      eligibleForProtectedPlaybackPreparation: true,
    });
    expect(result.segments[0]).toMatchObject({
      id: "segment-1",
      text: "We should ship the proof-watch tomorrow.",
      speakerLabel: "Charlie",
      providerText,
      providerSpeakerLabel,
      startSeconds: 12,
      endSeconds: 18,
      providerTextSha256: sha256(providerText),
      words: [{
        id: "word-1",
        providerWordIndex: 0,
        startSeconds: 12,
        endSeconds: 12.35,
        word: "We",
        punctuatedWord: "We",
        confidence: 0.99,
        speakerLabel: providerSpeakerLabel,
        channel: 0,
      }],
    });
    expect(result.boundaries).toMatchObject({ providerSegmentsImmutable: true, mediaTimeAnchorsPreserved: true });
  });

  it("keeps a segment-specific reviewed correction above the session-wide speaker identity", async () => {
    const accepted = correctionRecord({
      id: "accepted-1",
      segmentId: "segment-1",
      origin: "human",
      status: "accepted",
      correctedText: providerText,
      correctedSpeakerLabel: "Scott",
      reason: "This turn was the other speaker.",
    }, [{ revision: 1, operation: "created-and-accepted-after-playback", createdAt: new Date() }]);
    const attribution = {
      id: "attribution-1",
      providerSpeakerLabel,
      participantId: "participant-1",
      participantUserIdSnapshot: "speaker-user-1",
      participantDisplaySnapshot: "Charlie",
      providerSnapshotSha256: speakerSnapshotSha256(),
      sampleSegmentIdsJson: ["segment-1"],
      reviewedAt: new Date(),
    };
    const prisma = {
      callRoom: {
        findFirst: jest.fn(async () => accessibleRoom({ corrections: [accepted], speakerAttributions: [attribution] })),
        findUnique: jest.fn(async () => ({ id: "room-1", participants: [], recordingConsents: [] })),
      },
      mobileCaptureFinalizationReceipt: { findMany: jest.fn(async () => [{ id: "receipt-1" }]) },
    };

    const result = await readTranscriptCorrectionDesk({ prisma, roomId: "room-1", actor });
    expect(result.segments[0]).toMatchObject({
      speakerLabel: "Scott",
      providerSpeakerLabel,
      acceptedCorrection: { id: "accepted-1" },
      speakerAttribution: { id: "attribution-1", attributedLabel: "Charlie" },
    });
  });

  it("assigns a provider speaker cluster from protected playback and supersedes the prior identity atomically", async () => {
    const active = {
      id: "attribution-old",
      transcriptJobId: "job-1",
      providerSpeakerLabel,
      participantId: "participant-old",
      providerSnapshotSha256: speakerSnapshotSha256(),
      status: "active",
    };
    const { prisma, tx } = speakerMutationHarness({ active });
    const result = await attributeTranscriptSpeaker({
      prisma,
      actor,
      roomId: "room-1",
      providerSpeakerLabel,
      participantId: "participant-1",
      clientRequestId: "speaker-review-1",
      expectedProviderSnapshotSha256: speakerSnapshotSha256(),
      samples: [{ segmentId: "segment-1", playbackPositionSeconds: 13.5 }],
      confirmedAgainstPlayback: true,
    });

    expect(result).toMatchObject({
      ok: true,
      idempotentReplay: false,
      attribution: {
        schema: TRANSCRIPT_SPEAKER_ATTRIBUTION_SCHEMA,
        providerSpeakerLabel,
        participantId: "participant-1",
        attributedLabel: "Charlie",
      },
    });
    expect(tx.$queryRaw).toHaveBeenCalledTimes(2);
    expect(tx.mobileCaptureFinalizationReceipt.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { recordingAssetId: "asset-1" },
    }));
    expect(tx.transcriptSpeakerAttribution.update).toHaveBeenCalledWith({
      where: { id: "attribution-old" },
      data: { status: "superseded", supersededAt: expect.any(Date) },
    });
    expect(tx.transcriptSpeakerAttribution.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      roomId: "room-1",
      transcriptJobId: "job-1",
      recordingAssetId: "asset-1",
      providerSpeakerLabel,
      participantId: "participant-1",
      participantDisplaySnapshot: "Charlie",
      providerSnapshotSha256: speakerSnapshotSha256(),
      sampleSegmentIdsJson: ["segment-1"],
      sampleEvidenceJson: [expect.objectContaining({
        segmentId: "segment-1",
        playbackPositionSeconds: 13.5,
        providerTextSha256: sha256(providerText),
      })],
    }) });
  });

  it("reuses only an exact persisted request replay without entering another transaction", async () => {
    const replay = {
      id: "speaker-attribution-replay",
      roomId: "room-1",
      transcriptJobId: "job-1",
      recordingAssetId: "asset-1",
      providerSpeakerLabel,
      participantId: "participant-1",
      participantUserIdSnapshot: "speaker-user-1",
      participantDisplaySnapshot: "Charlie",
      providerSnapshotSha256: speakerSnapshotSha256(),
      sampleSegmentIdsJson: ["segment-1"],
      sampleEvidenceJson: [{
        endSeconds: 18,
        segmentId: "segment-1",
        playbackPositionSeconds: 13.5,
        providerTextSha256: sha256(providerText),
        startSeconds: 12,
      }],
      reviewedAt: new Date("2026-08-03T18:00:00.000Z"),
    };
    const { prisma } = speakerMutationHarness({ replay });
    const result = await attributeTranscriptSpeaker({
      prisma,
      actor,
      roomId: "room-1",
      providerSpeakerLabel,
      participantId: "participant-1",
      clientRequestId: "speaker-review-exact-replay",
      expectedProviderSnapshotSha256: speakerSnapshotSha256(),
      samples: [{ segmentId: "segment-1", playbackPositionSeconds: 13.5 }],
      confirmedAgainstPlayback: true,
    });

    expect(result).toMatchObject({
      ok: true,
      idempotentReplay: true,
      attribution: { id: "speaker-attribution-replay", attributedLabel: "Charlie" },
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("rejects changed speaker intent under a persisted request id", async () => {
    const { prisma } = speakerMutationHarness({ replay: {
      id: "speaker-attribution-conflict",
      roomId: "room-1",
      transcriptJobId: "job-1",
      providerSpeakerLabel,
      participantId: "different-participant",
      providerSnapshotSha256: speakerSnapshotSha256(),
      sampleEvidenceJson: [],
    } });
    await expect(attributeTranscriptSpeaker({
      prisma,
      actor,
      roomId: "room-1",
      providerSpeakerLabel,
      participantId: "participant-1",
      clientRequestId: "speaker-review-conflict",
      expectedProviderSnapshotSha256: speakerSnapshotSha256(),
      samples: [{ segmentId: "segment-1", playbackPositionSeconds: 13.5 }],
      confirmedAgainstPlayback: true,
    })).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT", status: 409 });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("rejects a stale speaker snapshot before entering the attribution transaction", async () => {
    const { prisma } = speakerMutationHarness();
    await expect(attributeTranscriptSpeaker({
      prisma,
      actor,
      roomId: "room-1",
      providerSpeakerLabel,
      participantId: "participant-1",
      clientRequestId: "speaker-review-stale",
      expectedProviderSnapshotSha256: "f".repeat(64),
      samples: [{ segmentId: "segment-1", playbackPositionSeconds: 13.5 }],
      confirmedAgainstPlayback: true,
    })).rejects.toMatchObject({ code: "STALE_SPEAKER_EVIDENCE", status: 409 });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("fails closed when the recording release gate changes after transaction locks are acquired", async () => {
    const gate = mobileCaptureProcessingGateFromEvidence as jest.Mock;
    gate
      .mockImplementationOnce(() => ({ allowed: true }))
      .mockImplementationOnce(() => ({ allowed: false, error: "Recording consent was withdrawn." }));
    const { prisma, tx } = speakerMutationHarness();

    await expect(attributeTranscriptSpeaker({
      prisma,
      actor,
      roomId: "room-1",
      providerSpeakerLabel,
      participantId: "participant-1",
      clientRequestId: "speaker-review-held-in-transaction",
      expectedProviderSnapshotSha256: speakerSnapshotSha256(),
      samples: [{ segmentId: "segment-1", playbackPositionSeconds: 13.5 }],
      confirmedAgainstPlayback: true,
    })).rejects.toMatchObject({ code: "TRANSCRIPT_HELD", status: 409 });

    expect(tx.transcriptSpeakerAttribution.findFirst).not.toHaveBeenCalled();
    expect(tx.transcriptSpeakerAttribution.create).not.toHaveBeenCalled();
  });

  it("surfaces a current playback-backed provider verification as reviewed without a correction", async () => {
    const verification = {
      id: "verification-1",
      segmentId: "segment-1",
      reviewKind: "confirmed-as-is",
      providerTextSha256: sha256(providerText),
      providerSpeakerLabel,
      createdAt: new Date("2026-08-01T23:30:00.000Z"),
    };
    const prisma = {
      callRoom: {
        findFirst: jest.fn(async () => accessibleRoom({ verifications: [verification] })),
        findUnique: jest.fn(async () => ({ id: "room-1", participants: [], recordingConsents: [] })),
      },
      mobileCaptureFinalizationReceipt: { findMany: jest.fn(async () => [{ id: "receipt-1" }]) },
    };

    const result = await readTranscriptCorrectionDesk({ prisma, roomId: "room-1", actor });

    expect(result.segments[0]).toMatchObject({
      acceptedCorrection: null,
      acceptedVerification: {
        id: "verification-1",
        segmentId: "segment-1",
        reviewKind: "confirmed-as-is",
        reviewedAt: "2026-08-01T23:30:00.000Z",
      },
    });
  });

  it("keeps the verified recording identity available when protected playback still needs preparation", async () => {
    const prisma = {
      callRoom: {
        findFirst: jest.fn(async () => accessibleRoom({ promoted: false })),
        findUnique: jest.fn(async () => ({ id: "room-1", participants: [], recordingConsents: [] })),
      },
      mobileCaptureFinalizationReceipt: { findMany: jest.fn(async () => [{ id: "receipt-1" }]) },
    };

    const result = await readTranscriptCorrectionDesk({ prisma, roomId: "room-1", actor });

    expect(result.playback).toBeNull();
    expect(result.recording).toMatchObject({
      id: "asset-1",
      status: "VERIFIED",
      eligibleForProtectedPlaybackPreparation: true,
    });
  });

  it("shows one decision for duplicate AI proposals while preserving complete history", async () => {
    const duplicate = {
      segmentId: "segment-1",
      origin: "ai",
      status: "proposed",
      correctedText: providerText,
      correctedSpeakerLabel: "Charlie",
      reason: "Isolated track attribution",
    };
    const first = correctionRecord({ ...duplicate, id: "proposal-1" });
    const retryByAnotherActor = correctionRecord({ ...duplicate, id: "proposal-2" });
    const prisma = {
      callRoom: {
        findFirst: jest.fn(async () => accessibleRoom({
          corrections: [retryByAnotherActor, first],
        })),
        findUnique: jest.fn(async () => ({ id: "room-1", participants: [], recordingConsents: [] })),
      },
      mobileCaptureFinalizationReceipt: {
        findMany: jest.fn(async () => [{ id: "receipt-1" }]),
      },
    };

    const result = await readTranscriptCorrectionDesk({
      prisma,
      roomId: "room-1",
      actor,
    });

    expect(result.segments[0].proposals).toHaveLength(1);
    expect(result.segments[0].proposals[0].id).toBe("proposal-2");
    expect(result.segments[0].correctionHistory).toHaveLength(2);
  });

  it("does not revive an identical AI proposal after a human decision", async () => {
    const proposal = {
      segmentId: "segment-1",
      origin: "ai",
      correctedText: providerText,
      correctedSpeakerLabel: "Charlie",
      reason: "Isolated track attribution",
    };
    const pendingRetry = correctionRecord({
      ...proposal,
      id: "proposal-pending",
      status: "proposed",
    });
    const rejected = correctionRecord({
      ...proposal,
      id: "proposal-rejected",
      status: "rejected",
      reviewedAt: new Date("2026-07-19T05:10:00.000Z"),
    });
    const prisma = {
      callRoom: {
        findFirst: jest.fn(async () => accessibleRoom({
          corrections: [pendingRetry, rejected],
        })),
        findUnique: jest.fn(async () => ({ id: "room-1", participants: [], recordingConsents: [] })),
      },
      mobileCaptureFinalizationReceipt: {
        findMany: jest.fn(async () => [{ id: "receipt-1" }]),
      },
    };

    const result = await readTranscriptCorrectionDesk({
      prisma,
      roomId: "room-1",
      actor,
    });

    expect(result.segments[0].proposals).toHaveLength(0);
    expect(result.segments[0].correctionHistory).toHaveLength(2);
  });

  it("accepts a human correction only with protected playback at the segment time", async () => {
    const { prisma, tx, revisionCreate } = mutationHarness();
    const result = await createTranscriptCorrection({
      prisma,
      actor,
      roomId: "room-1",
      segmentId: "segment-1",
      clientRequestId: "review-1",
      origin: "human",
      expectedText: providerText,
      expectedSpeakerLabel: providerSpeakerLabel,
      correctedText: "We should ship the proof-watch tomorrow.",
      correctedSpeakerLabel: "Charlie",
      reason: "Hyphen and speaker verified",
      confirmedAgainstPlayback: true,
      playbackPositionSeconds: 13.5,
    });

    expect(result).toMatchObject({ ok: true, idempotentReplay: false, correction: { status: "accepted" } });
    expect(tx.$queryRaw).toHaveBeenCalledTimes(2);
    expect(tx.transcriptCorrection.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
      status: "accepted",
      baseTextSha256: sha256(providerText),
      expectedText: providerText,
      startSecondsSnapshot: 12,
      endSecondsSnapshot: 18,
      reviewedByUserId: actor.id,
      provenanceJson: expect.objectContaining({ schema: TRANSCRIPT_CORRECTION_SCHEMA }),
    }) }));
    expect(revisionCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ revision: 1, operation: "created-and-accepted-after-playback" }) }));
  });

  it("records a reviewed-as-is receipt only after protected playback at the segment time", async () => {
    const { prisma, tx } = mutationHarness();
    const result = await confirmTranscriptSegmentAsIs({
      prisma,
      actor,
      roomId: "room-1",
      segmentId: "segment-1",
      clientRequestId: "verify-1",
      expectedText: providerText,
      expectedSpeakerLabel: providerSpeakerLabel,
      expectedAcceptedCorrectionId: null,
      confirmedAgainstPlayback: true,
      playbackPositionSeconds: 13.5,
    });

    expect(result).toMatchObject({
      ok: true,
      idempotentReplay: false,
      verification: { id: "verification-1", reviewKind: "confirmed-as-is" },
    });
    expect(tx.$queryRaw).toHaveBeenCalledTimes(2);
    expect(tx.transcriptSegmentVerification.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
      roomId: "room-1",
      transcriptJobId: "job-1",
      segmentId: "segment-1",
      recordingAssetId: "asset-1",
      reviewerUserId: actor.id,
      providerTextSha256: sha256(providerText),
      providerSpeakerLabel,
      playbackSourceId: "source-1",
      playbackPositionSeconds: 13.5,
    }) }));
    expect(tx.transcriptCorrection.create).not.toHaveBeenCalled();
  });

  it("refuses to confirm provider text as-is when a reviewed correction is active", async () => {
    const { prisma, tx } = mutationHarness({ active: { id: "accepted-1" } });
    await expect(confirmTranscriptSegmentAsIs({
      prisma,
      actor,
      roomId: "room-1",
      segmentId: "segment-1",
      clientRequestId: "verify-stale",
      expectedText: providerText,
      expectedSpeakerLabel: providerSpeakerLabel,
      expectedAcceptedCorrectionId: "accepted-1",
      confirmedAgainstPlayback: true,
      playbackPositionSeconds: 13.5,
    })).rejects.toMatchObject<Partial<TranscriptCorrectionError>>({ status: 409, code: "CORRECTION_ALREADY_ACTIVE" });
    expect(tx.transcriptSegmentVerification.create).not.toHaveBeenCalled();
  });

  it("serializes review writers and reuses an already-current verification", async () => {
    const existingVerification = {
      id: "verification-current",
      segmentId: "segment-1",
      reviewKind: "confirmed-as-is",
      providerTextSha256: sha256(providerText),
      providerSpeakerLabel,
      createdAt: new Date("2026-08-01T23:31:00.000Z"),
    };
    const { prisma, tx } = mutationHarness({ existingVerification });
    const result = await confirmTranscriptSegmentAsIs({
      prisma,
      actor,
      roomId: "room-1",
      segmentId: "segment-1",
      clientRequestId: "verify-concurrent-retry",
      expectedText: providerText,
      expectedSpeakerLabel: providerSpeakerLabel,
      confirmedAgainstPlayback: true,
      playbackPositionSeconds: 13.5,
    });

    expect(tx.$queryRaw).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({
      ok: true,
      idempotentReplay: true,
      verification: { id: "verification-current" },
    });
    expect(tx.transcriptSegmentVerification.create).not.toHaveBeenCalled();
  });

  it("refuses paperwork-only acceptance when protected playback is unavailable", async () => {
    const { prisma, tx } = mutationHarness({ promoted: false });
    await expect(createTranscriptCorrection({
      prisma,
      actor,
      roomId: "room-1",
      segmentId: "segment-1",
      clientRequestId: "review-no-playback",
      origin: "human",
      expectedText: providerText,
      expectedSpeakerLabel: providerSpeakerLabel,
      correctedText: "Corrected words",
      confirmedAgainstPlayback: true,
      playbackPositionSeconds: 13,
    })).rejects.toMatchObject<Partial<TranscriptCorrectionError>>({ status: 409, code: "PLAYBACK_UNAVAILABLE" });
    expect(tx.transcriptCorrection.create).not.toHaveBeenCalled();
  });

  it("quarantines AI output as a proposal even when its words look plausible", async () => {
    const { prisma, tx } = mutationHarness({ promoted: false });
    const result = await createTranscriptCorrection({
      prisma,
      actor,
      roomId: "room-1",
      segmentId: "segment-1",
      clientRequestId: "ai-1",
      origin: "ai",
      expectedText: providerText,
      expectedSpeakerLabel: providerSpeakerLabel,
      correctedText: "We should ship the proof-watch tomorrow.",
      correctedSpeakerLabel: "Charlie",
      aiReceipt: { provider: "local-review-model", model: "fixture" },
    });
    expect(result.correction).toMatchObject({ origin: "ai", status: "proposed" });
    expect(tx.transcriptCorrection.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
      status: "proposed",
      reviewedByUserId: null,
      reviewedAt: null,
    }) }));
  });

  it("fails closed rather than replacing a correction the reviewer did not see", async () => {
    const { prisma, tx } = mutationHarness({ active: { id: "newer-correction" } });
    await expect(createTranscriptCorrection({
      prisma,
      actor,
      roomId: "room-1",
      segmentId: "segment-1",
      clientRequestId: "stale-overlay",
      origin: "human",
      expectedText: providerText,
      expectedSpeakerLabel: providerSpeakerLabel,
      expectedAcceptedCorrectionId: null,
      correctedText: "Corrected words",
      confirmedAgainstPlayback: true,
      playbackPositionSeconds: 13,
    })).rejects.toMatchObject<Partial<TranscriptCorrectionError>>({ status: 409, code: "STALE_CORRECTION_OVERLAY" });
    expect(tx.transcriptCorrection.create).not.toHaveBeenCalled();
  });

  it("does not create another revision when the reviewed overlay already says the same thing", async () => {
    const active = {
      id: "accepted-1",
      correctedText: "We should ship the proof-watch tomorrow.",
      correctedSpeakerLabel: "Charlie",
    };
    const { prisma, tx } = mutationHarness({ active });
    await expect(createTranscriptCorrection({
      prisma,
      actor,
      roomId: "room-1",
      segmentId: "segment-1",
      clientRequestId: "same-overlay",
      origin: "human",
      expectedText: providerText,
      expectedSpeakerLabel: providerSpeakerLabel,
      expectedAcceptedCorrectionId: active.id,
      correctedText: active.correctedText,
      correctedSpeakerLabel: active.correctedSpeakerLabel,
      confirmedAgainstPlayback: true,
      playbackPositionSeconds: 13,
    })).rejects.toMatchObject<Partial<TranscriptCorrectionError>>({ status: 409, code: "UNCHANGED_CORRECTION_OVERLAY" });
    expect(tx.transcriptCorrection.create).not.toHaveBeenCalled();
  });
});
