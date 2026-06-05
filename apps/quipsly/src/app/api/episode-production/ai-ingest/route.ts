import { NextResponse } from "next/server";
import { GoogleGenAI, Schema, Type } from "@google/genai";
import { getPrismaClient } from "@/lib/prisma";
import { lookupStudioProjectDocument, projectConfig } from "../../../(app)/create/projectConfig";

type ImportedAssetInput = {
  id?: string;
  sourceId?: string;
  originalName?: string;
  contentType?: string;
  size?: number;
  kind?: string;
  importedAt?: string;
  sync?: {
    status?: string;
    anchorTimelineSeconds?: number;
    targetClipId?: string;
  };
  proxy?: {
    status?: string;
  };
};

const aiIngestSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    summary: {
      type: Type.STRING,
      description: "Plain-English overview of the imported media state and what the editor should do next.",
    },
    recommendations: {
      type: Type.ARRAY,
      description: "One recommendation per important imported media file.",
      items: {
        type: Type.OBJECT,
        properties: {
          assetId: { type: Type.STRING },
          role: {
            type: Type.STRING,
            description: "Likely production role, such as primary-audio, camera-video, screen-recording, b-roll, reference, transcript-source, or unknown.",
          },
          confidence: {
            type: Type.NUMBER,
            description: "0 to 1 confidence score.",
          },
          suggestedTrackId: {
            type: Type.STRING,
            description: "Suggested string track such as A1, A2, V1, V2, or V3.",
          },
          suggestedSyncStatus: {
            type: Type.STRING,
            description: "ready-to-sync, synced, or held.",
          },
          suggestedAction: {
            type: Type.STRING,
            description: "Short concrete next action for the editor.",
          },
          reason: {
            type: Type.STRING,
            description: "Why this recommendation was made.",
          },
        },
        required: ["assetId", "role", "confidence", "suggestedTrackId", "suggestedSyncStatus", "suggestedAction", "reason"],
      },
    },
    batchPlan: {
      type: Type.ARRAY,
      description: "A compact ordered plan for getting this media into a synced edit.",
      items: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          detail: { type: Type.STRING },
        },
        required: ["title", "detail"],
      },
    },
    warnings: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
    },
  },
  required: ["summary", "recommendations", "batchPlan", "warnings"],
};

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

function inferRole(asset: ImportedAssetInput) {
  const name = (asset.originalName ?? "").toLowerCase();
  const contentType = (asset.contentType ?? "").toLowerCase();
  const kind = (asset.kind ?? "").toLowerCase();

  if (kind === "audio" || contentType.startsWith("audio/")) {
    if (/phone|call|zoom|riverside|homer|host|mic|wav|m4a/.test(name)) return "primary-audio";
    return "audio-source";
  }

  if (kind === "video" || contentType.startsWith("video/")) {
    if (/screen|capture|youtube|clip|reference|source/.test(name)) return "reference-video";
    if (/insta|camera|iphone|sony|canon|gopro|take|roll/.test(name)) return "camera-video";
    return "video-source";
  }

  return "unknown";
}

function suggestedTrackForRole(role: string) {
  if (role.includes("audio")) return "A1";
  if (role.includes("reference")) return "V2";
  if (role.includes("camera")) return "V1";
  return "V3";
}

function localFallbackReport(importedMedia: ImportedAssetInput[], warning?: string) {
  const recommendations = importedMedia.map((asset) => {
    const assetId = asset.id || asset.sourceId || asset.originalName || "unknown";
    const role = inferRole(asset);
    const suggestedTrackId = suggestedTrackForRole(role);
    const syncStatus = asset.sync?.status ?? "ready-to-sync";

    return {
      assetId,
      role,
      confidence: role === "unknown" ? 0.3 : 0.62,
      suggestedTrackId,
      suggestedSyncStatus: syncStatus === "synced" ? "synced" : role === "unknown" ? "held" : "ready-to-sync",
      suggestedAction:
        role === "primary-audio"
          ? "Use this as the spine track, then align camera or screen video to it."
          : role === "camera-video"
            ? "Place this on V1 and sync it to the primary audio spine."
            : role === "reference-video"
              ? "Place this on V2 near the manuscript note that calls for the clip."
              : "Hold this file until its episode purpose is clear.",
      reason: `Classified from filename, content type, and current sync status: ${asset.originalName ?? assetId}.`,
    };
  });

  return {
    source: "local-fallback",
    generatedAt: new Date().toISOString(),
    summary:
      importedMedia.length === 0
        ? "No imported media is available yet. Import audio or video first, then run the organizer again."
        : `Organized ${importedMedia.length} imported file${importedMedia.length === 1 ? "" : "s"} from metadata. Use the highest-confidence audio as the sync spine.`,
    recommendations,
    batchPlan: [
      {
        title: "Pick the spine",
        detail: "Choose the cleanest continuous audio recording first. Everything else should sync to that timeline.",
      },
      {
        title: "Attach obvious video",
        detail: "Put camera footage on V1 and reference/screen clips on V2 so the visual intent stays readable.",
      },
      {
        title: "Hold ambiguous files",
        detail: "If a filename does not clearly say what it is, keep it in held state instead of forcing it into the cut.",
      },
    ],
    warnings: warning ? [warning] : [],
  };
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
        source: "quipsly-api-ai-ingest.create",
        projectSlug: project.slug,
        episodeSlug,
        importedMedia: [],
      },
    },
  });

  return { project, production };
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const rawProjectSlug = String(body.projectSlug ?? "").trim();
    if (!rawProjectSlug) {
      return NextResponse.json({ ok: false, error: "projectSlug is required. Choose a Nest before running AI ingest." }, { status: 400 });
    }

    const projectSlug = sanitizeSegment(rawProjectSlug);
    const episodeSlug = sanitizeSegment(String(body.episodeSlug ?? "current-episode"));
    let prisma: ReturnType<typeof getPrismaClient> | null = null;
    let production: any = null;
    let currentJson: Record<string, unknown> = {};
    try {
      prisma = getPrismaClient();
      if (!(prisma as any).studioEpisodeProduction) {
        throw new Error("StudioEpisodeProduction model is not available in the generated Prisma client.");
      }
      const ensured = await ensureProjectAndProduction(prisma, projectSlug, episodeSlug);
      production = ensured.production;
      currentJson = asRecord(production.productionJson);
    } catch (error) {
      console.warn("[episode-production ai-ingest] persistence unavailable; returning transient report.", error);
      const transientImportedMedia = Array.isArray(body.importedMedia)
        ? body.importedMedia as ImportedAssetInput[]
        : [];
      const report = localFallbackReport(
        transientImportedMedia,
        "Episode production persistence is not available in this deployment; this AI ingest report is transient until the production model is migrated.",
      );
      const productionJson = {
        projectSlug,
        episodeSlug,
        aiIngestReport: report,
        lastAiIngestAt: new Date().toISOString(),
        source: "quipsly-api-ai-ingest.transient",
      };
      return NextResponse.json({
        ok: true,
        mode: "transient",
        report,
        productionJson,
        updatedAt: productionJson.lastAiIngestAt,
      });
    }
    const importedMedia = Array.isArray(currentJson.importedMedia)
      ? currentJson.importedMedia as ImportedAssetInput[]
      : Array.isArray(body.importedMedia)
        ? body.importedMedia as ImportedAssetInput[]
        : [];
    const timelineClips = Array.isArray(body.timelineClips) ? body.timelineClips : [];
    const transcript = Array.isArray(body.transcript) ? body.transcript.slice(0, 20) : [];
    const generatedAt = new Date().toISOString();
    const apiKey = process.env.GEMINI_API_KEY;
    let report;

    if (!apiKey) {
      report = localFallbackReport(importedMedia, "GEMINI_API_KEY is not configured on this server; used local metadata fallback.");
    } else {
      const ai = new GoogleGenAI({ apiKey });
      const prompt = [
        "You are Quipsly's episode media ingest assistant.",
        "Your job is to reduce editing avoidance by making file handling and sync decisions simple.",
        "Analyze imported media metadata and current timeline context.",
        "Do not pretend to inspect waveforms or visual content. If a decision requires waveform/video analysis, say so in the reason.",
        "Prefer deterministic, editor-safe recommendations: primary audio spine first, then camera video, then reference/screen clips, then unknown files held.",
        "",
        `Project: ${projectSlug}`,
        `Episode: ${episodeSlug}`,
        "",
        "Imported media:",
        JSON.stringify(importedMedia.map((asset) => ({
          id: asset.id,
          sourceId: asset.sourceId,
          originalName: asset.originalName,
          contentType: asset.contentType,
          size: asset.size,
          kind: asset.kind,
          importedAt: asset.importedAt,
          sync: asset.sync,
          proxy: asset.proxy,
        })), null, 2),
        "",
        "Timeline clips:",
        JSON.stringify(timelineClips.map((clip: Record<string, unknown>) => ({
          id: clip.id,
          name: clip.name,
          trackId: clip.trackId,
          kind: clip.kind,
          startIn: clip.startIn,
          duration: clip.duration,
          assetId: clip.assetId,
        })), null, 2),
        "",
        "Transcript sample:",
        JSON.stringify(transcript.map((block: Record<string, unknown>) => ({
          time: block.time,
          duration: block.duration,
          text: block.text,
        })), null, 2),
      ].join("\n");

      const response = await ai.models.generateContent({
        model: process.env.GEMINI_INGEST_MODEL || process.env.GEMINI_MODEL || "gemini-2.5-flash",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: aiIngestSchema,
          systemInstruction: "You are a pragmatic post-production assistant. You organize media and sync work without hallucinating unavailable analysis.",
          temperature: 0.2,
        },
      });

      if (!response.text) {
        report = localFallbackReport(importedMedia, "Gemini returned an empty response; used local metadata fallback.");
      } else {
        report = {
          source: "gemini",
          generatedAt,
          ...JSON.parse(response.text),
        };
      }
    }

    const productionJson = {
      ...currentJson,
      projectSlug,
      episodeSlug,
      aiIngestReport: report,
      lastAiIngestAt: generatedAt,
    };

    const updated = await prisma!.studioEpisodeProduction.update({
      where: { id: production.id },
      data: { productionJson },
    });

    return NextResponse.json({
      ok: true,
      report,
      productionJson,
      updatedAt: updated.updatedAt?.toISOString?.() ?? generatedAt,
    });
  } catch (error) {
    console.error("[episode-production ai-ingest] failed", error);
    return NextResponse.json({ ok: false, error: "Failed to organize episode media." }, { status: 500 });
  }
}
