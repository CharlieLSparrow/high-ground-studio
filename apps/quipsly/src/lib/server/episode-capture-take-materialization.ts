import "server-only";

import type { PrismaClient } from "@prisma/client";

import {
  timelineStateFromEpisodeArtifact,
} from "@/app/(app)/episode-production/episodeArtifact";
import { canonicalEpisodeImportedMedia } from "@/lib/episode-production/imported-media";
import { reviewedSourceAlignment } from "@/lib/episode-production/reviewed-source-alignment";
import {
  planCaptureTakeMaterialization,
  type CaptureTakeMaterializationSource,
  type CaptureTakeMaterializationTranscript,
} from "@/lib/episode-production/capture-take-materialization";
import type { EpisodeProductionActor } from "@/lib/server/episode-production-access";
import { readTranscriptCorrectionDesk } from "@/lib/server/transcript-corrections";

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord
    : {};
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function finitePositive(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function recordingSyncForImportedAsset(asset: JsonRecord) {
  const metadata = record(asset.metadata);
  const sync = record(asset.sync);
  return {
    ...record(metadata.recordingSync),
    ...record(sync.recordingSync),
  };
}

function captureGroupForImportedAsset(asset: JsonRecord) {
  const recordingSync = recordingSyncForImportedAsset(asset);
  return text(asset.captureGroupId)
    || text(recordingSync.captureGroupId);
}

function recordingAssetIdForImportedAsset(asset: JsonRecord) {
  const sync = record(asset.sync);
  const recordingSync = recordingSyncForImportedAsset(asset);
  return text(asset.recordingAssetId)
    || text(sync.recordingAssetId)
    || text(recordingSync.recordingAssetId);
}

function latestCaptureGroup(importedMedia: JsonRecord[]) {
  return importedMedia
    .map((asset) => ({
      captureGroupId: captureGroupForImportedAsset(asset),
      importedAt: text(asset.importedAt),
    }))
    .filter((item) => item.captureGroupId)
    .sort((left, right) => right.importedAt.localeCompare(left.importedAt))[0]?.captureGroupId ?? "";
}

function participantIdentity(recordingAsset: any) {
  const participant = recordingAsset?.participant;
  if (!participant?.id) return null;
  return {
    participantId: participant.id as string,
    userId: text(participant.userId) || null,
    displayLabel:
      text(participant.displayName)
      || text(participant.email)
      || "Unnamed participant",
    email: text(participant.email).toLowerCase() || null,
    role: text(participant.role) || null,
    deviceLabel: text(participant.deviceLabel) || null,
  };
}

function materializationSource(
  importedAsset: JsonRecord,
  recordingAsset: any,
): CaptureTakeMaterializationSource | null {
  const recordingSync = recordingSyncForImportedAsset(importedAsset);
  const sourceProfile = record(recordingSync.reportedSourceProfile);
  const alignment = reviewedSourceAlignment(importedAsset);
  const kind = importedAsset.kind === "audio" || importedAsset.kind === "video"
    ? importedAsset.kind
    : text(recordingAsset?.kind).includes("VIDEO")
      ? "video"
      : "audio";
  const durationSeconds = finitePositive(recordingSync.durationSeconds)
    ?? finitePositive(recordingAsset?.durationSeconds)
    ?? 0;
  const captureGroupId = captureGroupForImportedAsset(importedAsset);
  const roomId = text(recordingAsset?.roomId)
    || text(recordingSync.callRoomId);
  const recordingAssetId = recordingAssetIdForImportedAsset(importedAsset);
  if (!captureGroupId || !roomId || !recordingAssetId) return null;
  return {
    captureGroupId,
    roomId,
    recordingAssetId,
    mediaAssetId: text(importedAsset.id),
    sourceId: text(importedAsset.sourceId),
    sourceSha256:
      text(recordingSync.expectedSha256).toLowerCase()
      || text(recordingAsset?.checksum).toLowerCase()
      || null,
    storageGeneration: text(recordingSync.storageGeneration) || null,
    playbackUrl: text(importedAsset.playbackUrl),
    originalName: text(importedAsset.originalName) || text(recordingAsset?.fileName) || "Capture source",
    kind,
    durationSeconds,
    participant: participantIdentity(recordingAsset),
    cameraPosition:
      text(recordingSync.cameraPosition)
      || text(sourceProfile.cameraPosition)
      || null,
    alignment: alignment
      ? {
          reviewId: alignment.reviewId,
          method: alignment.method,
          anchorTimelineSeconds: alignment.placement.anchorTimelineSeconds,
          targetSourceSeconds: alignment.placement.targetSourceSeconds,
        }
      : null,
  };
}

async function canonicalTranscriptForRoom(input: {
  prisma: any;
  roomId: string;
  actor: EpisodeProductionActor;
}): Promise<CaptureTakeMaterializationTranscript | null> {
  try {
    const desk = await readTranscriptCorrectionDesk({
      prisma: input.prisma,
      roomId: input.roomId,
      actor: {
        id: input.actor.id,
        email: input.actor.email,
        isStaff: input.actor.isStaff,
      },
    });
    const recordingAssetId = text(desk.playback?.recordingAssetId);
    if (
      desk.gate.allowed !== true
      || desk.transcriptStatus !== "COMPLETED"
      || !text(desk.transcriptJobId)
      || !recordingAssetId
      || !Array.isArray(desk.segments)
      || desk.segments.length === 0
    ) return null;
    return {
      transcriptJobId: desk.transcriptJobId!,
      recordingAssetId,
      segments: desk.segments.map((segment: any) => ({
        id: text(segment.id),
        speaker: text(segment.speakerLabel) || null,
        startSeconds: Number(segment.startSeconds),
        endSeconds: Number(segment.endSeconds),
        text: text(segment.text),
        reviewStatus: segment.acceptedCorrection || segment.acceptedVerification
          ? "human-reviewed"
          : "provider",
        acceptedReviewId:
          text(segment.acceptedCorrection?.id)
          || text(segment.acceptedVerification?.id)
          || null,
        speakerAttribution: segment.speakerAttribution?.participantId
          ? {
              participantId: text(segment.speakerAttribution.participantId) || null,
              participantUserId: text(segment.speakerAttribution.participantUserId) || null,
              attributedLabel: text(segment.speakerAttribution.attributedLabel) || text(segment.speakerLabel) || "Speaker",
            }
          : null,
      })),
    };
  } catch {
    return null;
  }
}

export async function loadEpisodeCaptureTakeMaterialization(input: {
  prisma: PrismaClient | any;
  projectId: string;
  episodeSlug: string;
  captureGroupId?: string | null;
  actor: EpisodeProductionActor;
  materializedAt?: string;
}) {
  const production = await input.prisma.studioEpisodeProduction.findUnique({
    where: {
      projectId_slug: {
        projectId: input.projectId,
        slug: input.episodeSlug,
      },
    },
    select: {
      id: true,
      projectId: true,
      slug: true,
      title: true,
      timelineJson: true,
      transcriptJson: true,
      productionJson: true,
      updatedAt: true,
    },
  });
  if (!production) return null;

  const importedMedia = canonicalEpisodeImportedMedia(
    production.productionJson,
    production.timelineJson,
  );
  const captureGroupId = text(input.captureGroupId)
    || latestCaptureGroup(importedMedia);
  const selectedMedia = importedMedia.filter((asset) => (
    captureGroupForImportedAsset(asset) === captureGroupId
  ));
  const recordingAssetIds = Array.from(new Set(
    selectedMedia.map(recordingAssetIdForImportedAsset).filter(Boolean),
  ));
  const recordingAssets = recordingAssetIds.length > 0
    ? await input.prisma.recordingAsset.findMany({
        where: { id: { in: recordingAssetIds } },
        include: { participant: true },
      })
    : [];
  const recordingById = new Map(recordingAssets.map((asset: any) => [asset.id, asset]));
  const sources = selectedMedia.flatMap((asset) => {
    const source = materializationSource(
      asset,
      recordingById.get(recordingAssetIdForImportedAsset(asset)),
    );
    return source ? [source] : [];
  });
  const roomId = sources[0]?.roomId ?? "";
  const transcript = roomId
    ? await canonicalTranscriptForRoom({
        prisma: input.prisma,
        roomId,
        actor: input.actor,
      })
    : null;
  const productionRecord = record(production.productionJson);
  const timeline = timelineStateFromEpisodeArtifact(production.timelineJson);
  const plan = planCaptureTakeMaterialization({
    timeline,
    sources,
    transcript,
    spineAudioAssetId: text(productionRecord.spineAudioAssetId) || null,
    actor: { id: input.actor.id, email: input.actor.email },
    materializedAt: input.materializedAt ?? new Date().toISOString(),
  });

  return {
    production,
    captureGroupId,
    importedMediaCount: importedMedia.length,
    selectedMediaCount: selectedMedia.length,
    sourceCount: sources.length,
    transcriptJobId: transcript?.transcriptJobId ?? null,
    plan,
  };
}
