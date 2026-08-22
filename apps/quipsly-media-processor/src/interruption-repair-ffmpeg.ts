import { createHash } from "node:crypto";
import { open, stat } from "node:fs/promises";
import { spawn } from "node:child_process";

import type {
  InterruptionRepairTechnicalEvidence,
} from "@high-ground/quipsly-media-processing";

export type RepairedContainer = {
  sizeBytes: number;
  sha256: string;
  technical: InterruptionRepairTechnicalEvidence;
};

export class InterruptionRepairError extends Error {
  readonly code: string;
  readonly retryable: boolean;

  constructor(code: string, message: string, retryable = false) {
    super(message);
    this.name = "InterruptionRepairError";
    this.code = code;
    this.retryable = retryable;
  }
}

export interface InterruptionRepairEngine {
  repair(inputPath: string, outputPath: string): Promise<RepairedContainer>;
}

/**
 * Rebuilds WebM container metadata without re-encoding audio/video packets.
 * The original recovered bytes remain immutable source truth; this derivative
 * exists solely to make the protected packets seekable and editor-safe.
 */
export class FfmpegInterruptionRepairEngine implements InterruptionRepairEngine {
  private readonly ffmpegPath: string;
  private readonly ffprobePath: string;

  constructor(
    ffmpegPath = process.env.QUIPSLY_FFMPEG_PATH?.trim() || "ffmpeg",
    ffprobePath = process.env.QUIPSLY_FFPROBE_PATH?.trim() || "ffprobe",
  ) {
    this.ffmpegPath = ffmpegPath;
    this.ffprobePath = ffprobePath;
  }

  async repair(inputPath: string, outputPath: string) {
    await runProcess(this.ffmpegPath, [
      "-hide_banner",
      "-nostdin",
      "-y",
      "-fflags",
      "+genpts",
      "-i",
      inputPath,
      "-map",
      "0",
      "-map_metadata",
      "0",
      "-map_chapters",
      "-1",
      "-c",
      "copy",
      outputPath,
    ], "interruption-remux-failed");

    const probe = await runProcess(this.ffprobePath, [
      "-v",
      "error",
      "-show_entries",
      "format=duration:stream=index,codec_type,codec_name",
      "-of",
      "json",
      outputPath,
    ], "interruption-repair-probe-failed");
    const technical = technicalEvidence(JSON.parse(probe.stdout));

    // A parsable index is not sufficient. Decode every retained packet so a
    // corrupt tail cannot be promoted merely because ffprobe read its header.
    await runProcess(this.ffmpegPath, [
      "-hide_banner",
      "-nostdin",
      "-v",
      "error",
      "-xerror",
      "-i",
      outputPath,
      "-map",
      "0:a?",
      "-map",
      "0:v?",
      "-f",
      "null",
      "-",
    ], "interruption-repair-decode-failed");

    const outputStat = await stat(outputPath);
    if (!outputStat.isFile() || outputStat.size <= 0) {
      throw new InterruptionRepairError(
        "interruption-repair-output-empty",
        "Lossless interruption repair produced no media bytes.",
      );
    }
    return {
      sizeBytes: outputStat.size,
      sha256: await sha256File(outputPath),
      technical,
    };
  }
}

function technicalEvidence(value: unknown): InterruptionRepairTechnicalEvidence {
  const root = record(value);
  const streams = Array.isArray(root.streams) ? root.streams.map(record) : [];
  const audio = streams.find((stream) => stream.codec_type === "audio");
  const video = streams.find((stream) => stream.codec_type === "video");
  const durationSeconds = Number(record(root.format).duration);
  if (
    streams.length === 0
    || (!audio && !video)
    || !Number.isFinite(durationSeconds)
    || durationSeconds <= 0
  ) {
    throw new InterruptionRepairError(
      "interruption-repair-technical-verification-failed",
      "Repaired WebM is missing playable audio/video streams or a valid duration.",
    );
  }
  return {
    durationSeconds,
    streamCount: streams.length,
    hasAudio: Boolean(audio),
    hasVideo: Boolean(video),
    audioCodec: audio ? text(audio.codec_name) || null : null,
    videoCodec: video ? text(video.codec_name) || null : null,
    decodedToEnd: true,
    packetPayloadReencoded: false,
  };
}

async function sha256File(filePath: string) {
  const hash = createHash("sha256");
  const handle = await open(filePath, "r");
  try {
    const buffer = Buffer.alloc(1024 * 1024);
    let position = 0;
    while (true) {
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, position);
      if (bytesRead === 0) break;
      hash.update(buffer.subarray(0, bytesRead));
      position += bytesRead;
    }
  } finally {
    await handle.close();
  }
  return hash.digest("hex");
}

async function runProcess(executable: string, args: string[], failureCode: string) {
  return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(executable, args, {
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => { stdout = bounded(stdout, chunk); });
    child.stderr.on("data", (chunk: string) => { stderr = bounded(stderr, chunk); });
    child.once("error", (error) => reject(new InterruptionRepairError(
      `${failureCode}-spawn`,
      `${executable} could not start: ${error.message}`,
      true,
    )));
    child.once("close", (code, signal) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      reject(new InterruptionRepairError(
        failureCode,
        `${executable} exited ${code ?? "without a code"}${signal ? ` after ${signal}` : ""}: ${stderr.slice(-2_000)}`,
      ));
    });
  });
}

function record(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, any>
    : {};
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function bounded(current: string, next: string) {
  return `${current}${next}`.slice(-64 * 1024);
}
