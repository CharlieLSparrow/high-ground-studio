import { createHash } from "node:crypto";
import { open, stat } from "node:fs/promises";
import { spawn } from "node:child_process";

import type { SessionAudioAuditionTechnicalEvidence } from "@high-ground/quipsly-media-processing";

export type SessionAudioAuditionOutput = {
  sizeBytes: number;
  sha256: string;
  technical: SessionAudioAuditionTechnicalEvidence;
};

export class SessionAudioAuditionError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly retryable = false,
  ) {
    super(message);
    this.name = "SessionAudioAuditionError";
  }
}

export interface SessionAudioAuditionEngine {
  extract(
    inputPath: string,
    outputPath: string,
  ): Promise<SessionAudioAuditionOutput>;
}

/**
 * Creates a small seekable speech-review derivative. It never replaces or
 * modifies the retained source; its only authority is exact-source audition.
 */
export class FfmpegSessionAudioAuditionEngine implements SessionAudioAuditionEngine {
  constructor(
    private readonly ffmpegPath = process.env.QUIPSLY_FFMPEG_PATH?.trim() ||
      "ffmpeg",
    private readonly ffprobePath = process.env.QUIPSLY_FFPROBE_PATH?.trim() ||
      "ffprobe",
  ) {}

  async extract(inputPath: string, outputPath: string) {
    const sourceProbe = await run(
      this.ffprobePath,
      [
        "-v",
        "error",
        "-show_entries",
        "format=duration:stream=index,codec_type",
        "-of",
        "json",
        inputPath,
      ],
      "session-audition-source-probe-failed",
    );
    await run(
      this.ffmpegPath,
      [
        "-hide_banner",
        "-nostdin",
        "-y",
        "-i",
        inputPath,
        "-map",
        "0:a:0",
        "-vn",
        "-map_metadata",
        "-1",
        "-map_chapters",
        "-1",
        "-c:a",
        "aac",
        "-profile:a",
        "aac_low",
        "-b:a",
        "128k",
        "-ar",
        "48000",
        "-ac",
        "2",
        "-movflags",
        "+faststart",
        outputPath,
      ],
      "session-audition-encode-failed",
    );

    const probe = await run(
      this.ffprobePath,
      [
        "-v",
        "error",
        "-show_entries",
        "format=duration,bit_rate:stream=codec_type,codec_name,sample_rate,channels,bit_rate",
        "-of",
        "json",
        outputPath,
      ],
      "session-audition-probe-failed",
    );
    const technical = technicalEvidence(
      JSON.parse(sourceProbe.stdout),
      JSON.parse(probe.stdout),
    );

    await run(
      this.ffmpegPath,
      [
        "-hide_banner",
        "-nostdin",
        "-v",
        "error",
        "-xerror",
        "-i",
        outputPath,
        "-map",
        "0:a:0",
        "-f",
        "null",
        "-",
      ],
      "session-audition-decode-failed",
    );

    const output = await stat(outputPath);
    if (!output.isFile() || output.size <= 0) {
      throw new SessionAudioAuditionError(
        "session-audition-output-empty",
        "Audio audition encoding produced no bytes.",
      );
    }
    return {
      sizeBytes: output.size,
      sha256: await sha256File(outputPath),
      technical,
    };
  }
}

function technicalEvidence(
  sourceValue: unknown,
  value: unknown,
): SessionAudioAuditionTechnicalEvidence {
  const sourceRoot = record(sourceValue);
  const sourceStreams = Array.isArray(sourceRoot.streams)
    ? sourceRoot.streams.map(record)
    : [];
  const sourceAudio = sourceStreams.find(
    (stream) => stream.codec_type === "audio",
  );
  const sourceDurationSeconds = Number(record(sourceRoot.format).duration);
  if (
    !sourceAudio ||
    !Number.isFinite(sourceDurationSeconds) ||
    sourceDurationSeconds <= 0
  ) {
    throw new SessionAudioAuditionError(
      "session-audition-source-audio-missing",
      "The exact Session source has no usable first audio stream or duration.",
    );
  }
  const root = record(value);
  const streams = Array.isArray(root.streams) ? root.streams.map(record) : [];
  const audio = streams.find((stream) => stream.codec_type === "audio");
  const video = streams.find((stream) => stream.codec_type === "video");
  const format = record(root.format);
  const durationSeconds = Number(format.duration);
  const bitRate = Number(audio?.bit_rate || format.bit_rate);
  const channelCount = Number(audio?.channels);
  const durationDeltaSeconds = Math.abs(
    durationSeconds - sourceDurationSeconds,
  );
  if (
    streams.length !== 1 ||
    !audio ||
    video ||
    audio.codec_name !== "aac" ||
    Number(audio.sample_rate) !== 48_000 ||
    ![1, 2].includes(channelCount) ||
    !Number.isFinite(durationSeconds) ||
    durationSeconds <= 0 ||
    !Number.isSafeInteger(bitRate) ||
    bitRate < 64_000 ||
    bitRate > 256_000 ||
    durationDeltaSeconds > 0.25
  )
    throw new SessionAudioAuditionError(
      "session-audition-technical-verification-failed",
      "Audio audition output is not a decodable 48 kHz AAC-only file.",
    );
  return {
    sourceDurationSeconds,
    durationSeconds,
    durationDeltaSeconds,
    sourceAudioOrdinal: 0,
    audioCodec: "aac",
    sampleRateHz: 48_000,
    channelCount: channelCount as 1 | 2,
    bitRate,
    hasVideo: false,
    decodedToEnd: true,
  };
}

async function sha256File(path: string) {
  const hash = createHash("sha256");
  const handle = await open(path, "r");
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

async function run(executable: string, args: string[], code: string) {
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
      stdout = `${stdout}${chunk}`.slice(-64 * 1024);
    });
    child.stderr.on("data", (chunk: string) => {
      stderr = `${stderr}${chunk}`.slice(-64 * 1024);
    });
    child.once("error", (error) =>
      reject(
        new SessionAudioAuditionError(
          `${code}-spawn`,
          `${executable} could not start: ${error.message}`,
          true,
        ),
      ),
    );
    child.once("close", (exitCode, signal) =>
      exitCode === 0
        ? resolve({ stdout, stderr })
        : reject(
            new SessionAudioAuditionError(
              code,
              `${executable} exited ${exitCode ?? "without a code"}${signal ? ` after ${signal}` : ""}: ${stderr.slice(-2_000)}`,
            ),
          ),
    );
  });
}

function record(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, any>)
    : {};
}
