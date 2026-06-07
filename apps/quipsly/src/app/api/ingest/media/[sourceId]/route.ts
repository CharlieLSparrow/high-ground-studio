import { promises as fs } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { NextRequest, NextResponse } from "next/server";
import { getPrismaClient } from "@/lib/prisma";
import { getMediaBucket, parseGcsUri } from "@/lib/server/gcs";

type VideoSourceRecord = {
  id: string;
  providerSourceId: string | null;
  url: string | null;
};
type VideoSourcePrismaClient = ReturnType<typeof getPrismaClient> & {
  studioVideoSource: {
    findUnique: (input: {
      where: { id: string };
      select: { id: true; providerSourceId: true; url: true };
    }) => Promise<VideoSourceRecord | null>;
  };
};

function inferContentType(filePath: string) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".webm") return "audio/webm";
  if (ext === ".mp4" || ext === ".mov" || ext === ".m4v" || ext === ".insv") return "video/mp4";
  if (ext === ".mkv" || ext === ".avi") return "video/x-msvideo";
  if (ext === ".m4a") return "audio/m4a";
  if (ext === ".wav") return "audio/wav";
  if (ext === ".mp3") return "audio/mpeg";
  if (ext === ".ogg") return "audio/ogg";
  if (ext === ".aac") return "audio/aac";
  return "application/octet-stream";
}

function isHttpUrl(value: string | null | undefined): value is string {
  return !!value && /^https?:\/\//.test(value);
}

function parseRangeHeader(rangeHeader: string | null, size: number) {
  if (!rangeHeader) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
  if (!match) return null;

  const rawStart = match[1];
  const rawEnd = match[2];
  const suffixLength = !rawStart && rawEnd ? Number.parseInt(rawEnd, 10) : null;
  const start = suffixLength ? Math.max(size - suffixLength, 0) : rawStart ? Number.parseInt(rawStart, 10) : 0;
  const end = suffixLength ? size - 1 : rawEnd ? Number.parseInt(rawEnd, 10) : size - 1;

  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  if (start < 0 || end < start || start >= size) return null;

  return {
    start,
    end: Math.min(end, size - 1),
  };
}

async function readFileRange(filePath: string, start: number, end: number) {
  const length = end - start + 1;
  const file = await fs.open(filePath, "r");
  try {
    const buffer = Buffer.alloc(length);
    await file.read(buffer, 0, length, start);
    return buffer;
  } finally {
    await file.close();
  }
}

function createMediaHeaders(args: {
  cacheControl?: string;
  contentLength: number;
  contentRange?: string;
  contentType: string;
}) {
  return {
    "Accept-Ranges": "bytes",
    "Cache-Control": args.cacheControl ?? "private, max-age=120",
    "Content-Length": String(args.contentLength),
    ...(args.contentRange ? { "Content-Range": args.contentRange } : {}),
    "Content-Type": args.contentType,
  };
}

async function createGcsMediaResponse(request: NextRequest, providerSourceId: string) {
  const parsed = parseGcsUri(providerSourceId);
  if (!parsed) return null;

  const file = getMediaBucket(parsed.bucketName).file(parsed.objectName);
  const [metadata] = await file.getMetadata();
  const size = Number(metadata.size ?? 0);

  if (!Number.isFinite(size) || size <= 0) {
    return NextResponse.json({ error: "GCS media is empty or unavailable" }, { status: 404 });
  }

  const contentType = metadata.contentType || inferContentType(parsed.objectName);
  const range = parseRangeHeader(request.headers.get("range"), size);
  const stream = file.createReadStream(range ? { start: range.start, end: range.end } : undefined);
  const body = Readable.toWeb(stream as Readable) as ReadableStream;

  if (range) {
    return new Response(body, {
      status: 206,
      headers: createMediaHeaders({
        cacheControl: String(metadata.cacheControl ?? "private, max-age=120"),
        contentLength: range.end - range.start + 1,
        contentRange: `bytes ${range.start}-${range.end}/${size}`,
        contentType,
      }),
    });
  }

  return new Response(body, {
    status: 200,
    headers: createMediaHeaders({
      cacheControl: String(metadata.cacheControl ?? "private, max-age=120"),
      contentLength: size,
      contentType,
    }),
  });
}

export async function GET(request: NextRequest, context: { params: Promise<{ sourceId: string }> }) {
  const { sourceId } = await context.params;

  const prisma = getPrismaClient() as VideoSourcePrismaClient;
  const source = await prisma.studioVideoSource.findUnique({
    where: { id: sourceId },
    select: { id: true, providerSourceId: true, url: true },
  });

  if (!source) {
    return NextResponse.json({ error: "Source not found" }, { status: 404 });
  }

  if (isHttpUrl(source.url)) {
    return NextResponse.redirect(source.url, { status: 307 });
  }

  const localPath = source.providerSourceId;
  if (!localPath) {
    return NextResponse.json({ error: "No local media available for source" }, { status: 404 });
  }

  try {
    const gcsResponse = await createGcsMediaResponse(request, localPath);
    if (gcsResponse) return gcsResponse;

    const stat = await fs.stat(localPath);
    const contentType = inferContentType(localPath);
    const range = parseRangeHeader(request.headers.get("range"), stat.size);

    if (range) {
      const data = await readFileRange(localPath, range.start, range.end);
      return new Response(data, {
        status: 206,
        headers: createMediaHeaders({
          contentLength: data.length,
          contentRange: `bytes ${range.start}-${range.end}/${stat.size}`,
          contentType,
        }),
      });
    }

    const data = await fs.readFile(localPath);
    return new Response(data, {
      status: 200,
      headers: createMediaHeaders({
        contentLength: data.length,
        contentType,
      }),
    });
  } catch (error: unknown) {
    console.error("[ingest media] failed", error);
    return NextResponse.json({ error: "Unable to read source media" }, { status: 404 });
  }
}
