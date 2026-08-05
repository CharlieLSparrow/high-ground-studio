import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";

import type { EpisodeImportedMediaAsset } from "@/app/(app)/episode-production/episodeArtifact";
import {
  canonicalEpisodeImportedMedia,
  canonicalEpisodeProductionJson,
} from "@/lib/episode-production/imported-media";
import {
  EPISODE_ROOM_TIMELINE_SOURCE,
  EpisodeRoomCommandError,
  EpisodeRoomRevisionConflict,
  applyEpisodeRoomCommand,
  episodeRoomTimelineMaterializationIsCurrent,
  episodeRoomTimelineClips,
  normalizeEpisodeRoomState,
  type EpisodeRoomActor,
  type EpisodeRoomClip,
  type EpisodeRoomCommand,
  type EpisodeRoomState,
} from "@/lib/episode-room/episode-room-contract";
import {
  episodeRoomCaptureAlignment,
  type EpisodeRoomCaptureAlignment,
} from "@/lib/episode-room/episode-room-source-alignment";
import { getPrismaClient } from "@/lib/prisma";
import { reconcileCaptureProxyResults } from "@/lib/server/capture-proxy-reconciliation";
import {
  episodeRoomWritingUpdatedAt,
  episodeRoomWritingVersion,
} from "@/lib/server/episode-room-writing";
import {
  listEpisodeMilestoneAssignees,
  listEpisodeMilestones,
} from "@/lib/server/episode-production-milestones";
import { sessionActorAccessWhere } from "@/lib/server/session-access";
import { callRoomEpisodeBindingWhere } from "@/lib/server/session-episode-binding";

type JsonRecord = Record<string, unknown>;

export type EpisodeRoomTextBlock = {
  id: string;
  stableId: string;
  order: number;
  title: string | null;
  body: string;
};

export type EpisodeRoomWritingState = {
  version: string;
  updatedAt: string;
  blockCount: number;
  visibleBlockCount: number;
  truncated: boolean;
  textBlocks?: EpisodeRoomTextBlock[];
};

export type EpisodeRoomTranscriptSegment = {
  id: string;
  speaker: string;
  text: string;
  startSeconds: number;
  endSeconds: number;
};

export type EpisodeRoomImportedCandidate = EpisodeRoomClip & {
  attached: boolean;
  proxyStatus?: string;
  sourceStatus: string;
  sourceSyncStatus: string;
  alignmentStatus: string;
  captureAlignment: EpisodeRoomCaptureAlignment | null;
  canAddToWatch: boolean;
  readinessLabel: string;
  recordingAssetId?: string;
  captureGroupId?: string;
};

export type EpisodeRoomVaultCandidate = {
  assetId: string;
  title: string;
  kind: "audio" | "video";
  mimeType: string | null;
  playbackUrl: string;
  durationSeconds?: number;
  thumbnailUrl: string | null;
  updatedAt: string;
  savedClipCount: number;
  savedClipTitles: string[];
  savedClips: EpisodeRoomVaultSavedClip[];
  imported: boolean;
  attached: boolean;
  canAddToWatch: boolean;
  readinessLabel: string;
};

export type EpisodeRoomVaultSavedClip = {
  mediaClipId: string;
  watchId: string;
  title: string;
  rangeStartSeconds: number;
  rangeEndSeconds: number;
  durationSeconds: number;
  attached: boolean;
};

export type EpisodeRoomRecordingSession = {
  id: string;
  captureGroupId: string;
  title: string;
  purpose: string;
  status: string;
  provider: string;
  recordingStartedAt: string | null;
  endedAt: string | null;
  updatedAt: string;
  participantRole: string | null;
  canUseRecordingClock: boolean;
  canOpenSession: boolean;
};

export type EpisodeRoomMilestone = Awaited<ReturnType<typeof listEpisodeMilestones>>[number];

export type EpisodeRoomMilestoneAssignee = Awaited<ReturnType<typeof listEpisodeMilestoneAssignees>>[number];

export type EpisodeRoomDeskPayload = {
  project: {
    id: string;
    slug: string;
    name: string;
  };
  episode: {
    id: string;
    slug: string;
    title: string;
    status: string;
    updatedAt: string;
    documentId: string;
    documentTitle: string;
  };
  room: EpisodeRoomState;
  writing: EpisodeRoomWritingState;
  textBlocks: EpisodeRoomTextBlock[];
  transcriptSegments: EpisodeRoomTranscriptSegment[];
  importedCandidates: EpisodeRoomImportedCandidate[];
  vaultCandidates: EpisodeRoomVaultCandidate[];
  recordingSessions: EpisodeRoomRecordingSession[];
  milestones: EpisodeRoomMilestone[];
  milestoneAssignees: EpisodeRoomMilestoneAssignee[];
  timelineClipCount: number;
  canEdit: boolean;
};

export type EpisodeRoomRuntimePayload = {
  room: EpisodeRoomState;
  writing: EpisodeRoomWritingState;
  importedCandidates: EpisodeRoomImportedCandidate[];
  recordingSessions: EpisodeRoomRecordingSession[];
  timelineClipCount: number;
  updatedAt: string;
};

export type EpisodeRoomWatchRuntimePayload = {
  room: EpisodeRoomState;
  updatedAt: string;
};

export type EpisodeRoomWritingRuntimePayload = {
  episode: {
    id: string;
    slug: string;
    title: string;
    status: string;
    updatedAt: string;
    documentId: string;
    documentTitle: string;
  };
  writing: EpisodeRoomWritingState;
};

export type EpisodeRoomCommandInput =
  | {
      type: "ADD_CLIP";
      assetId: string;
      clientRequestId: string;
      expectedRevision: number;
    }
  | {
      type: "IMPORT_VAULT_ASSET";
      assetId: string;
      mediaClipId?: string;
      clientRequestId: string;
      expectedRevision: number;
    }
  | {
      type: "START_SESSION";
      recordingRoomId?: string;
      clientRequestId: string;
      expectedRevision: number;
    }
  | Exclude<EpisodeRoomCommand, { type: "ADD_CLIP" | "START_SESSION" }>;

function record(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord
    : {};
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function optionalNumber(value: unknown) {
  if (value === null || value === undefined) return undefined;
  if (typeof value === "string" && !value.trim()) return undefined;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function safeByteCount(value: unknown) {
  const parsed = optionalNumber(value);
  if (parsed === undefined) return 0;
  return Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, Math.trunc(parsed)));
}

function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function productionRoomState(productionJson: unknown, now?: string) {
  return normalizeEpisodeRoomState(record(productionJson).episodeRoom, now);
}

function importedMedia(
  productionJson: unknown,
  legacyTimelineJson?: unknown,
) {
  return canonicalEpisodeImportedMedia(
    productionJson,
    legacyTimelineJson,
  ) as EpisodeImportedMediaAsset[];
}

function durationForImportedAsset(asset: EpisodeImportedMediaAsset) {
  const metadata = record(asset.metadata);
  const sync = record(asset.sync);
  const metadataRecording = record(metadata.recordingSync);
  const syncRecording = record(sync.recordingSync);
  return optionalNumber(syncRecording.durationSeconds)
    ?? optionalNumber(metadataRecording.durationSeconds);
}

function clipFromImportedAsset(
  asset: EpisodeImportedMediaAsset,
  actorLabel: string,
  now: string,
  savedClip?: {
    id: string;
    title: string;
    inTimecode: number;
    outTimecode: number;
  },
): EpisodeRoomClip {
  const proxyStatus = text(asset.proxy?.status).toLowerCase();
  const collaborativePlaybackReady =
    asset.kind !== "video"
    || Boolean(text(asset.proxy?.proxyUrl))
    || ["ready", "not-required", "external-preview"].includes(
      proxyStatus,
    );
  if (!collaborativePlaybackReady) {
    throw new EpisodeRoomCommandError(
      proxyStatus === "failed"
        ? "Repair or register this video proxy before adding it to shared Watch."
        : "Wait for this verified video source's proxy before adding it to shared Watch.",
    );
  }
  const playbackUrl = text(asset.proxy?.proxyUrl) || text(asset.playbackUrl);
  if (!playbackUrl) {
    throw new EpisodeRoomCommandError("This media does not have a playable source yet.");
  }
  if (asset.kind !== "audio" && asset.kind !== "video") {
    throw new EpisodeRoomCommandError("Episode Room supports audio and video watch clips.");
  }
  const assetDuration = durationForImportedAsset(asset);
  const rangeStartSeconds = savedClip
    ? Math.max(0, optionalNumber(savedClip.inTimecode) ?? 0)
    : undefined;
  const proposedRangeEnd = savedClip
    ? Math.max(0, optionalNumber(savedClip.outTimecode) ?? 0)
    : undefined;
  const rangeEndSeconds = proposedRangeEnd === undefined
    ? undefined
    : Math.min(assetDuration ?? Number.MAX_SAFE_INTEGER, proposedRangeEnd);
  if (
    savedClip
    && (
      rangeStartSeconds === undefined
      || rangeEndSeconds === undefined
      || rangeEndSeconds - rangeStartSeconds < 0.05
    )
  ) {
    throw new EpisodeRoomCommandError(
      "This saved Media Vault clip does not have a playable time range.",
    );
  }
  return {
    watchId: savedClip
      ? `media-vault-clip:${savedClip.id}`
      : asset.id,
    assetId: asset.id,
    ...(asset.sourceId ? { sourceId: asset.sourceId } : {}),
    title: savedClip?.title || asset.originalName || "Untitled watch clip",
    kind: asset.kind,
    playbackUrl,
    ...(assetDuration === undefined
      ? {}
      : { durationSeconds: assetDuration }),
    ...(savedClip
      ? {
          rangeStartSeconds,
          rangeEndSeconds,
        }
      : {}),
    ...(asset.importRole ? { importRole: asset.importRole } : {}),
    addedAt: now,
    addedBy: actorLabel,
  };
}

function importedCandidate(
  asset: EpisodeImportedMediaAsset,
  room: EpisodeRoomState,
  now: string,
): EpisodeRoomImportedCandidate | null {
  const playbackUrl = text(asset.proxy?.proxyUrl)
    || text(asset.playbackUrl);
  if (
    !playbackUrl
    || (asset.kind !== "audio" && asset.kind !== "video")
  ) {
    return null;
  }
  const metadata = record(asset.metadata);
  const metadataRecording = record(metadata.recordingSync);
  const sync = record(asset.sync);
  const syncRecording = record(sync.recordingSync);
  const proxyStatus = text(asset.proxy?.status).toLowerCase()
    || "registered";
  const sourceVerification =
    text(syncRecording.sourceVerification)
    || text(metadataRecording.sourceVerification);
  const recordingAssetId =
    text(sync.recordingAssetId)
    || text(syncRecording.recordingAssetId)
    || text(metadataRecording.recordingAssetId);
  const captureGroupId =
    text(syncRecording.captureGroupId)
    || text(metadataRecording.captureGroupId);
  const canAddToWatch =
    asset.kind !== "video"
    || Boolean(text(asset.proxy?.proxyUrl))
    || ["ready", "not-required", "external-preview"].includes(
      proxyStatus,
    );
  const sourceStatus =
    sourceVerification === "server-size-and-sha256"
      ? "source verified"
      : "source registered";
  const sourceSyncStatus = text(sync.status) || "ready-to-sync";
  const captureAlignment = episodeRoomCaptureAlignment(asset);
  const alignmentStatus = captureAlignment?.status
    || (
      sourceSyncStatus === "synced"
        ? "timeline alignment saved"
        : "needs alignment"
    );
  const alignmentLabel = captureAlignment?.status === "proposal-ready"
    ? "clock proposal ready"
    : captureAlignment
      ? "alignment review needed"
      : sourceSyncStatus === "synced"
        ? "timeline alignment saved"
        : "alignment needed";
  const readinessLabel = canAddToWatch
    ? `${sourceStatus} · ${alignmentLabel}`
    : proxyStatus === "failed"
      ? `${sourceStatus} · proxy failed`
      : `${sourceStatus} · proxy ${proxyStatus}`;

  return {
    watchId: asset.id,
    assetId: asset.id,
    ...(asset.sourceId ? { sourceId: asset.sourceId } : {}),
    title: asset.originalName || "Untitled source",
    kind: asset.kind,
    playbackUrl,
    ...(durationForImportedAsset(asset) === undefined
      ? {}
      : { durationSeconds: durationForImportedAsset(asset) }),
    ...(asset.importRole ? { importRole: asset.importRole } : {}),
    addedAt: asset.importedAt || now,
    addedBy: "Imported media",
    attached: room.clips.some((clip) => clip.assetId === asset.id),
    proxyStatus,
    sourceStatus,
    sourceSyncStatus,
    alignmentStatus,
    captureAlignment,
    canAddToWatch,
    readinessLabel,
    ...(recordingAssetId ? { recordingAssetId } : {}),
    ...(captureGroupId ? { captureGroupId } : {}),
  };
}

function importedCandidatesFor(
  productionJson: unknown,
  legacyTimelineJson: unknown,
  room: EpisodeRoomState,
  now: string,
) {
  const attached = new Set(room.clips.map((clip) => clip.assetId));
  return importedMedia(productionJson, legacyTimelineJson)
    .flatMap((asset) => {
      const candidate = importedCandidate(asset, room, now);
      return candidate
        ? [{ ...candidate, attached: attached.has(asset.id) }]
        : [];
    })
    .sort((left, right) => right.addedAt.localeCompare(left.addedAt));
}

function mediaKind(mimeType: unknown, filename: unknown): "audio" | "video" | null {
  const mime = text(mimeType).toLowerCase();
  const name = text(filename).toLowerCase();
  if (mime.startsWith("audio/") || /\.(wav|mp3|m4a|aac|ogg|flac)(?:$|[?#])/.test(name)) {
    return "audio";
  }
  if (mime.startsWith("video/") || /\.(mp4|mov|m4v|webm|mkv)(?:$|[?#])/.test(name)) {
    return "video";
  }
  return null;
}

function preferredVaultPlayback(asset: any, proxies: any[]) {
  const proxyVariant = (asset.variants ?? []).find((variant: any) => (
    text(variant.kind).toLowerCase().includes("proxy")
    && Boolean(text(variant.url))
  ));
  const proxyAsset = proxies.find((candidate: any) => Boolean(text(candidate.url)));
  return {
    playbackUrl:
      text(proxyVariant?.url)
      || text(proxyAsset?.url)
      || text(asset.url),
    hasProxy: Boolean(proxyVariant || proxyAsset),
  };
}

function vaultAssetScopeWhere(projectId: string) {
  return {
    OR: [
      { projects: { some: { id: projectId } } },
      { mediaBin: { projectId } },
      { assetAttachments: { some: { projectId } } },
    ],
  };
}

async function vaultAssetsForProject(
  prisma: any,
  projectId: string,
  assetId?: string,
  mediaClipId?: string,
) {
  const assets = await prisma.studioMediaAsset.findMany({
    where: {
      isProxy: false,
      ...(assetId ? { id: assetId } : {}),
      ...vaultAssetScopeWhere(projectId),
    },
    select: {
      id: true,
      captureGroupId: true,
      filename: true,
      url: true,
      mimeType: true,
      sizeBytes: true,
      duration: true,
      thumbnailUrl: true,
      updatedAt: true,
      variants: {
        orderBy: { updatedAt: "desc" },
        select: {
          kind: true,
          url: true,
          duration: true,
          mimeType: true,
        },
      },
      clips: {
        ...(mediaClipId ? { where: { id: mediaClipId } } : {}),
        orderBy: { updatedAt: "desc" },
        take: mediaClipId ? 1 : 24,
        select: {
          id: true,
          title: true,
          inTimecode: true,
          outTimecode: true,
        },
      },
      _count: {
        select: { clips: true },
      },
    },
    orderBy: { updatedAt: "desc" },
    take: assetId ? 1 : 80,
  });
  if (!assets.length) return [];
  const proxies = await prisma.studioMediaAsset.findMany({
    where: {
      isProxy: true,
      rawAssetId: { in: assets.map((asset: any) => asset.id) },
      ...vaultAssetScopeWhere(projectId),
    },
    select: {
      id: true,
      rawAssetId: true,
      url: true,
      updatedAt: true,
    },
    orderBy: { updatedAt: "desc" },
    take: assetId ? 12 : 160,
  });
  const proxiesByRawId = new Map<string, any[]>();
  for (const proxy of proxies) {
    const rawAssetId = text(proxy.rawAssetId);
    if (!rawAssetId) continue;
    proxiesByRawId.set(rawAssetId, [
      ...(proxiesByRawId.get(rawAssetId) ?? []),
      proxy,
    ]);
  }
  return assets.map((asset: any) => ({
    asset,
    proxies: proxiesByRawId.get(asset.id) ?? [],
    ...preferredVaultPlayback(asset, proxiesByRawId.get(asset.id) ?? []),
  }));
}

async function vaultCandidatesFor(
  prisma: any,
  projectId: string,
  productionJson: unknown,
  legacyTimelineJson: unknown,
  room: EpisodeRoomState,
): Promise<EpisodeRoomVaultCandidate[]> {
  const importedIds = new Set(
    importedMedia(productionJson, legacyTimelineJson)
      .map((asset) => asset.id),
  );
  const attachedWatchIds = new Set(room.clips.map((clip) => clip.watchId));
  const rows = await vaultAssetsForProject(prisma, projectId);
  return rows.flatMap(({ asset, playbackUrl, hasProxy }: any) => {
    const kind = mediaKind(asset.mimeType, asset.filename);
    if (!kind || !playbackUrl) return [];
    const imported = importedIds.has(asset.id);
    const attached = attachedWatchIds.has(asset.id);
    const durationSeconds = optionalNumber(asset.duration)
      ?? optionalNumber(asset.variants?.find((variant: any) => (
        optionalNumber(variant.duration) !== undefined
      ))?.duration);
    return [{
      assetId: asset.id,
      title: text(asset.filename) || "Untitled media",
      kind,
      mimeType: text(asset.mimeType) || null,
      playbackUrl,
      ...(durationSeconds === undefined ? {} : { durationSeconds }),
      thumbnailUrl: text(asset.thumbnailUrl) || null,
      updatedAt: asset.updatedAt.toISOString(),
      savedClipCount: asset._count.clips,
      savedClips: asset.clips.flatMap((clip: any) => {
        const rangeStartSeconds = Math.max(
          0,
          optionalNumber(clip.inTimecode) ?? 0,
        );
        const proposedRangeEnd = Math.max(
          0,
          optionalNumber(clip.outTimecode) ?? 0,
        );
        const rangeEndSeconds = Math.min(
          durationSeconds ?? Number.MAX_SAFE_INTEGER,
          proposedRangeEnd,
        );
        if (rangeEndSeconds - rangeStartSeconds < 0.05) return [];
        const watchId = `media-vault-clip:${clip.id}`;
        return [{
          mediaClipId: clip.id,
          watchId,
          title: text(clip.title) || "Saved clip",
          rangeStartSeconds,
          rangeEndSeconds,
          durationSeconds: rangeEndSeconds - rangeStartSeconds,
          attached: attachedWatchIds.has(watchId),
        }];
      }),
      savedClipTitles: asset.clips
        .map((clip: any) => text(clip.title))
        .filter(Boolean)
        .slice(0, 3),
      imported,
      attached,
      canAddToWatch: !attached,
      readinessLabel: attached
        ? "in Watch"
        : imported
          ? "already in episode"
          : kind === "video" && !hasProxy
            ? "source playback · proxy recommended for editing"
            : hasProxy
              ? "proxy ready"
              : "playback ready",
    }];
  });
}

function importedAssetFromVault(
  row: any,
  projectSlug: string,
  episodeSlug: string,
  actorLabel: string,
  importedAt: string,
): EpisodeImportedMediaAsset {
  const { asset, playbackUrl, hasProxy } = row;
  const kind = mediaKind(asset.mimeType, asset.filename);
  if (!kind || !playbackUrl) {
    throw new EpisodeRoomCommandError(
      "This Media Vault item is not playable audio or video.",
    );
  }
  const durationSeconds = optionalNumber(asset.duration)
    ?? optionalNumber(asset.variants?.find((variant: any) => (
      optionalNumber(variant.duration) !== undefined
    ))?.duration);
  return {
    id: asset.id,
    sourceId: `media-vault-asset:${asset.id}`,
    projectSlug,
    episodeSlug,
    originalName: text(asset.filename) || "Untitled media",
    contentType: text(asset.mimeType) || `${kind}/unknown`,
    size: safeByteCount(asset.sizeBytes),
    kind,
    bucketName: "",
    objectName: "",
    gcsUri: playbackUrl,
    playbackUrl,
    importedAt,
    source: "media-vault-existing",
    importRole: "reference-clip",
    metadata: {
      mediaVault: {
        schema: "quipsly-episode-vault-reference-v1",
        assetId: asset.id,
        referencedBy: actorLabel,
        referencedAt: importedAt,
        originalPreserved: true,
      },
    },
    sync: {
      status: "ready-to-sync",
      suggestedRole: "reference-clip",
      note: "Existing Media Vault source attached without duplicating or mutating the original.",
      ...(durationSeconds === undefined
        ? {}
        : { recordingSync: { durationSeconds } }),
    },
    proxy: {
      status: kind === "audio"
        ? "not-required"
        : hasProxy
          ? "ready"
          : "external-preview",
      proxyUrl: playbackUrl,
      note: hasProxy
        ? "Media Vault proxy selected for collaborative Watch."
        : "The existing source is available for Watch; create a proxy before final editing when needed.",
    },
  };
}

function timelineRows(productionJson: unknown) {
  const rows = record(productionJson).timelineClips;
  return Array.isArray(rows) ? rows : [];
}

function episodeRoomWatchTimelineRows(productionJson: unknown) {
  return timelineRows(productionJson).filter(
    (clip) => record(clip).generatedFrom === EPISODE_ROOM_TIMELINE_SOURCE,
  );
}

function transcriptSegments(timelineJson: unknown): EpisodeRoomTranscriptSegment[] {
  const rows = record(timelineJson).transcriptSegments;
  if (!Array.isArray(rows)) return [];
  return rows.flatMap((value, index) => {
    const row = record(value);
    const body = text(row.text);
    if (!body) return [];
    return [{
      id: text(row.id) || `transcript-segment-${index + 1}`,
      speaker: text(row.speaker) || "Speaker",
      text: body,
      startSeconds: Math.max(0, optionalNumber(row.startTime) ?? optionalNumber(row.startSeconds) ?? 0),
      endSeconds: Math.max(0, optionalNumber(row.endTime) ?? optionalNumber(row.endSeconds) ?? 0),
    }];
  }).slice(0, 1_500);
}

function recordingRoomAccessWhere(actor: EpisodeRoomActor) {
  if (actor.isStaff) return {};
  if (!actor.userId) return { id: "__episode-room-no-user__" };
  return sessionActorAccessWhere({
    id: actor.userId,
    email: actor.email,
    isStaff: actor.isStaff,
  });
}

export async function recordingSessionsFor(
  prisma: any,
  projectId: string,
  episodeProductionId: string,
  episodeSlug: string,
  actor?: EpisodeRoomActor,
  boundRecordingRoomId?: string,
): Promise<EpisodeRoomRecordingSession[]> {
  if (!actor?.userId && !actor?.isStaff) return [];
  const rooms = await prisma.callRoom.findMany({
    where: {
      projectId,
      purpose: "PODCAST",
      AND: [
        callRoomEpisodeBindingWhere({ episodeProductionId, episodeSlug }),
        recordingRoomAccessWhere(actor),
      ],
    },
    orderBy: [{ recordingStartedAt: "desc" }, { updatedAt: "desc" }],
    take: 20,
    select: {
      id: true,
      title: true,
      purpose: true,
      status: true,
      provider: true,
      recordingStartedAt: true,
      endedAt: true,
      updatedAt: true,
      participants: actor.userId
        ? {
            where: { userId: actor.userId },
            take: 1,
            select: { role: true },
          }
        : {
            take: 0,
            select: { role: true },
          },
    },
  });
  const sessions = rooms.map((room: any) => ({
    id: room.id,
    captureGroupId: room.captureGroupId,
    title: text(room.title) || "Podcast recording session",
    purpose: room.purpose,
    status: room.status,
    provider: room.provider,
    recordingStartedAt: room.recordingStartedAt?.toISOString?.() ?? null,
    endedAt: room.endedAt?.toISOString?.() ?? null,
    updatedAt: room.updatedAt.toISOString(),
    participantRole: room.participants[0]?.role ?? null,
    canUseRecordingClock:
      room.status === "RECORDING" && Boolean(room.recordingStartedAt),
    canOpenSession: true,
  }));
  if (
    !boundRecordingRoomId
    || sessions.some((session: EpisodeRoomRecordingSession) => (
      session.id === boundRecordingRoomId
    ))
  ) {
    return sessions;
  }

  const boundRoom = await prisma.callRoom.findFirst({
    where: {
      id: boundRecordingRoomId,
      projectId,
      purpose: "PODCAST",
      ...callRoomEpisodeBindingWhere({ episodeProductionId, episodeSlug }),
    },
    select: {
      id: true,
      captureGroupId: true,
      title: true,
      purpose: true,
      status: true,
      provider: true,
      recordingStartedAt: true,
      endedAt: true,
      updatedAt: true,
    },
  });
  if (!boundRoom) return sessions;

  return [
    ...sessions,
    {
      id: boundRoom.id,
      captureGroupId: boundRoom.captureGroupId,
      title: text(boundRoom.title) || "Podcast recording session",
      purpose: boundRoom.purpose,
      status: boundRoom.status,
      provider: boundRoom.provider,
      recordingStartedAt:
        boundRoom.recordingStartedAt?.toISOString?.() ?? null,
      endedAt: boundRoom.endedAt?.toISOString?.() ?? null,
      updatedAt: boundRoom.updatedAt.toISOString(),
      participantRole: null,
      canUseRecordingClock:
        boundRoom.status === "RECORDING" && Boolean(boundRoom.recordingStartedAt),
      canOpenSession: false,
    },
  ];
}

function blockOrderWhere(start?: number | null, end?: number | null) {
  if (start === null || start === undefined) return undefined;
  return {
    gte: start,
    ...(end === null || end === undefined ? {} : { lte: end }),
  };
}

const EPISODE_ROOM_TEXT_BLOCK_LIMIT = 400;

async function loadEpisodeRoomWriting(
  prisma: Pick<
    ReturnType<typeof getPrismaClient>,
    "studioDocumentBlock" | "studioDocumentOperation"
  >,
  input: {
    documentId: string;
    documentUpdatedAt: Date;
    boundaryStartOrder?: number | null;
    boundaryEndOrder?: number | null;
    knownVersion?: string;
  },
): Promise<EpisodeRoomWritingState> {
  const order = blockOrderWhere(
    input.boundaryStartOrder,
    input.boundaryEndOrder,
  );
  const where = {
    documentId: input.documentId,
    archivedAt: null,
    ...(order ? { order } : {}),
  };
  const [blockSignals, latestOperation] = await Promise.all([
    prisma.studioDocumentBlock.aggregate({
      where,
      _count: { _all: true },
      _max: { updatedAt: true },
    }),
    prisma.studioDocumentOperation.findFirst({
      where: { documentId: input.documentId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: { id: true },
    }),
  ]);
  const blockCount = blockSignals._count._all;
  const signals = {
    documentUpdatedAt: input.documentUpdatedAt,
    latestBlockUpdatedAt: blockSignals._max.updatedAt,
    blockCount,
    latestOperationId: latestOperation?.id ?? null,
  };
  const version = episodeRoomWritingVersion(signals);
  const metadata = {
    version,
    updatedAt: episodeRoomWritingUpdatedAt(signals),
    blockCount,
    visibleBlockCount: Math.min(blockCount, EPISODE_ROOM_TEXT_BLOCK_LIMIT),
    truncated: blockCount > EPISODE_ROOM_TEXT_BLOCK_LIMIT,
  };
  if (input.knownVersion === version) return metadata;

  const textBlocks = await prisma.studioDocumentBlock.findMany({
    where,
    orderBy: { order: "asc" },
    take: EPISODE_ROOM_TEXT_BLOCK_LIMIT,
    select: {
      id: true,
      stableId: true,
      order: true,
      title: true,
      body: true,
    },
  });
  return {
    ...metadata,
    visibleBlockCount: textBlocks.length,
    textBlocks,
  };
}

async function reconcileEpisodeCaptureProxies(
  prisma: ReturnType<typeof getPrismaClient>,
  projectSlug: string,
) {
  const project = await prisma.studioProject.findFirst({
    where: { slug: projectSlug },
    select: { id: true },
  });
  if (!project) return;
  await reconcileCaptureProxyResults({
    prisma,
    projectIds: [project.id],
    limit: 4,
  });
}

export async function loadEpisodeRoomDesk(
  projectSlug: string,
  episodeSlug: string,
  canEdit: boolean,
  actor?: EpisodeRoomActor,
): Promise<EpisodeRoomDeskPayload | null> {
  const prisma = getPrismaClient();
  await reconcileEpisodeCaptureProxies(prisma, projectSlug);
  const production = await prisma.studioEpisodeProduction.findFirst({
    where: {
      slug: episodeSlug,
      project: { slug: projectSlug },
    },
    select: {
      id: true,
      slug: true,
      title: true,
      status: true,
      updatedAt: true,
      documentId: true,
      boundaryStartOrder: true,
      boundaryEndOrder: true,
      productionJson: true,
      timelineJson: true,
      project: {
        select: {
          id: true,
          slug: true,
          name: true,
        },
      },
      document: {
        select: {
          id: true,
          title: true,
          updatedAt: true,
        },
      },
    },
  });
  if (!production) return null;

  const writingSnapshot = await loadEpisodeRoomWriting(prisma, {
    documentId: production.documentId,
    documentUpdatedAt: production.document.updatedAt,
    boundaryStartOrder: production.boundaryStartOrder,
    boundaryEndOrder: production.boundaryEndOrder,
  });
  const {
    textBlocks = [],
    ...writing
  } = writingSnapshot;

  const now = new Date().toISOString();
  const room = productionRoomState(production.productionJson, now);
  return {
    project: production.project,
    episode: {
      id: production.id,
      slug: production.slug,
      title: production.title,
      status: production.status,
      updatedAt: production.updatedAt.toISOString(),
      documentId: production.document.id,
      documentTitle: production.document.title,
    },
    room,
    writing,
    textBlocks,
    transcriptSegments: transcriptSegments(production.timelineJson),
    importedCandidates: importedCandidatesFor(
      production.productionJson,
      production.timelineJson,
      room,
      now,
    ),
    vaultCandidates: await vaultCandidatesFor(
      prisma,
      production.project.id,
      production.productionJson,
      production.timelineJson,
      room,
    ),
    recordingSessions: await recordingSessionsFor(
      prisma,
      production.project.id,
      production.id,
      production.slug,
      actor,
      room.session?.recordingRoomId,
    ),
    milestones: await listEpisodeMilestones(prisma, production.id),
    milestoneAssignees: await listEpisodeMilestoneAssignees(
      prisma,
      production.project.id,
      actor?.userId,
    ),
    timelineClipCount: episodeRoomWatchTimelineRows(production.productionJson).length,
    canEdit,
  };
}

export async function loadEpisodeRoomVault(
  projectSlug: string,
  episodeSlug: string,
): Promise<EpisodeRoomVaultCandidate[] | null> {
  const prisma = getPrismaClient();
  const production = await prisma.studioEpisodeProduction.findFirst({
    where: {
      slug: episodeSlug,
      project: { slug: projectSlug },
    },
    select: {
      projectId: true,
      productionJson: true,
      timelineJson: true,
    },
  });
  if (!production) return null;
  const room = productionRoomState(
    production.productionJson,
    new Date().toISOString(),
  );
  return vaultCandidatesFor(
    prisma,
    production.projectId,
    production.productionJson,
    production.timelineJson,
    room,
  );
}

export async function loadEpisodeRoomRuntime(
  projectSlug: string,
  episodeSlug: string,
  actor?: EpisodeRoomActor,
  knownWritingVersion?: string,
): Promise<EpisodeRoomRuntimePayload | null> {
  const prisma = getPrismaClient();
  await reconcileEpisodeCaptureProxies(prisma, projectSlug);
  const production = await prisma.studioEpisodeProduction.findFirst({
    where: {
      slug: episodeSlug,
      project: { slug: projectSlug },
    },
    select: {
      id: true,
      slug: true,
      projectId: true,
      documentId: true,
      boundaryStartOrder: true,
      boundaryEndOrder: true,
      productionJson: true,
      timelineJson: true,
      updatedAt: true,
      document: {
        select: {
          updatedAt: true,
        },
      },
    },
  });
  if (!production) return null;
  const now = new Date().toISOString();
  const room = productionRoomState(production.productionJson, now);
  const writing = await loadEpisodeRoomWriting(prisma, {
    documentId: production.documentId,
    documentUpdatedAt: production.document.updatedAt,
    boundaryStartOrder: production.boundaryStartOrder,
    boundaryEndOrder: production.boundaryEndOrder,
    knownVersion: knownWritingVersion,
  });
  return {
    room,
    writing,
    importedCandidates: importedCandidatesFor(
      production.productionJson,
      production.timelineJson,
      room,
      now,
    ),
    recordingSessions: await recordingSessionsFor(
      prisma,
      production.projectId,
      production.id,
      production.slug,
      actor,
      room.session?.recordingRoomId,
    ),
    timelineClipCount: episodeRoomWatchTimelineRows(production.productionJson).length,
    updatedAt: production.updatedAt.toISOString(),
  };
}

/**
 * Lightweight canonical-manuscript projection for native and offline readers.
 *
 * This intentionally avoids proxy reconciliation, Watch state, imported media,
 * recording sessions, and timeline construction. A matching opaque version
 * returns metadata only so clients can retain their protected cached blocks.
 */
export async function loadEpisodeRoomWritingRuntime(
  projectSlug: string,
  episodeSlug: string,
  knownWritingVersion?: string,
): Promise<EpisodeRoomWritingRuntimePayload | null> {
  const prisma = getPrismaClient();
  const production = await prisma.studioEpisodeProduction.findFirst({
    where: {
      slug: episodeSlug,
      project: { slug: projectSlug },
    },
    select: {
      id: true,
      slug: true,
      title: true,
      status: true,
      updatedAt: true,
      documentId: true,
      boundaryStartOrder: true,
      boundaryEndOrder: true,
      document: {
        select: {
          title: true,
          updatedAt: true,
        },
      },
    },
  });
  if (!production) return null;
  return {
    episode: {
      id: production.id,
      slug: production.slug,
      title: production.title,
      status: production.status,
      updatedAt: production.updatedAt.toISOString(),
      documentId: production.documentId,
      documentTitle: production.document.title,
    },
    writing: await loadEpisodeRoomWriting(prisma, {
      documentId: production.documentId,
      documentUpdatedAt: production.document.updatedAt,
      boundaryStartOrder: production.boundaryStartOrder,
      boundaryEndOrder: production.boundaryEndOrder,
      knownVersion: knownWritingVersion,
    }),
  };
}

/**
 * Lightweight shared-playback projection for native clients.
 *
 * The one-second transport poll must not reconcile proxies, load manuscript
 * blocks, enumerate recording sessions, or construct editor candidates. Those
 * belong to the full Episode Room runtime. Attached Watch clips already carry
 * the released playback identity needed by the native player.
 */
export async function loadEpisodeRoomWatchRuntime(
  projectSlug: string,
  episodeSlug: string,
): Promise<EpisodeRoomWatchRuntimePayload | null> {
  const prisma = getPrismaClient();
  const production = await prisma.studioEpisodeProduction.findFirst({
    where: {
      slug: episodeSlug,
      project: { slug: projectSlug },
    },
    select: {
      productionJson: true,
      updatedAt: true,
    },
  });
  if (!production) return null;
  const now = new Date().toISOString();
  return {
    room: productionRoomState(production.productionJson, now),
    updatedAt: production.updatedAt.toISOString(),
  };
}

async function findProductionId(projectSlug: string, episodeSlug: string) {
  const prisma = getPrismaClient();
  return prisma.studioEpisodeProduction.findFirst({
    where: {
      slug: episodeSlug,
      project: { slug: projectSlug },
    },
    select: { id: true },
  });
}

function isRetryableTransactionError(error: unknown) {
  return record(error).code === "P2034";
}

export async function applyEpisodeRoomStoreCommand({
  projectSlug,
  episodeSlug,
  input,
  actor,
}: {
  projectSlug: string;
  episodeSlug: string;
  input: EpisodeRoomCommandInput;
  actor: EpisodeRoomActor;
}) {
  const productionRef = await findProductionId(projectSlug, episodeSlug);
  if (!productionRef) throw new EpisodeRoomCommandError("Episode production not found.");
  const prisma = getPrismaClient();

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction(async (tx) => {
        await tx.$queryRaw(Prisma.sql`
          SELECT "id"
          FROM "StudioEpisodeProduction"
          WHERE "id" = ${productionRef.id}
          FOR UPDATE
        `);
        const production = await tx.studioEpisodeProduction.findUnique({
          where: { id: productionRef.id },
          select: {
            id: true,
            slug: true,
            projectId: true,
            productionJson: true,
            timelineJson: true,
            updatedAt: true,
          },
        });
        if (!production) throw new EpisodeRoomCommandError("Episode production not found.");

        const acceptedAt = new Date().toISOString();
        let currentProductionJson: JsonRecord =
          canonicalEpisodeProductionJson(
            production.productionJson,
            production.timelineJson,
          );
        const currentRoom = productionRoomState(currentProductionJson, acceptedAt);
        if (currentRoom.receipts.some((receipt) => receipt.clientRequestId === input.clientRequestId)) {
          return {
            room: currentRoom,
            updatedAt: production.updatedAt.toISOString(),
            timelineClipCount: episodeRoomWatchTimelineRows(currentProductionJson).length,
            importedCandidates: importedCandidatesFor(
              currentProductionJson,
              production.timelineJson,
              currentRoom,
              acceptedAt,
            ),
            recordingSessions: await recordingSessionsFor(
              tx,
              production.projectId,
              production.id,
              production.slug,
              actor,
              currentRoom.session?.recordingRoomId,
            ),
          };
        }
        if (
          input.type === "SYNC_TIMELINE"
          && input.expectedRevision === currentRoom.revision
          && episodeRoomTimelineMaterializationIsCurrent(
            currentRoom,
            timelineRows(currentProductionJson),
          )
        ) {
          return {
            room: currentRoom,
            updatedAt: production.updatedAt.toISOString(),
            timelineClipCount: episodeRoomWatchTimelineRows(currentProductionJson).length,
            importedCandidates: importedCandidatesFor(
              currentProductionJson,
              production.timelineJson,
              currentRoom,
              acceptedAt,
            ),
            recordingSessions: await recordingSessionsFor(
              tx,
              production.projectId,
              production.id,
              production.slug,
              actor,
              currentRoom.session?.recordingRoomId,
            ),
          };
        }
        let command: EpisodeRoomCommand;
        if (input.type === "IMPORT_VAULT_ASSET") {
          const [vaultRow] = await vaultAssetsForProject(
            tx,
            production.projectId,
            input.assetId,
            input.mediaClipId,
          );
          if (!vaultRow) {
            throw new EpisodeRoomCommandError(
              "This Media Vault item is unavailable in this Nest.",
            );
          }
          const existingImportedAsset = importedMedia(
            currentProductionJson,
            production.timelineJson,
          ).find((asset) => asset.id === input.assetId);
          const currentVaultAsset = importedAssetFromVault(
            vaultRow,
            projectSlug,
            episodeSlug,
            actor.label,
            acceptedAt,
          );
          const importedAsset = existingImportedAsset
            ? {
                ...existingImportedAsset,
                ...currentVaultAsset,
                importedAt: existingImportedAsset.importedAt || currentVaultAsset.importedAt,
                metadata: {
                  ...existingImportedAsset.metadata,
                  ...currentVaultAsset.metadata,
                },
                sync: {
                  ...existingImportedAsset.sync,
                  ...currentVaultAsset.sync,
                },
                proxy: {
                  ...existingImportedAsset.proxy,
                  ...currentVaultAsset.proxy,
                },
              }
            : currentVaultAsset;
          const savedClip = input.mediaClipId
            ? vaultRow.asset.clips.find((clip: any) => (
              clip.id === input.mediaClipId
            ))
            : undefined;
          if (input.mediaClipId && !savedClip) {
            throw new EpisodeRoomCommandError(
              "This saved Media Vault clip is unavailable in this Nest.",
            );
          }
          currentProductionJson = {
            ...currentProductionJson,
            importedMedia: [
              importedAsset,
              ...importedMedia(
                currentProductionJson,
                production.timelineJson,
              ).filter((asset) => asset.id !== importedAsset.id),
            ],
            ...(existingImportedAsset
              ? { lastMediaVaultRefreshAt: acceptedAt }
              : { lastMediaImportAt: acceptedAt }),
            source: "quipsly-episode-room-media-vault",
          };
          command = {
            type: "ADD_CLIP",
            clientRequestId: input.clientRequestId,
            expectedRevision: input.expectedRevision,
            clip: clipFromImportedAsset(
              importedAsset,
              actor.label,
              acceptedAt,
              savedClip,
            ),
          };
        } else if (input.type === "ADD_CLIP") {
          command = {
              type: "ADD_CLIP",
              clientRequestId: input.clientRequestId,
              expectedRevision: input.expectedRevision,
              clip: clipFromImportedAsset(
                importedMedia(
                  currentProductionJson,
                  production.timelineJson,
                ).find((asset) => asset.id === input.assetId)
                  ?? (() => {
                    throw new EpisodeRoomCommandError("Import the media into this episode before adding it to Watch.");
                  })(),
                actor.label,
                acceptedAt,
              ),
            };
        } else if (input.type === "START_SESSION" && input.recordingRoomId) {
          const recordingRoom = await tx.callRoom.findFirst({
            where: {
              id: input.recordingRoomId,
              projectId: production.projectId,
              purpose: "PODCAST",
              AND: [
                callRoomEpisodeBindingWhere({
                  episodeProductionId: production.id,
                  episodeSlug: production.slug,
                }),
                recordingRoomAccessWhere(actor),
              ],
            },
            select: {
              id: true,
              status: true,
              recordingStartedAt: true,
            },
          });
          if (!recordingRoom) {
            throw new EpisodeRoomCommandError(
              "That podcast recording session is not accessible or belongs to another episode.",
            );
          }
          if (!recordingRoom.recordingStartedAt) {
            throw new EpisodeRoomCommandError(
              "Start recording from Quipsly Capture before binding the Episode Room to its clock.",
            );
          }
          if (recordingRoom.status !== "RECORDING") {
            throw new EpisodeRoomCommandError(
              "That Capture recording clock is no longer live. Start a rehearsal clock or begin a new recording before binding Watch.",
            );
          }
          command = {
            ...input,
            recordingRoomId: recordingRoom.id,
            recordingStartedAt: recordingRoom.recordingStartedAt.toISOString(),
          };
        } else {
          command = input;
        }
        if (command.type === "PLAY" && currentRoom.session?.recordingRoomId) {
          const liveRecording = await tx.callRoom.findFirst({
            where: {
              id: currentRoom.session.recordingRoomId,
              projectId: production.projectId,
              purpose: "PODCAST",
              AND: [
                callRoomEpisodeBindingWhere({
                  episodeProductionId: production.id,
                  episodeSlug: production.slug,
                }),
                recordingRoomAccessWhere(actor),
              ],
              status: "RECORDING",
            },
            select: { id: true },
          });
          if (!liveRecording) {
            throw new EpisodeRoomCommandError(
              "The bound Capture clock is no longer recording. Start a rehearsal clock or begin a new recording before playing the shared clip.",
            );
          }
        }
        let nextRoom = applyEpisodeRoomCommand(currentRoom, command, {
          actor,
          acceptedAt,
          receiptId: randomUUID(),
          sessionId: randomUUID(),
          segmentId: randomUUID(),
        });

        let nextTimeline = timelineRows(currentProductionJson);
        if (command.type === "SYNC_TIMELINE") {
          const watchedTimeline = episodeRoomTimelineClips(nextRoom);
          nextTimeline = [
            ...nextTimeline.filter((clip) => record(clip).generatedFrom !== EPISODE_ROOM_TIMELINE_SOURCE),
            ...watchedTimeline,
          ];
          nextRoom = {
            ...nextRoom,
            timelineSync: {
              syncedAt: acceptedAt,
              syncedBy: actor.label,
              sourceRevision: nextRoom.revision,
              segmentCount: watchedTimeline.length,
              timelineClipCount: watchedTimeline.length,
              sourceSegmentIds: watchedTimeline
                .map((clip) => clip.recordingSync.watchSegmentId)
                .sort(),
            },
          };
        }

        const nextProductionJson = {
          ...currentProductionJson,
          episodeRoom: nextRoom,
          ...(command.type === "SYNC_TIMELINE" ? { timelineClips: nextTimeline } : {}),
          lastEpisodeRoomCommandAt: acceptedAt,
          source: "quipsly-episode-room",
        };
        const updated = await tx.studioEpisodeProduction.update({
          where: { id: production.id },
          data: { productionJson: json(nextProductionJson) },
          select: { updatedAt: true },
        });

        return {
          room: nextRoom,
          updatedAt: updated.updatedAt.toISOString(),
          timelineClipCount: nextTimeline.filter(
            (clip) => record(clip).generatedFrom === EPISODE_ROOM_TIMELINE_SOURCE,
          ).length,
          importedCandidates: importedCandidatesFor(
            nextProductionJson,
            production.timelineJson,
            nextRoom,
            acceptedAt,
          ),
          recordingSessions: await recordingSessionsFor(
            tx,
            production.projectId,
            production.id,
            production.slug,
            actor,
            nextRoom.session?.recordingRoomId,
          ),
        };
      }, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error) {
      if (isRetryableTransactionError(error) && attempt < 2) continue;
      throw error;
    }
  }

  throw new EpisodeRoomCommandError("Episode Room could not save the command.");
}

function episodeTextBlocks(value: string) {
  return value
    .replace(/\r\n?/g, "\n")
    .split(/\n\s*\n+/)
    .map((block) => block.trim())
    .filter(Boolean)
    .slice(0, 400);
}

export async function importEpisodeRoomText({
  projectSlug,
  episodeSlug,
  body,
  actor,
  clientRequestId,
}: {
  projectSlug: string;
  episodeSlug: string;
  body: string;
  actor: EpisodeRoomActor;
  clientRequestId: string;
}) {
  const blocks = episodeTextBlocks(body);
  if (!blocks.length) throw new EpisodeRoomCommandError("Paste at least one paragraph of episode text.");
  if (body.length > 200_000) throw new EpisodeRoomCommandError("Episode text imports are limited to 200,000 characters.");
  const productionRef = await findProductionId(projectSlug, episodeSlug);
  if (!productionRef) throw new EpisodeRoomCommandError("Episode production not found.");
  const prisma = getPrismaClient();

  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw(Prisma.sql`
      SELECT "id"
      FROM "StudioEpisodeProduction"
      WHERE "id" = ${productionRef.id}
      FOR UPDATE
    `);
    const production = await tx.studioEpisodeProduction.findUnique({
      where: { id: productionRef.id },
      select: {
        id: true,
        projectId: true,
        documentId: true,
        productionJson: true,
      },
    });
    if (!production) throw new EpisodeRoomCommandError("Episode production not found.");

    const currentJson = record(production.productionJson);
    const priorImport = record(currentJson.episodeTextImport);
    if (priorImport.clientRequestId === clientRequestId) {
      return {
        imported: false,
        alreadyImported: true,
        blockCount: Math.max(0, Math.trunc(optionalNumber(priorImport.blockCount) ?? 0)),
        operationId: text(priorImport.operationId) || null,
      };
    }

    const existingCount = await tx.studioDocumentBlock.count({
      where: {
        documentId: production.documentId,
        archivedAt: null,
      },
    });
    if (existingCount > 0) {
      throw new EpisodeRoomCommandError("This episode already has text. Open Writing to edit it without overwriting existing work.");
    }

    const importedAt = new Date();
    const importedBlocks = blocks.map((block, index) => ({
      id: randomUUID(),
      documentId: production.documentId,
      stableId: `episode-room-${randomUUID()}`,
      order: index,
      body: block,
      sourceLabel: "Episode Room text import",
      sourcePath: `episode-room://${projectSlug}/${episodeSlug}/${clientRequestId}`,
      isPrivate: true,
    }));
    await tx.studioDocumentBlock.createMany({
      data: importedBlocks,
    });
    await tx.studioDocument.update({
      where: { id: production.documentId },
      data: { updatedAt: importedAt },
    });
    const contentSha256 = createHash("sha256")
      .update(blocks.join("\n\n"))
      .digest("hex");
    const operation = await tx.studioDocumentOperation.create({
      data: {
        projectId: production.projectId,
        documentId: production.documentId,
        groupId: clientRequestId,
        actorEmail: actor.email,
        origin: "human",
        operationType: "episode-room-text-import",
        status: "applied",
        beforeJson: json({
          blockCount: 0,
          blockIds: [],
        }),
        afterJson: json({
          blockCount: importedBlocks.length,
          blockIds: importedBlocks.map((block) => block.id),
          stableIds: importedBlocks.map((block) => block.stableId),
        }),
        payloadJson: json({
          clientRequestId,
          episodeSlug,
          contentSha256,
          source: "episode-room-paste",
        }),
        reversible: false,
      },
      select: { id: true },
    });
    await tx.studioEpisodeProduction.update({
      where: { id: production.id },
      data: {
        productionJson: json({
          ...currentJson,
          episodeTextImport: {
            version: 1,
            clientRequestId,
            blockCount: blocks.length,
            importedAt: importedAt.toISOString(),
            importedBy: actor.label,
            actorEmail: actor.email,
            operationId: operation.id,
            contentSha256,
            source: "episode-room-paste",
            externalSideEffects: false,
          },
          lastEpisodeRoomCommandAt: importedAt.toISOString(),
          source: "quipsly-episode-room",
        }),
      },
    });
    return {
      imported: true,
      alreadyImported: false,
      blockCount: blocks.length,
      operationId: operation.id,
    };
  }, {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  });
}

export { EpisodeRoomCommandError, EpisodeRoomRevisionConflict };
