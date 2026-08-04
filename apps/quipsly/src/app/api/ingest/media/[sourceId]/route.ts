import { promises as fs } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { NextRequest, NextResponse } from "next/server";
import { getPrismaClient } from "@/lib/prisma";
import { getMediaBucket } from "@/lib/server/gcs";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";
import { authorizeStudioMediaSource } from "@/lib/server/studio-media-source-access";
import {
  authorizeConfiguredMediaVaultLocation,
  resolveAllowedLocalStudioMediaPath,
} from "@/lib/server/studio-media-location-security";

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

async function readFileRange(file: Awaited<ReturnType<typeof fs.open>>, start: number, end: number) {
  const length = end - start + 1;
  const buffer = Buffer.alloc(length);
  let offset = 0;
  while (offset < length) {
    const { bytesRead } = await file.read(buffer, offset, length - offset, start + offset);
    if (bytesRead === 0) break;
    offset += bytesRead;
  }
  return offset === length ? buffer : buffer.subarray(0, offset);
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
    Vary: "Authorization, Cookie",
  };
}

async function createGcsMediaResponse(request: NextRequest, providerSourceId: string) {
  const location = authorizeConfiguredMediaVaultLocation(providerSourceId);
  if (location.kind === "not-gcs") return null;
  if (location.kind === "rejected-gcs") {
    return NextResponse.json(
      { error: location.error },
      { status: 409, headers: { "Cache-Control": "private, no-store" } },
    );
  }

  const file = getMediaBucket(location.bucketName).file(
    location.objectName,
    location.generation ? { generation: location.generation as any } : undefined,
  );
  const [metadata] = await file.getMetadata();
  const size = Number(metadata.size ?? 0);

  if (!Number.isFinite(size) || size <= 0) {
    return NextResponse.json({ error: "GCS media is empty or unavailable" }, { status: 404 });
  }

  const contentType = metadata.contentType || inferContentType(location.objectName);
  const range = parseRangeHeader(request.headers.get("range"), size);
  const stream = file.createReadStream(range ? { start: range.start, end: range.end } : undefined);
  const body = Readable.toWeb(stream as Readable) as ReadableStream;

  if (range) {
    return new Response(body, {
      status: 206,
      headers: createMediaHeaders({
        cacheControl: "private, max-age=120",
        contentLength: range.end - range.start + 1,
        contentRange: `bytes ${range.start}-${range.end}/${size}`,
        contentType,
      }),
    });
  }

  return new Response(body, {
    status: 200,
    headers: createMediaHeaders({
      cacheControl: "private, max-age=120",
      contentLength: size,
      contentType,
    }),
  });
}

export async function GET(request: NextRequest, context: { params: Promise<{ sourceId: string }> }) {
  const { sourceId } = await context.params;

  const prisma = getPrismaClient();
  const session = await getQuipslySessionFromRequest(request);
  const releasedSource = await authorizeStudioMediaSource({
    prisma,
    actor: session?.user
      ? {
          id: session.user.id,
          email: session.user.primaryEmail,
          isStaff: session.user.isStaff,
        }
      : null,
    sourceId,
  });
  if (!releasedSource.allowed) {
    return NextResponse.json(
      {
        error: releasedSource.error,
        errorCode: releasedSource.errorCode,
      },
      {
        status: releasedSource.status,
        headers: {
          "Cache-Control": "private, no-store",
          Vary: "Authorization, Cookie",
        },
      },
    );
  }
  const source = releasedSource.source;

  if (isHttpUrl(source.url)) {
    const response = NextResponse.redirect(source.url, { status: 307 });
    response.headers.set("Cache-Control", "private, no-store");
    response.headers.set("Vary", "Authorization, Cookie");
    return response;
  }

  const localPath = source.providerSourceId;
  if (!localPath) {
    return NextResponse.json({ error: "No local media available for source" }, { status: 404 });
  }

  try {
    const gcsResponse = await createGcsMediaResponse(request, localPath);
    if (gcsResponse) return gcsResponse;

    const allowedLocalPath = await resolveAllowedLocalStudioMediaPath(localPath);
    if (!allowedLocalPath) {
      return NextResponse.json(
        { error: "This source is outside Quipsly's configured local ingest roots." },
        { status: 409, headers: { "Cache-Control": "private, no-store" } },
      );
    }

    const file = await fs.open(allowedLocalPath, "r");
    try {
      const stat = await file.stat();
      if (!stat.isFile() || stat.size <= 0) {
        return NextResponse.json({ error: "Source media is empty or is not a regular file." }, { status: 404 });
      }
      const contentType = inferContentType(allowedLocalPath);
      const range = parseRangeHeader(request.headers.get("range"), stat.size);

      if (range) {
        const data = await readFileRange(file, range.start, range.end);
        return new Response(data, {
          status: 206,
          headers: createMediaHeaders({
            contentLength: data.length,
            contentRange: `bytes ${range.start}-${range.end}/${stat.size}`,
            contentType,
          }),
        });
      }

      const data = await readFileRange(file, 0, stat.size - 1);
      return new Response(data, {
        status: 200,
        headers: createMediaHeaders({
          contentLength: data.length,
          contentType,
        }),
      });
    } finally {
      await file.close();
    }
  } catch (error: unknown) {
    console.error("[ingest media] failed", error);
    return NextResponse.json({ error: "Unable to read source media" }, { status: 404 });
  }
}
