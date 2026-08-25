import { createReadStream as createFileReadStream } from "node:fs";
import { Readable } from "node:stream";

import { NextResponse } from "next/server";

import { getPrismaClient } from "@/lib/prisma";
import { getMediaBucket, requireMediaBucketName } from "@/lib/server/gcs";
import {
  loadLocalMobileCaptureObject,
  MOBILE_CAPTURE_LOCAL_VAULT_BUCKET,
} from "@/lib/server/mobile-capture-local-vault";
import { privateMediaByteRange } from "@/lib/server/private-media-byte-range";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";
import {
  authorizeSessionRecordingShareMedia,
  SessionRecordingShareError,
} from "@/lib/server/session-recording-share";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PRIVATE = {
  "Cache-Control": "private, no-store",
  Vary: "Authorization, Cookie",
};

function text(value: unknown, max = 240) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function errorResponse(error: unknown) {
  const status =
    error instanceof SessionRecordingShareError ? error.status : 503;
  return NextResponse.json(
    {
      ok: false,
      code:
        error instanceof SessionRecordingShareError
          ? error.code
          : "RECORDING_MEDIA_UNAVAILABLE",
      error:
        error instanceof SessionRecordingShareError
          ? error.message
          : "Quipsly could not verify these recording bytes.",
    },
    { status, headers: PRIVATE },
  );
}

async function response(
  request: Request,
  context: { params: Promise<{ roomId: string; outputId: string }> },
  headOnly: boolean,
) {
  const session = await getQuipslySessionFromRequest(request);
  if (!session?.user?.id)
    return NextResponse.json(
      {
        ok: false,
        code: "AUTH_REQUIRED",
        error: "Sign in before playing a private Session recording.",
      },
      { status: 401, headers: PRIVATE },
    );
  const params = await context.params;
  const roomId = text(params.roomId);
  const outputId = text(params.outputId);
  try {
    const asset = await authorizeSessionRecordingShareMedia(
      getPrismaClient() as any,
      { roomId, outputId, actor: session.user },
    );
    const url = new URL(request.url);
    const download = url.searchParams.get("download") === "1";
    const safeName = String(asset.fileName || "coaching-session.m4a").replace(
      /[^a-zA-Z0-9._-]+/g,
      "-",
    );
    const size = Number(asset.byteSize);
    const headers = new Headers({
      ...PRIVATE,
      "Accept-Ranges": "bytes",
      "Content-Type": asset.contentType || "audio/mp4",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${safeName}"`,
      ETag: `"sha256-${asset.checksum}"`,
      "X-Content-Type-Options": "nosniff",
      "X-Quipsly-Verified-Bytes": String(size),
    });
    const requested = privateMediaByteRange(request.headers.get("range"), size);
    if (requested === "invalid") {
      headers.set("Content-Range", `bytes */${size}`);
      return new Response(null, { status: 416, headers });
    }

    if (asset.storageBucket !== MOBILE_CAPTURE_LOCAL_VAULT_BUCKET) {
      if (asset.storageBucket !== requireMediaBucketName()) {
        throw new SessionRecordingShareError(
          409,
          "RECORDING_SHARE_VAULT_MISMATCH",
          "This private preview is outside the configured media vault.",
        );
      }
      const file = getMediaBucket(asset.storageBucket).file(
        asset.storageObjectPath,
        { generation: asset.storageGeneration as any },
      );
      const [metadata] = await file.getMetadata();
      const custom = metadata.metadata ?? {};
      if (
        String(metadata.generation) !== asset.storageGeneration ||
        Number(metadata.size) !== size ||
        String(metadata.contentType) !== (asset.contentType || "audio/mp4") ||
        String(custom.quipslyExpectedSha256) !== asset.checksum ||
        String(custom.quipslyExpectedSizeBytes) !== String(size) ||
        String(custom.quipslyOutputPrivateUntilRelease) !== "true"
      ) {
        throw new SessionRecordingShareError(
          409,
          "RECORDING_SHARE_OBJECT_MISMATCH",
          "This private preview no longer matches its immutable render receipt.",
        );
      }
      if (requested) {
        headers.set(
          "Content-Length",
          String(requested.end - requested.start + 1),
        );
        headers.set(
          "Content-Range",
          `bytes ${requested.start}-${requested.end}/${size}`,
        );
        const body = headOnly
          ? null
          : (Readable.toWeb(
              file.createReadStream(requested) as Readable,
            ) as ReadableStream);
        return new Response(body, { status: 206, headers });
      }
      headers.set("Content-Length", String(size));
      const body = headOnly
        ? null
        : (Readable.toWeb(
            file.createReadStream() as Readable,
          ) as ReadableStream);
      return new Response(body, { status: 200, headers });
    }

    const local = await loadLocalMobileCaptureObject(
      asset.storageObjectPath,
    );
    if (
      !local ||
      local.generation !== asset.storageGeneration ||
      local.sizeBytes !== size ||
      local.contentType !== asset.contentType ||
      local.customMetadata.quipslyExpectedSha256 !== asset.checksum ||
      local.customMetadata.quipslyExpectedSizeBytes !== String(size) ||
      !/^session-recording-share-v[1-3]$/.test(
        local.customMetadata.quipslyKind || "",
      )
    ) {
      throw new SessionRecordingShareError(
        409,
        "RECORDING_SHARE_OBJECT_MISMATCH",
        "This private preview no longer matches its immutable local render receipt.",
      );
    }
    if (requested) {
      headers.set(
        "Content-Length",
        String(requested.end - requested.start + 1),
      );
      headers.set(
        "Content-Range",
        `bytes ${requested.start}-${requested.end}/${size}`,
      );
      const body = headOnly
        ? null
        : (Readable.toWeb(
            createFileReadStream(local.objectPath, requested),
          ) as ReadableStream);
      return new Response(body, { status: 206, headers });
    }
    headers.set("Content-Length", String(size));
    const body = headOnly
      ? null
      : (Readable.toWeb(
          createFileReadStream(local.objectPath),
        ) as ReadableStream);
    return new Response(body, { status: 200, headers });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function GET(
  request: Request,
  context: { params: Promise<{ roomId: string; outputId: string }> },
) {
  return response(request, context, false);
}

export async function HEAD(
  request: Request,
  context: { params: Promise<{ roomId: string; outputId: string }> },
) {
  return response(request, context, true);
}
