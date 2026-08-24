import { Readable } from "node:stream";

import { getPrismaClient } from "@/lib/prisma";
import { getMediaBucket, requireMediaBucketName } from "@/lib/server/gcs";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";
import { sessionAccessWhere } from "@/lib/server/session-access";
import {
  sessionProtectedPlaybackBinding,
  sessionProtectedPlaybackReceiptReleased,
} from "@/lib/server/session-protected-playback";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ByteRange = { start: number; end: number };

function privateJson(status: number, code: string, error: string) {
  return Response.json(
    { ok: false, code, error, externalSideEffects: false },
    {
      status,
      headers: {
        "Cache-Control": "private, no-store",
        Vary: "Authorization, Cookie",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}

function cleanIdentifier(value: unknown) {
  if (typeof value !== "string") return "";
  const clean = value.trim();
  return clean.length > 0 && clean.length <= 240 ? clean : "";
}

function positiveSafeInteger(value: unknown) {
  const parsed = typeof value === "bigint" ? Number(value) : Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function byteRange(
  header: string | null,
  size: number,
): ByteRange | "invalid" | null {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match || (!match[1] && !match[2])) return "invalid";
  if (!match[1]) {
    const suffix = Number(match[2]);
    if (!Number.isSafeInteger(suffix) || suffix <= 0) return "invalid";
    return { start: Math.max(0, size - suffix), end: size - 1 };
  }
  const start = Number(match[1]);
  const end = match[2] ? Number(match[2]) : size - 1;
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    start < 0 ||
    end < start ||
    start >= size
  )
    return "invalid";
  return { start, end: Math.min(end, size - 1) };
}

function mediaHeaders(args: {
  contentType: string;
  sha256: string;
  size: number;
}) {
  return new Headers({
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, max-age=120",
    "Content-Type": args.contentType,
    ETag: `"sha256-${args.sha256}"`,
    Vary: "Authorization, Cookie",
    "X-Content-Type-Options": "nosniff",
    "X-Quipsly-Verified-Bytes": String(args.size),
  });
}

async function protectedSessionMediaResponse(
  request: Request,
  context: {
    params: Promise<{ roomId: string; recordingAssetId: string }>;
  },
  headOnly: boolean,
) {
  const session = await getQuipslySessionFromRequest(request);
  if (!session?.user?.id) {
    return privateJson(
      401,
      "AUTH_REQUIRED",
      "Sign in before opening a private Session recording.",
    );
  }

  const params = await context.params;
  const roomId = cleanIdentifier(params.roomId);
  const recordingAssetId = cleanIdentifier(params.recordingAssetId);
  if (!roomId || !recordingAssetId) {
    return privateJson(
      404,
      "SOURCE_NOT_FOUND",
      "This private recording is unavailable.",
    );
  }

  try {
    const prisma = getPrismaClient() as any;
    const room = await prisma.callRoom.findFirst({
      where: sessionAccessWhere(roomId, session.user),
      select: {
        id: true,
        recordingAssets: {
          where: { id: recordingAssetId },
          take: 1,
          select: {
            id: true,
            roomId: true,
            status: true,
            contentType: true,
            byteSize: true,
            storageBucket: true,
            storageObjectPath: true,
            checksum: true,
            verifiedAt: true,
            localManifestJson: true,
          },
        },
      },
    });
    const asset = room?.recordingAssets?.[0];
    if (!room || !asset || asset.roomId !== room.id) {
      return privateJson(
        404,
        "SOURCE_NOT_FOUND",
        "This private recording is unavailable.",
      );
    }

    const receipt = await prisma.mobileCaptureFinalizationReceipt.findFirst({
      where: { roomId: room.id, recordingAssetId: asset.id },
      orderBy: { updatedAt: "desc" },
      select: {
        roomId: true,
        recordingAssetId: true,
        uploadSessionId: true,
        processingDisposition: true,
        metadataJson: true,
      },
    });
    if (!sessionProtectedPlaybackReceiptReleased({
      roomId: room.id,
      recordingAssetId: asset.id,
      receipt,
    })) {
      return privateJson(
        409,
        "SOURCE_NOT_RELEASED",
        "This recording is still being safely prepared.",
      );
    }

    const binding = sessionProtectedPlaybackBinding({
      roomId: room.id,
      asset,
      receipt,
    });
    if (!binding) {
      return privateJson(
        409,
        "SOURCE_EVIDENCE_MISMATCH",
        "Quipsly stopped playback because the retained source no longer matches its verification receipt.",
      );
    }

    const configuredBucket = requireMediaBucketName();
    if (binding.bucketName !== configuredBucket) {
      return privateJson(
        409,
        "SOURCE_VAULT_MISMATCH",
        "Quipsly stopped playback because the source is outside the configured private media vault.",
      );
    }

    const file = getMediaBucket(configuredBucket).file(binding.objectName, {
      generation: binding.generation as any,
    });
    const [metadata] = await file.getMetadata();
    const retainedSize = positiveSafeInteger(metadata.size);
    if (
      retainedSize !== binding.byteSize ||
      String(metadata.generation) !== binding.generation
    ) {
      return privateJson(
        409,
        "SOURCE_OBJECT_MISMATCH",
        "Quipsly stopped playback because the retained object no longer matches its immutable receipt.",
      );
    }

    const headers = mediaHeaders({
      contentType: binding.contentType,
      sha256: binding.sha256,
      size: binding.byteSize,
    });
    const range = byteRange(request.headers.get("range"), binding.byteSize);
    if (range === "invalid") {
      headers.set("Content-Range", `bytes */${binding.byteSize}`);
      return new Response(null, { status: 416, headers });
    }
    if (range) {
      headers.set("Content-Length", String(range.end - range.start + 1));
      headers.set("Content-Range", `bytes ${range.start}-${range.end}/${binding.byteSize}`);
      const body = headOnly
        ? null
        : (Readable.toWeb(
            file.createReadStream(range) as Readable,
          ) as ReadableStream);
      return new Response(body, { status: 206, headers });
    }
    headers.set("Content-Length", String(binding.byteSize));
    const body = headOnly
      ? null
      : (Readable.toWeb(file.createReadStream() as Readable) as ReadableStream);
    return new Response(body, { status: 200, headers });
  } catch (error) {
    console.error("[session-protected-media] playback failed", error);
    return privateJson(
      503,
      "SOURCE_PLAYBACK_UNAVAILABLE",
      "This private recording could not be opened right now. Try again shortly.",
    );
  }
}

export async function GET(
  request: Request,
  context: { params: Promise<{ roomId: string; recordingAssetId: string }> },
) {
  return protectedSessionMediaResponse(request, context, false);
}

export async function HEAD(
  request: Request,
  context: { params: Promise<{ roomId: string; recordingAssetId: string }> },
) {
  return protectedSessionMediaResponse(request, context, true);
}
