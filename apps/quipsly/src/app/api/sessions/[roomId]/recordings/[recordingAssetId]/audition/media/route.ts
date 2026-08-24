import { Readable } from "node:stream";

import { getPrismaClient } from "@/lib/prisma";
import { getMediaBucket, requireMediaBucketName } from "@/lib/server/gcs";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";
import {
  SessionAudioAuditionError,
  resolveSessionAudioAuditionBinding,
} from "@/lib/server/session-audio-audition";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Range = { start: number; end: number };

function json(status: number, code: string, error: string) {
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

function range(header: string | null, size: number): Range | "invalid" | null {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match || (!match[1] && !match[2])) return "invalid";
  if (!match[1]) {
    const suffix = Number(match[2]);
    return Number.isSafeInteger(suffix) && suffix > 0
      ? { start: Math.max(0, size - suffix), end: size - 1 }
      : "invalid";
  }
  const start = Number(match[1]);
  const end = match[2] ? Number(match[2]) : size - 1;
  return Number.isSafeInteger(start) &&
    Number.isSafeInteger(end) &&
    start >= 0 &&
    end >= start &&
    start < size
    ? { start, end: Math.min(end, size - 1) }
    : "invalid";
}

async function response(
  request: Request,
  context: { params: Promise<{ roomId: string; recordingAssetId: string }> },
  head: boolean,
) {
  const session = await getQuipslySessionFromRequest(request);
  if (!session?.user?.id)
    return json(
      401,
      "AUTH_REQUIRED",
      "Sign in before opening private Session audio.",
    );
  const { roomId, recordingAssetId } = await context.params;
  try {
    const { result } = await resolveSessionAudioAuditionBinding({
      prisma: getPrismaClient() as any,
      roomId,
      recordingAssetId,
      actor: {
        id: session.user.id,
        email: session.user.email,
        primaryEmail: session.user.primaryEmail,
      },
    });
    if (result.output.bucketName !== requireMediaBucketName())
      return json(
        409,
        "AUDITION_VAULT_MISMATCH",
        "The review copy is outside the configured private media vault.",
      );
    const file = getMediaBucket(result.output.bucketName).file(
      result.output.objectName,
      { generation: result.output.generation as any },
    );
    const [metadata] = await file.getMetadata();
    const customMetadata = metadata.metadata ?? {};
    if (
      String(metadata.generation) !== result.output.generation ||
      Number(metadata.size) !== result.output.sizeBytes ||
      String(metadata.contentType) !== result.output.contentType ||
      String(metadata.crc32c) !== result.output.crc32c ||
      String(customMetadata.quipslyOutputSha256) !== result.output.sha256 ||
      String(customMetadata.quipslySourceSha256) !== result.source.sha256 ||
      String(customMetadata.quipslySourceGeneration) !==
        result.source.generation
    ) {
      return json(
        409,
        "AUDITION_OBJECT_MISMATCH",
        "The review copy no longer matches its immutable worker receipt.",
      );
    }
    const headers = new Headers({
      "Accept-Ranges": "bytes",
      "Cache-Control": "private, max-age=120",
      "Content-Type": "audio/mp4",
      ETag: `"sha256-${result.output.sha256}"`,
      Vary: "Authorization, Cookie",
      "X-Content-Type-Options": "nosniff",
      "X-Quipsly-Verified-Bytes": String(result.output.sizeBytes),
      "X-Quipsly-Source-Sha256": result.source.sha256,
    });
    const requested = range(
      request.headers.get("range"),
      result.output.sizeBytes,
    );
    if (requested === "invalid") {
      headers.set("Content-Range", `bytes */${result.output.sizeBytes}`);
      return new Response(null, { status: 416, headers });
    }
    if (requested) {
      headers.set(
        "Content-Length",
        String(requested.end - requested.start + 1),
      );
      headers.set(
        "Content-Range",
        `bytes ${requested.start}-${requested.end}/${result.output.sizeBytes}`,
      );
      const body = head
        ? null
        : (Readable.toWeb(
            file.createReadStream(requested) as Readable,
          ) as ReadableStream);
      return new Response(body, { status: 206, headers });
    }
    headers.set("Content-Length", String(result.output.sizeBytes));
    const body = head
      ? null
      : (Readable.toWeb(file.createReadStream() as Readable) as ReadableStream);
    return new Response(body, { status: 200, headers });
  } catch (error) {
    if (error instanceof SessionAudioAuditionError)
      return json(error.status, error.code, error.message);
    console.error("[session-audio-audition-media] playback failed", error);
    return json(
      503,
      "AUDITION_PLAYBACK_UNAVAILABLE",
      "The compact audio review copy could not be opened right now.",
    );
  }
}

export async function GET(
  request: Request,
  context: { params: Promise<{ roomId: string; recordingAssetId: string }> },
) {
  return response(request, context, false);
}
export async function HEAD(
  request: Request,
  context: { params: Promise<{ roomId: string; recordingAssetId: string }> },
) {
  return response(request, context, true);
}
