import { randomUUID } from "node:crypto";
import path from "node:path";
import type { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { getPrismaClient } from "@/lib/prisma";
import { uploadMediaBuffer } from "@/lib/server/gcs";
import { attachAssetToNest, createWorkflowJob } from "@/lib/server/quipsly-core";
import { lookupStudioProjectDocument, projectConfig } from "../../../(app)/create/projectConfig";
import {
  EPISODE_ARTIFACT_CURRENT_VERSION,
  EPISODE_AUDIO_TAKE_STACK_SOURCE,
  EPISODE_MAC_TIMELINE_ATTACH_SOURCE,
  EPISODE_PRODUCTION_CURRENT_VERSION,
  type EpisodeImportedMediaAsset,
} from "../../../(app)/episode-production/episodeArtifact";

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function sanitizeSegment(value: string) {
  return (value || "untitled")
    .replaceAll("..", "")
    .replaceAll("/", "_")
    .replaceAll("\\", "_")
    .replace(/[^\w.-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 120) || "untitled";
}

function inferKind(contentType: string, fileName: string): EpisodeImportedMediaAsset["kind"] {
  const ext = path.extname(fileName).toLowerCase();
  if (contentType.startsWith("video/") || [".mp4", ".mov", ".m4v", ".webm", ".mkv"].includes(ext)) return "video";
  if (contentType.startsWith("audio/") || [".wav", ".mp3", ".m4a", ".aac", ".ogg", ".webm"].includes(ext)) return "audio";
  return "unknown";
}

function inferKindFromSourceUrl(sourceUrl: string): EpisodeImportedMediaAsset["kind"] {
  const lower = sourceUrl.toLowerCase();
  if (/\.(mp3|wav|m4a|aac|ogg|flac|webm)(\?|$)/i.test(lower)) return "audio";
  if (/\.(mp4|mov|m4v|webm|mkv|m3u8|mpd)(\?|$)/i.test(lower)) return "video";
  if (/youtube\.com|youtu\.be|vimeo\.com/i.test(lower)) return "video";
  return "unknown";
}

function sanitizeExplicitKind(value: unknown, fallback: EpisodeImportedMediaAsset["kind"]): EpisodeImportedMediaAsset["kind"] {
  const raw = String(value ?? "").trim().toLowerCase();
  return raw === "audio" || raw === "video" || raw === "unknown" ? raw : fallback;
}

function parseOptionalNumber(value: unknown) {
  if (typeof value !== "string" && typeof value !== "number") return undefined;
  if (typeof value === "string" && !value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseOptionalInteger(value: unknown) {
  const number = parseOptionalNumber(value);
  if (number === undefined) return undefined;
  return Number.isFinite(number) ? Math.trunc(number) : undefined;
}

function optionalString(value: unknown) {
  const raw = typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
  return raw || undefined;
}

function sanitizeTrackId(value: unknown) {
  const raw = String(value ?? "").trim().toUpperCase();
  return /^[VA]\d+(?:\.\d+)?$/.test(raw) ? raw : undefined;
}

function sanitizeAiSyncStatus(value: unknown) {
  const raw = String(value ?? "").trim();
  return ["ready-to-sync", "synced", "held"].includes(raw) ? raw : undefined;
}

function sanitizeImportRole(value: unknown) {
  const raw = String(value ?? "").trim().toLowerCase();
  const safe = raw
    .replace(/[^a-z0-9-_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
  return safe || "episode-media";
}

function importRoleLabel(value: string) {
  if (value === "spine-audio") return "Spine audio";
  if (value === "audio-source") return "Audio source";
  if (value === "phone-audio") return "Phone audio";
  if (value === "camera-video") return "Camera video";
  if (value === "reference-clip") return "Reference clip";
  if (value === "b-roll") return "B-roll";
  if (value === "source-clip") return "YouTube/source clip";
  if (value === "youtube-source-clip") return "YouTube/source clip";
  return "Episode media";
}

function parseJsonBody(raw: string) {
  if (!raw.trim()) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function sanitizeRecordingSyncMetadata(...sources: unknown[]) {
  const raw = Object.assign({}, ...sources.map(asRecord));
  const metadata: Record<string, unknown> = {
    importJobId: optionalString(raw.importJobId),
    recordedStartAt: optionalString(raw.recordedStartAt),
    recordedEndAt: optionalString(raw.recordedEndAt),
    deviceLabel: optionalString(raw.deviceLabel),
    sourceDeviceClockNotes: optionalString(raw.sourceDeviceClockNotes),
    segmentOrder: parseOptionalInteger(raw.segmentOrder),
    takeOrder: parseOptionalInteger(raw.takeOrder),
    sourceFileCreatedAt: optionalString(raw.sourceFileCreatedAt),
    sourceFileModifiedAt: optionalString(raw.sourceFileModifiedAt),
    durationSeconds: parseOptionalNumber(raw.durationSeconds),
    queuedAt: optionalString(raw.queuedAt),
    fingerprint: optionalString(raw.fingerprint),
    homeNestSlug: optionalString(raw.homeNestSlug),
  };

  Object.keys(metadata).forEach((key) => metadata[key] === undefined && delete metadata[key]);
  return Object.keys(metadata).length ? metadata : undefined;
}

function importedMediaMetadata(localMetadata: Record<string, unknown>, recordingSyncMetadata: Record<string, unknown> | undefined) {
  const localImport = { ...localMetadata };
  delete localImport.recordingSync;
  delete localImport.recordingSyncMetadata;

  const metadata: Record<string, unknown> = {};
  if (recordingSyncMetadata) metadata.recordingSync = recordingSyncMetadata;
  if (Object.keys(localImport).length) metadata.localImport = localImport;
  return Object.keys(metadata).length ? metadata : undefined;
}

const AUDIO_TAKE_STACK_SOURCE = EPISODE_AUDIO_TAKE_STACK_SOURCE;
const MAC_TIMELINE_ATTACH_SOURCE = EPISODE_MAC_TIMELINE_ATTACH_SOURCE;

function episodeProductionJson(currentJson: Record<string, unknown>, projectSlug: string, episodeSlug: string, patch: Record<string, unknown>) {
  return {
    ...currentJson,
    episodeProductionPayloadVersion: EPISODE_PRODUCTION_CURRENT_VERSION,
    projectSlug,
    episodeSlug,
    ...patch,
  };
}

function isAudioAsset(asset: Record<string, unknown>) {
  const kind = String(asset.kind ?? "").toLowerCase();
  const contentType = String(asset.contentType ?? "").toLowerCase();
  const importRole = String(asset.importRole ?? "").toLowerCase();
  return kind === "audio" || contentType.startsWith("audio/") || importRole.includes("audio");
}

function recordingSyncForAsset(asset: Record<string, unknown>) {
  const metadata = asRecord(asset.metadata);
  const sync = asRecord(asset.sync);
  return {
    ...asRecord(metadata.recordingSync),
    ...asRecord(sync.recordingSync),
  };
}

function numericSyncField(record: Record<string, unknown>, key: string) {
  const value = record[key];
  if (typeof value !== "number" && typeof value !== "string") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function dateSortValue(value: unknown) {
  const text = optionalString(value);
  if (!text) return Number.MAX_SAFE_INTEGER;
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER;
}

function audioTakeDuration(asset: Record<string, unknown>, recordingSync: Record<string, unknown>) {
  const duration = numericSyncField(recordingSync, "durationSeconds");
  if (duration !== undefined && duration > 0) return duration;

  const sync = asRecord(asset.sync);
  const segments = Array.isArray(sync.recordingSegments) ? sync.recordingSegments.map(asRecord) : [];
  const segmentDuration = segments.reduce((sum, segment) => {
    const start = numericSyncField(segment, "startSeconds") ?? numericSyncField(segment, "start") ?? 0;
    const end = numericSyncField(segment, "endSeconds") ?? numericSyncField(segment, "end");
    if (end === undefined || end <= start) return sum;
    return sum + (end - start);
  }, 0);
  if (segmentDuration > 0) return segmentDuration;

  return 1;
}

function stableAudioTakeClipId(asset: Record<string, unknown>) {
  const seed = String(asset.id ?? asset.sourceId ?? asset.originalName ?? randomUUID());
  return `audio-take-${seed}`;
}

function sanitizeTimelineClips(value: unknown) {
  return Array.isArray(value) ? value.map(asRecord).filter((clip) => Object.keys(clip).length) : [];
}

function toPrismaJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function nextAudioStackTrackId(currentJson: Record<string, unknown>, existingClips: Record<string, unknown>[]) {
  const existing = optionalString(currentJson.audioTakeStackTrackId);
  if (existing && /^A\d+(?:\.\d+)?$/i.test(existing)) return existing.toUpperCase();

  const used = new Set(
    existingClips
      .map((clip) => optionalString(clip.trackId)?.toUpperCase())
      .filter((trackId): trackId is string => typeof trackId === "string" && /^A\d+(?:\.\d+)?$/i.test(trackId)),
  );

  for (let index = 1; index <= 20; index += 1) {
    const candidate = `A${index}`;
    if (!used.has(candidate)) return candidate;
  }

  return "A99";
}

function rebuildAudioTakeStack(productionJson: Record<string, unknown>, importedMedia: unknown[]) {
  const existingClips = sanitizeTimelineClips(productionJson.timelineClips);
  const preservedClips = existingClips.filter((clip) => clip.generatedFrom !== AUDIO_TAKE_STACK_SOURCE);
  const trackId = nextAudioStackTrackId(productionJson, preservedClips);
  const audioAssets = importedMedia
    .map(asRecord)
    .filter((asset) => Object.keys(asset).length)
    .filter(isAudioAsset)
    .sort((left, right) => {
      const leftSync = recordingSyncForAsset(left);
      const rightSync = recordingSyncForAsset(right);
      return (
        (numericSyncField(leftSync, "segmentOrder") ?? 999999) - (numericSyncField(rightSync, "segmentOrder") ?? 999999)
        || (numericSyncField(leftSync, "takeOrder") ?? 999999) - (numericSyncField(rightSync, "takeOrder") ?? 999999)
        || dateSortValue(leftSync.recordedStartAt) - dateSortValue(rightSync.recordedStartAt)
        || dateSortValue(left.importedAt) - dateSortValue(right.importedAt)
        || String(left.id ?? "").localeCompare(String(right.id ?? ""))
      );
    });

  let cursor = 0;
  const generatedClips = audioAssets.map((asset, index) => {
    const recordingSync = recordingSyncForAsset(asset);
    const duration = audioTakeDuration(asset, recordingSync);
    const clip = {
      id: stableAudioTakeClipId(asset),
      assetId: String(asset.id ?? asset.sourceId ?? `audio-take-${index + 1}`),
      sourceId: optionalString(asset.sourceId),
      trackId,
      startIn: Number(cursor.toFixed(3)),
      duration: Number(duration.toFixed(3)),
      sourceStart: 0,
      sourceEnd: Number(duration.toFixed(3)),
      name: optionalString(asset.originalName) ?? `Audio take ${index + 1}`,
      color: "#4f8f72",
      kind: "audio",
      generatedFrom: AUDIO_TAKE_STACK_SOURCE,
      recordingSync,
      segmentOrder: numericSyncField(recordingSync, "segmentOrder"),
      takeOrder: numericSyncField(recordingSync, "takeOrder") ?? index + 1,
    };
    cursor += duration;
    return clip;
  });

  return {
    timelineClips: [...preservedClips, ...generatedClips],
    audioTakeStack: {
      version: 1,
      source: AUDIO_TAKE_STACK_SOURCE,
      trackId,
      clipCount: generatedClips.length,
      totalDurationSeconds: Number(cursor.toFixed(3)),
      rebuiltAt: new Date().toISOString(),
      note: "Quipsly-managed audio takes are stacked end-to-end for editing while wall-clock metadata remains attached for later sync to continuous video.",
      clips: generatedClips.map((clip) => ({
        clipId: clip.id,
        assetId: clip.assetId,
        sourceId: clip.sourceId,
        startIn: clip.startIn,
        duration: clip.duration,
        recordedStartAt: optionalString(clip.recordingSync.recordedStartAt),
        recordedEndAt: optionalString(clip.recordingSync.recordedEndAt),
        deviceLabel: optionalString(clip.recordingSync.deviceLabel),
        segmentOrder: clip.segmentOrder,
        takeOrder: clip.takeOrder,
      })),
    },
    audioTakeStackTrackId: trackId,
  };
}

function clipKindForAsset(asset: Record<string, unknown>): "audio" | "video" {
  return isAudioAsset(asset) ? "audio" : "video";
}

function trackPrefixForKind(kind: "audio" | "video") {
  return kind === "audio" ? "A" : "V";
}

function sanitizedTrackForKind(value: unknown, kind: "audio" | "video") {
  const trackId = sanitizeTrackId(value);
  const prefix = trackPrefixForKind(kind);
  return trackId?.startsWith(prefix) ? trackId : undefined;
}

function clipEnd(clip: Record<string, unknown>) {
  const start = numericSyncField(clip, "startIn") ?? 0;
  const duration = numericSyncField(clip, "duration") ?? 0;
  return start + Math.max(0, duration);
}

function clipOverlaps(clip: Record<string, unknown>, trackId: string, start: number, duration: number) {
  if (String(clip.trackId ?? "").toUpperCase() !== trackId.toUpperCase()) return false;
  const clipStart = numericSyncField(clip, "startIn") ?? 0;
  const clipDuration = numericSyncField(clip, "duration") ?? 0;
  const clipStop = clipStart + Math.max(0, clipDuration);
  const stop = start + Math.max(0, duration);
  return start < clipStop && stop > clipStart;
}

function defaultTrackForKind(kind: "audio" | "video", clips: Record<string, unknown>[]) {
  const prefix = trackPrefixForKind(kind);
  const existing = clips
    .map((clip) => String(clip.trackId ?? "").toUpperCase())
    .filter((trackId) => trackId.startsWith(prefix))
    .sort((left, right) => {
      const leftNumber = Number(left.slice(1)) || 999;
      const rightNumber = Number(right.slice(1)) || 999;
      return leftNumber - rightNumber || left.localeCompare(right);
    });

  return existing[0] ?? `${prefix}1`;
}

function availableTrackForKind(kind: "audio" | "video", clips: Record<string, unknown>[], start: number, duration: number, requestedTrackId?: string) {
  if (requestedTrackId && !clips.some((clip) => clipOverlaps(clip, requestedTrackId, start, duration))) {
    return requestedTrackId;
  }

  const prefix = trackPrefixForKind(kind);
  const existing = new Set(
    clips
      .map((clip) => String(clip.trackId ?? "").toUpperCase())
      .filter((trackId) => trackId.startsWith(prefix)),
  );

  for (let index = 1; index <= 20; index += 1) {
    const candidate = `${prefix}${index}`;
    existing.add(candidate);
    if (!clips.some((clip) => clipOverlaps(clip, candidate, start, duration))) return candidate;
  }

  return `${prefix}99`;
}

function findExistingTimelineClipForAsset(clips: Record<string, unknown>[], asset: Record<string, unknown>) {
  const ids = new Set(
    [asset.id, asset.sourceId]
      .map((value) => String(value ?? "").trim())
      .filter(Boolean),
  );

  if (!ids.size) return undefined;
  return clips.find((clip) => ids.has(String(clip.assetId ?? "")) || ids.has(String(clip.sourceId ?? "")));
}

function durationForTimelineAsset(asset: Record<string, unknown>) {
  const recordingSync = recordingSyncForAsset(asset);
  const duration = numericSyncField(recordingSync, "durationSeconds");
  if (duration !== undefined && duration > 0) return duration;
  return audioTakeDuration(asset, recordingSync);
}

function buildTimelineClipForAsset(
  asset: Record<string, unknown>,
  clips: Record<string, unknown>[],
  placement: string,
  requestedTrackId: string | undefined,
  requestedPlayheadSeconds: number | undefined,
) {
  const kind = clipKindForAsset(asset);
  const duration = durationForTimelineAsset(asset);
  const preferredTrackId = requestedTrackId ?? defaultTrackForKind(kind, clips);
  const afterLast = placement === "after-last";
  const startIn = afterLast
    ? clips
      .filter((clip) => String(clip.trackId ?? "").toUpperCase() === preferredTrackId.toUpperCase())
      .reduce((max, clip) => Math.max(max, clipEnd(clip)), 0)
    : Math.max(0, requestedPlayheadSeconds ?? 0);
  const trackId = afterLast ? preferredTrackId : availableTrackForKind(kind, clips, startIn, duration, preferredTrackId);
  const recordingSync = recordingSyncForAsset(asset);
  const assetId = String(asset.id ?? asset.sourceId ?? randomUUID());

  return {
    id: `mac-import-${assetId}`,
    assetId,
    sourceId: optionalString(asset.sourceId),
    trackId,
    startIn: Number(startIn.toFixed(3)),
    duration: Number(duration.toFixed(3)),
    sourceStart: 0,
    sourceEnd: Number(duration.toFixed(3)),
    name: optionalString(asset.originalName) ?? `${kind === "audio" ? "Audio" : "Video"} import`,
    color: kind === "audio" ? "#4f8f72" : "#4178be",
    kind,
    generatedFrom: MAC_TIMELINE_ATTACH_SOURCE,
    recordingSync,
    takeOrder: numericSyncField(recordingSync, "takeOrder"),
    segmentOrder: numericSyncField(recordingSync, "segmentOrder"),
  };
}

function syncHistoryArray(productionJson: Record<string, unknown>) {
  return Array.isArray(productionJson.syncHistory) ? productionJson.syncHistory : [];
}

function appendSyncHistory(productionJson: Record<string, unknown>, snapshot: Record<string, unknown>) {
  return [
    {
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      ...snapshot,
    },
    ...syncHistoryArray(productionJson),
  ].slice(0, 30);
}

async function ensureProjectAndProduction(prisma: ReturnType<typeof getPrismaClient>, projectSlug: string, episodeSlug: string) {
  const { project, document } = await lookupStudioProjectDocument(prisma, projectConfig(projectSlug).slug);

  const title = episodeSlug
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
  const production = await prisma.studioEpisodeProduction.upsert({
    where: { projectId_slug: { projectId: project.id, slug: episodeSlug } },
    update: {
      title,
      boundaryLabel: title,
      boundaryKind: "episode",
    },
    create: {
      projectId: project.id,
      documentId: document.id,
      slug: episodeSlug,
      title,
      boundaryLabel: title,
      boundaryKind: "episode",
      productionJson: {
        source: "quipsly-api-import-media.create",
        projectSlug: project.slug,
        episodeSlug,
        importedMedia: [],
      },
    },
  });
  const productionRoom = await prisma.studioProductionRoom.upsert({
    where: { projectId_slug: { projectId: project.id, slug: episodeSlug } },
    update: {
      documentId: document.id,
      title,
      kind: "episode",
      status: production.status === "published" ? "published" : production.status === "held" ? "held" : "active",
      metadataJson: {
        mirroredFromStudioEpisodeProductionId: production.id,
        boundaryKind: production.boundaryKind,
        boundaryLabel: production.boundaryLabel,
        projectSlug: project.slug,
        episodeSlug,
      },
    },
    create: {
      projectId: project.id,
      documentId: document.id,
      slug: episodeSlug,
      title,
      kind: "episode",
      status: "active",
      metadataJson: {
        mirroredFromStudioEpisodeProductionId: production.id,
        boundaryKind: production.boundaryKind,
        boundaryLabel: production.boundaryLabel,
        projectSlug: project.slug,
        episodeSlug,
      },
    },
  });

  return { project, document, production, productionRoom };
}

export async function POST(request: Request) {
  try {
    const contentTypeHeader = request.headers.get("content-type") ?? "";
    const isJsonRequest = contentTypeHeader.includes("application/json");
    const body = isJsonRequest ? asRecord(parseJsonBody(await request.text())) : {};
    const formData = isJsonRequest ? null : await request.formData();
    const file = formData?.get("file") as File | null;
    const rawSourceUrl = String(body.sourceUrl ?? body.url ?? "").trim();

    if (isJsonRequest && !rawSourceUrl) {
      return NextResponse.json({ ok: false, error: "No source URL provided." }, { status: 400 });
    }

    if (!isJsonRequest && !file) {
      return NextResponse.json({ ok: false, error: "No media file provided." }, { status: 400 });
    }

    const rawProjectSlug = String((isJsonRequest ? body.projectSlug : formData?.get("projectSlug")) ?? "").trim();
    if (!rawProjectSlug) {
      return NextResponse.json({ ok: false, error: "projectSlug is required. Choose a Nest before importing media." }, { status: 400 });
    }

    const projectSlug = sanitizeSegment(rawProjectSlug);
    const episodeSlug = sanitizeSegment(String((isJsonRequest ? body.episodeSlug : formData?.get("episodeSlug")) ?? "current-episode"));
    const selectedClipId = typeof (isJsonRequest ? body.selectedClipId : formData?.get("selectedClipId")) === "string"
      ? String(isJsonRequest ? body.selectedClipId : formData?.get("selectedClipId"))
      : undefined;
    const anchorTimelineSeconds = parseOptionalNumber(isJsonRequest ? body.anchorTime ?? body.anchorTimelineSeconds : formData?.get("anchorTime"));
    const importRole = sanitizeImportRole(isJsonRequest ? body.importRole ?? body.role : formData?.get("importRole"));
    const importSource = isJsonRequest ? "editor-source-url" : "editor-file-import";
    const importId = randomUUID();
    const localMetadata = isJsonRequest ? asRecord(body.localMetadata) : {};
    const formRecordingSyncMetadata = !isJsonRequest ? {
      recordedStartAt: formData?.get("recordedStartAt"),
      recordedEndAt: formData?.get("recordedEndAt"),
      deviceLabel: formData?.get("deviceLabel"),
      sourceDeviceClockNotes: formData?.get("sourceDeviceClockNotes"),
      segmentOrder: formData?.get("segmentOrder"),
      takeOrder: formData?.get("takeOrder"),
      sourceFileCreatedAt: formData?.get("sourceFileCreatedAt"),
      sourceFileModifiedAt: formData?.get("sourceFileModifiedAt"),
      durationSeconds: formData?.get("durationSeconds"),
    } : {};
    const recordingSyncMetadata = sanitizeRecordingSyncMetadata(
      localMetadata.recordingSyncMetadata,
      localMetadata.recordingSync,
      isJsonRequest ? body.recordingSyncMetadata : undefined,
      formRecordingSyncMetadata,
    );
    const mediaMetadata = importedMediaMetadata(localMetadata, recordingSyncMetadata);

    const rawSegments = isJsonRequest ? undefined : formData?.get("recordingSegments");
    const recordingSegments = typeof rawSegments === "string" ? JSON.parse(rawSegments) : undefined;

    const prisma = getPrismaClient();
    if (!(prisma as any).studioEpisodeProduction) {
      return NextResponse.json({
        ok: false,
        error: "Episode production persistence is not available in this deployment.",
      }, { status: 503 });
    }

    if (isJsonRequest) {
      const originalName = String(body.originalName ?? body.title ?? rawSourceUrl).trim() || "Source clip";
      const kind = sanitizeExplicitKind(body.kind, inferKindFromSourceUrl(rawSourceUrl));
      const importedAt = new Date().toISOString();
      const { project, production } = await ensureProjectAndProduction(prisma, projectSlug, episodeSlug);
      const source = await prisma.studioVideoSource.create({
        data: {
          provider: "external-url",
          providerSourceId: rawSourceUrl,
          url: rawSourceUrl,
          title: `${importRoleLabel(importRole)} [${project.slug}/${episodeSlug}] ${originalName}`,
        },
      });
      const mediaAsset = await prisma.studioMediaAsset.create({
        data: {
          filename: originalName,
          url: rawSourceUrl,
          mimeType: kind === "audio" ? "audio/external" : kind === "video" ? "video/external" : "application/external-url",
          sizeBytes: BigInt(0),
          cloudProvider: "external",
          isGlobal: false,
          duration: parseOptionalNumber(recordingSyncMetadata?.durationSeconds),
          projects: { connect: { id: project.id } },
        },
      });
      await attachAssetToNest({
        prisma,
        nestSlug: projectSlug,
        assetId: mediaAsset.id,
        role: importRole,
        source: "episode-import-media.external-url",
        metadataJson: {
          episodeSlug,
          sourceId: source.id,
          importId,
          kind,
          playbackUrl: rawSourceUrl,
          recordingSync: recordingSyncMetadata ?? null,
        },
      });
      await createWorkflowJob({
        prisma,
        projectId: project.id,
        assetId: mediaAsset.id,
        type: "asset-register",
        source: "episode-import-media.external-url",
        inputJson: {
          projectSlug,
          episodeSlug,
          importRole,
          sourceId: source.id,
          playbackUrl: rawSourceUrl,
        },
      });

      const currentProductionJson = asRecord(production.productionJson);
      const currentImportedMedia = Array.isArray(currentProductionJson.importedMedia)
        ? currentProductionJson.importedMedia
        : [];
      const importedAsset: EpisodeImportedMediaAsset = {
        id: mediaAsset.id,
        sourceId: source.id,
        projectSlug,
        episodeSlug,
        originalName,
        contentType: kind === "audio" ? "audio/external" : kind === "video" ? "video/external" : "application/external-url",
        size: 0,
        kind,
        bucketName: "",
        objectName: "",
        gcsUri: rawSourceUrl,
        playbackUrl: rawSourceUrl,
        importedAt,
        source: importSource,
        importRole,
        ...(mediaMetadata ? { metadata: mediaMetadata } : {}),
        sync: {
          status: "ready-to-sync",
          ...(anchorTimelineSeconds === undefined ? {} : { anchorTimelineSeconds }),
          ...(selectedClipId ? { targetClipId: selectedClipId } : {}),
          suggestedRole: importRole,
          ...(recordingSegments ? { recordingSegments } : {}),
          ...(recordingSyncMetadata ? { recordingSync: recordingSyncMetadata } : {}),
          note: `${importRoleLabel(importRole)} registered from URL. Ready to sync.`,
        },
        proxy: {
          status: kind === "video" ? "external-preview" : "not-required",
          proxyUrl: rawSourceUrl,
          note: kind === "video"
            ? "External source is available for preview. Download/transcode before final render if needed."
            : "External audio source does not require a video proxy.",
        },
      };

      const stackedAudio = rebuildAudioTakeStack(currentProductionJson, [importedAsset, ...currentImportedMedia]);
      const nextProductionJson = episodeProductionJson(currentProductionJson, projectSlug, episodeSlug, {
        importedMedia: [importedAsset, ...currentImportedMedia],
        timelineClips: stackedAudio.timelineClips,
        audioTakeStack: stackedAudio.audioTakeStack,
        audioTakeStackTrackId: stackedAudio.audioTakeStackTrackId,
        lastMediaImportAt: importedAt,
        source: "quipsly-api-import-media",
      });

      const updated = await prisma.studioEpisodeProduction.update({
        where: { id: production.id },
        data: { productionJson: nextProductionJson },
      });

      return NextResponse.json({
        ok: true,
        importedAsset,
        productionJson: nextProductionJson,
        playbackUrl: rawSourceUrl,
        sourceId: source.id,
        updatedAt: updated.updatedAt.toISOString(),
      });
    }

    if (!file) {
      return NextResponse.json({ ok: false, error: "No media file provided." }, { status: 400 });
    }
    const originalName = file.name || "imported-media";
    const safeName = sanitizeSegment(originalName);
    const contentType = file.type || "application/octet-stream";
    const kind = inferKind(contentType, originalName);
    const objectName = `episode-imports/${projectSlug}/${episodeSlug}/${importId}-${safeName}`;
    const importedAt = new Date().toISOString();

    const bytes = Buffer.from(await file.arrayBuffer());
    const uploaded = await uploadMediaBuffer({
      objectName,
      buffer: bytes,
      contentType,
      metadata: {
        anchorTimelineSeconds: anchorTimelineSeconds === undefined ? undefined : String(anchorTimelineSeconds),
        episodeSlug,
        importId,
        kind,
        originalName,
        projectSlug,
        selectedClipId,
        importRole,
        source: "quipsly-editor-import",
        recordedStartAt: optionalString(recordingSyncMetadata?.recordedStartAt),
        recordedEndAt: optionalString(recordingSyncMetadata?.recordedEndAt),
        deviceLabel: optionalString(recordingSyncMetadata?.deviceLabel),
        sourceDeviceClockNotes: optionalString(recordingSyncMetadata?.sourceDeviceClockNotes),
        segmentOrder: recordingSyncMetadata?.segmentOrder === undefined ? undefined : String(recordingSyncMetadata.segmentOrder),
        takeOrder: recordingSyncMetadata?.takeOrder === undefined ? undefined : String(recordingSyncMetadata.takeOrder),
      },
    });

    const { project, production } = await ensureProjectAndProduction(prisma, projectSlug, episodeSlug);
    const source = await prisma.studioVideoSource.create({
      data: {
        provider: "internal-gcs",
        providerSourceId: uploaded.uri,
        url: "",
        title: `${importRoleLabel(importRole)} [${project.slug}/${episodeSlug}] ${originalName}`,
      },
    });
    const playbackUrl = `/api/ingest/media/${source.id}`;
    await prisma.studioVideoSource.update({
      where: { id: source.id },
      data: { url: playbackUrl },
    });
    const mediaAsset = await prisma.studioMediaAsset.create({
      data: {
        filename: originalName,
        url: playbackUrl,
        mimeType: contentType,
        sizeBytes: BigInt(file.size),
        cloudProvider: uploaded.bucketName ? "gcs" : "local",
        isGlobal: false,
        duration: parseOptionalNumber(recordingSyncMetadata?.durationSeconds),
        thumbnailUrl: kind === "video" ? undefined : null,
        projects: { connect: { id: project.id } },
      },
    });
    await attachAssetToNest({
      prisma,
      nestSlug: projectSlug,
      assetId: mediaAsset.id,
      role: importRole,
      source: "episode-import-media.upload",
      metadataJson: {
        episodeSlug,
        sourceId: source.id,
        importId,
        kind,
        bucketName: uploaded.bucketName,
        objectName: uploaded.objectName,
        gcsUri: uploaded.uri,
        playbackUrl,
        recordingSync: recordingSyncMetadata ?? null,
      },
    });
    await createWorkflowJob({
      prisma,
      projectId: project.id,
      assetId: mediaAsset.id,
      type: kind === "video" ? "asset-proxy" : "asset-register",
      source: "episode-import-media.upload",
      inputJson: {
        projectSlug,
        episodeSlug,
        importRole,
        sourceId: source.id,
        bucketName: uploaded.bucketName,
        objectName: uploaded.objectName,
        playbackUrl,
      },
    });

    const currentProductionJson = asRecord(production.productionJson);
    const currentImportedMedia = Array.isArray(currentProductionJson.importedMedia)
      ? currentProductionJson.importedMedia
      : [];
    const importedAsset: EpisodeImportedMediaAsset = {
      id: mediaAsset.id,
      sourceId: source.id,
      projectSlug,
      episodeSlug,
      originalName,
      contentType,
      size: file.size,
      kind,
      bucketName: uploaded.bucketName,
      objectName: uploaded.objectName,
      gcsUri: uploaded.uri,
      playbackUrl,
      importedAt,
      source: "editor-import",
      importRole,
      ...(mediaMetadata ? { metadata: mediaMetadata } : {}),
      sync: {
        status: "ready-to-sync",
        ...(anchorTimelineSeconds === undefined ? {} : { anchorTimelineSeconds }),
        ...(selectedClipId ? { targetClipId: selectedClipId } : {}),
        suggestedRole: importRole,
        ...(recordingSegments ? { recordingSegments } : {}),
        ...(recordingSyncMetadata ? { recordingSync: recordingSyncMetadata } : {}),
        note: selectedClipId
          ? `${importRoleLabel(importRole)} imported while a clip was selected. Ready to attach or align.`
          : `${importRoleLabel(importRole)} imported into the episode source bin. Ready to sync.`,
      },
      proxy: {
        status: kind === "video" ? "ready" : "not-required",
        proxyUrl: playbackUrl,
        note: kind === "video"
          ? "Direct playback is ready through the episode media endpoint. A transcode worker can replace this with a lighter proxy later."
          : "Audio imports do not require a video proxy.",
      },
    };

    const stackedAudio = rebuildAudioTakeStack(currentProductionJson, [importedAsset, ...currentImportedMedia]);
    const nextProductionJson = episodeProductionJson(currentProductionJson, projectSlug, episodeSlug, {
      importedMedia: [importedAsset, ...currentImportedMedia],
      timelineClips: stackedAudio.timelineClips,
      audioTakeStack: stackedAudio.audioTakeStack,
      audioTakeStackTrackId: stackedAudio.audioTakeStackTrackId,
      lastMediaImportAt: importedAt,
      source: "quipsly-api-import-media",
    });

    const updated = await prisma.studioEpisodeProduction.update({
      where: { id: production.id },
      data: { productionJson: nextProductionJson },
    });

    return NextResponse.json({
      ok: true,
      importedAsset,
      productionJson: nextProductionJson,
      playbackUrl,
      sourceId: source.id,
      updatedAt: updated.updatedAt.toISOString(),
    });
  } catch (error) {
    console.error("[episode-production import-media] failed", error);
    return NextResponse.json({ ok: false, error: "Failed to import media into the episode." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const rawProjectSlug = String(body.projectSlug ?? "").trim();
    if (!rawProjectSlug) {
      return NextResponse.json({ ok: false, error: "projectSlug is required. Choose a Nest before updating media sync." }, { status: 400 });
    }

    const projectSlug = sanitizeSegment(rawProjectSlug);
    const episodeSlug = sanitizeSegment(String(body.episodeSlug ?? "current-episode"));
    const action = String(body.action ?? "update-sync").trim();
    const assetId = String(body.assetId ?? "").trim();
    const requestedStatus = String(body.status ?? "synced").trim();
    const status = ["ready-to-sync", "synced", "held"].includes(requestedStatus) ? requestedStatus : "synced";
    const anchorTimelineSeconds = parseOptionalNumber(body.anchorTimelineSeconds ?? body.anchorTime);
    const targetClipId = String(body.targetClipId ?? "").trim() || undefined;
    const suggestedTrackId = sanitizeTrackId(body.suggestedTrackId);
    const suggestedRole = String(body.suggestedRole ?? body.role ?? "").trim() || undefined;
    const suggestionReason = String(body.suggestionReason ?? body.reason ?? "").trim() || undefined;
    const suggestionSource = String(body.suggestionSource ?? "ai-ingest").trim() || "ai-ingest";
    const suggestionConfidence = parseOptionalNumber(body.suggestionConfidence ?? body.confidence);
    const spineAudioAssetId = String(body.spineAudioAssetId ?? "").trim() || undefined;
    const spineAudioClipId = String(body.spineAudioClipId ?? "").trim() || undefined;
    const spineAudioSource = String(body.spineAudioSource ?? "").trim() || undefined;
    const spineAudioLabel = String(body.spineAudioLabel ?? "").trim() || undefined;

    const prisma = getPrismaClient();
    if (!(prisma as any).studioEpisodeProduction) {
      return NextResponse.json({
        ok: false,
        error: "Episode production persistence is not available in this deployment.",
      }, { status: 503 });
    }
    const { production } = await ensureProjectAndProduction(prisma, projectSlug, episodeSlug);
    const currentJson = asRecord(production.productionJson) ?? {};
    const importedMedia = Array.isArray(currentJson.importedMedia) ? currentJson.importedMedia : [];
    const syncedAt = new Date().toISOString();

    if (action === "set-spine-audio") {
      if (!spineAudioAssetId && !spineAudioClipId) {
        return NextResponse.json({ ok: false, error: "spineAudioAssetId or spineAudioClipId is required" }, { status: 400 });
      }

      if (spineAudioAssetId) {
        const matchedAsset = importedMedia
          .map((item) => asRecord(item))
          .find((asset) => asset.id === spineAudioAssetId || asset.sourceId === spineAudioAssetId);
        const isAudioAsset = matchedAsset
          && (matchedAsset.kind === "audio" || String(matchedAsset.contentType ?? "").startsWith("audio/"));
        if (!isAudioAsset) {
          return NextResponse.json({ ok: false, error: "Only imported audio assets can be set as spine audio." }, { status: 400 });
        }
      }

      const previousSpine = {
        spineAudioAssetId: currentJson.spineAudioAssetId,
        spineAudioClipId: currentJson.spineAudioClipId,
        spineAudioSource: currentJson.spineAudioSource,
        spineAudioLabel: currentJson.spineAudioLabel,
      };
      const productionJson = episodeProductionJson(currentJson, projectSlug, episodeSlug, {
        spineAudioAssetId: spineAudioAssetId ?? null,
        spineAudioClipId: spineAudioClipId ?? null,
        spineAudioSource: spineAudioSource ?? null,
        spineAudioLabel: spineAudioLabel ?? (spineAudioAssetId ?? spineAudioClipId),
        spineAudioSetAt: syncedAt,
        spineAudioSetBy: "editor",
        syncHistory: appendSyncHistory(currentJson, {
          type: "set-spine-audio",
          assetId: spineAudioAssetId,
          targetClipId: spineAudioClipId,
          label: `Set spine audio: ${spineAudioLabel ?? spineAudioAssetId ?? spineAudioClipId}`,
          beforeSync: previousSpine,
          afterSync: {
            spineAudioAssetId: spineAudioAssetId ?? null,
            spineAudioClipId: spineAudioClipId ?? null,
            spineAudioSource: spineAudioSource ?? null,
            spineAudioLabel: spineAudioLabel ?? (spineAudioAssetId ?? spineAudioClipId),
          },
        }),
        lastImportSyncUpdatedAt: syncedAt,
      });

      const updated = await prisma.studioEpisodeProduction.update({
        where: { id: production.id },
        data: { productionJson },
      });

      return NextResponse.json({
        ok: true,
        productionJson,
        updatedAt: updated.updatedAt?.toISOString?.() ?? syncedAt,
      });
    }

    if (action === "record-sync-snapshot") {
      const snapshot = asRecord(body.snapshot);
      if (!snapshot.type) {
        return NextResponse.json({ ok: false, error: "snapshot.type is required" }, { status: 400 });
      }

      const productionJson = episodeProductionJson(currentJson, projectSlug, episodeSlug, {
        syncHistory: appendSyncHistory(currentJson, {
          ...snapshot,
          projectSlug,
          episodeSlug,
          source: "editor-sync-history",
        }),
        lastSyncHistoryUpdatedAt: syncedAt,
      });

      const updated = await prisma.studioEpisodeProduction.update({
        where: { id: production.id },
        data: { productionJson },
      });

      return NextResponse.json({
        ok: true,
        productionJson,
        updatedAt: updated.updatedAt?.toISOString?.() ?? syncedAt,
      });
    }

    if (action === "stage-premiere-draft-edit") {
      const draftEdit = asRecord(body.draftEdit);
      const draftTimelineClips = Array.isArray(draftEdit.timelineClips) ? draftEdit.timelineClips : [];
      if (draftTimelineClips.length === 0) {
        return NextResponse.json({
          ok: false,
          error: "draftEdit.timelineClips is required before staging a Premiere draft edit.",
        }, { status: 400 });
      }

      const draftId = String(draftEdit.id ?? `premiere-draft-${randomUUID()}`).trim() || `premiere-draft-${randomUUID()}`;
      const currentDrafts = Array.isArray(currentJson.premiereDraftEdits) ? currentJson.premiereDraftEdits : [];
      const draftRecord = {
        ...draftEdit,
        id: draftId,
        projectSlug,
        episodeSlug,
        stagedAt: syncedAt,
        stagedBy: "quipsly-mac",
        stageMode: "draft-only-no-active-timeline-overwrite",
      };
      const nextDrafts = [
        draftRecord,
        ...currentDrafts.filter((item) => asRecord(item).id !== draftId),
      ].slice(0, 10);

      const productionJson = episodeProductionJson(currentJson, projectSlug, episodeSlug, {
        premiereDraftEdits: nextDrafts,
        latestPremiereDraftEditId: draftId,
        lastPremiereDraftStagedAt: syncedAt,
        syncHistory: appendSyncHistory(currentJson, {
          type: "stage-premiere-draft-edit",
          source: "quipsly-mac-premiere-draft-edit",
          label: `Staged Premiere draft edit for ${episodeSlug}`,
          draftEditId: draftId,
          timelineClipCount: draftTimelineClips.length,
          deactivatedSourceRangeCount: Array.isArray(draftEdit.deactivatedSourceRanges)
            ? draftEdit.deactivatedSourceRanges.length
            : 0,
          activeTimelineOverwritten: false,
        }),
      });

      const updated = await prisma.studioEpisodeProduction.update({
        where: { id: production.id },
        data: { productionJson },
      });

      return NextResponse.json({
        ok: true,
        draftEditId: draftId,
        timelineClipCount: draftTimelineClips.length,
        activeTimelineOverwritten: false,
        productionJson,
        updatedAt: updated.updatedAt?.toISOString?.() ?? syncedAt,
      });
    }

    if (action === "promote-premiere-draft-edit") {
      const draftEditId = String(body.draftEditId ?? "").trim();
      if (!draftEditId) {
        return NextResponse.json({ ok: false, error: "draftEditId is required." }, { status: 400 });
      }

      const currentDrafts = Array.isArray(currentJson.premiereDraftEdits) ? currentJson.premiereDraftEdits : [];
      const draftEdit = currentDrafts
        .map((item) => asRecord(item))
        .find((draft) => String(draft.id ?? "") === draftEditId);

      if (!draftEdit) {
        return NextResponse.json({ ok: false, error: "Staged Premiere draft edit was not found." }, { status: 404 });
      }

      const draftTimelineClips = sanitizeTimelineClips(draftEdit.timelineClips);
      if (draftTimelineClips.length === 0) {
        return NextResponse.json({
          ok: false,
          error: "This Premiere draft has no valid timeline clips to promote.",
        }, { status: 400 });
      }

      const currentTimelineJson = asRecord(production.timelineJson);
      const currentTimelineClipsFromTimeline = sanitizeTimelineClips(currentTimelineJson.timelineClips);
      const currentTimelineClipsFromProduction = sanitizeTimelineClips(currentJson.timelineClips);
      const currentTimelineClips = currentTimelineClipsFromTimeline.length
        ? currentTimelineClipsFromTimeline
        : currentTimelineClipsFromProduction;
      const backupId = `premiere-backup-${randomUUID()}`;
      const backupRecord = {
        id: backupId,
        createdAt: syncedAt,
        source: "promote-premiere-draft-edit",
        draftEditId,
        timelineClipCount: currentTimelineClips.length,
        timelineJson: currentTimelineJson,
        productionTimelineClips: currentTimelineClipsFromProduction,
      };
      const currentBackups = Array.isArray(currentJson.timelineBackups) ? currentJson.timelineBackups : [];
      const nextTimelineJson = {
        ...currentTimelineJson,
        payloadVersion: parseOptionalNumber(currentTimelineJson.payloadVersion) ?? EPISODE_ARTIFACT_CURRENT_VERSION,
        projectSlug,
        episodeSlug,
        source: "quipsly-premiere-draft-promote",
        timelineClips: draftTimelineClips,
        transcript: Array.isArray(currentTimelineJson.transcript) ? currentTimelineJson.transcript : [],
        generatedFrom: "quipsly-premiere-draft-promote",
        savedAt: syncedAt,
        premiereDraftEditId: draftEditId,
        timelineBackupId: backupId,
      };

      const productionJson = episodeProductionJson(currentJson, projectSlug, episodeSlug, {
        timelineClips: draftTimelineClips,
        timelineBackups: [backupRecord, ...currentBackups].slice(0, 20),
        latestPremiereDraftPromotedId: draftEditId,
        lastPremiereDraftPromotedAt: syncedAt,
        lastPremiereTimelineBackupId: backupId,
        syncHistory: appendSyncHistory(currentJson, {
          type: "promote-premiere-draft-edit",
          source: "editor-premiere-draft-review",
          label: `Promoted Premiere draft edit for ${episodeSlug}`,
          draftEditId,
          backupId,
          previousTimelineClipCount: currentTimelineClips.length,
          nextTimelineClipCount: draftTimelineClips.length,
          activeTimelineOverwritten: true,
        }),
      });

      const updated = await prisma.studioEpisodeProduction.update({
        where: { id: production.id },
        data: {
          productionJson: toPrismaJson(productionJson),
          timelineJson: toPrismaJson(nextTimelineJson),
        },
      });

      return NextResponse.json({
        ok: true,
        draftEditId,
        backupId,
        timelineClipCount: draftTimelineClips.length,
        previousTimelineClipCount: currentTimelineClips.length,
        activeTimelineOverwritten: true,
        productionJson,
        timelineJson: nextTimelineJson,
        updatedAt: updated.updatedAt?.toISOString?.() ?? syncedAt,
      });
    }

    if (action === "restore-timeline-backup") {
      const backupId = String(body.backupId ?? "").trim();
      if (!backupId) {
        return NextResponse.json({ ok: false, error: "backupId is required." }, { status: 400 });
      }

      const currentBackups = Array.isArray(currentJson.timelineBackups) ? currentJson.timelineBackups : [];
      const backup = currentBackups
        .map((item) => asRecord(item))
        .find((item) => String(item.id ?? "") === backupId);

      if (!backup) {
        return NextResponse.json({ ok: false, error: "Timeline backup was not found." }, { status: 404 });
      }

      const backupTimelineJson = asRecord(backup.timelineJson);
      const backupTimelineClips = sanitizeTimelineClips(backupTimelineJson.timelineClips);
      const backupProductionTimelineClips = sanitizeTimelineClips(backup.productionTimelineClips);
      const restoredClips = backupTimelineClips.length ? backupTimelineClips : backupProductionTimelineClips;

      if (restoredClips.length === 0) {
        return NextResponse.json({
          ok: false,
          error: "This backup does not contain restorable timeline clips.",
        }, { status: 400 });
      }

      const currentTimelineJson = asRecord(production.timelineJson);
      const currentTimelineClipsFromTimeline = sanitizeTimelineClips(currentTimelineJson.timelineClips);
      const currentTimelineClipsFromProduction = sanitizeTimelineClips(currentJson.timelineClips);
      const currentTimelineClips = currentTimelineClipsFromTimeline.length
        ? currentTimelineClipsFromTimeline
        : currentTimelineClipsFromProduction;
      const preRestoreBackupId = `pre-restore-${randomUUID()}`;
      const preRestoreBackup = {
        id: preRestoreBackupId,
        createdAt: syncedAt,
        source: "restore-timeline-backup",
        restoredFromBackupId: backupId,
        timelineClipCount: currentTimelineClips.length,
        timelineJson: currentTimelineJson,
        productionTimelineClips: currentTimelineClipsFromProduction,
      };

      const nextTimelineJson = {
        ...backupTimelineJson,
        payloadVersion: parseOptionalNumber(backupTimelineJson.payloadVersion) ?? EPISODE_ARTIFACT_CURRENT_VERSION,
        projectSlug,
        episodeSlug,
        source: "quipsly-timeline-backup-restore",
        timelineClips: restoredClips,
        transcript: Array.isArray(backupTimelineJson.transcript) ? backupTimelineJson.transcript : [],
        generatedFrom: "quipsly-timeline-backup-restore",
        savedAt: syncedAt,
        restoredFromBackupId: backupId,
        preRestoreBackupId,
      };

      const productionJson = episodeProductionJson(currentJson, projectSlug, episodeSlug, {
        timelineClips: restoredClips,
        timelineBackups: [preRestoreBackup, ...currentBackups].slice(0, 20),
        lastTimelineRestoredAt: syncedAt,
        lastTimelineRestoredFromBackupId: backupId,
        syncHistory: appendSyncHistory(currentJson, {
          type: "restore-timeline-backup",
          source: "editor-premiere-draft-review",
          label: `Restored timeline backup for ${episodeSlug}`,
          backupId,
          preRestoreBackupId,
          previousTimelineClipCount: currentTimelineClips.length,
          nextTimelineClipCount: restoredClips.length,
        }),
      });

      const updated = await prisma.studioEpisodeProduction.update({
        where: { id: production.id },
        data: {
          productionJson: toPrismaJson(productionJson),
          timelineJson: toPrismaJson(nextTimelineJson),
        },
      });

      return NextResponse.json({
        ok: true,
        backupId,
        preRestoreBackupId,
        timelineClipCount: restoredClips.length,
        previousTimelineClipCount: currentTimelineClips.length,
        productionJson,
        timelineJson: nextTimelineJson,
        updatedAt: updated.updatedAt?.toISOString?.() ?? syncedAt,
      });
    }

    if (action === "undo-last-sync") {
      const history = syncHistoryArray(currentJson);
      const [latestSnapshot, ...remainingHistory] = history;
      const snapshot = asRecord(latestSnapshot);

      if (!snapshot.type) {
        return NextResponse.json({ ok: false, error: "No sync history to undo" }, { status: 404 });
      }

      let nextImportedMedia = importedMedia;
      if (snapshot.type === "sync-status" || snapshot.type === "ai-suggestion") {
        const snapshotAssetId = String(snapshot.assetId ?? "");
        nextImportedMedia = importedMedia.map((item) => {
          const asset = asRecord(item);
          if (!asset) return item;
          if (asset.id !== snapshotAssetId && asset.sourceId !== snapshotAssetId) return item;
          return {
            ...asset,
            sync: asRecord(snapshot.beforeSync) ?? {},
          };
        });
      }

      const productionJson = episodeProductionJson(currentJson, projectSlug, episodeSlug, {
        importedMedia: nextImportedMedia,
        syncHistory: remainingHistory,
        lastSyncUndoAt: syncedAt,
      });

      const updated = await prisma.studioEpisodeProduction.update({
        where: { id: production.id },
        data: { productionJson },
      });

      return NextResponse.json({
        ok: true,
        productionJson,
        undoAction: snapshot,
        updatedAt: updated.updatedAt?.toISOString?.() ?? syncedAt,
      });
    }

    if (action === "add-to-timeline") {
      if (!assetId) {
        return NextResponse.json({ ok: false, error: "assetId is required" }, { status: 400 });
      }

      const matchedAsset = importedMedia
        .map((item) => asRecord(item))
        .find((asset) => asset.id === assetId || asset.sourceId === assetId);

      if (!matchedAsset) {
        return NextResponse.json({ ok: false, error: "Imported media asset was not found for this episode." }, { status: 404 });
      }

      const currentTimelineJson = asRecord(production.timelineJson);
      const timelineClipsFromTimeline = sanitizeTimelineClips(currentTimelineJson.timelineClips);
      const timelineClipsFromProduction = sanitizeTimelineClips(currentJson.timelineClips);
      const currentTimelineClips = timelineClipsFromTimeline.length ? timelineClipsFromTimeline : timelineClipsFromProduction;
      const allowDuplicate = body.allowDuplicate === true;
      const existingClip = allowDuplicate ? undefined : findExistingTimelineClipForAsset(currentTimelineClips, matchedAsset);
      const requestedPlacement = String(body.placement ?? "playhead").trim() === "after-last" ? "after-last" : "playhead";
      const kind = clipKindForAsset(matchedAsset);
      const requestedTrackId = sanitizedTrackForKind(body.trackId, kind);
      const playheadSeconds = parseOptionalNumber(body.playheadSeconds ?? body.anchorTimelineSeconds ?? body.anchorTime) ?? 0;
      const newClip = existingClip ?? buildTimelineClipForAsset(
        matchedAsset,
        currentTimelineClips,
        requestedPlacement,
        requestedTrackId,
        playheadSeconds,
      );
      const nextTimelineClips = existingClip ? currentTimelineClips : [...currentTimelineClips, newClip];
      const nextTimelineJson = {
        ...currentTimelineJson,
        payloadVersion: parseOptionalNumber(currentTimelineJson.payloadVersion) ?? EPISODE_ARTIFACT_CURRENT_VERSION,
        projectSlug,
        episodeSlug,
        source: "quipsly-mac-import-attach",
        timelineClips: nextTimelineClips,
        transcript: Array.isArray(currentTimelineJson.transcript) ? currentTimelineJson.transcript : [],
        generatedFrom: "quipsly-mac-import-attach",
        savedAt: syncedAt,
      };
      const productionJson = episodeProductionJson(currentJson, projectSlug, episodeSlug, {
        timelineClips: nextTimelineClips,
        lastTimelineAttachAt: syncedAt,
        lastTimelineAttachSource: "quipsly-mac-import",
        syncHistory: appendSyncHistory(currentJson, {
          type: "add-to-timeline",
          assetId,
          label: existingClip
            ? `Asset already attached: ${optionalString(matchedAsset.originalName) ?? assetId}`
            : `Added imported media to timeline: ${optionalString(matchedAsset.originalName) ?? assetId}`,
          placement: requestedPlacement,
          trackId: newClip.trackId,
          startIn: newClip.startIn,
          duration: newClip.duration,
          alreadyAttached: Boolean(existingClip),
          source: "quipsly-mac-import",
        }),
      });

      const updated = await prisma.studioEpisodeProduction.update({
        where: { id: production.id },
        data: {
          productionJson: toPrismaJson(productionJson),
          timelineJson: toPrismaJson(nextTimelineJson),
        },
      });

      return NextResponse.json({
        ok: true,
        clipId: newClip.id,
        trackId: newClip.trackId,
        startIn: newClip.startIn,
        duration: newClip.duration,
        placement: requestedPlacement,
        alreadyAttached: Boolean(existingClip),
        timelineClip: newClip,
        productionJson,
        timelineJson: nextTimelineJson,
        updatedAt: updated.updatedAt?.toISOString?.() ?? syncedAt,
      });
    }

    if (!assetId) {
      return NextResponse.json({ ok: false, error: "assetId is required" }, { status: 400 });
    }

    let found = false;
    let beforeSync: Record<string, unknown> | null = null;
    let afterSync: Record<string, unknown> | null = null;
    const isAiSuggestionApply = action === "apply-ai-suggestion";
    const effectiveStatus = isAiSuggestionApply ? sanitizeAiSyncStatus(body.status ?? body.suggestedSyncStatus) ?? status : status;

    const nextImportedMedia = importedMedia.map((item) => {
      const asset = asRecord(item);
      if (!asset) return item;
      if (asset.id !== assetId && asset.sourceId !== assetId) return item;

      found = true;
      const existingSync = asRecord(asset.sync) ?? {};
      beforeSync = existingSync;
      afterSync = {
        ...existingSync,
        status: effectiveStatus,
        ...(anchorTimelineSeconds !== undefined ? { anchorTimelineSeconds } : {}),
        ...(targetClipId ? { targetClipId } : {}),
        ...(suggestedTrackId ? { suggestedTrackId } : {}),
        ...(suggestedRole ? { suggestedRole } : {}),
        ...(suggestionReason ? { suggestionReason } : {}),
        ...(suggestionConfidence !== undefined ? { suggestionConfidence } : {}),
        ...(isAiSuggestionApply ? { suggestionAppliedAt: syncedAt, suggestionSource } : {}),
        syncedAt,
        source: isAiSuggestionApply ? "editor-ai-suggestion" : "editor-sync-bench",
      };
      return {
        ...asset,
        sync: afterSync,
      };
    });

    if (!found) {
      return NextResponse.json({ ok: false, error: "Imported asset not found" }, { status: 404 });
    }

    const productionJson = episodeProductionJson(currentJson, projectSlug, episodeSlug, {
      importedMedia: nextImportedMedia,
      syncHistory: appendSyncHistory(currentJson, {
        type: isAiSuggestionApply ? "ai-suggestion" : "sync-status",
        assetId,
        targetClipId,
        beforeSync: beforeSync ?? {},
        afterSync: afterSync ?? {},
        label: isAiSuggestionApply
          ? `Applied AI suggestion for ${assetId}${suggestedTrackId ? ` (${suggestedTrackId})` : ""}`
          : `Changed sync for ${assetId}`,
      }),
      lastImportSyncUpdatedAt: syncedAt,
    });

    const updated = await prisma.studioEpisodeProduction.update({
      where: { id: production.id },
      data: { productionJson },
    });

    return NextResponse.json({
      ok: true,
      productionJson,
      updatedAt: updated.updatedAt?.toISOString?.() ?? syncedAt,
    });
  } catch (error) {
    console.error("Could not update imported media sync metadata.", error);
    return NextResponse.json({ ok: false, error: "Could not update imported media sync metadata" }, { status: 500 });
  }
}
