import "server-only";

import { createHash } from "node:crypto";

import { mobileCaptureProcessingGateFromEvidence } from "./mobile-capture-processing-policy.js";
import { acquirePrismaAdvisoryTransactionLock } from "./prisma-advisory-lock.js";
import { reconcileCaptureTranscriptJob } from "@/lib/server/capture-transcript-reconciliation";

export const TRANSCRIPT_CORRECTION_SCHEMA = "quipsly-transcript-correction-v1";
export const TRANSCRIPT_SEGMENT_VERIFICATION_SCHEMA = "quipsly-transcript-segment-verification-v1";

export type TranscriptCorrectionActor = {
  id: string;
  email?: string | null;
  isStaff: boolean;
};

export class TranscriptCorrectionError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(
    message: string,
    status: number,
    code: string,
  ) {
    super(message);
    this.name = "TranscriptCorrectionError";
    this.status = status;
    this.code = code;
  }
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function object(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function nullableLabel(value: unknown) {
  const normalized = text(value);
  return normalized || null;
}

function sha256(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function accessibleRoomWhere(roomId: string, actor: TranscriptCorrectionActor) {
  if (actor.isStaff) return { id: roomId };
  const email = text(actor.email).toLowerCase();
  return {
    id: roomId,
    OR: [
      { createdByUserId: actor.id },
      { participants: { some: { userId: actor.id } } },
      { booking: { clientUserId: actor.id } },
      { booking: { coachUserId: actor.id } },
      ...(email ? [{ project: { accessGrants: { some: { email, status: "ACTIVE" } } } }] : []),
    ],
  };
}

function playbackFromAsset(asset: any) {
  const promotion = object(object(asset?.localManifestJson).promotion);
  const sourceId = text(promotion.sourceId);
  const playbackUrl = text(promotion.playbackUrl);
  if (!sourceId || playbackUrl !== `/api/ingest/media/${sourceId}`) return null;
  return {
    sourceId,
    url: playbackUrl,
    kind: text(promotion.mediaKind) === "video" ? "video" as const : "audio" as const,
    recordingAssetId: asset.id as string,
    durationSeconds: typeof asset.durationSeconds === "number" ? asset.durationSeconds : null,
    label: text(asset.fileName) || "Session recording",
  };
}

async function transcriptProcessingGate(prisma: any, recordingAsset: any) {
  const [receipts, room] = await Promise.all([
    prisma.mobileCaptureFinalizationReceipt.findMany({
      where: { recordingAssetId: recordingAsset.id },
      orderBy: { createdAt: "asc" },
    }),
    prisma.callRoom.findUnique({
      where: { id: recordingAsset.roomId },
      include: { participants: true, recordingConsents: true },
    }),
  ]);
  return mobileCaptureProcessingGateFromEvidence({
    recordingAsset,
    receipts,
    room,
    transcript: true,
  });
}

function correctionSnapshot(correction: any) {
  return {
    schema: TRANSCRIPT_CORRECTION_SCHEMA,
    correctionId: correction.id,
    roomId: correction.roomId,
    transcriptJobId: correction.transcriptJobId,
    segmentId: correction.segmentId,
    origin: correction.origin,
    status: correction.status,
    baseTextSha256: correction.baseTextSha256,
    expectedText: correction.expectedText,
    expectedSpeakerLabel: correction.expectedSpeakerLabel,
    startSecondsSnapshot: correction.startSecondsSnapshot,
    endSecondsSnapshot: correction.endSecondsSnapshot,
    correctedText: correction.correctedText,
    correctedSpeakerLabel: correction.correctedSpeakerLabel,
    reason: correction.reason,
    provenance: correction.provenanceJson,
    reviewedByUserId: correction.reviewedByUserId,
    reviewedAt: correction.reviewedAt instanceof Date
      ? correction.reviewedAt.toISOString()
      : correction.reviewedAt ?? null,
    reviewNote: correction.reviewNote,
    createdAt: correction.createdAt instanceof Date
      ? correction.createdAt.toISOString()
      : correction.createdAt,
    updatedAt: correction.updatedAt instanceof Date
      ? correction.updatedAt.toISOString()
      : correction.updatedAt,
  };
}

function publicCorrection(correction: any) {
  return {
    id: correction.id as string,
    segmentId: correction.segmentId as string,
    origin: correction.origin as "human" | "ai",
    status: correction.status as "proposed" | "accepted" | "rejected" | "superseded",
    correctedText: correction.correctedText as string | null,
    correctedSpeakerLabel: correction.correctedSpeakerLabel as string | null,
    reason: correction.reason as string | null,
    reviewedAt: correction.reviewedAt instanceof Date
      ? correction.reviewedAt.toISOString()
      : correction.reviewedAt ?? null,
    createdAt: correction.createdAt instanceof Date
      ? correction.createdAt.toISOString()
      : correction.createdAt,
    updatedAt: correction.updatedAt instanceof Date
      ? correction.updatedAt.toISOString()
      : correction.updatedAt,
    revisions: Array.isArray(correction.revisions)
      ? correction.revisions.map((revision: any) => ({
          revision: revision.revision,
          operation: revision.operation,
          createdAt: revision.createdAt instanceof Date ? revision.createdAt.toISOString() : revision.createdAt,
        }))
      : [],
  };
}

function publicVerification(verification: any) {
  return {
    id: verification.id as string,
    segmentId: verification.segmentId as string,
    reviewKind: verification.reviewKind as "confirmed-as-is",
    reviewedAt: verification.createdAt instanceof Date
      ? verification.createdAt.toISOString()
      : verification.createdAt,
  };
}

function proposalIdentity(correction: any) {
  return JSON.stringify([
    nullableLabel(correction.correctedSpeakerLabel),
    text(correction.correctedText),
    text(correction.reason),
  ]);
}

function visibleTranscriptProposals(corrections: any[]) {
  const decided = new Set(
    corrections
      .filter((correction) => correction.origin === "ai" && correction.status !== "proposed")
      .map(proposalIdentity),
  );
  const visible = new Set<string>();
  return corrections.filter((correction) => {
    if (correction.origin !== "ai" || correction.status !== "proposed") return false;
    const identity = proposalIdentity(correction);
    if (decided.has(identity) || visible.has(identity)) return false;
    visible.add(identity);
    return true;
  });
}

async function loadAccessibleRoom(prisma: any, roomId: string, actor: TranscriptCorrectionActor) {
  const room = await prisma.callRoom.findFirst({
    where: accessibleRoomWhere(roomId, actor),
    select: {
      id: true,
      title: true,
      projectId: true,
      transcriptJobs: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          id: true,
          status: true,
          errorMessage: true,
          processingManifestObject: true,
          processingResultObject: true,
          sourceGeneration: true,
          sourceSha256: true,
          providerRequestId: true,
          providerResponseObject: true,
          workerBuildId: true,
          resultJson: true,
          _count: { select: { words: true } },
          asset: {
            select: {
              id: true,
              roomId: true,
              kind: true,
              status: true,
              fileName: true,
              durationSeconds: true,
              byteSize: true,
              checksum: true,
              storageBucket: true,
              storageObjectPath: true,
              localManifestJson: true,
            },
          },
          segments: {
            orderBy: { startSeconds: "asc" },
            take: 1000,
            select: {
              id: true,
              speakerLabel: true,
              startSeconds: true,
              endSeconds: true,
              text: true,
              confidence: true,
              words: {
                orderBy: { providerWordIndex: "asc" },
                select: {
                  id: true,
                  providerWordIndex: true,
                  startSeconds: true,
                  endSeconds: true,
                  word: true,
                  punctuatedWord: true,
                  confidence: true,
                  speakerLabel: true,
                  channel: true,
                },
              },
              corrections: {
                orderBy: { updatedAt: "desc" },
                select: {
                  id: true,
                  segmentId: true,
                  origin: true,
                  status: true,
                  correctedText: true,
                  correctedSpeakerLabel: true,
                  reason: true,
                  reviewedAt: true,
                  createdAt: true,
                  updatedAt: true,
                  revisions: {
                    orderBy: { revision: "asc" },
                    select: { revision: true, operation: true, createdAt: true },
                  },
                },
              },
              verifications: {
                orderBy: { createdAt: "desc" },
                take: 1,
                select: {
                  id: true,
                  segmentId: true,
                  reviewKind: true,
                  providerTextSha256: true,
                  providerSpeakerLabel: true,
                  createdAt: true,
                },
              },
            },
          },
        },
      },
    },
  });
  if (!room) throw new TranscriptCorrectionError("Session not found or not accessible.", 404, "ROOM_NOT_FOUND");
  return room;
}

export async function readTranscriptCorrectionDesk(input: {
  prisma: any;
  roomId: string;
  actor: TranscriptCorrectionActor;
}) {
  let room = await loadAccessibleRoom(input.prisma, input.roomId, input.actor);
  let job = room.transcriptJobs[0] ?? null;
  if (
    job?.status === "RUNNING"
    && job.processingManifestObject
  ) {
    const reconciliation = await reconcileCaptureTranscriptJob({
      prisma: input.prisma,
      transcriptJobId: job.id,
    });
    if (reconciliation.status !== "pending") {
      room = await loadAccessibleRoom(input.prisma, input.roomId, input.actor);
      job = room.transcriptJobs[0] ?? null;
    }
  }
  if (!job?.asset) {
    return {
      ok: true,
      roomId: room.id,
      projectId: room.projectId ?? null,
      transcriptJobId: job?.id ?? null,
      transcriptStatus: job?.status ?? null,
      processing: transcriptProcessingSummary(job),
      gate: { allowed: false, error: "No recording-backed transcript is available." },
      playback: null,
      segments: [],
      boundaries: transcriptCorrectionBoundaries(),
    };
  }

  const gate = await transcriptProcessingGate(input.prisma, job.asset);
  if (!gate.allowed) {
    return {
      ok: true,
      roomId: room.id,
      projectId: room.projectId ?? null,
      transcriptJobId: job.id,
      transcriptStatus: job.status,
      processing: transcriptProcessingSummary(job),
      gate,
      playback: null,
      segments: [],
      boundaries: transcriptCorrectionBoundaries(),
    };
  }

  return {
    ok: true,
    roomId: room.id,
    projectId: room.projectId ?? null,
    transcriptJobId: job.id,
    transcriptStatus: job.status,
    processing: transcriptProcessingSummary(job),
    gate,
    playback: playbackFromAsset(job.asset),
    segments: job.segments.map((segment: any) => {
      const accepted = segment.corrections.find((correction: any) => correction.status === "accepted") ?? null;
      const acceptedVerification = !accepted
        && segment.verifications[0]?.providerTextSha256 === sha256(segment.text)
        && (segment.verifications[0]?.providerSpeakerLabel ?? null) === (segment.speakerLabel ?? null)
        ? segment.verifications[0]
        : null;
      const proposals = visibleTranscriptProposals(segment.corrections);
      return {
        id: segment.id,
        speakerLabel: accepted?.correctedSpeakerLabel ?? segment.speakerLabel ?? null,
        providerSpeakerLabel: segment.speakerLabel ?? null,
        startSeconds: segment.startSeconds,
        endSeconds: segment.endSeconds,
        text: accepted?.correctedText ?? segment.text,
        providerText: segment.text,
        providerTextSha256: sha256(segment.text),
        confidence: segment.confidence ?? null,
        words: segment.words.map((word: any) => ({
          id: word.id,
          providerWordIndex: word.providerWordIndex,
          startSeconds: word.startSeconds,
          endSeconds: word.endSeconds,
          word: word.word,
          punctuatedWord: word.punctuatedWord,
          confidence: word.confidence ?? null,
          speakerLabel: word.speakerLabel ?? null,
          channel: word.channel ?? null,
        })),
        acceptedCorrection: accepted ? publicCorrection(accepted) : null,
        acceptedVerification: acceptedVerification ? publicVerification(acceptedVerification) : null,
        proposals: proposals.map(publicCorrection),
        correctionHistory: segment.corrections.map(publicCorrection),
      };
    }),
    boundaries: transcriptCorrectionBoundaries(),
  };
}

export function transcriptCorrectionBoundaries() {
  return {
    providerSegmentsImmutable: true,
    correctionOverlayVersioned: true,
    acceptedHumanCorrectionRequiresPlaybackConfirmation: true,
    confirmedAsIsRequiresPlaybackConfirmation: true,
    aiOutputRequiresHumanReview: true,
    mediaTimeAnchorsPreserved: true,
    providerWordTimeAnchorsImmutable: true,
    noTaskCreated: true,
    noExternalDelivery: true,
    noPublication: true,
  };
}

function transcriptProcessingSummary(job: any) {
  if (!job) return null;
  const result = object(job.resultJson);
  const control = object(result.processingControl);
  return {
    status: job.status,
    message: job.errorMessage ?? null,
    wordCount: job._count?.words ?? 0,
    sourceBound: Boolean(
      job.processingManifestObject
      && job.sourceGeneration
      && job.sourceSha256,
    ),
    executionRequestedAt: text(control.executionRequestedAt) || null,
    resultReceived: Boolean(job.processingResultObject),
    providerReceiptReceived: Boolean(
      job.providerRequestId
      && job.providerResponseObject,
    ),
    workerBuildId: job.workerBuildId ?? null,
  };
}

function validateCorrectionChange(input: {
  providerText: string;
  providerSpeakerLabel: string | null;
  correctedText: unknown;
  correctedSpeakerLabel: unknown;
}) {
  const correctedText = text(input.correctedText) || null;
  const correctedSpeakerLabel = nullableLabel(input.correctedSpeakerLabel);
  if (!correctedText && !correctedSpeakerLabel) {
    throw new TranscriptCorrectionError("Enter corrected words, a corrected speaker, or both.", 400, "EMPTY_CORRECTION");
  }
  if (correctedText === input.providerText && correctedSpeakerLabel === input.providerSpeakerLabel) {
    throw new TranscriptCorrectionError("The correction does not change the provider transcript.", 400, "UNCHANGED_CORRECTION");
  }
  return { correctedText, correctedSpeakerLabel };
}

function correctionMatchesActiveOverlay(input: {
  providerText: string;
  providerSpeakerLabel: string | null;
  correctedText: string | null;
  correctedSpeakerLabel: string | null;
  active: { correctedText?: string | null; correctedSpeakerLabel?: string | null } | null;
}) {
  if (!input.active) return false;
  return (input.correctedText ?? input.providerText) === (input.active.correctedText ?? input.providerText)
    && (input.correctedSpeakerLabel ?? input.providerSpeakerLabel) === (input.active.correctedSpeakerLabel ?? input.providerSpeakerLabel);
}

function assertPlaybackConfirmation(input: {
  playback: ReturnType<typeof playbackFromAsset>;
  confirmedAgainstPlayback: unknown;
  playbackPositionSeconds: unknown;
  startSeconds: number;
  endSeconds: number;
}) {
  if (!input.playback) {
    throw new TranscriptCorrectionError(
      "Promote the verified recording to protected Quipsly media before accepting a correction against playback.",
      409,
      "PLAYBACK_UNAVAILABLE",
    );
  }
  if (input.confirmedAgainstPlayback !== true) {
    throw new TranscriptCorrectionError("Listen to this segment and confirm the correction before accepting it.", 409, "PLAYBACK_NOT_CONFIRMED");
  }
  const position = typeof input.playbackPositionSeconds === "number" ? input.playbackPositionSeconds : Number.NaN;
  if (!Number.isFinite(position) || position < Math.max(0, input.startSeconds - 1) || position > input.endSeconds + 3) {
    throw new TranscriptCorrectionError("Play this segment from its timestamp before accepting the correction.", 409, "PLAYBACK_POSITION_MISMATCH");
  }
  return position;
}

async function loadMutationEvidence(prisma: any, input: {
  roomId: string;
  segmentId: string;
  actor: TranscriptCorrectionActor;
}) {
  const room = await prisma.callRoom.findFirst({
    where: accessibleRoomWhere(input.roomId, input.actor),
    select: {
      id: true,
      transcriptJobs: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          id: true,
          asset: {
            select: {
              id: true,
              roomId: true,
              kind: true,
              status: true,
              fileName: true,
              durationSeconds: true,
              byteSize: true,
              checksum: true,
              storageBucket: true,
              storageObjectPath: true,
              localManifestJson: true,
            },
          },
          segments: {
            where: { id: input.segmentId },
            take: 1,
            select: { id: true, text: true, speakerLabel: true, startSeconds: true, endSeconds: true },
          },
        },
      },
    },
  });
  const job = room?.transcriptJobs[0] ?? null;
  const segment = job?.segments[0] ?? null;
  if (!room || !job?.asset || !segment) {
    throw new TranscriptCorrectionError("The current transcript segment was not found in this session.", 404, "SEGMENT_NOT_FOUND");
  }
  const gate = await transcriptProcessingGate(prisma, job.asset);
  if (!gate.allowed) {
    throw new TranscriptCorrectionError(gate.error || "Transcript correction is held by its release gate.", 409, "TRANSCRIPT_HELD");
  }
  return { room, job, segment, playback: playbackFromAsset(job.asset) };
}

export async function confirmTranscriptSegmentAsIs(input: {
  prisma: any;
  actor: TranscriptCorrectionActor;
  roomId: string;
  segmentId: string;
  clientRequestId: string;
  expectedText: string;
  expectedSpeakerLabel?: string | null;
  expectedAcceptedCorrectionId?: string | null;
  confirmedAgainstPlayback?: boolean;
  playbackPositionSeconds?: number;
  reviewNote?: string | null;
}) {
  const roomId = text(input.roomId);
  const segmentId = text(input.segmentId);
  const clientRequestId = text(input.clientRequestId);
  if (!roomId || !segmentId || !clientRequestId || clientRequestId.length > 160) {
    throw new TranscriptCorrectionError("roomId, segmentId, and a bounded clientRequestId are required.", 400, "INVALID_REQUEST");
  }

  const evidence = await loadMutationEvidence(input.prisma, { roomId, segmentId, actor: input.actor });
  const replay = await input.prisma.transcriptSegmentVerification.findUnique({
    where: { reviewerUserId_clientRequestId: { reviewerUserId: input.actor.id, clientRequestId } },
  });
  if (replay) {
    if (replay.roomId !== roomId || replay.segmentId !== segmentId) {
      throw new TranscriptCorrectionError("That request id is already bound to different evidence.", 409, "IDEMPOTENCY_CONFLICT");
    }
    return { ok: true, idempotentReplay: true, verification: publicVerification(replay), boundaries: transcriptCorrectionBoundaries() };
  }

  const expectedSpeakerLabel = nullableLabel(input.expectedSpeakerLabel);
  if (input.expectedText !== evidence.segment.text || expectedSpeakerLabel !== (evidence.segment.speakerLabel ?? null)) {
    throw new TranscriptCorrectionError("The provider transcript changed. Refresh before confirming it.", 409, "STALE_PROVIDER_EVIDENCE");
  }
  const expectedAcceptedCorrectionId = text(input.expectedAcceptedCorrectionId) || null;
  const active = await input.prisma.transcriptCorrection.findFirst({
    where: { segmentId, status: "accepted" },
    orderBy: { updatedAt: "desc" },
    select: { id: true },
  });
  if ((active?.id ?? null) !== expectedAcceptedCorrectionId) {
    throw new TranscriptCorrectionError("The reviewed overlay changed. Refresh before confirming this segment.", 409, "STALE_CORRECTION_OVERLAY");
  }
  if (active) {
    throw new TranscriptCorrectionError("This segment already has a reviewed correction. Confirm the displayed correction through its review history instead of marking provider text as-is.", 409, "CORRECTION_ALREADY_ACTIVE");
  }
  const playbackPositionSeconds = assertPlaybackConfirmation({
    playback: evidence.playback,
    confirmedAgainstPlayback: input.confirmedAgainstPlayback,
    playbackPositionSeconds: input.playbackPositionSeconds,
    startSeconds: evidence.segment.startSeconds,
    endSeconds: evidence.segment.endSeconds,
  });

  const saved = await input.prisma.$transaction(async (tx: any) => {
    await acquirePrismaAdvisoryTransactionLock(tx, `transcript-job-packet-source:${evidence.job.id}`);
    await acquirePrismaAdvisoryTransactionLock(tx, `transcript-segment-review:${segmentId}`);
    const transactionActive = await tx.transcriptCorrection.findFirst({
      where: { segmentId, status: "accepted" },
      orderBy: { updatedAt: "desc" },
      select: { id: true },
    });
    if (transactionActive) {
      throw new TranscriptCorrectionError("A reviewed correction won the save race. Refresh before confirming this segment.", 409, "STALE_CORRECTION_OVERLAY");
    }
    const currentVerification = await tx.transcriptSegmentVerification.findFirst({
      where: {
        segmentId,
        providerTextSha256: sha256(evidence.segment.text),
        providerSpeakerLabel: evidence.segment.speakerLabel ?? null,
      },
      orderBy: { createdAt: "desc" },
    });
    if (currentVerification) {
      return { verification: currentVerification, idempotentReplay: true };
    }
    const verification = await tx.transcriptSegmentVerification.create({
      data: {
        roomId,
        transcriptJobId: evidence.job.id,
        segmentId,
        recordingAssetId: evidence.playback!.recordingAssetId,
        reviewerUserId: input.actor.id,
        reviewerEmailSnapshot: text(input.actor.email) || null,
        clientRequestId,
        reviewKind: "confirmed-as-is",
        providerTextSha256: sha256(evidence.segment.text),
        providerSpeakerLabel: evidence.segment.speakerLabel ?? null,
        startSecondsSnapshot: evidence.segment.startSeconds,
        endSecondsSnapshot: evidence.segment.endSeconds,
        playbackSourceId: evidence.playback!.sourceId,
        playbackPositionSeconds,
        reviewNote: text(input.reviewNote) || "Reviewer confirmed the provider segment as-is against protected playback.",
      },
    });
    return { verification, idempotentReplay: false };
  });

  return { ok: true, idempotentReplay: saved.idempotentReplay, verification: publicVerification(saved.verification), boundaries: transcriptCorrectionBoundaries() };
}

export async function createTranscriptCorrection(input: {
  prisma: any;
  actor: TranscriptCorrectionActor;
  roomId: string;
  segmentId: string;
  clientRequestId: string;
  origin: "human" | "ai";
  expectedText: string;
  expectedSpeakerLabel?: string | null;
  expectedAcceptedCorrectionId?: string | null;
  correctedText?: string | null;
  correctedSpeakerLabel?: string | null;
  reason?: string | null;
  confirmedAgainstPlayback?: boolean;
  playbackPositionSeconds?: number;
  aiReceipt?: Record<string, unknown> | null;
}) {
  const roomId = text(input.roomId);
  const segmentId = text(input.segmentId);
  const clientRequestId = text(input.clientRequestId);
  if (!roomId || !segmentId || !clientRequestId || clientRequestId.length > 160) {
    throw new TranscriptCorrectionError("roomId, segmentId, and a bounded clientRequestId are required.", 400, "INVALID_REQUEST");
  }
  if (input.origin !== "human" && input.origin !== "ai") {
    throw new TranscriptCorrectionError("Correction origin must be human or ai.", 400, "INVALID_ORIGIN");
  }

  const evidence = await loadMutationEvidence(input.prisma, { roomId, segmentId, actor: input.actor });
  // Replays still re-authorize the current room and release gate before any
  // previously saved correction text is returned.
  const replay = await input.prisma.transcriptCorrection.findUnique({
    where: { createdByUserId_clientRequestId: { createdByUserId: input.actor.id, clientRequestId } },
    include: { revisions: { orderBy: { revision: "asc" } } },
  });
  if (replay) {
    if (replay.roomId !== roomId || replay.segmentId !== segmentId) {
      throw new TranscriptCorrectionError("That request id is already bound to different evidence.", 409, "IDEMPOTENCY_CONFLICT");
    }
    return { ok: true, idempotentReplay: true, correction: publicCorrection(replay), boundaries: transcriptCorrectionBoundaries() };
  }
  const expectedSpeakerLabel = nullableLabel(input.expectedSpeakerLabel);
  if (input.expectedText !== evidence.segment.text || expectedSpeakerLabel !== (evidence.segment.speakerLabel ?? null)) {
    throw new TranscriptCorrectionError("The provider transcript changed. Refresh before saving a correction.", 409, "STALE_PROVIDER_EVIDENCE");
  }
  const change = validateCorrectionChange({
    providerText: evidence.segment.text,
    providerSpeakerLabel: evidence.segment.speakerLabel ?? null,
    correctedText: input.correctedText,
    correctedSpeakerLabel: input.correctedSpeakerLabel,
  });
  const active = await input.prisma.transcriptCorrection.findFirst({
    where: { segmentId, status: "accepted" },
    orderBy: { updatedAt: "desc" },
    select: { id: true, correctedText: true, correctedSpeakerLabel: true },
  });
  if ((active?.id ?? null) !== (text(input.expectedAcceptedCorrectionId) || null)) {
    throw new TranscriptCorrectionError("Another accepted correction is now active. Refresh before replacing it.", 409, "STALE_CORRECTION_OVERLAY");
  }
  if (correctionMatchesActiveOverlay({
    providerText: evidence.segment.text,
    providerSpeakerLabel: evidence.segment.speakerLabel ?? null,
    correctedText: change.correctedText,
    correctedSpeakerLabel: change.correctedSpeakerLabel,
    active,
  })) {
    throw new TranscriptCorrectionError("The reviewed overlay already contains that correction.", 409, "UNCHANGED_CORRECTION_OVERLAY");
  }

  const accepted = input.origin === "human";
  const playbackPositionSeconds = accepted
    ? assertPlaybackConfirmation({
        playback: evidence.playback,
        confirmedAgainstPlayback: input.confirmedAgainstPlayback,
        playbackPositionSeconds: input.playbackPositionSeconds,
        startSeconds: evidence.segment.startSeconds,
        endSeconds: evidence.segment.endSeconds,
      })
    : null;
  const now = new Date();
  const status = accepted ? "accepted" : "proposed";
  const provenanceJson = {
    schema: TRANSCRIPT_CORRECTION_SCHEMA,
    source: accepted ? "session-review-playback" : "ai-transcript-correction-proposal",
    playback: accepted ? {
      confirmed: true,
      sourceId: evidence.playback?.sourceId,
      recordingAssetId: evidence.playback?.recordingAssetId,
      positionSeconds: playbackPositionSeconds,
    } : null,
    aiReceipt: input.origin === "ai" ? object(input.aiReceipt) : null,
    expectedAcceptedCorrectionId: active?.id ?? null,
    boundaries: transcriptCorrectionBoundaries(),
  };

  const correction = await input.prisma.$transaction(async (tx: any) => {
    if (accepted) {
      await acquirePrismaAdvisoryTransactionLock(tx, `transcript-job-packet-source:${evidence.job.id}`);
      await acquirePrismaAdvisoryTransactionLock(tx, `transcript-segment-review:${segmentId}`);
    }
    const transactionActive = accepted
      ? await tx.transcriptCorrection.findFirst({
          where: { segmentId, status: "accepted" },
          orderBy: { updatedAt: "desc" },
          select: { id: true },
        })
      : active;
    if ((transactionActive?.id ?? null) !== (active?.id ?? null)) {
      throw new TranscriptCorrectionError("Another accepted correction won the save race. Refresh before replacing it.", 409, "STALE_CORRECTION_OVERLAY");
    }
    if (accepted && transactionActive) {
      const superseded = await tx.transcriptCorrection.update({
        where: { id: transactionActive.id },
        data: { status: "superseded" },
      });
      const previousRevision = await tx.transcriptCorrectionRevision.count({ where: { correctionId: transactionActive.id } });
      await tx.transcriptCorrectionRevision.create({
        data: {
          correctionId: transactionActive.id,
          revision: previousRevision + 1,
          operation: "superseded-by-reviewed-correction",
          actorUserId: input.actor.id,
          snapshotJson: correctionSnapshot(superseded),
        },
      });
    }
    const created = await tx.transcriptCorrection.create({
      data: {
        roomId,
        transcriptJobId: evidence.job.id,
        segmentId,
        createdByUserId: input.actor.id,
        createdByEmailSnapshot: text(input.actor.email) || null,
        clientRequestId,
        origin: input.origin,
        status,
        baseTextSha256: sha256(evidence.segment.text),
        expectedText: evidence.segment.text,
        expectedSpeakerLabel: evidence.segment.speakerLabel ?? null,
        startSecondsSnapshot: evidence.segment.startSeconds,
        endSecondsSnapshot: evidence.segment.endSeconds,
        correctedText: change.correctedText,
        correctedSpeakerLabel: change.correctedSpeakerLabel,
        reason: text(input.reason) || null,
        provenanceJson,
        reviewedByUserId: accepted ? input.actor.id : null,
        reviewedAt: accepted ? now : null,
        reviewNote: accepted ? "Reviewer explicitly confirmed this correction against protected playback." : null,
      },
    });
    await tx.transcriptCorrectionRevision.create({
      data: {
        correctionId: created.id,
        revision: 1,
        operation: accepted ? "created-and-accepted-after-playback" : "ai-proposal-created",
        actorUserId: input.actor.id,
        snapshotJson: correctionSnapshot(created),
      },
    });
    return tx.transcriptCorrection.findUnique({
      where: { id: created.id },
      include: { revisions: { orderBy: { revision: "asc" } } },
    });
  });

  return { ok: true, idempotentReplay: false, correction: publicCorrection(correction), boundaries: transcriptCorrectionBoundaries() };
}

export async function reviewTranscriptCorrectionProposal(input: {
  prisma: any;
  actor: TranscriptCorrectionActor;
  roomId: string;
  correctionId: string;
  decision: "accept" | "reject";
  expectedAcceptedCorrectionId?: string | null;
  confirmedAgainstPlayback?: boolean;
  playbackPositionSeconds?: number;
  reviewNote?: string | null;
}) {
  const correction = await input.prisma.transcriptCorrection.findFirst({
    where: { id: text(input.correctionId), room: accessibleRoomWhere(text(input.roomId), input.actor) },
    include: { segment: true, revisions: true },
  });
  if (!correction) throw new TranscriptCorrectionError("Correction proposal not found.", 404, "PROPOSAL_NOT_FOUND");
  if (correction.origin !== "ai" || correction.status !== "proposed") {
    throw new TranscriptCorrectionError("Only an unreviewed AI proposal can be decided here.", 409, "PROPOSAL_NOT_REVIEWABLE");
  }
  const evidence = await loadMutationEvidence(input.prisma, {
    roomId: correction.roomId,
    segmentId: correction.segmentId,
    actor: input.actor,
  });
  if (correction.baseTextSha256 !== sha256(evidence.segment.text) || correction.expectedText !== evidence.segment.text) {
    throw new TranscriptCorrectionError("The proposal no longer matches provider evidence.", 409, "STALE_PROVIDER_EVIDENCE");
  }
  const active = await input.prisma.transcriptCorrection.findFirst({
    where: { segmentId: correction.segmentId, status: "accepted" },
    orderBy: { updatedAt: "desc" },
    select: { id: true, correctedText: true, correctedSpeakerLabel: true },
  });
  if ((active?.id ?? null) !== (text(input.expectedAcceptedCorrectionId) || null)) {
    throw new TranscriptCorrectionError("Another accepted correction is now active. Refresh before reviewing.", 409, "STALE_CORRECTION_OVERLAY");
  }
  if (input.decision === "accept" && correctionMatchesActiveOverlay({
    providerText: evidence.segment.text,
    providerSpeakerLabel: evidence.segment.speakerLabel ?? null,
    correctedText: correction.correctedText,
    correctedSpeakerLabel: correction.correctedSpeakerLabel,
    active,
  })) {
    throw new TranscriptCorrectionError("That proposal matches the correction already in effect.", 409, "UNCHANGED_CORRECTION_OVERLAY");
  }
  const position = input.decision === "accept"
    ? assertPlaybackConfirmation({
        playback: evidence.playback,
        confirmedAgainstPlayback: input.confirmedAgainstPlayback,
        playbackPositionSeconds: input.playbackPositionSeconds,
        startSeconds: evidence.segment.startSeconds,
        endSeconds: evidence.segment.endSeconds,
      })
    : null;
  const now = new Date();
  const reviewed = await input.prisma.$transaction(async (tx: any) => {
    if (input.decision === "accept") {
      await acquirePrismaAdvisoryTransactionLock(tx, `transcript-job-packet-source:${evidence.job.id}`);
      await acquirePrismaAdvisoryTransactionLock(tx, `transcript-segment-review:${correction.segmentId}`);
    }
    const transactionActive = input.decision === "accept"
      ? await tx.transcriptCorrection.findFirst({
          where: { segmentId: correction.segmentId, status: "accepted" },
          orderBy: { updatedAt: "desc" },
          select: { id: true },
        })
      : active;
    if ((transactionActive?.id ?? null) !== (active?.id ?? null)) {
      throw new TranscriptCorrectionError("Another accepted correction won the review race. Refresh before deciding.", 409, "STALE_CORRECTION_OVERLAY");
    }
    if (input.decision === "accept" && transactionActive) {
      const superseded = await tx.transcriptCorrection.update({ where: { id: transactionActive.id }, data: { status: "superseded" } });
      const revision = await tx.transcriptCorrectionRevision.count({ where: { correctionId: transactionActive.id } });
      await tx.transcriptCorrectionRevision.create({
        data: {
          correctionId: transactionActive.id,
          revision: revision + 1,
          operation: "superseded-by-reviewed-ai-proposal",
          actorUserId: input.actor.id,
          snapshotJson: correctionSnapshot(superseded),
        },
      });
    }
    const updated = await tx.transcriptCorrection.update({
      where: { id: correction.id },
      data: {
        status: input.decision === "accept" ? "accepted" : "rejected",
        reviewedByUserId: input.actor.id,
        reviewedAt: now,
        reviewNote: text(input.reviewNote) || (input.decision === "accept"
          ? "Reviewer explicitly accepted this AI proposal against protected playback."
          : "Reviewer rejected this AI proposal."),
        provenanceJson: {
          ...object(correction.provenanceJson),
          review: {
            decision: input.decision,
            playbackConfirmed: input.decision === "accept",
            playbackPositionSeconds: position,
            reviewedAt: now.toISOString(),
          },
        },
      },
    });
    await tx.transcriptCorrectionRevision.create({
      data: {
        correctionId: correction.id,
        revision: correction.revisions.length + 1,
        operation: input.decision === "accept" ? "ai-proposal-accepted-after-playback" : "ai-proposal-rejected",
        actorUserId: input.actor.id,
        snapshotJson: correctionSnapshot(updated),
      },
    });
    return tx.transcriptCorrection.findUnique({
      where: { id: correction.id },
      include: { revisions: { orderBy: { revision: "asc" } } },
    });
  });
  return { ok: true, correction: publicCorrection(reviewed), boundaries: transcriptCorrectionBoundaries() };
}
