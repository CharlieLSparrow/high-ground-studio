import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import { Readable } from "node:stream";
import { GoogleGenAI, Schema, Type } from "@google/genai";
import { getPrismaClient } from "@/lib/prisma";
import { resolveEpisodeProductionAccess } from "@/lib/server/episode-production-access";
import { getMediaBucket } from "@/lib/server/gcs";
import { authorizeStudioMediaSource } from "@/lib/server/studio-media-source-access";
import {
  authorizeConfiguredMediaVaultLocation,
  resolveAllowedLocalStudioMediaPath,
} from "@/lib/server/studio-media-location-security";
import { lookupStudioProjectDocument, projectConfig } from "../../../(app)/create/projectConfig";

const MAX_INLINE_MEDIA_BYTES = 18 * 1024 * 1024;

const transcriptAssistSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    summary: {
      type: Type.STRING,
      description: "Short plain-English summary of what this asset likely contains and how useful it is for transcription.",
    },
    transcriptText: {
      type: Type.STRING,
      description: "Best-effort transcript text. Empty string if raw media was not inspected.",
    },
    transcriptBlocks: {
      type: Type.ARRAY,
      description: "Suggested transcript blocks. Do not invent exact timings when unavailable.",
      items: {
        type: Type.OBJECT,
        properties: {
          startSeconds: { type: Type.NUMBER },
          endSeconds: { type: Type.NUMBER },
          speaker: { type: Type.STRING },
          text: { type: Type.STRING },
          confidence: { type: Type.NUMBER },
        },
        required: ["startSeconds", "endSeconds", "speaker", "text", "confidence"],
      },
    },
    suggestedUse: {
      type: Type.STRING,
      description: "Concrete next action for the editor, such as use as transcript source, compare with manuscript, hold for later, or sync first.",
    },
    warnings: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
    },
  },
  required: ["summary", "transcriptText", "transcriptBlocks", "suggestedUse", "warnings"],
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

function coerceArray<T>(value: unknown) {
  return Array.isArray(value) ? (value as T[]) : [];
}

function mediaAnalysisJobs(value: Record<string, unknown>) {
  return Array.isArray(value.mediaAnalysisJobs) ? value.mediaAnalysisJobs : [];
}

function assetKind(asset: Record<string, unknown>) {
  const contentType = String(asset.contentType ?? "").toLowerCase();
  const kind = String(asset.kind ?? "").toLowerCase();
  if (kind === "audio" || contentType.startsWith("audio/")) return "audio";
  if (kind === "video" || contentType.startsWith("video/")) return "video";
  return "unknown";
}

function localFallbackReport(asset: Record<string, unknown>, warning: string) {
  const kind = assetKind(asset);
  const name = String(asset.originalName ?? asset.id ?? "Imported media");
  const generatedAt = new Date().toISOString();
  return {
    id: `${String(asset.id ?? asset.sourceId ?? "asset")}-${Date.now().toString(36)}`,
    source: "metadata-fallback",
    generatedAt,
    assetId: String(asset.id ?? ""),
    sourceId: String(asset.sourceId ?? ""),
    originalName: name,
    contentType: String(asset.contentType ?? ""),
    kind,
    inspectedRawMedia: false,
    summary: `${name} is available as ${kind} media, but raw media transcription was not performed. Use this as a safe placeholder report until media analysis is enabled.`,
    transcriptText: "",
    transcriptBlocks: [],
    suggestedUse: kind === "audio"
      ? "Likely transcript source. Set this as spine audio or sync it before accepting transcript text."
      : kind === "video"
        ? "Potential transcript source if it has dialogue. Sync it to the spine before trusting timings."
        : "Hold until the asset type is clear.",
    warnings: [warning],
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
        source: "quipsly-api-transcript-assist.create",
        projectSlug: project.slug,
        episodeSlug,
        importedMedia: [],
      },
    },
  });

  return { project, production };
}

function overLimitWarning(size: number) {
  return `Raw media is ${Math.round(size / 1024 / 1024)} MB, above the inline analysis limit. Use the bounded transcript worker instead.`;
}

async function readStreamWithLimit(stream: Readable) {
  const chunks: Buffer[] = [];
  let total = 0;
  try {
    for await (const chunk of stream) {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as any);
      total += bytes.byteLength;
      if (total > MAX_INLINE_MEDIA_BYTES) {
        stream.destroy?.();
        throw new Error(overLimitWarning(total));
      }
      chunks.push(bytes);
    }
  } finally {
    stream.destroy?.();
  }
  return Buffer.concat(chunks, total);
}

async function loadInlineMedia(
  asset: Record<string, unknown>,
  source: { providerSourceId: string | null },
) {
  const providerSourceId = String(source.providerSourceId ?? "").trim();
  const contentType = String(asset.contentType ?? "application/octet-stream");
  if (!providerSourceId) {
    return { part: null, warning: "This authorized source has no stored media location, so metadata fallback was used." };
  }

  const gcsLocation = authorizeConfiguredMediaVaultLocation(providerSourceId);
  let bytes: Buffer;
  let verifiedContentType = contentType;
  if (gcsLocation.kind === "rejected-gcs") {
    return { part: null, warning: gcsLocation.error };
  }
  if (gcsLocation.kind === "gcs") {
    const file = getMediaBucket(gcsLocation.bucketName).file(
      gcsLocation.objectName,
      gcsLocation.generation ? { generation: gcsLocation.generation as any } : undefined,
    );
    const [metadata] = await file.getMetadata();
    const size = Number(metadata.size ?? 0);
    if (!Number.isSafeInteger(size) || size <= 0) {
      return { part: null, warning: "The private-vault source is empty or its size evidence is invalid." };
    }
    if (size > MAX_INLINE_MEDIA_BYTES) {
      return { part: null, warning: overLimitWarning(size) };
    }
    verifiedContentType = metadata.contentType || contentType;
    bytes = await readStreamWithLimit(file.createReadStream({ start: 0, end: MAX_INLINE_MEDIA_BYTES }));
  } else {
    const localPath = await resolveAllowedLocalStudioMediaPath(
      providerSourceId,
      ["QUIPSLY_TRANSCRIPT_ASSIST_LOCAL_ROOTS"],
    );
    if (!localPath) {
      return {
        part: null,
        warning: "Transcript assist will not server-fetch external or unconfined media URLs. Upload the source to the private media vault first.",
      };
    }
    const file = await fs.open(localPath, "r");
    try {
      const stat = await file.stat();
      if (!stat.isFile() || stat.size <= 0) {
        return { part: null, warning: "The confined local source is empty or is not a regular file." };
      }
      if (stat.size > MAX_INLINE_MEDIA_BYTES) {
        return { part: null, warning: overLimitWarning(stat.size) };
      }
      bytes = Buffer.alloc(stat.size);
      let offset = 0;
      while (offset < bytes.length) {
        const { bytesRead } = await file.read(bytes, offset, bytes.length - offset, offset);
        if (bytesRead === 0) break;
        offset += bytesRead;
      }
      if (offset !== bytes.length) bytes = bytes.subarray(0, offset);
    } finally {
      await file.close();
    }
  }

  const base64 = bytes.toString("base64");
  return {
    part: {
      inlineData: {
        mimeType: verifiedContentType,
        data: base64,
      },
    },
    warning: "",
  };
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const rawProjectSlug = String(body.projectSlug ?? "").trim();
    if (!rawProjectSlug) {
      return NextResponse.json({ ok: false, error: "projectSlug is required. Choose a Nest before running transcript assist." }, { status: 400 });
    }

    const projectSlug = sanitizeSegment(rawProjectSlug);
    const episodeSlug = sanitizeSegment(String(body.episodeSlug ?? "current-episode"));
    const assetId = String(body.assetId ?? "").trim();
    if (!assetId) {
      return NextResponse.json({ ok: false, error: "assetId is required." }, { status: 400 });
    }

    const generatedAt = new Date().toISOString();
    const prisma = getPrismaClient();
    const access = await resolveEpisodeProductionAccess({
      request,
      projectSlug,
      action: "write",
      prisma,
    });

    if (!access.allowed) {
      return NextResponse.json({
        ok: false,
        code: access.code,
        error: access.error,
        actorSource: access.actor.source,
      }, { status: access.status });
    }

    const { production } = await ensureProjectAndProduction(prisma, projectSlug, episodeSlug);
    const currentJson = asRecord(production.productionJson);
    const importedMedia = coerceArray<Record<string, unknown>>(currentJson.importedMedia);
    const asset = importedMedia.find((candidate) => candidate.id === assetId || candidate.sourceId === assetId);
    if (!asset) {
      return NextResponse.json({ ok: false, error: "Imported asset not found." }, { status: 404 });
    }

    const sourceId = String(asset.sourceId ?? "").trim();
    const sourceAuthorization = sourceId
      ? await authorizeStudioMediaSource({
          prisma,
          actor: {
            id: access.actor.id,
            email: access.actor.email,
            // Episode production actors still pass project authorization;
            // do not add a staff scope bypass at this derived-byte boundary.
            isStaff: false,
          },
          sourceId,
        })
      : null;

    let report;
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      report = localFallbackReport(asset, "GEMINI_API_KEY is not configured on this server; saved metadata-only transcript assist.");
    } else {
      const { part, warning } = sourceAuthorization?.allowed
        ? await loadInlineMedia(asset, sourceAuthorization.source).catch((error) => ({
            part: null,
            warning: error instanceof Error ? error.message : "Could not load authorized raw media for Gemini.",
          }))
        : {
            part: null,
            warning: sourceAuthorization && !sourceAuthorization.allowed
              ? sourceAuthorization.error
              : "This imported item has no authorized Studio source binding; metadata fallback was used.",
          };

      if (!part) {
        report = localFallbackReport(asset, warning || "Raw media was not loaded; saved metadata-only transcript assist.");
      } else {
        const ai = new GoogleGenAI({ apiKey });
        const prompt = [
          "You are Quipsly's transcript assistant.",
          "Transcribe only what you can hear in the provided media. If audio is unclear, say so.",
          "Return suggestions only. Do not claim this replaces the existing episode transcript.",
          "Use rough timings if exact timings are unavailable.",
          "",
          `Project: ${projectSlug}`,
          `Episode: ${episodeSlug}`,
          "Asset metadata:",
          JSON.stringify({
            id: asset.id,
            sourceId: asset.sourceId,
            originalName: asset.originalName,
            contentType: asset.contentType,
            kind: asset.kind,
            size: asset.size,
            sync: asset.sync,
          }, null, 2),
        ].join("\n");

        const response = await ai.models.generateContent({
          model: process.env.GEMINI_TRANSCRIPT_MODEL || process.env.GEMINI_MODEL || "gemini-2.5-flash",
          contents: [{ text: prompt }, part],
          config: {
            responseMimeType: "application/json",
            responseSchema: transcriptAssistSchema,
            systemInstruction: "You are a cautious transcription assistant. Prefer uncertainty over invented words or timings.",
            temperature: 0.1,
          },
        });

        if (!response.text) {
          report = localFallbackReport(asset, "Gemini returned an empty transcript response; saved metadata-only transcript assist.");
        } else {
          report = {
            id: `${assetId}-${Date.now().toString(36)}`,
            source: "gemini-inline-media",
            generatedAt,
            assetId: String(asset.id ?? ""),
            sourceId: String(asset.sourceId ?? ""),
            originalName: String(asset.originalName ?? "Imported media"),
            contentType: String(asset.contentType ?? ""),
            kind: assetKind(asset),
            inspectedRawMedia: true,
            ...JSON.parse(response.text),
            warnings: [
              ...(warning ? [warning] : []),
              ...coerceArray<string>(JSON.parse(response.text).warnings),
            ],
          };
        }
      }
    }

    const previousReports = coerceArray<Record<string, unknown>>(currentJson.transcriptAssistReports);
    const transcriptJob = {
      id: randomUUID(),
      assetId: String(asset.id ?? assetId),
      type: "transcript",
      status: "completed",
      startedAt: generatedAt,
      completedAt: new Date().toISOString(),
      error: null,
      result: {
        reportId: report.id,
        source: report.source,
        inspectedRawMedia: report.inspectedRawMedia,
        transcriptBlockCount: Array.isArray(report.transcriptBlocks) ? report.transcriptBlocks.length : 0,
        hasTranscriptText: Boolean(report.transcriptText),
        warningCount: Array.isArray(report.warnings) ? report.warnings.length : 0,
      },
    };
    const productionJson = {
      ...currentJson,
      projectSlug,
      episodeSlug,
      transcriptAssistReports: [report, ...previousReports].slice(0, 20),
      mediaAnalysisJobs: [transcriptJob, ...mediaAnalysisJobs(currentJson)].slice(0, 60),
      lastTranscriptAssistAt: generatedAt,
      lastMediaAnalysisJobAt: transcriptJob.completedAt,
    };

    const updated = await prisma.studioEpisodeProduction.update({
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
    console.error("[episode-production transcript-assist] failed", error);
    return NextResponse.json({ ok: false, error: "Failed to generate transcript assist." }, { status: 500 });
  }
}
