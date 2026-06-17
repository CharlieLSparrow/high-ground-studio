import { NextResponse } from "next/server";
import { getPrismaClient } from "@/lib/prisma";
import { promises as fs } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { uploadMediaBuffer } from "@/lib/server/gcs";
import { ensureCurrentActorHomeNest } from "@/lib/server/home-nest";

type VideoIngestPrismaClient = ReturnType<typeof getPrismaClient> & {
  studioMediaAsset: {
    create: (input: {
      data: {
        filename: string;
        url: string;
        mimeType: string;
        sizeBytes?: bigint;
        isGlobal: boolean;
        isProxy: boolean;
        cloudProvider: string;
        rawAssetId: string;
        projects?: {
          connect: { id: string };
        };
      };
    }) => Promise<{ id: string }>;
  };
  studioProject: {
    findUnique: (input: {
      where: { id: string };
      select: { id: string };
    }) => Promise<{ id: string } | null>;
    findFirst: (input: {
      where: { slug: string };
      select: { id: string };
    }) => Promise<{ id: string } | null>;
  };
  studioVideoSource: {
    create: (input: {
      data: {
        provider: string;
        providerSourceId: string;
        url: string;
        title: string;
      };
    }) => Promise<{ id: string }>;
    update: (input: {
      where: { id: string };
      data: { url: string };
    }) => Promise<{ id: string }>;
  };
  studioEpisodeProduction: {
    findFirst: (input: {
      where: { slug: string; project: { slug: string } };
      select: { id: string; timelineJson: unknown };
    }) => Promise<{ id: string; timelineJson: unknown } | null>;
    update: (input: {
      where: { id: string };
      data: { timelineJson: unknown };
    }) => Promise<{ id: string }>;
  };
};

const INGEST_MEDIA_DIR = path.join(tmpdir(), "quipsly-media-ingest");
const SOURCE_RECORDING_PREFIX = "recordings/source";

function inferAudioFileExtension(fileName: string, mimeType: string) {
  if (mimeType.includes("video/mp4") || mimeType.includes("video/quicktime") || mimeType.includes("video/x-m4v") || mimeType.includes("video/webm")) {
    return "mp4";
  }
  if (mimeType.includes("audio/m4a") || mimeType.includes("audio/mp4")) return "m4a";
  if (mimeType.includes("audio/aac")) return "aac";
  if (mimeType.includes("audio/ogg")) return "ogg";
  if (mimeType.includes("audio/wav") || mimeType.includes("audio/x-wav")) return "wav";
  const ext = path.extname(fileName).toLowerCase().replace(".", "");
  return ext && ext.length <= 6 ? ext : "webm";
}

function sanitizeSegment(str: string) {
  return (str || "").replaceAll("..", "").replaceAll("/", "_").replaceAll("\\", "_").trim();
}

// In a real implementation, this would handle Multipart Form Data containing the video/audio chunk
// from the Quipsly Field Kit iPhone app, stream it to a temporary GCS bucket, and then
// create a corresponding StudioMediaAsset (or StudioVideoSource) record linked to a StudioProject.

export async function POST(req: Request) {
  const prisma = getPrismaClient() as VideoIngestPrismaClient;

  try {
    const formData = await req.formData();

    const file = formData.get("file") as File | null;
    const projectId = formData.get("projectId") as string | null;
    const type = formData.get("type") as string | null; // 'audio' | 'video'
    const projectSlug = formData.get("projectSlug") as string | null;
    const episodeSlug = formData.get("episodeSlug") as string | null;
    const trackId = formData.get("trackId") as string | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const mimeType = file.type || "audio/webm";
    const extension = inferAudioFileExtension(file.name || "audio", mimeType);
  const safeProject = sanitizeSegment(projectSlug ?? "project").slice(0, 60);
  const safeEpisode = sanitizeSegment(episodeSlug ?? "episode").slice(0, 80);
    const safeTrack = sanitizeSegment(trackId ?? "track").slice(0, 40) || "track";
    const fileKey = `${Date.now()}-${safeProject}-${safeEpisode}-${safeTrack}.${extension}`;
    const objectName = `${SOURCE_RECORDING_PREFIX}/${safeProject}/${safeEpisode}/oneshot-${Date.now()}/${fileKey}`;
    const localPath = path.join(INGEST_MEDIA_DIR, fileKey);

    const bytes = Buffer.from(await file.arrayBuffer());
    let provider = "gcs";
    let providerSourceId = "";
    let verifiedStorage: {
      bucketName?: string;
      objectName?: string;
      sizeBytes?: number;
      contentType?: string;
      generation?: string;
      metageneration?: string;
    } = {};

    try {
      const uploaded = await uploadMediaBuffer({
        objectName,
        buffer: bytes,
        contentType: mimeType,
        metadata: {
          episodeSlug,
          originalName: file.name,
          projectSlug,
          quipslyKind: "source-recording",
          trackId,
          type: type ?? "audio",
        },
      });
      providerSourceId = uploaded.uri;
      verifiedStorage = uploaded;
      console.log(`[Field Kit Ingest] Persisted ${file.name} (${file.size} bytes) to ${uploaded.uri}`);
    } catch (storageError) {
      if (process.env.NODE_ENV === "production") {
        console.error("[Field Kit Ingest] GCS upload failed in production", storageError);
        return NextResponse.json(
          {
            error: "Cloud recording upload failed",
            details: storageError instanceof Error ? storageError.message : String(storageError),
          },
          { status: 502 },
        );
      }
      provider = "local-dev";
      providerSourceId = localPath;
      await fs.mkdir(INGEST_MEDIA_DIR, { recursive: true });
      await fs.writeFile(localPath, bytes);
      console.warn("[Field Kit Ingest] GCS upload failed; using local fallback", storageError);
      console.log(`[Field Kit Ingest] Persisted ${file.name} (${file.size} bytes) to ${localPath}`);
    }

    // Create the database record.
    // Since StudioMediaAsset might not be in the immediate schema yet, we use StudioVideoSource as the anchor
    // for MVP.
    const source = await prisma.studioVideoSource.create({
      data: {
        provider,
        providerSourceId,
        url: `/api/ingest/media/${trackId ?? "track"}`,
        title: `Field Kit ${projectSlug ? `[${projectSlug}/${episodeSlug ?? "no-episode"}]` : ""} ${file.name}${trackId ? ` (${trackId})` : ""}`,
      }
    });

    const playbackUrl = `/api/ingest/media/${source.id}`;
    await prisma.studioVideoSource.update({
      where: { id: source.id },
      data: { url: playbackUrl },
    });

    let resolvedProjectId: string | null = null;
    if (projectId) {
      const matchedProject = await prisma.studioProject.findUnique({
        where: { id: projectId },
        select: { id: true },
      });
      resolvedProjectId = matchedProject?.id ?? null;
    }

    if (!resolvedProjectId && projectSlug) {
      const matchedProject = await prisma.studioProject.findFirst({
        where: { slug: safeProject },
        select: { id: true },
      });
      resolvedProjectId = matchedProject?.id ?? null;
    }

    if (!resolvedProjectId) {
      const homeNest = await ensureCurrentActorHomeNest(prisma as any);
      resolvedProjectId = homeNest?.id ?? null;
    }

    const mediaAsset = await prisma.studioMediaAsset.create({
      data: {
        filename: file.name,
        url: playbackUrl,
        mimeType: file.type,
        sizeBytes: BigInt(bytes.byteLength),
        isGlobal: !resolvedProjectId,
        isProxy: false,
        cloudProvider: provider,
        rawAssetId: source.id,
        ...(resolvedProjectId
          ? { projects: { connect: { id: resolvedProjectId } } }
          : {}),
      },
    });

    console.log(`[Field Kit Ingest] Created source record: ${source.id}`);

    if (projectSlug && episodeSlug) {
      try {
        const production = await prisma.studioEpisodeProduction.findFirst({
          where: { slug: episodeSlug, project: { slug: projectSlug } },
          select: { id: true, timelineJson: true },
        });

        if (production) {
          const timelineJson = (production.timelineJson && typeof production.timelineJson === "object" && !Array.isArray(production.timelineJson))
            ? (production.timelineJson as Record<string, any>)
            : {};
          
          const importedMedia = Array.isArray(timelineJson.importedMedia) ? [...timelineJson.importedMedia] : [];
          
          importedMedia.push({
            id: mediaAsset.id,
            sourceId: source.id,
            projectSlug: projectSlug,
            episodeSlug: episodeSlug,
            originalName: file.name,
            contentType: file.type || "audio/webm",
            size: bytes.byteLength,
            kind: type ?? "audio",
            bucketName: verifiedStorage.bucketName ?? "",
            objectName: verifiedStorage.objectName ?? "",
            gcsUri: provider === "gcs" ? providerSourceId : "",
            playbackUrl: `/api/ingest/media/${source.id}`,
            importedAt: new Date().toISOString(),
            source: "recorder-upload",
            sync: {
              status: "ready-to-sync",
              recordingSegments: [],
            },
            proxy: {
              status: "not-required",
            }
          });

          await prisma.studioEpisodeProduction.update({
            where: { id: production.id },
            data: {
              timelineJson: {
                ...timelineJson,
                importedMedia,
              }
            }
          });
          console.log(`[Field Kit Ingest] Bridged recording to Episode Production ${production.id}`);
        }
      } catch (err) {
        console.error("[Field Kit Ingest] Failed to bridge recording to Episode Production", err);
      }
    }

    // 3. Trigger WebSocket notification to the Local Engine / Render Farm
    // In a full implementation, we'd fire an event to a PubSub queue or WS server to tell the
    // local desktop app to start downloading and generating proxies.

      return NextResponse.json({
        success: true,
        sourceId: source.id,
        url: playbackUrl,
        mediaAssetId: mediaAsset.id,
        message: resolvedProjectId
          ? "Media successfully uploaded to the Vault and attached to a Nest."
          : "Media successfully uploaded to the global Vault.",
        projectId: projectId ?? null,
        projectSlug,
        episodeSlug,
        trackId,
      type: type ?? "audio",
      storage: provider,
      storageVerification: {
        verified: provider === "gcs",
        ...verifiedStorage,
      },
      sizeBytes: bytes.byteLength,
    });

  } catch (error: any) {
    console.error("[Field Kit API] Error:", error);
    return NextResponse.json({ error: "Failed to process mobile ingest", details: error.message }, { status: 500 });
  }
}
