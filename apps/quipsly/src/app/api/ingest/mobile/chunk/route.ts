import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { getPrismaClient } from "@/lib/prisma";
import { uploadMediaBuffer } from "@/lib/server/gcs";
import { ensureCurrentActorHomeNest } from "@/lib/server/home-nest";

type MobileIngestPrismaClient = ReturnType<typeof getPrismaClient> & {
  studioMediaAsset: {
    create: (input: {
      data: {
        filename: string;
        url: string;
        mimeType: string | null;
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
  };
};

type SessionManifest = {
  sessionId: string;
  fileName: string;
  projectSlug: string;
  episodeSlug: string;
  sourceType: string;
  trackId?: string | null;
  contentType?: string | null;
  totalChunks: number;
  receivedChunks: number[];
  startedAt?: string | null;
  stoppedAt?: string | null;
  createdAt: string;
};

const INGEST_ROOT = path.join(tmpdir(), "quipsly-mobile-chunk-ingest");
const MAX_PAYLOAD_CHUNK_BYTES = 120 * 1024 * 1024;

function sanitizeSegment(value: string) {
  return (value || "")
    .replaceAll("..", "")
    .replaceAll("/", "_")
    .replaceAll("\\", "_")
    .trim();
}

function normalizeHeaderInt(raw: string | null): number | null {
  if (!raw) return null;
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value) || value < 0) return null;
  return value;
}

function uniqueInts(values: number[]) {
  const seen = new Set<number>();
  const out: number[] = [];
  for (const value of values) {
    if (seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}

function inferExtension(fileName: string, mimeType: string | null) {
  if (mimeType?.includes("video/mp4") || mimeType?.includes("video/quicktime") || mimeType?.includes("video/x-m4v") || mimeType?.includes("video/webm")) {
    return "mp4";
  }
  if (mimeType?.includes("audio/m4a") || mimeType?.includes("audio/mp4")) return "m4a";
  if (mimeType?.includes("audio/aac")) return "aac";
  if (mimeType?.includes("audio/ogg")) return "ogg";
  if (mimeType?.includes("audio/wav") || mimeType?.includes("audio/x-wav")) return "wav";
  const ext = path.extname(fileName).toLowerCase().replace(".", "");
  return ext && ext.length <= 8 ? ext : "mp4";
}

function safeJsonError(message: string, status: number, details: string | null = null) {
  return NextResponse.json(
    { error: message, ...(details ? { details } : {}) },
    { status }
  );
}

async function loadManifest(sessionDir: string): Promise<SessionManifest | null> {
  try {
    const raw = await fs.readFile(path.join(sessionDir, "manifest.json"), "utf8");
    return JSON.parse(raw) as SessionManifest;
  } catch {
    return null;
  }
}

async function saveManifest(sessionDir: string, manifest: SessionManifest) {
  await fs.mkdir(sessionDir, { recursive: true });
  await fs.writeFile(
    path.join(sessionDir, "manifest.json"),
    JSON.stringify({ ...manifest, receivedChunks: uniqueInts(manifest.receivedChunks) })
  );
}

async function cleanupSession(sessionDir: string) {
  try {
    await fs.rm(sessionDir, { recursive: true, force: true });
  } catch {
    // no-op cleanup failure
  }
}

export async function POST(request: Request) {
  try {
    const sessionId = request.headers.get("X-Session-ID");
    const chunkIndex = normalizeHeaderInt(request.headers.get("X-Chunk-Index"));
    const totalChunks = normalizeHeaderInt(request.headers.get("X-Total-Chunks"));

    if (!sessionId) {
      return safeJsonError("Missing X-Session-ID", 400);
    }
    if (chunkIndex === null) {
      return safeJsonError("Missing or invalid X-Chunk-Index", 400);
    }
    if (totalChunks === null || totalChunks === 0) {
      return safeJsonError("Missing or invalid X-Total-Chunks", 400);
    }
    if (chunkIndex >= totalChunks) {
      return safeJsonError("Chunk index is out of range", 400);
    }

    const chunkSize = await request.arrayBuffer();
    if (chunkSize.byteLength === 0) {
      return safeJsonError("Empty chunk payload", 400);
    }
    if (chunkSize.byteLength > MAX_PAYLOAD_CHUNK_BYTES) {
      return safeJsonError("Chunk too large", 413);
    }

    const projectSlug = request.headers.get("X-Project-Slug") ?? "";
    const episodeSlug = request.headers.get("X-Episode-Slug") ?? "";
    const sourceType = request.headers.get("X-Source-Type") ?? "video";
    const trackId = request.headers.get("X-Track-Id");
    const fileName = request.headers.get("X-File-Name")?.trim() || "quipsly-upload.bin";
    const contentType = request.headers.get("Content-Type") || "video/mp4";
    const startedAt = request.headers.get("X-Recording-Started-At");
    const stoppedAt = request.headers.get("X-Recording-Stopped-At");

    const safeProject = sanitizeSegment(projectSlug) || "project";
    const safeEpisode = sanitizeSegment(episodeSlug) || "episode";
    const safeTrack = sanitizeSegment(trackId || "track");
    const safeFile = sanitizeSegment(fileName).slice(0, 100);
    const extension = inferExtension(safeFile, contentType);

    const sessionDir = path.join(INGEST_ROOT, sessionId);
    const chunkPath = path.join(sessionDir, `chunk-${chunkIndex}.bin`);
    await fs.mkdir(sessionDir, { recursive: true });

    const prisma = getPrismaClient() as MobileIngestPrismaClient;
    const existingManifest = await loadManifest(sessionDir);
    const manifest: SessionManifest = existingManifest ?? {
      sessionId,
      fileName: safeFile,
      projectSlug: safeProject,
      episodeSlug: safeEpisode,
      sourceType,
      trackId,
      contentType,
      totalChunks,
      receivedChunks: [],
      startedAt,
      stoppedAt,
      createdAt: new Date().toISOString(),
    };

    if (manifest.totalChunks !== totalChunks) {
      return safeJsonError("Session chunk total mismatch", 409);
    }

    await fs.writeFile(chunkPath, Buffer.from(chunkSize));
    if (!manifest.receivedChunks.includes(chunkIndex)) {
      manifest.receivedChunks.push(chunkIndex);
    }
    manifest.receivedChunks = uniqueInts(manifest.receivedChunks);
    manifest.contentType = contentType;
    await saveManifest(sessionDir, manifest);

    // Not all chunks received yet: return a normal progress ack.
    if (manifest.receivedChunks.length < totalChunks) {
      return NextResponse.json({
        success: true,
        stage: "chunk",
        sessionId,
        chunkIndex,
        totalChunks,
      });
    }

    // On final chunk: ensure all chunk indexes are present before assembly.
    const expected = Array.from({ length: totalChunks }, (_, i) => i);
    const hasMissingChunk = expected.some((index) => !manifest.receivedChunks.includes(index));
    if (hasMissingChunk) {
      return safeJsonError("Chunk set incomplete", 409);
    }

    const assembledPath = path.join(sessionDir, `assembled.${extension}`);
    const output = await fs.open(assembledPath, "w");
    try {
      for (let i = 0; i < totalChunks; i++) {
        const data = await fs.readFile(path.join(sessionDir, `chunk-${i}.bin`));
        await output.appendFile(data);
      }
    } finally {
      await output.close();
    }

    const assembledBytes = await fs.readFile(assembledPath);
    const assembledSize = assembledBytes.byteLength;
    const safeName = `${safeTrack}-${Date.now()}-${safeProject}-${safeEpisode}.${extension}`;
    const objectName = `field-kit/${safeProject}/${safeEpisode}/${safeName}`;

    const baseFilePath = path.join(INGEST_ROOT, "raw", safeName);
    let provider = "internal-local";
    let providerSourceId = assembledPath;
    try {
      const uploaded = await uploadMediaBuffer({
        objectName,
        buffer: assembledBytes,
        contentType: contentType || "video/mp4",
        metadata: {
          episodeSlug,
          fileName: safeName,
          projectSlug: safeProject,
          sourceType,
          trackId: safeTrack,
          startedAt: startedAt ?? "",
          stoppedAt: stoppedAt ?? "",
        },
      });
      provider = "gcs";
      providerSourceId = uploaded.uri;
    } catch {
      await fs.mkdir(path.dirname(baseFilePath), { recursive: true });
      await fs.writeFile(baseFilePath, assembledBytes);
      providerSourceId = baseFilePath;
    }

    const project = manifest.projectSlug
      ? await prisma.studioProject.findFirst({ where: { slug: manifest.projectSlug }, select: { id: true } })
      : null;
    const homeNest = project ? null : await ensureCurrentActorHomeNest(prisma as any);
    const attachmentProjectId = project?.id ?? homeNest?.id ?? null;

    const source = await prisma.studioVideoSource.create({
      data: {
        provider,
        providerSourceId,
        url: "/api/ingest/media/pending",
        title: `Field Kit ${manifest.projectSlug}/${manifest.episodeSlug} ${sourceType}`,
      },
    });

    await prisma.studioVideoSource.update({
      where: { id: source.id },
      data: { url: `/api/ingest/media/${source.id}` },
    });

    const mediaAsset = await prisma.studioMediaAsset.create({
      data: {
        filename: safeName,
        url: `/api/ingest/media/${source.id}`,
        mimeType: manifest.contentType ?? contentType,
        isGlobal: !Boolean(attachmentProjectId),
        isProxy: true,
        cloudProvider: provider,
        rawAssetId: source.id,
        ...(attachmentProjectId ? { projects: { connect: { id: attachmentProjectId } } } : {}),
      },
    });

    await cleanupSession(sessionDir);
    return NextResponse.json({
      success: true,
      stage: "done",
      mediaAssetId: mediaAsset.id,
      sourceId: source.id,
      url: `/api/ingest/media/${source.id}`,
      projectSlug,
      episodeSlug,
      trackId,
      provider,
      sizeBytes: assembledSize,
    });
  } catch (error: unknown) {
    console.error("[Field Kit Mobile Chunk API] Upload chunk failed", error);
    return safeJsonError("Upload chunk processing failed", 500, error instanceof Error ? error.message : null);
  }
}
