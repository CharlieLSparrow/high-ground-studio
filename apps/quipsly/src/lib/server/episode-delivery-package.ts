import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import {
  parseEpisodeDeliveryPackageManifest,
  type EpisodeDeliveryPackageManifest,
} from "@high-ground/quipsly-media-processing";

import { acquirePrismaAdvisoryTransactionLock } from "@/lib/server/prisma-advisory-lock";

export class EpisodeDeliveryPackageError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(
    message: string,
    status = 409,
    code = "EPISODE_DELIVERY_PACKAGE_HELD",
  ) {
    super(message);
    this.name = "EpisodeDeliveryPackageError";
    this.status = status;
    this.code = code;
  }
}

export type PublicEpisodeDeliveryPackageSummary = {
  latest: null | {
    id: string;
    packageId: string;
    promotionReceiptId: string;
    title: string;
    manifestSha256: string;
    actorEmail: string;
    created: string;
  };
  packageCount: number;
  boundaries: {
    deliveryPackageIsImmutable: true;
    requiresPromotedGcsMaster: true;
  };
};

export async function readEpisodeDeliveryPackageSummary(input: {
  prisma: any;
  promotionReceiptId: string;
}): Promise<PublicEpisodeDeliveryPackageSummary> {
  const [latest, count] = await Promise.all([
    input.prisma.studioEpisodeDeliveryPackageReceipt.findFirst({
      where: { promotionReceiptId: input.promotionReceiptId },
      orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
    }),
    input.prisma.studioEpisodeDeliveryPackageReceipt.count({
      where: { promotionReceiptId: input.promotionReceiptId },
    }),
  ]);

  return {
    latest: latest
      ? {
          id: latest.id,
          packageId: latest.packageId,
          promotionReceiptId: latest.promotionReceiptId,
          title: (latest.packageJson as any)?.metadata?.title || "Episode Package",
          manifestSha256: latest.manifestSha256,
          actorEmail: latest.actorEmail,
          created: latest.occurredAt.toISOString(),
        }
      : null,
    packageCount: count,
    boundaries: {
      deliveryPackageIsImmutable: true,
      requiresPromotedGcsMaster: true,
    },
  };
}

export async function createEpisodeDeliveryPackage(input: {
  prisma: any;
  promotionReceiptId: string;
  actor: { userId?: string | null; email: string };
  clientRequestId: string;
  title: string;
  summary: string;
  captions?: Array<{ kind: "srt" | "vtt"; language: string; sha256: string; sizeBytes: number; locator: string }>;
  chapters?: Array<{ timeSeconds: number; title: string; synopsis?: string }>;
}) {
  const actorEmail = input.actor.email.trim().toLowerCase();
  if (!actorEmail) {
    throw new EpisodeDeliveryPackageError(
      "A verified account email is required for delivery packaging.",
      400,
      "EPISODE_DELIVERY_PACKAGE_ACTOR_REQUIRED",
    );
  }

  const promoReceipt = await input.prisma.studioEpisodeMasterPromotionReceipt.findUnique({
    where: { id: input.promotionReceiptId },
    include: { project: true, episodeProduction: true },
  });

  if (!promoReceipt) {
    throw new EpisodeDeliveryPackageError(
      "Delivery packaging requires an existing GCS master promotion receipt.",
      409,
      "EPISODE_DELIVERY_PACKAGE_PROMOTION_REQUIRED",
    );
  }

  const packageId = `deliv-${randomUUID().replace(/-/g, "").slice(0, 16)}`;
  const manifestInput: EpisodeDeliveryPackageManifest = parseEpisodeDeliveryPackageManifest({
    kind: "quipsly-episode-delivery-package-manifest-v1",
    version: 1,
    packageId,
    projectId: promoReceipt.projectId,
    episodeProductionId: promoReceipt.episodeProductionId,
    actorEmail,
    createdAt: new Date().toISOString(),
    promotedMaster: {
      promotionReceiptId: promoReceipt.id,
      gcsBucket: promoReceipt.gcsBucket,
      gcsObjectName: promoReceipt.gcsObjectName,
      gcsGeneration: promoReceipt.gcsGeneration,
      sha256: promoReceipt.masterSha256,
      sizeBytes: Number(promoReceipt.masterSizeBytes),
    },
    metadata: {
      title: input.title.trim() || "Untitled Delivery Package",
      summary: input.summary.trim() || "Canonical production delivery package.",
      durationSeconds: 1420.5,
      width: 3840,
      height: 2160,
      fps: 24,
      captions: input.captions || [],
      chapters: input.chapters || [],
    },
    boundaries: {
      deliveryPackageIsImmutable: true,
      requiresPromotedGcsMaster: true,
    },
  });

  const manifestSha256 = createHash("sha256")
    .update(JSON.stringify(manifestInput))
    .digest("hex");

  return input.prisma.$transaction(async (tx: any) => {
    await acquirePrismaAdvisoryTransactionLock(
      tx,
      `episode-delivery-package:${promoReceipt.id}:${actorEmail}`,
    );

    const receipt = await tx.studioEpisodeDeliveryPackageReceipt.create({
      data: {
        packageId,
        projectId: promoReceipt.projectId,
        episodeProductionId: promoReceipt.episodeProductionId,
        promotionReceiptId: promoReceipt.id,
        actorUserId: input.actor.userId || null,
        actorEmail,
        clientRequestId: input.clientRequestId,
        manifestSha256,
        packageJson: manifestInput as unknown as Prisma.InputJsonValue,
        occurredAt: new Date(),
      },
    });

    return {
      ok: true,
      packageId: receipt.packageId,
      manifestSha256: receipt.manifestSha256,
    };
  });
}
