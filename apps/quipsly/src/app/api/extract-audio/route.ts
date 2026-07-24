import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import { getPrismaClient } from "@/lib/prisma";
import { getMediaBucket } from "@/lib/server/gcs";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";
import { authorizeStudioMediaSource } from "@/lib/server/studio-media-source-access";
import {
  authorizeConfiguredMediaVaultLocation,
  resolveAllowedLocalStudioMediaPath,
} from "@/lib/server/studio-media-location-security";

export async function GET(req: NextRequest) {
  const sourceId = req.nextUrl.searchParams.get("sourceId");
  if (!sourceId) {
    return NextResponse.json({ error: "Missing sourceId" }, { status: 400 });
  }

  const prisma = getPrismaClient() as any;
  const session = await getQuipslySessionFromRequest(req);
  const authorization = await authorizeStudioMediaSource({
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
  if (!authorization.allowed) {
    return NextResponse.json(
      { error: authorization.error, errorCode: authorization.errorCode },
      {
        status: authorization.status,
        headers: {
          "Cache-Control": "private, no-store",
          Vary: "Authorization, Cookie",
        },
      },
    );
  }
  const source = authorization.source;

  if (!source.providerSourceId) {
    return NextResponse.json({ error: "Source media is unavailable." }, { status: 404 });
  }

  let inputPath = source.providerSourceId;

  // If it's a GCS URI, we need a signed URL or public URL, since ffmpeg can't read gs:// directly easily without auth
  const gcsLocation = authorizeConfiguredMediaVaultLocation(inputPath);
  if (gcsLocation.kind === "rejected-gcs") {
    return NextResponse.json({ error: gcsLocation.error }, { status: 409 });
  }
  if (gcsLocation.kind === "gcs") {
    try {
      const bucket = getMediaBucket(gcsLocation.bucketName);
      const file = bucket.file(
        gcsLocation.objectName,
        gcsLocation.generation ? { generation: gcsLocation.generation as any } : undefined,
      );
      const [url] = await file.getSignedUrl({
        version: "v4",
        action: "read",
        expires: Date.now() + 15 * 60 * 1000, // 15 mins
      });
      inputPath = url;
    } catch (err) {
      console.error("Failed to generate signed URL for GCS object", err);
      return NextResponse.json({ error: "Failed to generate signed URL for GCS" }, { status: 500 });
    }
  } else {
    const allowedLocalPath = await resolveAllowedLocalStudioMediaPath(
      inputPath,
      ["QUIPSLY_AUDIO_EXTRACTION_LOCAL_ROOTS"],
    );
    if (allowedLocalPath) {
      inputPath = allowedLocalPath;
    } else {
    // Never hand an arbitrary database URL/protocol to ffmpeg. Production
    // extraction is private-GCS only; local development paths require an
    // explicit, path-confined QUIPSLY_AUDIO_EXTRACTION_LOCAL_ROOTS entry.
      return NextResponse.json(
        { error: "Audio extraction is available only for released private-vault media." },
        { status: 409 },
      );
    }
  }

  // Use ffmpeg to extract audio and output to stdout
  const ffmpeg = spawn("ffmpeg", [
    "-nostdin",
    "-hide_banner",
    "-loglevel", "error",
    "-protocol_whitelist", "file,crypto,tcp,tls,https",
    "-i", inputPath,
    "-vn", // No video
    "-acodec", "pcm_s16le", // 16-bit PCM
    "-ar", "44100", // 44.1 kHz
    "-ac", "2", // Stereo
    "-f", "wav", // WAV format
    "pipe:1", // Output to stdout
  ]);

  // Handle errors
  ffmpeg.stderr.on("data", (data) => {
    // FFmpeg logs to stderr, we could log it for debugging
    // console.log(data.toString());
  });

  const stream = new ReadableStream({
    start(controller) {
      ffmpeg.stdout.on("data", (chunk) => {
        controller.enqueue(chunk);
      });
      ffmpeg.stdout.on("end", () => {
        controller.close();
      });
      ffmpeg.stdout.on("error", (err) => {
        console.error("FFmpeg stream error:", err);
        controller.error(err);
      });
      ffmpeg.on("error", (err) => {
        console.error("FFmpeg launch error:", err);
        controller.error(err);
      });
      ffmpeg.on("close", (code) => {
        if (code !== 0) {
          console.error(`FFmpeg process exited with code ${code}`);
          // Note: if stream is already streaming, we can't change the HTTP status code
        }
      });
    },
    cancel() {
      ffmpeg.kill("SIGKILL");
    }
  });

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "audio/wav",
      "Content-Disposition": `attachment; filename="audio-extract-${sourceId}.wav"`,
      "Cache-Control": "private, no-store",
      Vary: "Authorization, Cookie",
    },
  });
}
