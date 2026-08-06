import "server-only";

import { episodeInventoryAudioDeliveryArtifact } from "@/lib/episode-inventory-audio-delivery";
import { episodeInventoryAudioMasterCandidate } from "@/lib/episode-inventory-audio-master";

import {
  buildSessionVersionedOutputGraph,
  type SessionOutputGraphAssetInput,
  type SessionOutputGraphSelectionInput,
  type SessionVersionedOutputGraph,
} from "./session-versioned-output-graph";

export async function loadSessionVersionedOutputGraph(input: {
  prisma: any;
  projectId: string;
  projectSlug: string;
  episode: null | { id: string; slug: string; title: string };
  sources: Array<{
    recordingAssetId: string;
    mediaAssetId: string;
    sourceId: string;
    label: string;
  }>;
}): Promise<SessionVersionedOutputGraph> {
  const episode = input.episode ? { ...input.episode, projectSlug: input.projectSlug } : null;
  if (!episode || !input.sources.length) return buildSessionVersionedOutputGraph({ episode, assets: [], selections: [] });
  const uniqueSources = [...new Map(input.sources.map((source) => [source.mediaAssetId, source])).values()];
  const mediaAssetIds = uniqueSources.map((source) => source.mediaAssetId);
  const [assetRows, selectionRows] = await Promise.all([
    input.prisma.studioMediaAsset.findMany({
      where: {
        id: { in: mediaAssetIds },
        assetAttachments: { some: { projectId: input.projectId } },
      },
      select: {
        id: true,
        variants: { orderBy: [{ updatedAt: "desc" }, { id: "desc" }], take: 50 },
        audioMasterPromotions: {
          where: { projectId: input.projectId },
          orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
          take: 50,
        },
        processingJobs: {
          where: { projectId: input.projectId, type: "audio-delivery" },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: 10,
          include: {
            audioDeliveryReviews: {
              orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
              take: 50,
            },
          },
        },
        assetAttachments: {
          where: { projectId: input.projectId },
          select: { role: true },
          take: 1,
        },
      },
    }),
    input.prisma.studioEpisodeOutputSelectionReceipt.findMany({
      where: { episodeProductionId: episode.id, outputKind: "podcast-rss-episode" },
      orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
      take: 100,
      include: { outputPacket: true },
    }),
  ]);
  const assetsById = new Map(assetRows.map((row: any) => [row.id, row]));
  const assets: SessionOutputGraphAssetInput[] = uniqueSources.flatMap((source) => {
    const row = assetsById.get(source.mediaAssetId) as any;
    if (!row) return [];
    const delivery = episodeInventoryAudioDeliveryArtifact({
      jobs: row.processingJobs,
      variants: row.variants,
      promotionEvents: row.audioMasterPromotions,
    });
    return [{
      ...source,
      attachmentRole: row.assetAttachments[0]?.role ?? null,
      masterCandidate: episodeInventoryAudioMasterCandidate(row.audioMasterPromotions),
      deliveryArtifact: delivery ? {
        jobId: String(delivery.jobId),
        status: String(delivery.status),
        promotionReceiptId: delivery.promotionReceiptId,
        deliverySha256: delivery.deliverySha256,
        playbackUrl: delivery.playbackUrl,
        promotionStillActive: delivery.promotionStillActive,
        review: delivery.review ? {
          id: String(delivery.review.id),
          decision: delivery.review.decision === "approved" ? "approved" as const : "rejected" as const,
          reviewedAt: delivery.review.reviewedAt,
        } : null,
        readiness: {
          encodedAndVerified: delivery.readiness.encodedAndVerified,
          proofListenApproved: delivery.readiness.proofListenApproved,
          outputPacketEligible: delivery.readiness.outputPacketEligible,
        },
      } : null,
    }];
  });
  const selections: SessionOutputGraphSelectionInput[] = selectionRows.map((row: any) => ({
    id: row.id,
    operation: row.operation,
    outputPacketId: row.outputPacketId,
    packetDigestSha256: row.packetDigestSha256,
    artifactSha256: row.artifactSha256,
    occurredAt: row.occurredAt.toISOString(),
    reason: row.reason,
    packet: {
      id: row.outputPacket.id,
      slug: row.outputPacket.slug,
      title: row.outputPacket.title,
      status: row.outputPacket.status,
      packetJson: row.outputPacket.packetJson,
    },
  }));
  return buildSessionVersionedOutputGraph({ episode, assets, selections });
}
