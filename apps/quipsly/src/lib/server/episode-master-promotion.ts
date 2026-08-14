import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import {
  buildEpisodeMasterPromotionGcsObjectName,
  parseEpisodeMasterPromotionJob,
  parseEpisodeMasterPromotionResult,
  type EpisodeMasterPromotionJob,
} from "@high-ground/quipsly-media-processing";

import { acquirePrismaAdvisoryTransactionLock } from "@/lib/server/prisma-advisory-lock";
import { readLocalExecutorTarget } from "@/lib/server/local-executor-storage";

const JOB_TYPE = "episode-master-promotion";
const JOB_SOURCE = "episode-editor.local-approved-master";
const DEFAULT_GCS_BUCKET = process.env.QUIPSLY_GCS_MASTERS_BUCKET || "high-ground-masters-vault";

export class EpisodeMasterPromotionError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(
    message: string,
    status = 409,
    code = "EPISODE_MASTER_PROMOTION_HELD",
  ) {
    super(message);
    this.name = "EpisodeMasterPromotionError";
    this.status = status;
    this.code = code;
  }
}

export type PublicEpisodeMasterPromotionSummary = {
  latest: null | {
    id: string;
    promotionJobId: string;
    gcsBucket: string;
    gcsObjectName: string;
    gcsGeneration: string;
    masterSha256: string;
    masterSizeBytes: number;
    promotedAt: string;
    actorEmail: string;
    custodyState: "portable-gcs";
  };
  promotionCount: number;
  boundaries: {
    requiresExplicitMasterApproval: true;
    localSourceMustMatchExactReviewHash: true;
    promotionIsPortableObjectCopy: true;
  };
};

export async function readEpisodeMasterPromotionSummary(input: {
  prisma: any;
  masterReviewReceiptId: string;
}): Promise<PublicEpisodeMasterPromotionSummary> {
  const [latest, count] = await Promise.all([
    input.prisma.studioEpisodeMasterPromotionReceipt.findFirst({
      where: { masterReviewReceiptId: input.masterReviewReceiptId },
      orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
    }),
    input.prisma.studioEpisodeMasterPromotionReceipt.count({
      where: { masterReviewReceiptId: input.masterReviewReceiptId },
    }),
  ]);

  return {
    latest: latest
      ? {
          id: latest.id,
          promotionJobId: latest.promotionJobId,
          gcsBucket: latest.gcsBucket,
          gcsObjectName: latest.gcsObjectName,
          gcsGeneration: latest.gcsGeneration,
          masterSha256: latest.masterSha256,
          masterSizeBytes: Number(latest.masterSizeBytes),
          promotedAt: latest.occurredAt.toISOString(),
          actorEmail: latest.actorEmail,
          custodyState: "portable-gcs",
        }
      : null,
    promotionCount: count,
    boundaries: {
      requiresExplicitMasterApproval: true,
      localSourceMustMatchExactReviewHash: true,
      promotionIsPortableObjectCopy: true,
    },
  };
}

export async function queueEpisodeMasterPromotion(input: {
  prisma: any;
  projectSlug: string;
  episodeSlug: string;
  masterReviewReceiptId: string;
  actor: { userId?: string | null; email: string };
  clientRequestId: string;
}) {
  const actorEmail = input.actor.email.trim().toLowerCase();
  if (!actorEmail) {
    throw new EpisodeMasterPromotionError(
      "A verified account email is required for promotion.",
      400,
      "EPISODE_MASTER_PROMOTION_ACTOR_REQUIRED",
    );
  }

  const reviewReceipt = await input.prisma.studioEpisodeMasterReviewReceipt.findUnique({
    where: { id: input.masterReviewReceiptId },
    include: { project: true, episodeProduction: true, renderJob: true },
  });

  if (!reviewReceipt || reviewReceipt.decision !== "APPROVED") {
    throw new EpisodeMasterPromotionError(
      "Master promotion requires an explicitly APPROVED master review receipt.",
      409,
      "EPISODE_MASTER_PROMOTION_UNAPPROVED",
    );
  }

  const executor = await readLocalExecutorTarget(
    input.prisma,
    reviewReceipt.renderJob.executionTarget?.custodianNodeId || "mac-studio-01",
  );

  const custodianNodeId = executor?.nodeId || "mac-studio-01";
  const storageScopeId = executor?.storageScopeId || "local-ssd-root";

  const jobId = `promo-${randomUUID().replace(/-/g, "").slice(0, 16)}`;
  const gcsObjectName = buildEpisodeMasterPromotionGcsObjectName({
    projectSlug: input.projectSlug,
    episodeSlug: input.episodeSlug,
    jobId,
  });

  const jobManifest: EpisodeMasterPromotionJob = parseEpisodeMasterPromotionJob({
    kind: "quipsly-episode-master-promotion-job-v1",
    version: 1,
    jobId,
    projectId: reviewReceipt.projectId,
    episodeProductionId: reviewReceipt.episodeProductionId,
    requestedByEmail: actorEmail,
    clientRequestId: input.clientRequestId,
    queuedAt: new Date().toISOString(),
    reviewApproval: {
      receiptId: reviewReceipt.id,
      masterJobId: reviewReceipt.renderJobId,
      approvedByEmail: reviewReceipt.actorEmail,
      approvedAt: reviewReceipt.occurredAt.toISOString(),
      masterSha256: reviewReceipt.outputSha256,
      masterSizeBytes: Number(reviewReceipt.outputSizeBytes),
      masterGeneration: reviewReceipt.outputGeneration,
      masterLocator: String(reviewReceipt.renderJob.resultJson?.output?.locator || ""),
    },
    executionTarget: {
      portability: "executor-local",
      custodianNodeId,
      storageScopeId,
    },
    sourceLocalMaster: {
      portability: "executor-local",
      custodianNodeId,
      storageScopeId,
      locator: String(reviewReceipt.renderJob.resultJson?.output?.locator || ""),
      sha256: reviewReceipt.outputSha256,
      sizeBytes: Number(reviewReceipt.outputSizeBytes),
    },
    target: {
      provider: "gcs",
      bucketName: DEFAULT_GCS_BUCKET,
      objectName: gcsObjectName,
      contentType: "video/mp4",
    },
    boundaries: {
      requiresExplicitMasterApproval: true,
      localSourceMustMatchExactReviewHash: true,
      promotionIsPortableObjectCopy: true,
      originalSourceMediaRemainsImmutable: true,
      serverMustVerifyGcsUploadBeforeCustodyUpdate: true,
    },
  });

  return input.prisma.$transaction(async (tx: any) => {
    await acquirePrismaAdvisoryTransactionLock(
      tx,
      `episode-master-promotion:${reviewReceipt.id}:${actorEmail}`,
    );

    const workflowJob = await tx.studioWorkflowJob.create({
      data: {
        id: jobId,
        projectId: reviewReceipt.projectId,
        type: JOB_TYPE,
        source: JOB_SOURCE,
        status: "queued",
        priority: 10,
        inputJson: jobManifest as unknown as Prisma.InputJsonValue,
      },
    });

    return {
      ok: true,
      jobId: workflowJob.id,
      gcsTarget: jobManifest.target,
    };
  });
}
