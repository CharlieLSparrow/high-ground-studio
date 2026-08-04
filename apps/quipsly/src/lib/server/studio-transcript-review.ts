import "server-only";

import { createHash } from "node:crypto";

import { Prisma } from "@prisma/client";

import { inspectImmutableStudioMediaSource } from "@/lib/server/episode-collaboration-proxy";
import { acquirePrismaAdvisoryTransactionLock } from "@/lib/server/prisma-advisory-lock";
import { authorizeStudioMediaSource } from "@/lib/server/studio-media-source-access";
import { resolveStudioProjectAccess } from "@/lib/server/studio-project-access";
import {
  TranscriptCorrectionError,
  transcriptCorrectionBoundaries,
} from "@/lib/server/transcript-corrections";
import { loadStudioSourceTranscriptContext } from "@/lib/server/studio-source-transcript";

type Actor = { id: string; email: string; isStaff: boolean };
type Coordinates = {
  prisma: any;
  actor: Actor;
  projectSlug: string;
  episodeSlug: string;
  assetId: string;
  sourceId: string;
};

const MAX_PAGE = 80;
const MAX_TEXT = 20_000;
const MAX_LABEL = 160;
const MAX_REASON = 2_000;

function text(value: unknown, maximum = Number.POSITIVE_INFINITY) {
  return typeof value === "string" ? value.trim().slice(0, maximum) : "";
}

function label(value: unknown) {
  return text(value, MAX_LABEL) || null;
}

function sha256(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function correctionSnapshot(correction: any) {
  return {
    schema: "quipsly-transcript-correction-v1",
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
    reviewedAt: correction.reviewedAt?.toISOString?.() ?? correction.reviewedAt ?? null,
    reviewNote: correction.reviewNote,
    createdAt: correction.createdAt?.toISOString?.() ?? correction.createdAt,
    updatedAt: correction.updatedAt?.toISOString?.() ?? correction.updatedAt,
  };
}

function publicCorrection(correction: any) {
  return {
    id: correction.id as string,
    status: correction.status as string,
    origin: correction.origin as string,
    correctedText: correction.correctedText as string | null,
    correctedSpeakerLabel: correction.correctedSpeakerLabel as string | null,
    reason: correction.reason as string | null,
    reviewedAt: correction.reviewedAt?.toISOString?.() ?? correction.reviewedAt ?? null,
    createdAt: correction.createdAt?.toISOString?.() ?? correction.createdAt,
    revisions: Array.isArray(correction.revisions)
      ? correction.revisions.map((revision: any) => ({
          revision: revision.revision as number,
          operation: revision.operation as string,
          createdAt: revision.createdAt?.toISOString?.() ?? revision.createdAt,
        }))
      : [],
  };
}

async function sourceEvidence(input: Coordinates, action: "read" | "write") {
  const access = await resolveStudioProjectAccess({
    projectSlug: input.projectSlug,
    email: input.actor.email,
    action,
    prisma: input.prisma,
  });
  if (!access.allowed) throw new TranscriptCorrectionError("This account cannot review that Nest transcript.", 403, "STUDIO_TRANSCRIPT_REVIEW_DENIED");
  const sourceAccess = await authorizeStudioMediaSource({ prisma: input.prisma, actor: input.actor, sourceId: input.sourceId });
  if (!sourceAccess.allowed) throw new TranscriptCorrectionError(sourceAccess.error, sourceAccess.status, sourceAccess.errorCode || "STUDIO_TRANSCRIPT_SOURCE_HELD");
  const context = await loadStudioSourceTranscriptContext(input);
  const job = await input.prisma.transcriptJob.findFirst({
    where: {
      studioMediaAssetId: context.asset.id,
      studioProjectId: context.project.id,
      episodeProductionId: context.production.id,
      status: "COMPLETED",
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      status: true,
      provider: true,
      language: true,
      sourceSha256: true,
      sourceGeneration: true,
      studioMediaAssetId: true,
      _count: { select: { segments: true, words: true, verifications: true } },
    },
  });
  if (!job) throw new TranscriptCorrectionError("A completed canonical transcript was not found for this source.", 404, "STUDIO_TRANSCRIPT_NOT_FOUND");
  const immutable = await inspectImmutableStudioMediaSource(context.source.providerSourceId, context.asset.mimeType);
  if (!job.sourceSha256 || immutable.sha256 !== job.sourceSha256 || immutable.generation !== job.sourceGeneration) {
    throw new TranscriptCorrectionError("The media source no longer matches the transcript receipt. Review is held.", 409, "STUDIO_TRANSCRIPT_SOURCE_DRIFT");
  }
  return {
    context,
    job,
    immutable,
    playback: {
      sourceId: context.source.id,
      url: context.source.url,
      kind: String(context.asset.mimeType || "").startsWith("video/") ? "video" as const : "audio" as const,
      label: context.asset.filename as string,
      durationSeconds: typeof context.asset.duration === "number" ? context.asset.duration : null,
    },
  };
}

function acceptedOverlay(segment: any) {
  return segment.corrections.find((correction: any) => correction.status === "accepted") ?? null;
}

function currentVerification(segment: any, accepted: any) {
  if (accepted) return null;
  return segment.verifications.find((verification: any) => (
    verification.providerTextSha256 === sha256(segment.text)
    && (verification.providerSpeakerLabel ?? null) === (segment.speakerLabel ?? null)
  )) ?? null;
}

function publicSegment(segment: any) {
  const accepted = acceptedOverlay(segment);
  const verification = currentVerification(segment, accepted);
  return {
    id: segment.id as string,
    startSeconds: segment.startSeconds as number,
    endSeconds: segment.endSeconds as number,
    providerText: segment.text as string,
    providerTextSha256: sha256(segment.text),
    providerSpeakerLabel: segment.speakerLabel as string | null,
    text: accepted?.correctedText ?? segment.text,
    speakerLabel: accepted?.correctedSpeakerLabel ?? segment.speakerLabel ?? null,
    confidence: segment.confidence as number | null,
    acceptedCorrection: accepted ? publicCorrection(accepted) : null,
    confirmedAsIs: verification ? {
      id: verification.id as string,
      reviewedAt: verification.createdAt?.toISOString?.() ?? verification.createdAt,
    } : null,
    words: segment.words.map((word: any) => ({
      id: word.id as string,
      providerWordIndex: word.providerWordIndex as number,
      startSeconds: word.startSeconds as number,
      endSeconds: word.endSeconds as number,
      punctuatedWord: word.punctuatedWord as string,
      confidence: word.confidence as number | null,
    })),
  };
}

export async function readStudioTranscriptReviewPage(input: Coordinates & { afterSegmentId?: string | null; limit?: number }) {
  const evidence = await sourceEvidence(input, "read");
  const limit = Math.max(1, Math.min(MAX_PAGE, Math.trunc(input.limit || 40)));
  const afterId = text(input.afterSegmentId);
  const anchor = afterId ? await input.prisma.transcriptSegment.findFirst({
    where: { id: afterId, transcriptJobId: evidence.job.id },
    select: { id: true, startSeconds: true },
  }) : null;
  if (afterId && !anchor) throw new TranscriptCorrectionError("The transcript page cursor is stale.", 409, "STALE_TRANSCRIPT_CURSOR");
  const segments = await input.prisma.transcriptSegment.findMany({
    where: {
      transcriptJobId: evidence.job.id,
      ...(anchor ? { OR: [
        { startSeconds: { gt: anchor.startSeconds } },
        { startSeconds: anchor.startSeconds, id: { gt: anchor.id } },
      ] } : {}),
    },
    orderBy: [{ startSeconds: "asc" }, { id: "asc" }],
    take: limit + 1,
    include: {
      words: { orderBy: { providerWordIndex: "asc" } },
      corrections: {
        where: { status: "accepted" },
        orderBy: { updatedAt: "desc" },
        take: 1,
        include: { revisions: { orderBy: { revision: "asc" } } },
      },
      verifications: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });
  const hasMore = segments.length > limit;
  const page = segments.slice(0, limit);
  const [correctionReceiptCount, activeCorrectionCount, bounds] = await Promise.all([
    input.prisma.transcriptCorrection.count({ where: { transcriptJobId: evidence.job.id } }),
    input.prisma.transcriptCorrection.count({ where: { transcriptJobId: evidence.job.id, status: "accepted" } }),
    input.prisma.transcriptSegment.aggregate({
      where: { transcriptJobId: evidence.job.id },
      _min: { startSeconds: true },
      _max: { endSeconds: true },
    }),
  ]);
  return {
    ok: true,
    transcriptJobId: evidence.job.id,
    provider: evidence.job.provider,
    language: evidence.job.language,
    playback: evidence.playback,
    source: {
      assetId: evidence.context.asset.id,
      sourceId: evidence.context.source.id,
      sha256: evidence.immutable.sha256,
      generation: evidence.immutable.generation,
    },
    coverage: {
      segmentCount: evidence.job._count.segments,
      wordCount: evidence.job._count.words,
      correctionReceiptCount,
      activeCorrectionCount,
      playbackVerificationCount: evidence.job._count.verifications,
      startSeconds: typeof bounds._min.startSeconds === "number" ? bounds._min.startSeconds : null,
      endSeconds: typeof bounds._max.endSeconds === "number" ? bounds._max.endSeconds : null,
    },
    page: {
      count: page.length,
      hasMore,
      nextAfterSegmentId: hasMore ? page.at(-1)?.id ?? null : null,
    },
    segments: page.map(publicSegment),
    boundaries: transcriptCorrectionBoundaries(),
  };
}

async function mutationEvidence(input: Coordinates & { segmentId: string }) {
  const evidence = await sourceEvidence(input, "write");
  const segment = await input.prisma.transcriptSegment.findFirst({
    where: { id: text(input.segmentId), transcriptJobId: evidence.job.id },
    select: { id: true, text: true, speakerLabel: true, startSeconds: true, endSeconds: true },
  });
  if (!segment) throw new TranscriptCorrectionError("The transcript segment is not part of this immutable source.", 404, "STUDIO_TRANSCRIPT_SEGMENT_NOT_FOUND");
  return { ...evidence, segment };
}

function playbackPosition(input: { confirmedAgainstPlayback?: boolean; playbackPositionSeconds?: number; startSeconds: number; endSeconds: number }) {
  const position = input.playbackPositionSeconds;
  if (input.confirmedAgainstPlayback !== true || typeof position !== "number" || !Number.isFinite(position)) {
    throw new TranscriptCorrectionError("Listen to the exact source segment before recording a review decision.", 409, "PLAYBACK_NOT_CONFIRMED");
  }
  if (position < Math.max(0, input.startSeconds - 0.5) || position > input.endSeconds + 1.5) {
    throw new TranscriptCorrectionError("The protected player is not positioned at the segment being reviewed.", 409, "PLAYBACK_POSITION_MISMATCH");
  }
  return position;
}

export async function correctStudioTranscriptSegment(input: Coordinates & {
  segmentId: string;
  clientRequestId: string;
  expectedText: string;
  expectedSpeakerLabel?: string | null;
  expectedAcceptedCorrectionId?: string | null;
  correctedText?: string | null;
  correctedSpeakerLabel?: string | null;
  reason?: string | null;
  confirmedAgainstPlayback?: boolean;
  playbackPositionSeconds?: number;
}) {
  const clientRequestId = text(input.clientRequestId, 160);
  if (!clientRequestId) throw new TranscriptCorrectionError("A stable client request id is required.", 400, "INVALID_REQUEST");
  const evidence = await mutationEvidence(input);
  const replay = await input.prisma.transcriptCorrection.findUnique({
    where: { createdByUserId_clientRequestId: { createdByUserId: input.actor.id, clientRequestId } },
    include: { revisions: { orderBy: { revision: "asc" } } },
  });
  if (replay) {
    if (replay.roomId !== null || replay.transcriptJobId !== evidence.job.id || replay.segmentId !== evidence.segment.id) {
      throw new TranscriptCorrectionError("That request id is already bound to different review evidence.", 409, "IDEMPOTENCY_CONFLICT");
    }
    return { ok: true, idempotentReplay: true, correction: publicCorrection(replay), boundaries: transcriptCorrectionBoundaries() };
  }
  const expectedSpeaker = label(input.expectedSpeakerLabel);
  if (input.expectedText !== evidence.segment.text || expectedSpeaker !== (evidence.segment.speakerLabel ?? null)) {
    throw new TranscriptCorrectionError("Provider evidence changed. Refresh before saving.", 409, "STALE_PROVIDER_EVIDENCE");
  }
  const correctedText = text(input.correctedText, MAX_TEXT) || null;
  const correctedSpeakerLabel = label(input.correctedSpeakerLabel);
  if ((correctedText ?? evidence.segment.text) === evidence.segment.text && (correctedSpeakerLabel ?? evidence.segment.speakerLabel ?? null) === (evidence.segment.speakerLabel ?? null)) {
    throw new TranscriptCorrectionError("The reviewed correction does not change provider evidence.", 400, "UNCHANGED_CORRECTION");
  }
  const active = await input.prisma.transcriptCorrection.findFirst({
    where: { segmentId: evidence.segment.id, status: "accepted" },
    orderBy: { updatedAt: "desc" },
  });
  if ((active?.id ?? null) !== (text(input.expectedAcceptedCorrectionId) || null)) {
    throw new TranscriptCorrectionError("Another accepted correction is now active. Refresh before replacing it.", 409, "STALE_CORRECTION_OVERLAY");
  }
  const position = playbackPosition({
    confirmedAgainstPlayback: input.confirmedAgainstPlayback,
    playbackPositionSeconds: input.playbackPositionSeconds,
    startSeconds: evidence.segment.startSeconds,
    endSeconds: evidence.segment.endSeconds,
  });
  const now = new Date();
  const saved = await input.prisma.$transaction(async (tx: any) => {
    await acquirePrismaAdvisoryTransactionLock(tx, `transcript-segment-review:${evidence.segment.id}`);
    const transactionActive = await tx.transcriptCorrection.findFirst({
      where: { segmentId: evidence.segment.id, status: "accepted" },
      orderBy: { updatedAt: "desc" },
    });
    if ((transactionActive?.id ?? null) !== (active?.id ?? null)) {
      throw new TranscriptCorrectionError("Another correction won the save race. Refresh before replacing it.", 409, "STALE_CORRECTION_OVERLAY");
    }
    if (transactionActive) {
      const superseded = await tx.transcriptCorrection.update({ where: { id: transactionActive.id }, data: { status: "superseded" } });
      const revision = await tx.transcriptCorrectionRevision.count({ where: { correctionId: superseded.id } });
      await tx.transcriptCorrectionRevision.create({ data: {
        correctionId: superseded.id,
        revision: revision + 1,
        operation: "superseded-by-studio-playback-correction",
        actorUserId: input.actor.id,
        snapshotJson: json(correctionSnapshot(superseded)),
      } });
    }
    const created = await tx.transcriptCorrection.create({ data: {
      roomId: null,
      transcriptJobId: evidence.job.id,
      segmentId: evidence.segment.id,
      createdByUserId: input.actor.id,
      createdByEmailSnapshot: text(input.actor.email) || null,
      clientRequestId,
      origin: "human",
      status: "accepted",
      baseTextSha256: sha256(evidence.segment.text),
      expectedText: evidence.segment.text,
      expectedSpeakerLabel: evidence.segment.speakerLabel ?? null,
      startSecondsSnapshot: evidence.segment.startSeconds,
      endSecondsSnapshot: evidence.segment.endSeconds,
      correctedText: correctedText === evidence.segment.text ? null : correctedText,
      correctedSpeakerLabel: correctedSpeakerLabel === (evidence.segment.speakerLabel ?? null) ? null : correctedSpeakerLabel,
      reason: text(input.reason, MAX_REASON) || null,
      provenanceJson: json({
        schema: "quipsly-transcript-correction-v1",
        source: "studio-source-review-playback",
        playback: {
          confirmed: true,
          sourceId: evidence.playback.sourceId,
          studioMediaAssetId: evidence.context.asset.id,
          sourceSha256: evidence.immutable.sha256,
          sourceGeneration: evidence.immutable.generation,
          positionSeconds: position,
        },
        expectedAcceptedCorrectionId: active?.id ?? null,
        boundaries: transcriptCorrectionBoundaries(),
      }),
      reviewedByUserId: input.actor.id,
      reviewedAt: now,
      reviewNote: "Reviewer explicitly confirmed this Studio correction against protected source playback.",
    } });
    await tx.transcriptCorrectionRevision.create({ data: {
      correctionId: created.id,
      revision: 1,
      operation: "created-and-accepted-after-studio-playback",
      actorUserId: input.actor.id,
      snapshotJson: json(correctionSnapshot(created)),
    } });
    return tx.transcriptCorrection.findUnique({ where: { id: created.id }, include: { revisions: { orderBy: { revision: "asc" } } } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  return { ok: true, idempotentReplay: false, correction: publicCorrection(saved), boundaries: transcriptCorrectionBoundaries() };
}

export async function confirmStudioTranscriptSegmentAsIs(input: Coordinates & {
  segmentId: string;
  clientRequestId: string;
  expectedText: string;
  expectedSpeakerLabel?: string | null;
  confirmedAgainstPlayback?: boolean;
  playbackPositionSeconds?: number;
  reviewNote?: string | null;
}) {
  const clientRequestId = text(input.clientRequestId, 160);
  if (!clientRequestId) throw new TranscriptCorrectionError("A stable client request id is required.", 400, "INVALID_REQUEST");
  const evidence = await mutationEvidence(input);
  const replay = await input.prisma.transcriptSegmentVerification.findUnique({
    where: { reviewerUserId_clientRequestId: { reviewerUserId: input.actor.id, clientRequestId } },
  });
  if (replay) {
    if (replay.roomId !== null || replay.transcriptJobId !== evidence.job.id || replay.segmentId !== evidence.segment.id || replay.studioMediaAssetId !== evidence.context.asset.id) {
      throw new TranscriptCorrectionError("That request id is already bound to different review evidence.", 409, "IDEMPOTENCY_CONFLICT");
    }
    return { ok: true, idempotentReplay: true, verification: { id: replay.id, segmentId: replay.segmentId, reviewedAt: replay.createdAt.toISOString() }, boundaries: transcriptCorrectionBoundaries() };
  }
  if (input.expectedText !== evidence.segment.text || label(input.expectedSpeakerLabel) !== (evidence.segment.speakerLabel ?? null)) {
    throw new TranscriptCorrectionError("Provider evidence changed. Refresh before confirming it.", 409, "STALE_PROVIDER_EVIDENCE");
  }
  const active = await input.prisma.transcriptCorrection.findFirst({ where: { segmentId: evidence.segment.id, status: "accepted" }, select: { id: true } });
  if (active) throw new TranscriptCorrectionError("This segment has an accepted correction and cannot be confirmed as provider-accurate.", 409, "CORRECTED_SEGMENT_NOT_AS_IS");
  const position = playbackPosition({
    confirmedAgainstPlayback: input.confirmedAgainstPlayback,
    playbackPositionSeconds: input.playbackPositionSeconds,
    startSeconds: evidence.segment.startSeconds,
    endSeconds: evidence.segment.endSeconds,
  });
  const verification = await input.prisma.transcriptSegmentVerification.create({ data: {
    roomId: null,
    transcriptJobId: evidence.job.id,
    segmentId: evidence.segment.id,
    recordingAssetId: null,
    studioMediaAssetId: evidence.context.asset.id,
    reviewerUserId: input.actor.id,
    reviewerEmailSnapshot: text(input.actor.email) || null,
    clientRequestId,
    reviewKind: "confirmed-as-is",
    providerTextSha256: sha256(evidence.segment.text),
    providerSpeakerLabel: evidence.segment.speakerLabel ?? null,
    startSecondsSnapshot: evidence.segment.startSeconds,
    endSecondsSnapshot: evidence.segment.endSeconds,
    playbackSourceId: evidence.playback.sourceId,
    playbackPositionSeconds: position,
    reviewNote: text(input.reviewNote, MAX_REASON) || null,
  } });
  return { ok: true, idempotentReplay: false, verification: { id: verification.id, segmentId: verification.segmentId, reviewedAt: verification.createdAt.toISOString() }, boundaries: transcriptCorrectionBoundaries() };
}
