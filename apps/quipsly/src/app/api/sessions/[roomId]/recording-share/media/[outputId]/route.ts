import { NextResponse } from "next/server";

import { getPrismaClient } from "@/lib/prisma";
import { readMobileCaptureObjectBytes } from "@/lib/server/mobile-capture-object-reader";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";
import {
  authorizeSessionRecordingShareMedia,
  SessionRecordingShareError,
} from "@/lib/server/session-recording-share";

export const runtime = "nodejs";

const MAX_AUDIO_BYTES = 1024 * 1024 * 1024;
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

export async function GET(
  request: Request,
  context: { params: Promise<{ roomId: string; outputId: string }> },
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
    const bytes = await readMobileCaptureObjectBytes({
      bucketName: asset.storageBucket,
      objectName: asset.storageObjectPath,
      expectedByteSize: Number(asset.byteSize),
      expectedSha256: asset.checksum,
      expectedGeneration: asset.storageGeneration,
      maxBytes: MAX_AUDIO_BYTES,
    });
    const url = new URL(request.url);
    const download = url.searchParams.get("download") === "1";
    const safeName = String(asset.fileName || "coaching-session.m4a").replace(
      /[^a-zA-Z0-9._-]+/g,
      "-",
    );
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        ...PRIVATE,
        "Content-Type": asset.contentType || "audio/mp4",
        "Content-Length": String(bytes.byteLength),
        "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${safeName}"`,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
