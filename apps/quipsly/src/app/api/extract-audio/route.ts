import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import { getPrismaClient } from "@/lib/prisma";
import { parseGcsUri, getMediaBucket } from "@/lib/server/gcs";

export async function GET(req: NextRequest) {
  const sourceId = req.nextUrl.searchParams.get("sourceId");
  if (!sourceId) {
    return NextResponse.json({ error: "Missing sourceId" }, { status: 400 });
  }

  const prisma = getPrismaClient() as any;
  const source = await prisma.studioVideoSource.findUnique({
    where: { id: sourceId },
    select: { id: true, providerSourceId: true, url: true },
  });

  if (!source || !source.providerSourceId) {
    return NextResponse.json({ error: "Source not found" }, { status: 404 });
  }

  let inputPath = source.providerSourceId;

  // If it's a GCS URI, we need a signed URL or public URL, since ffmpeg can't read gs:// directly easily without auth
  const gcsParsed = parseGcsUri(inputPath);
  if (gcsParsed) {
    try {
      const bucket = getMediaBucket(gcsParsed.bucketName);
      const file = bucket.file(gcsParsed.objectName);
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
  }

  // Use ffmpeg to extract audio and output to stdout
  const ffmpeg = spawn("ffmpeg", [
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
    },
  });
}
