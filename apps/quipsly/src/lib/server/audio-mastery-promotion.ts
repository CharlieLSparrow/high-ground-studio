import "server-only";

import { createHash } from "node:crypto";

import { Prisma } from "@prisma/client";

import {
  AudioMasteryReviewError,
  loadAudioMasteryReviewContext,
} from "@/lib/server/audio-mastery-review";
import { acquirePrismaAdvisoryTransactionLock } from "@/lib/server/prisma-advisory-lock";

type Actor = { id: string; email: string };
type Coordinates = {
  prisma: any;
  projectSlug: string;
  assetId: string;
  sourceId: string;
  jobId: string;
};

export type PublicAudioMasterPromotionReceipt = {
  id: string;
  jobId: string;
  reviewReceiptId: string | null;
  operation: "promote" | "withdraw";
  reason: string | null;
  occurredAt: string;
  actorEmail: string;
  candidatePlaybackUrl: string | null;
};

export type PublicAudioMasterPromotionSummary = {
  active: boolean;
  holdReason: "latest-review-no-longer-approves-candidate" | null;
  latest: PublicAudioMasterPromotionReceipt | null;
  activePromotion: PublicAudioMasterPromotionReceipt | null;
  promoteCount: number;
  withdrawalCount: number;
  candidatePlaybackUrl: string | null;
  boundaries: {
    originalRemainsSourceTruth: true;
    episodeSpineUnchanged: true;
    deliveryEncodingNotCreated: true;
    publicationNotStarted: true;
    withdrawalPreservesHistory: true;
  };
};

export class AudioMasteryPromotionError extends Error {
  constructor(message: string, readonly status: number, readonly code: string) {
    super(message);
  }
}

function text(value: unknown, maximum = Number.POSITIVE_INFINITY) {
  return typeof value === "string" ? value.trim().slice(0, maximum) : "";
}

function object(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, any>
    : {};
}

function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function sha256(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function boundaries() {
  return {
    originalRemainsSourceTruth: true as const,
    episodeSpineUnchanged: true as const,
    deliveryEncodingNotCreated: true as const,
    publicationNotStarted: true as const,
    withdrawalPreservesHistory: true as const,
  };
}

function publicReceipt(receipt: any): PublicAudioMasterPromotionReceipt {
  const evidence = object(receipt.evidenceJson);
  return {
    id: String(receipt.id),
    jobId: String(receipt.masteryJobId),
    reviewReceiptId: text(receipt.reviewReceiptId) || null,
    operation: receipt.operation === "PROMOTE" ? "promote" : "withdraw",
    reason: text(receipt.reason) || null,
    occurredAt: receipt.occurredAt?.toISOString?.() ?? String(receipt.occurredAt),
    actorEmail: String(receipt.actorEmail),
    candidatePlaybackUrl: text(evidence.candidatePlaybackUrl) || null,
  };
}

export function emptyAudioMasterPromotionSummary(): PublicAudioMasterPromotionSummary {
  return {
    active: false,
    holdReason: null,
    latest: null,
    activePromotion: null,
    promoteCount: 0,
    withdrawalCount: 0,
    candidatePlaybackUrl: null,
    boundaries: boundaries(),
  };
}

export async function readAudioMasterPromotionSummary(input: {
  prisma: any;
  jobId?: string | null;
  projectId?: string | null;
  assetId?: string | null;
}): Promise<PublicAudioMasterPromotionSummary> {
  const where = input.projectId && input.assetId
    ? { projectId: input.projectId, assetId: input.assetId }
    : input.jobId
      ? { masteryJobId: input.jobId }
      : null;
  if (!where) return emptyAudioMasterPromotionSummary();
  const [latest, promotes, withdrawals] = await Promise.all([
    input.prisma.studioAudioMasterPromotionReceipt.findFirst({
      where,
      orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
    }),
    input.prisma.studioAudioMasterPromotionReceipt.count({
      where: { ...where, operation: "PROMOTE" },
    }),
    input.prisma.studioAudioMasterPromotionReceipt.count({
      where: { ...where, operation: "WITHDRAW" },
    }),
  ]);
  const publicLatest = latest ? publicReceipt(latest) : null;
  const latestReview = publicLatest?.operation === "promote" && publicLatest.reviewReceiptId
    ? await input.prisma.studioAudioMasterReviewReceipt.findFirst({
      where: { masteryJobId: publicLatest.jobId },
      orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
    })
    : null;
  const approvalStillCurrent = Boolean(
    latestReview
      && latestReview.id === publicLatest?.reviewReceiptId
      && latestReview.decision === "APPROVED",
  );
  const active = publicLatest?.operation === "promote" && approvalStillCurrent;
  return {
    active,
    holdReason: publicLatest?.operation === "promote" && !approvalStillCurrent
      ? "latest-review-no-longer-approves-candidate"
      : null,
    latest: publicLatest,
    activePromotion: active ? publicLatest : null,
    promoteCount: promotes,
    withdrawalCount: withdrawals,
    candidatePlaybackUrl: active ? publicLatest?.candidatePlaybackUrl ?? null : null,
    boundaries: boundaries(),
  };
}

function requestFingerprint(input: {
  projectId: string;
  assetId: string;
  masteryJobId: string;
  reviewReceiptId: string | null;
  actorUserId: string;
  actorEmail: string;
  clientRequestId: string;
  operation: "PROMOTE" | "WITHDRAW";
  profileId: string;
  sourceSha256: string;
  sourceGeneration: string;
  previewSha256: string;
  candidatePlaybackUrl: string;
  reason: string | null;
}) {
  return {
    schema: "quipsly-audio-master-promotion-request-v1",
    ...input,
    originalRemainsSourceTruth: true,
    episodeSpineUnchanged: true,
    deliveryEncodingNotCreated: true,
    publicationNotStarted: true,
  };
}

export async function appendAudioMasterPromotion(input: Coordinates & {
  actor: Actor;
  clientRequestId: string;
  operation: "promote" | "withdraw";
  reviewReceiptId?: string | null;
  reason?: string | null;
}) {
  const clientRequestId = text(input.clientRequestId, 160);
  const reviewReceiptId = input.operation === "promote"
    ? text(input.reviewReceiptId, 160) || null
    : null;
  const reason = text(input.reason, 2_000) || null;
  if (!clientRequestId) {
    throw new AudioMasteryPromotionError(
      "A stable client request id is required.",
      400,
      "INVALID_AUDIO_MASTER_PROMOTION_REQUEST",
    );
  }
  if (input.operation === "promote" && !reviewReceiptId) {
    throw new AudioMasteryPromotionError(
      "Promotion requires the exact approved listening receipt.",
      400,
      "AUDIO_MASTER_PROMOTION_REVIEW_REQUIRED",
    );
  }
  if (input.operation === "withdraw" && (!reason || reason.length < 3)) {
    throw new AudioMasteryPromotionError(
      "Withdrawing a promoted master requires a short reason.",
      400,
      "AUDIO_MASTER_WITHDRAWAL_REASON_REQUIRED",
    );
  }

  let context: Awaited<ReturnType<typeof loadAudioMasteryReviewContext>>;
  try {
    context = await loadAudioMasteryReviewContext(input);
  } catch (error) {
    if (error instanceof AudioMasteryReviewError) {
      throw new AudioMasteryPromotionError(error.message, error.status, error.code);
    }
    throw error;
  }
  const candidatePlaybackUrl = text(context.registration.playbackUrl);
  if (!candidatePlaybackUrl || !context.result.derivative) {
    throw new AudioMasteryPromotionError(
      "The verified mastering preview is no longer playable.",
      409,
      "AUDIO_MASTER_PROMOTION_PREVIEW_UNAVAILABLE",
    );
  }
  const derivative = context.result.derivative;
  const request = requestFingerprint({
    projectId: context.project.id,
    assetId: context.asset.id,
    masteryJobId: context.job.jobId,
    reviewReceiptId,
    actorUserId: input.actor.id,
    actorEmail: input.actor.email.toLowerCase(),
    clientRequestId,
    operation: input.operation === "promote" ? "PROMOTE" : "WITHDRAW",
    profileId: context.job.profileId,
    sourceSha256: context.job.source.sha256,
    sourceGeneration: context.job.source.generation,
    previewSha256: derivative.sha256,
    candidatePlaybackUrl,
    reason,
  });
  const requestSha256 = sha256(request);

  const existing = await input.prisma.studioAudioMasterPromotionReceipt.findUnique({
    where: {
      projectId_actorEmail_clientRequestId: {
        projectId: context.project.id,
        actorEmail: request.actorEmail,
        clientRequestId,
      },
    },
  });
  if (existing) {
    if (existing.requestSha256 !== requestSha256) {
      throw new AudioMasteryPromotionError(
        "That request id is already bound to a different mastering action.",
        409,
        "AUDIO_MASTER_PROMOTION_IDEMPOTENCY_CONFLICT",
      );
    }
    return {
      ok: true,
      idempotentReplay: true,
      receipt: publicReceipt(existing),
      promotion: await readAudioMasterPromotionSummary({
        prisma: input.prisma,
        projectId: context.project.id,
        assetId: context.asset.id,
      }),
    };
  }

  const receipt = await input.prisma.$transaction(async (tx: any) => {
    await acquirePrismaAdvisoryTransactionLock(
      tx,
      `audio-master-promotion:${context.project.id}:${context.asset.id}`,
    );
    const replay = await tx.studioAudioMasterPromotionReceipt.findUnique({
      where: {
        projectId_actorEmail_clientRequestId: {
          projectId: context.project.id,
          actorEmail: request.actorEmail,
          clientRequestId,
        },
      },
    });
    if (replay) {
      if (replay.requestSha256 !== requestSha256) {
        throw new AudioMasteryPromotionError(
          "That request id won a race with a different mastering action.",
          409,
          "AUDIO_MASTER_PROMOTION_IDEMPOTENCY_CONFLICT",
        );
      }
      return replay;
    }

    if (input.operation === "promote") {
      const latestMasteryJob = await tx.studioAssetProcessingJob.findFirst({
        where: {
          projectId: context.project.id,
          assetId: context.asset.id,
          type: "audio-mastery",
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: { id: true },
      });
      if (!latestMasteryJob || latestMasteryJob.id !== context.job.jobId) {
        throw new AudioMasteryPromotionError(
          "A newer mastering job exists for this source. Refresh before changing the delivery candidate.",
          409,
          "AUDIO_MASTER_PROMOTION_JOB_STALE",
        );
      }
    }

    const latestPromotion = await tx.studioAudioMasterPromotionReceipt.findFirst({
      where: { projectId: context.project.id, assetId: context.asset.id },
      orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
    });
    let approvedReview: any = null;
    if (input.operation === "promote") {
      const latestReview = await tx.studioAudioMasterReviewReceipt.findFirst({
        where: { masteryJobId: context.job.jobId },
        orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
      });
      if (
        !latestReview
        || latestReview.id !== reviewReceiptId
        || latestReview.decision !== "APPROVED"
        || latestReview.projectId !== context.project.id
        || latestReview.assetId !== context.asset.id
        || latestReview.sourceSha256 !== context.job.source.sha256
        || latestReview.sourceGeneration !== context.job.source.generation
        || latestReview.previewSha256 !== derivative.sha256
      ) {
        throw new AudioMasteryPromotionError(
          "Promotion requires the latest exact playback-bound approval. Refresh and listen again if the preview changed.",
          409,
          "AUDIO_MASTER_PROMOTION_APPROVAL_STALE",
        );
      }
      if (latestPromotion?.operation === "PROMOTE" && latestPromotion.reviewReceiptId === latestReview.id) {
        throw new AudioMasteryPromotionError(
          "A mastering preview is already the active delivery candidate. Withdraw it before promoting another pass.",
          409,
          "AUDIO_MASTER_ALREADY_PROMOTED",
        );
      }
      approvedReview = latestReview;
    } else {
      if (!latestPromotion || latestPromotion.operation !== "PROMOTE") {
        throw new AudioMasteryPromotionError(
          "There is no active mastering promotion to withdraw.",
          409,
          "AUDIO_MASTER_NOT_PROMOTED",
        );
      }
      if (latestPromotion.masteryJobId !== context.job.jobId) {
        throw new AudioMasteryPromotionError(
          "The requested mastering job is not the active delivery candidate. Refresh before withdrawing it.",
          409,
          "AUDIO_MASTER_WITHDRAWAL_TARGET_STALE",
        );
      }
    }

    const now = new Date();
    const created = await tx.studioAudioMasterPromotionReceipt.create({
      data: {
        projectId: context.project.id,
        assetId: context.asset.id,
        masteryJobId: context.job.jobId,
        reviewReceiptId: approvedReview?.id ?? latestPromotion?.reviewReceiptId ?? null,
        actorUserId: input.actor.id,
        actorEmail: request.actorEmail,
        clientRequestId,
        operation: request.operation,
        profileId: context.job.profileId,
        sourceSha256: context.job.source.sha256,
        sourceGeneration: context.job.source.generation,
        previewSha256: derivative.sha256,
        requestSha256,
        evidenceJson: json({
          schema: "quipsly-audio-master-promotion-evidence-v1",
          candidatePlaybackUrl,
          masteryJobId: context.job.jobId,
          reviewReceiptId: approvedReview?.id ?? latestPromotion?.reviewReceiptId ?? null,
          profile: context.result.proposal.profile,
          measurement: derivative.verificationMeasurement,
          verification: derivative.verification,
          sourceSha256: context.job.source.sha256,
          sourceGeneration: context.job.source.generation,
          previewSha256: derivative.sha256,
          ...boundaries(),
        }),
        reason,
        occurredAt: now,
      },
    });

    if (input.operation === "promote") {
      await tx.studioAssetVariant.upsert({
        where: {
          assetId_kind_url: {
            assetId: context.asset.id,
            kind: "audio-master-candidate",
            url: candidatePlaybackUrl,
          },
        },
        create: {
          assetId: context.asset.id,
          kind: "audio-master-candidate",
          url: candidatePlaybackUrl,
          mimeType: "audio/wav",
          duration: derivative.verificationMeasurement.durationSeconds,
          sizeBytes: BigInt(derivative.sizeBytes),
          metadataJson: json({
            schema: "quipsly-audio-master-candidate-v1",
            masteryJobId: context.job.jobId,
            approvalReceiptId: approvedReview.id,
            firstPromotionReceiptId: created.id,
            sourceSha256: context.job.source.sha256,
            sourceGeneration: context.job.source.generation,
            previewSha256: derivative.sha256,
            profileId: context.job.profileId,
            candidateRequiresActivePromotionLedger: true,
            historicalVariantIsNotCurrentState: true,
            ...boundaries(),
          }),
        },
        update: {
          duration: derivative.verificationMeasurement.durationSeconds,
          sizeBytes: BigInt(derivative.sizeBytes),
        },
      });
    }
    return created;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

  return {
    ok: true,
    idempotentReplay: false,
    receipt: publicReceipt(receipt),
    promotion: await readAudioMasterPromotionSummary({
      prisma: input.prisma,
      projectId: context.project.id,
      assetId: context.asset.id,
    }),
  };
}
