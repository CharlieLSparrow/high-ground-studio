import "server-only";

import { createHash } from "node:crypto";

import type { PrismaClient } from "@prisma/client";

import {
  episodeTimelineContentFingerprint,
  timelineStateFromEpisodeArtifact,
} from "@/app/(app)/episode-production/episodeArtifact";
import type { EpisodeProductionActor } from "@/lib/server/episode-production-access";
import { loadEpisodeCaptureTakeMaterialization } from "@/lib/server/episode-capture-take-materialization";

import { buildSessionEpisodeAssemblyEvidence } from "./session-episode-assembly-evidence";

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export async function loadSessionEpisodeAssemblyEvidence(input: {
  prisma: PrismaClient | any;
  roomId: string;
  projectId: string;
  projectSlug: string;
  episodeSlug: string;
  captureGroupId?: string | null;
  actor: EpisodeProductionActor;
}) {
  const materialization = await loadEpisodeCaptureTakeMaterialization({
    prisma: input.prisma,
    projectId: input.projectId,
    episodeSlug: input.episodeSlug,
    captureGroupId: input.captureGroupId,
    actor: input.actor,
  });
  if (!materialization) return null;

  const timeline = timelineStateFromEpisodeArtifact(materialization.production.timelineJson);
  const currentTimelineFingerprintSha256 = sha256(episodeTimelineContentFingerprint(timeline));
  let proposalSets: Array<{ id: string; timelineFingerprintSha256: string }> = [];
  let reviewReceipts: Array<{
    id: string;
    proposalSetId: string | null;
    action: string;
    scope: string;
    evidenceJson: unknown;
    occurredAt: string;
  }> = [];
  let ledgerAvailable = true;
  try {
    const [proposalRows, receiptRows] = await Promise.all([
      input.prisma.studioEpisodeEditProposalSet.findMany({
        where: { episodeProductionId: materialization.production.id },
        select: { id: true, timelineFingerprintSha256: true },
      }),
      input.prisma.studioEpisodeEditReviewReceipt.findMany({
        where: { episodeProductionId: materialization.production.id },
        select: {
          id: true,
          proposalSetId: true,
          action: true,
          scope: true,
          evidenceJson: true,
          occurredAt: true,
        },
      }),
    ]);
    proposalSets = proposalRows.map((row: any) => ({
      id: row.id,
      timelineFingerprintSha256: row.timelineFingerprintSha256,
    }));
    reviewReceipts = receiptRows.map((row: any) => ({
      id: row.id,
      proposalSetId: row.proposalSetId,
      action: String(row.action),
      scope: String(row.scope),
      evidenceJson: row.evidenceJson,
      occurredAt: row.occurredAt.toISOString(),
    }));
  } catch (error) {
    ledgerAvailable = false;
    console.error("[session-assembly-evidence] edit review ledger unavailable", error);
  }

  return buildSessionEpisodeAssemblyEvidence({
    roomId: input.roomId,
    episodeProductionId: materialization.production.id,
    episodeTitle: materialization.production.title,
    projectSlug: input.projectSlug,
    episodeSlug: materialization.production.slug,
    productionUpdatedAt: materialization.production.updatedAt.toISOString(),
    captureGroupId: materialization.captureGroupId,
    selectedMediaCount: materialization.selectedMediaCount,
    plannedSourceCount: materialization.sourceCount,
    plan: materialization.plan,
    timelineClipCount: timeline.clips.length,
    transcriptBlockCount: timeline.transcript.length,
    materializations: timeline.captureTakeMaterializations ?? [],
    proposalSets,
    reviewReceipts,
    currentTimelineFingerprintSha256,
    ledgerAvailable,
  });
}
