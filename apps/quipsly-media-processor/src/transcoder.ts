import { createHash } from "node:crypto";
import { open, stat } from "node:fs/promises";
import { spawn } from "node:child_process";

import type {
  CaptureProxyTechnicalEvidence,
} from "@high-ground/quipsly-media-processing";

export type TranscodedProxy = {
  sizeBytes: number;
  sha256: string;
  technical: CaptureProxyTechnicalEvidence;
};

export class ProxyTranscodeError extends Error {
  readonly code: string;
  readonly retryable: boolean;

  constructor(
    code: string,
    message: string,
    retryable = false,
  ) {
    super(message);
    this.name = "ProxyTranscodeError";
    this.code = code;
    this.retryable = retryable;
  }
}

export interface CaptureProxyTranscoder {
  transcode(inputPath: string, outputPath: string): Promise<TranscodedProxy>;
  inspect?(outputPath: string): Promise<TranscodedProxy>;
}

export type FfmpegCaptureProxyOptions = {
  maxDimension?: number;
  crf?: number;
  audioBitrate?: string;
};

export class FfmpegCaptureProxyTranscoder implements CaptureProxyTranscoder {
  private readonly ffmpegPath: string;
  private readonly ffprobePath: string;
  private readonly maxDimension: number;
  private readonly crf: number;
  private readonly audioBitrate: string;

  constructor(
    ffmpegPath = process.env.QUIPSLY_FFMPEG_PATH?.trim() || "ffmpeg",
    ffprobePath = process.env.QUIPSLY_FFPROBE_PATH?.trim() || "ffprobe",
    options: FfmpegCaptureProxyOptions = {},
  ) {
    this.ffmpegPath = ffmpegPath;
    this.ffprobePath = ffprobePath;
    this.maxDimension = positiveInteger(options.maxDimension, 1920);
    this.crf = boundedInteger(options.crf, 22, 0, 51);
    this.audioBitrate = /^\d+k$/.test(options.audioBitrate || "")
      ? options.audioBitrate as string
      : "160k";
  }

  async transcode(inputPath: string, outputPath: string) {
    await runProcess(this.ffmpegPath, [
      "-hide_banner",
      "-nostdin",
      "-y",
      "-i",
      inputPath,
      "-map",
      "0:v:0",
      "-map",
      "0:a:0?",
      "-sn",
      "-dn",
      "-vf",
      `scale=w='if(gte(iw,ih),min(${this.maxDimension},iw),-2)':h='if(gte(iw,ih),-2,min(${this.maxDimension},ih))':force_divisible_by=2`,
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      String(this.crf),
      "-pix_fmt",
      "yuv420p",
      "-profile:v",
      "high",
      "-level:v",
      "4.2",
      "-g",
      "60",
      "-keyint_min",
      "30",
      "-c:a",
      "aac",
      "-b:a",
      this.audioBitrate,
      "-ar",
      "48000",
      "-movflags",
      "+faststart",
      outputPath,
    ], "ffmpeg-transcode-failed");

    return inspectTranscodedProxy(outputPath, this.ffprobePath);
  }

  async inspect(outputPath: string) {
    return inspectTranscodedProxy(outputPath, this.ffprobePath);
  }
}

function positiveInteger(value: number | undefined, fallback: number) {
  return Number.isInteger(value) && Number(value) > 0 ? Number(value) : fallback;
}

function boundedInteger(value: number | undefined, fallback: number, minimum: number, maximum: number) {
  const candidate = Number(value);
  return Number.isInteger(candidate) && candidate >= minimum && candidate <= maximum
    ? candidate
    : fallback;
}

export async function inspectTranscodedProxy(
  outputPath: string,
  ffprobePath = process.env.QUIPSLY_FFPROBE_PATH?.trim() || "ffprobe",
) {
    const probe = await runProcess(ffprobePath, [
      "-v",
      "error",
      "-show_entries",
      "format=duration:stream=index,codec_type,codec_name,pix_fmt,width,height,avg_frame_rate",
      "-of",
      "json",
      outputPath,
    ], "ffprobe-output-failed");
    const technical = technicalEvidence(JSON.parse(probe.stdout));
    if (!(await hasFastStart(outputPath))) {
      throw new ProxyTranscodeError(
        "proxy-not-faststart",
        "Generated MP4 does not place its playback index before media bytes.",
      );
    }
    const fileStat = await stat(outputPath);
    if (!fileStat.isFile() || fileStat.size <= 0) {
      throw new ProxyTranscodeError(
        "proxy-output-empty",
        "Generated proxy is empty.",
      );
    }
    return {
      sizeBytes: fileStat.size,
      sha256: await sha256File(outputPath),
      technical,
    };
}

async function runProcess(
  executable: string,
  args: string[],
  failureCode: string,
) {
  return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(executable, args, {
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout = appendBounded(stdout, chunk);
    });
    child.stderr.on("data", (chunk: string) => {
      stderr = appendBounded(stderr, chunk);
    });
    child.once("error", (error) => {
      reject(new ProxyTranscodeError(
        `${failureCode}-spawn`,
        `${executable} could not start: ${error.message}`,
      ));
    });
    child.once("close", (code, signal) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      reject(new ProxyTranscodeError(
        failureCode,
        `${executable} exited ${code ?? "without a code"}${signal ? ` after ${signal}` : ""}: ${stderr.slice(-2_000)}`,
      ));
    });
  });
}

function technicalEvidence(value: unknown): CaptureProxyTechnicalEvidence {
  const root = asRecord(value);
  const streams = Array.isArray(root.streams)
    ? root.streams.map(asRecord)
    : [];
  const video = streams.find((stream) => stream.codec_type === "video");
  const audio = streams.find((stream) => stream.codec_type === "audio");
  const format = asRecord(root.format);
  const durationSeconds = Number(format.duration);
  const width = Number(video?.width);
  const height = Number(video?.height);
  const fps = rational(video?.avg_frame_rate);
  if (
    video?.codec_name !== "h264"
    || video.pix_fmt !== "yuv420p"
    || !Number.isFinite(durationSeconds)
    || durationSeconds <= 0
    || !Number.isSafeInteger(width)
    || width <= 0
    || !Number.isSafeInteger(height)
    || height <= 0
    || !Number.isFinite(fps)
    || fps <= 0
    || (audio && audio.codec_name !== "aac")
  ) {
    throw new ProxyTranscodeError(
      "proxy-technical-verification-failed",
      "Generated proxy does not satisfy the H.264/AAC 1080p collaboration profile.",
    );
  }
  return {
    durationSeconds,
    width,
    height,
    fps,
    hasAudio: Boolean(audio),
    videoCodec: "h264",
    audioCodec: audio ? "aac" : null,
    pixelFormat: "yuv420p",
    fastStart: true,
  };
}

export async function hasFastStart(filePath: string) {
  const handle = await open(filePath, "r");
  try {
    const buffer = Buffer.alloc(4 * 1024 * 1024);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    const head = buffer.subarray(0, bytesRead);
    const moov = head.indexOf(Buffer.from("moov"));
    const mdat = head.indexOf(Buffer.from("mdat"));
    return moov > 0 && (mdat < 0 || moov < mdat);
  } finally {
    await handle.close();
  }
}

export async function sha256File(filePath: string) {
  const hash = createHash("sha256");
  const handle = await open(filePath, "r");
  try {
    const buffer = Buffer.alloc(1024 * 1024);
    let position = 0;
    while (true) {
      const { bytesRead } = await handle.read(
        buffer,
        0,
        buffer.length,
        position,
      );
      if (bytesRead === 0) break;
      hash.update(buffer.subarray(0, bytesRead));
      position += bytesRead;
    }
  } finally {
    await handle.close();
  }
  return hash.digest("hex");
}

function rational(value: unknown) {
  const [left, right] = String(value ?? "").split("/").map(Number);
  if (!Number.isFinite(left) || !Number.isFinite(right) || right === 0) {
    return Number.NaN;
  }
  return left / right;
}

function asRecord(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, any>
    : {};
}

function appendBounded(current: string, next: string) {
  return `${current}${next}`.slice(-64 * 1024);
}
