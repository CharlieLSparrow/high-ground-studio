/** @jest-environment node */

jest.mock("server-only", () => ({}));
jest.mock("./mobile-capture-processing-policy.js", () => ({
  mobileCaptureProcessingGateFromEvidence: jest.fn(() => ({ allowed: true })),
}));

import { createHash } from "node:crypto";

import {
  confirmTranscriptSegmentAsIs,
  createTranscriptCorrection,
  readTranscriptCorrectionDesk,
  TRANSCRIPT_CORRECTION_SCHEMA,
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

function accessibleRoom(options: { promoted?: boolean; corrections?: any[]; verifications?: any[] } = {}) {
  return {
    id: "room-1",
    title: "Episode review",
    transcriptJobs: [{
      id: "job-1",
      status: "COMPLETED",
      asset: recordingAsset(options.promoted !== false),
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

describe("transcript correction desk", () => {
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
