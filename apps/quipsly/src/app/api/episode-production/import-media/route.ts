// @ts-nocheck
import { randomUUID } from "node:crypto";
import path from "node:path";
import { NextResponse } from "next/server";
import { getPrismaClient } from "@/lib/prisma";
import { uploadMediaBuffer } from "@/lib/server/gcs";
import { DEFAULT_PROJECT_SLUG, projectConfig } from "../../../create/projectConfig";
import type { EpisodeImportedMediaAsset } from "../../../episode-production/episodeArtifact";

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

function parseOptionalNumber(value: unknown) {
  if (typeof value !== "string" && typeof value !== "number") return undefined;
  if (typeof value === "string" && !value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
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
  if (value === "phone-audio") return "Phone audio";
  if (value === "camera-video") return "Camera video";
  if (value === "reference-clip") return "Reference clip";
  if (value === "source-clip") return "YouTube/source clip";
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
  const config = projectConfig(projectSlug);
  const workspace = await prisma.studioWorkspace.upsert({
    where: { slug: "tonight-pack" },
    update: {},
    create: { slug: "tonight-pack", name: "Tonight Pack Workspace" },
  });

  const project = await prisma.studioProject.findUnique({
    where: { workspaceId_slug: { workspaceId: workspace.id, slug: config.slug } },
  }) ?? await prisma.studioProject.create({
    data: { workspaceId: workspace.id, slug: config.slug, name: config.name },
  });

  const document = await prisma.studioDocument.findUnique({
    where: { stableId: config.documentStableId },
  }) ?? await prisma.studioDocument.create({
    data: { projectId: project.id, stableId: config.documentStableId, title: config.documentTitle },
  });

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

  return { project, document, production };
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

    const projectSlug = sanitizeSegment(String((isJsonRequest ? body.projectSlug : formData?.get("projectSlug")) ?? DEFAULT_PROJECT_SLUG));
    const episodeSlug = sanitizeSegment(String((isJsonRequest ? body.episodeSlug : formData?.get("episodeSlug")) ?? "current-episode"));
    const selectedClipId = typeof (isJsonRequest ? body.selectedClipId : formData?.get("selectedClipId")) === "string"
      ? String(isJsonRequest ? body.selectedClipId : formData?.get("selectedClipId"))
      : undefined;
    const anchorTimelineSeconds = parseOptionalNumber(isJsonRequest ? body.anchorTime ?? body.anchorTimelineSeconds : formData?.get("anchorTime"));
    const importRole = sanitizeImportRole(isJsonRequest ? body.importRole ?? body.role : formData?.get("importRole"));
    const importSource = isJsonRequest ? "editor-source-url" : "editor-file-import";
    const importId = randomUUID();

    const prisma = getPrismaClient();
    if (!(prisma as any).studioEpisodeProduction) {
      return NextResponse.json({
        ok: false,
        error: "Episode production persistence is not available in this deployment.",
      }, { status: 503 });
    }

    if (isJsonRequest) {
      const originalName = String(body.originalName ?? body.title ?? rawSourceUrl).trim() || "Source clip";
      const kind = inferKindFromSourceUrl(rawSourceUrl);
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

      const currentProductionJson = asRecord(production.productionJson);
      const currentImportedMedia = Array.isArray(currentProductionJson.importedMedia)
        ? currentProductionJson.importedMedia
        : [];
      const importedAsset: EpisodeImportedMediaAsset = {
        id: importId,
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
        sync: {
          status: "ready-to-sync",
          ...(anchorTimelineSeconds === undefined ? {} : { anchorTimelineSeconds }),
          ...(selectedClipId ? { targetClipId: selectedClipId } : {}),
          suggestedRole: importRole,
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

      const nextProductionJson = {
        ...currentProductionJson,
        projectSlug,
        episodeSlug,
        importedMedia: [importedAsset, ...currentImportedMedia],
        lastMediaImportAt: importedAt,
        source: "quipsly-api-import-media",
      };

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

    const currentProductionJson = asRecord(production.productionJson);
    const currentImportedMedia = Array.isArray(currentProductionJson.importedMedia)
      ? currentProductionJson.importedMedia
      : [];
    const importedAsset: EpisodeImportedMediaAsset = {
      id: importId,
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
      sync: {
        status: "ready-to-sync",
        ...(anchorTimelineSeconds === undefined ? {} : { anchorTimelineSeconds }),
        ...(selectedClipId ? { targetClipId: selectedClipId } : {}),
        suggestedRole: importRole,
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

    const nextProductionJson = {
      ...currentProductionJson,
      projectSlug,
      episodeSlug,
      importedMedia: [importedAsset, ...currentImportedMedia],
      lastMediaImportAt: importedAt,
      source: "quipsly-api-import-media",
    };

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
    const projectSlug = sanitizeSegment(String(body.projectSlug ?? DEFAULT_PROJECT_SLUG));
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

    if (action === "record-sync-snapshot") {
      const snapshot = asRecord(body.snapshot);
      if (!snapshot.type) {
        return NextResponse.json({ ok: false, error: "snapshot.type is required" }, { status: 400 });
      }

      const productionJson = {
        ...currentJson,
        syncHistory: appendSyncHistory(currentJson, {
          ...snapshot,
          projectSlug,
          episodeSlug,
          source: "editor-sync-history",
        }),
        lastSyncHistoryUpdatedAt: syncedAt,
      };

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

      const productionJson = {
        ...currentJson,
        importedMedia: nextImportedMedia,
        syncHistory: remainingHistory,
        lastSyncUndoAt: syncedAt,
      };

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

    const productionJson = {
      ...currentJson,
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
    };

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
