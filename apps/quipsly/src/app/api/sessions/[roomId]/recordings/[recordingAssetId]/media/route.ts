import { Readable } from "node:stream";

import { getPrismaClient } from "@/lib/prisma";
import { getMediaBucket, requireMediaBucketName } from "@/lib/server/gcs";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";
import { sessionAccessWhere } from "@/lib/server/session-access";

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

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function positiveSafeInteger(value: unknown) {
  const parsed = typeof value === "bigint" ? Number(value) : Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function exactSha256(value: unknown) {
  const normalized = text(value).toLowerCase();
  return /^[0-9a-f]{64}$/.test(normalized) ? normalized : null;
}

function exactGeneration(value: unknown) {
  const normalized = text(value);
  return /^[1-9][0-9]*$/.test(normalized) ? normalized : null;
}

function mediaContentType(value: unknown) {
  const normalized = text(value).toLowerCase();
  return /^(audio|video)\/[a-z0-9.+-]+$/.test(normalized) ? normalized : null;
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
        processingDisposition: true,
        metadataJson: true,
      },
    });
    if (
      !receipt ||
      receipt.roomId !== room.id ||
      receipt.recordingAssetId !== asset.id ||
      receipt.processingDisposition !== "RELEASED"
    ) {
      return privateJson(
        409,
        "SOURCE_NOT_RELEASED",
        "This recording is still being safely prepared.",
      );
    }

    const manifest = object(asset.localManifestJson);
    const receiptMetadata = object(receipt.metadataJson);
    const immutableBinding = object(receiptMetadata.immutableUploadBinding);
    const durableRecoveryReplica = object(
      object(receiptMetadata.recoveryAuthority).durableCaptureReplica,
    );
    const durableRecoveryStorage = object(
      object(manifest.captureSourceRecovery).durableStorage,
    );
    const size = positiveSafeInteger(asset.byteSize);
    const bindingSize = positiveSafeInteger(immutableBinding.sizeBytes);
    const sha256 = exactSha256(asset.checksum);
    const bindingSha256 = exactSha256(immutableBinding.sha256);
    const bucketName = text(asset.storageBucket);
    const objectName = text(asset.storageObjectPath);
    const bindingBucketName = text(immutableBinding.bucketName);
    const bindingObjectName = text(immutableBinding.objectName);
    const generation =
      exactGeneration(immutableBinding.generation) ??
      exactGeneration(durableRecoveryReplica.generation);
    const manifestGeneration =
      exactGeneration(manifest.storageGeneration) ??
      exactGeneration(durableRecoveryStorage.generation);
    const contentType = mediaContentType(asset.contentType);
    const exactBinding =
      asset.status === "VERIFIED" &&
      Boolean(asset.verifiedAt) &&
      manifest.exactBytesVerified === true &&
      size !== null &&
      size === bindingSize &&
      sha256 !== null &&
      sha256 === bindingSha256 &&
      bucketName.length > 0 &&
      bucketName === bindingBucketName &&
      objectName.length > 0 &&
      objectName === bindingObjectName &&
      generation !== null &&
      generation === manifestGeneration &&
      contentType !== null;
    if (!exactBinding) {
      return privateJson(
        409,
        "SOURCE_EVIDENCE_MISMATCH",
        "Quipsly stopped playback because the retained source no longer matches its verification receipt.",
      );
    }

    const configuredBucket = requireMediaBucketName();
    if (bucketName !== configuredBucket) {
      return privateJson(
        409,
        "SOURCE_VAULT_MISMATCH",
        "Quipsly stopped playback because the source is outside the configured private media vault.",
      );
    }

    const file = getMediaBucket(configuredBucket).file(objectName, {
      generation: generation as any,
    });
    const [metadata] = await file.getMetadata();
    const retainedSize = positiveSafeInteger(metadata.size);
    if (
      retainedSize !== size ||
      exactGeneration(metadata.generation) !== generation
    ) {
      return privateJson(
        409,
        "SOURCE_OBJECT_MISMATCH",
        "Quipsly stopped playback because the retained object no longer matches its immutable receipt.",
      );
    }

    const headers = mediaHeaders({ contentType, sha256, size });
    const range = byteRange(request.headers.get("range"), size);
    if (range === "invalid") {
      headers.set("Content-Range", `bytes */${size}`);
      return new Response(null, { status: 416, headers });
    }
    if (range) {
      headers.set("Content-Length", String(range.end - range.start + 1));
      headers.set("Content-Range", `bytes ${range.start}-${range.end}/${size}`);
      const body = headOnly
        ? null
        : (Readable.toWeb(
            file.createReadStream(range) as Readable,
          ) as ReadableStream);
      return new Response(body, { status: 206, headers });
    }
    headers.set("Content-Length", String(size));
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
