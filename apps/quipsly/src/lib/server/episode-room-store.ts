import "server-only";

import { randomUUID } from "node:crypto";
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

type JsonRecord = Record<string, unknown>;

export type EpisodeRoomTextBlock = {
  id: string;
  stableId: string;
  order: number;
  title: string | null;
  body: string;
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

export type EpisodeRoomRecordingSession = {
  id: string;
  title: string;
  purpose: string;
  status: string;
  provider: string;
  recordingStartedAt: string | null;
  endedAt: string | null;
  updatedAt: string;
  participantRole: string | null;
  canUseRecordingClock: boolean;
};

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
  textBlocks: EpisodeRoomTextBlock[];
  transcriptSegments: EpisodeRoomTranscriptSegment[];
  importedCandidates: EpisodeRoomImportedCandidate[];
  recordingSessions: EpisodeRoomRecordingSession[];
  timelineClipCount: number;
  canEdit: boolean;
};

export type EpisodeRoomRuntimePayload = {
  room: EpisodeRoomState;
  importedCandidates: EpisodeRoomImportedCandidate[];
  recordingSessions: EpisodeRoomRecordingSession[];
  timelineClipCount: number;
  updatedAt: string;
};

export type EpisodeRoomCommandInput =
  | {
      type: "ADD_CLIP";
      assetId: string;
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
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
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
  return {
    assetId: asset.id,
    ...(asset.sourceId ? { sourceId: asset.sourceId } : {}),
    title: asset.originalName || "Untitled watch clip",
    kind: asset.kind,
    playbackUrl,
    ...(durationForImportedAsset(asset) === undefined
      ? {}
      : { durationSeconds: durationForImportedAsset(asset) }),
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

function timelineRows(productionJson: unknown) {
  const rows = record(productionJson).timelineClips;
  return Array.isArray(rows) ? rows : [];
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
  return {
    OR: [
      { createdByUserId: actor.userId },
      { participants: { some: { userId: actor.userId } } },
      { booking: { clientUserId: actor.userId } },
      { booking: { coachUserId: actor.userId } },
    ],
  };
}

async function recordingSessionsFor(
  prisma: any,
  projectId: string,
  episodeSlug: string,
  actor?: EpisodeRoomActor,
): Promise<EpisodeRoomRecordingSession[]> {
  if (!actor?.userId && !actor?.isStaff) return [];
  const rooms = await prisma.callRoom.findMany({
    where: {
      projectId,
      purpose: "PODCAST",
      metadataJson: {
        path: ["episodeSlug"],
        equals: episodeSlug,
      },
      ...recordingRoomAccessWhere(actor),
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
  return rooms.map((room: any) => ({
    id: room.id,
    title: text(room.title) || "Podcast recording session",
    purpose: room.purpose,
    status: room.status,
    provider: room.provider,
    recordingStartedAt: room.recordingStartedAt?.toISOString?.() ?? null,
    endedAt: room.endedAt?.toISOString?.() ?? null,
    updatedAt: room.updatedAt.toISOString(),
    participantRole: room.participants[0]?.role ?? null,
    canUseRecordingClock: Boolean(room.recordingStartedAt),
  }));
}

function blockOrderWhere(start?: number | null, end?: number | null) {
  if (start === null || start === undefined) return undefined;
  return {
    gte: start,
    ...(end === null || end === undefined ? {} : { lte: end }),
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
          blocks: {
            where: { archivedAt: null },
            orderBy: { order: "asc" },
            take: 240,
            select: {
              id: true,
              stableId: true,
              order: true,
              title: true,
              body: true,
            },
          },
        },
      },
    },
  });
  if (!production) return null;

  const order = blockOrderWhere(production.boundaryStartOrder, production.boundaryEndOrder);
  const textBlocks = order
    ? await prisma.studioDocumentBlock.findMany({
        where: {
          documentId: production.documentId,
          archivedAt: null,
          order,
        },
        orderBy: { order: "asc" },
        take: 240,
        select: {
          id: true,
          stableId: true,
          order: true,
          title: true,
          body: true,
        },
      })
    : production.document.blocks;

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
    textBlocks,
    transcriptSegments: transcriptSegments(production.timelineJson),
    importedCandidates: importedCandidatesFor(
      production.productionJson,
      production.timelineJson,
      room,
      now,
    ),
    recordingSessions: await recordingSessionsFor(
      prisma,
      production.project.id,
      production.slug,
      actor,
    ),
    timelineClipCount: timelineRows(production.productionJson).length,
    canEdit,
  };
}

export async function loadEpisodeRoomRuntime(
  projectSlug: string,
  episodeSlug: string,
  actor?: EpisodeRoomActor,
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
      productionJson: true,
      timelineJson: true,
      updatedAt: true,
    },
  });
  if (!production) return null;
  const now = new Date().toISOString();
  const room = productionRoomState(production.productionJson, now);
  return {
    room,
    importedCandidates: importedCandidatesFor(
      production.productionJson,
      production.timelineJson,
      room,
      now,
    ),
    recordingSessions: await recordingSessionsFor(
      prisma,
      production.projectId,
      production.slug,
      actor,
    ),
    timelineClipCount: timelineRows(production.productionJson).length,
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
        const currentProductionJson =
          canonicalEpisodeProductionJson(
            production.productionJson,
            production.timelineJson,
          );
        const currentRoom = productionRoomState(currentProductionJson, acceptedAt);
        if (currentRoom.receipts.some((receipt) => receipt.clientRequestId === input.clientRequestId)) {
          return {
            room: currentRoom,
            updatedAt: production.updatedAt.toISOString(),
            timelineClipCount: timelineRows(currentProductionJson).length,
            importedCandidates: importedCandidatesFor(
              currentProductionJson,
              production.timelineJson,
              currentRoom,
              acceptedAt,
            ),
            recordingSessions: await recordingSessionsFor(
              tx,
              production.projectId,
              production.slug,
              actor,
            ),
          };
        }
        let command: EpisodeRoomCommand;
        if (input.type === "ADD_CLIP") {
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
              metadataJson: {
                path: ["episodeSlug"],
                equals: production.slug,
              },
              ...recordingRoomAccessWhere(actor),
            },
            select: {
              id: true,
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
          command = {
            ...input,
            recordingRoomId: recordingRoom.id,
            recordingStartedAt: recordingRoom.recordingStartedAt.toISOString(),
          };
        } else {
          command = input;
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
              segmentCount: nextRoom.segments.length,
              timelineClipCount: watchedTimeline.length,
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
          timelineClipCount: nextTimeline.length,
          importedCandidates: importedCandidatesFor(
            nextProductionJson,
            production.timelineJson,
            nextRoom,
            acceptedAt,
          ),
          recordingSessions: await recordingSessionsFor(
            tx,
            production.projectId,
            production.slug,
            actor,
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
    await tx.studioDocumentBlock.createMany({
      data: blocks.map((block, index) => ({
        documentId: production.documentId,
        stableId: `episode-room-${randomUUID()}`,
        order: index,
        body: block,
        sourceLabel: "Episode Room text import",
        sourcePath: `episode-room://${projectSlug}/${episodeSlug}/${clientRequestId}`,
        isPrivate: true,
      })),
    });
    await tx.studioDocument.update({
      where: { id: production.documentId },
      data: { updatedAt: importedAt },
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
    };
  }, {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  });
}

export { EpisodeRoomCommandError, EpisodeRoomRevisionConflict };
