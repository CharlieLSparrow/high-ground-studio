import "server-only";

import { createHash } from "node:crypto";

import { episodeInventoryAudioDeliveryArtifact } from "@/lib/episode-inventory-audio-delivery";
import { episodeInventoryAudioMasterCandidate } from "@/lib/episode-inventory-audio-master";

import {
  buildSessionVersionedOutputGraph,
  type SessionOutputGraphAssetInput,
  type SessionOutputGraphProgramMixInput,
  type SessionOutputGraphSelectionInput,
  type SessionVersionedOutputGraph,
} from "./session-versioned-output-graph";

function object(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, any>
    : {};
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function iso(value: unknown) {
  return value && typeof (value as any).toISOString === "function"
    ? (value as any).toISOString()
    : text(value) || null;
}

function stableJson(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (typeof value === "object") {
    const row = value as Record<string, unknown>;
    return `{${Object.keys(row).sort().map((key) => `${JSON.stringify(key)}:${stableJson(row[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256(value: unknown) {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}

function programMixProjection(rows: any[], registeredAsset: any | null): SessionOutputGraphProgramMixInput | null {
  const latest = rows[0] ?? null;
  if (!latest?.mixJob) return null;
  const proposal = object(latest.mixJob.inputJson);
  const resultEnvelope = object(latest.mixJob.resultJson);
  const result = object(resultEnvelope.receipt);
  const derivative = object(result.derivative);
  const baselineDerivative = object(result.baselineDerivative);
  const registration = object(resultEnvelope.registration);
  const attachment = registeredAsset?.assetAttachments?.[0] ?? null;
  const attachmentMetadata = object(attachment?.metadataJson);
  const attachmentOutput = object(attachmentMetadata.output);
  const tracks = Array.isArray(proposal.tracks) ? proposal.tracks : [];
  const assetId = text(derivative.assetId) || text(registration.outputAssetId) || null;
  const programFingerprintSha256 = text(proposal.programFingerprintSha256);
  const proposalSha256 = text(latest.proposalSha256);
  const previewSha256 = text(latest.previewSha256);
  return {
    jobId: String(latest.mixJobId),
    assetId,
    sourceTrackCount: tracks.length,
    programFingerprintSha256,
    proposalSha256,
    previewSha256,
    reviewReceiptId: text(latest.reviewReceiptId) || null,
    promotionReceiptId: String(latest.id),
    operation: latest.operation === "WITHDRAW" ? "WITHDRAW" : "PROMOTE",
    playbackUrl: text(registration.playbackUrl) || text(object(latest.evidenceJson).candidatePlaybackUrl) || null,
    occurredAt: iso(latest.occurredAt),
    historicalEventCount: rows.length,
    integrity: {
      jobCompleted: latest.mixJob.status === "completed",
      assetRegistered: Boolean(assetId
        && registeredAsset?.id === assetId
        && registeredAsset.url === text(registration.playbackUrl)
        && attachment?.source === "episode-audio-mix-registration"
        && text(attachmentMetadata.episodeProductionId) === text(latest.episodeProductionId)
        && text(attachmentMetadata.mixJobId) === text(latest.mixJobId)
        && text(attachmentMetadata.playbackUrl) === text(registration.playbackUrl)
        && text(attachmentOutput.sha256) === previewSha256),
      reviewApproved: latest.reviewReceipt?.decision === "APPROVED",
      promotionMatchesJob: String(latest.mixJobId) === String(latest.mixJob.id),
      promotionMatchesReview: Boolean(latest.reviewReceipt
        && text(latest.reviewReceiptId) === text(latest.reviewReceipt.id)
        && text(latest.reviewReceipt.mixJobId) === text(latest.mixJobId)
        && latest.reviewReceipt.programFingerprintSha256 === latest.programFingerprintSha256
        && latest.reviewReceipt.proposalSha256 === latest.proposalSha256
        && latest.reviewReceipt.baselineSha256 === latest.baselineSha256
        && latest.reviewReceipt.previewSha256 === latest.previewSha256),
      promotionMatchesProposal: Boolean(proposalSha256 && proposalSha256 === sha256(proposal)),
      promotionMatchesBaseline: Boolean(text(latest.baselineSha256) && text(latest.baselineSha256) === text(baselineDerivative.sha256)),
      promotionMatchesPreview: Boolean(previewSha256 && previewSha256 === text(derivative.sha256)),
      promotionMatchesProgram: Boolean(programFingerprintSha256 && programFingerprintSha256 === text(latest.programFingerprintSha256)),
    },
  };
}

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
  if (!episode) return buildSessionVersionedOutputGraph({ episode, assets: [], selections: [] });
  const uniqueSources = [...new Map(input.sources.map((source) => [source.mediaAssetId, source])).values()];
  const mediaAssetIds = uniqueSources.map((source) => source.mediaAssetId);
  const [assetRows, selectionRows, programMixPromotionRows] = await Promise.all([
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
    input.prisma.studioEpisodeAudioMixPromotionReceipt.findMany({
      where: { projectId: input.projectId, episodeProductionId: episode.id },
      orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
      take: 100,
      include: { mixJob: true, reviewReceipt: true },
    }),
  ]);
  const latestMixJob = programMixPromotionRows[0]?.mixJob ?? null;
  const latestMixResult = object(object(latestMixJob?.resultJson).receipt);
  const latestMixRegistration = object(object(latestMixJob?.resultJson).registration);
  const latestMixAssetId = text(object(latestMixResult.derivative).assetId) || text(latestMixRegistration.outputAssetId) || null;
  const registeredMixAsset = latestMixAssetId ? await input.prisma.studioMediaAsset.findFirst({
    where: {
      id: latestMixAssetId,
      assetAttachments: {
        some: {
          projectId: input.projectId,
          source: "episode-audio-mix-registration",
          metadataJson: { path: ["episodeProductionId"], equals: episode.id },
        },
      },
    },
    select: {
      id: true,
      url: true,
      assetAttachments: {
        where: { projectId: input.projectId, source: "episode-audio-mix-registration" },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 1,
        select: { source: true, metadataJson: true },
      },
    },
  }) : null;
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
  return buildSessionVersionedOutputGraph({
    episode,
    programMix: programMixProjection(programMixPromotionRows, registeredMixAsset),
    assets,
    selections,
  });
}
