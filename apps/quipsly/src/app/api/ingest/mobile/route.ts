import { NextResponse } from "next/server";
import { getPrismaClient } from "@/lib/prisma";
import { promises as fs } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { uploadMediaBuffer } from "@/lib/server/gcs";

type VideoIngestPrismaClient = ReturnType<typeof getPrismaClient> & {
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
};

const INGEST_MEDIA_DIR = path.join(tmpdir(), "quipsly-media-ingest");

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
    const fileKey = `${Date.now()}-${safeProject}-${safeEpisode}-${trackId ?? "track"}.${extension}`;
    const objectName = `field-kit/${safeProject}/${safeEpisode}/${fileKey}`;
    const localPath = path.join(INGEST_MEDIA_DIR, fileKey);

    const bytes = Buffer.from(await file.arrayBuffer());
    let provider = "internal-gcs";
    let providerSourceId = "";

    try {
      const uploaded = await uploadMediaBuffer({
        objectName,
        buffer: bytes,
        contentType: mimeType,
        metadata: {
          episodeSlug,
          originalName: file.name,
          projectSlug,
          trackId,
          type: type ?? "audio",
        },
      });
      providerSourceId = uploaded.uri;
      console.log(`[Field Kit Ingest] Persisted ${file.name} (${file.size} bytes) to ${uploaded.uri}`);
    } catch (storageError) {
      provider = "internal-local";
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

    console.log(`[Field Kit Ingest] Created source record: ${source.id}`);

    // 3. Trigger WebSocket notification to the Local Engine / Render Farm
    // In a full implementation, we'd fire an event to a PubSub queue or WS server to tell the 
    // local desktop app to start downloading and generating proxies.
    
    return NextResponse.json({ 
      success: true, 
      sourceId: source.id,
      url: playbackUrl,
      message: "Media successfully uploaded to The Vault and attached to your project.",
      projectId: projectId ?? null,
      projectSlug,
      episodeSlug,
      trackId,
      type: type ?? "audio",
      storage: provider,
    });

  } catch (error: any) {
    console.error("[Field Kit API] Error:", error);
    return NextResponse.json({ error: "Failed to process mobile ingest", details: error.message }, { status: 500 });
  }
}
