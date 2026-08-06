import { execFile as execFileCallback, spawn } from "node:child_process";
import { stat } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import type { AudioPairCorrelationRange } from "@high-ground/quipsly-media-processing";

import { analyzeAudioPairCorrelation } from "./audio-pair-correlation.js";

const execFile = promisify(execFileCallback);
const SAMPLE_RATE = 16_000;
const BYTES_PER_SAMPLE = 4;
const MAXIMUM_SECONDS = 30;
const SAMPLE_TOLERANCE = 16;

export class AudioPairCorrelationDecodeError extends Error {
  constructor(readonly code: string, message: string, readonly retryable = false) {
    super(message);
    this.name = "AudioPairCorrelationDecodeError";
  }
}

export class FfmpegAudioPairCorrelationAnalyzer {
  constructor(private readonly ffmpegPath = "ffmpeg") {}

  async analyze(input: {
    referencePath: string;
    referenceRange: AudioPairCorrelationRange;
    observationPath: string;
    observationRange: AudioPairCorrelationRange;
  }) {
    const durationSeconds = input.referenceRange.sourceEndSeconds - input.referenceRange.sourceStartSeconds;
    const observationDurationSeconds = input.observationRange.sourceEndSeconds - input.observationRange.sourceStartSeconds;
    if (durationSeconds < 0.5 || durationSeconds > MAXIMUM_SECONDS || Math.abs(durationSeconds - observationDurationSeconds) > 0.001) {
      throw new AudioPairCorrelationDecodeError("audio-pair-range-invalid", "Pair analysis requires matching 0.5 to 30 second source ranges.");
    }
    const [reference, observation, ffmpegVersion] = await Promise.all([
      this.decodeRange(input.referencePath, input.referenceRange.sourceStartSeconds, input.referenceRange.sourceEndSeconds),
      this.decodeRange(input.observationPath, input.observationRange.sourceStartSeconds, input.observationRange.sourceEndSeconds),
      this.version(),
    ]);
    const expectedSamples = Math.round(durationSeconds * SAMPLE_RATE);
    const usableSamples = Math.min(reference.length, observation.length, expectedSamples);
    if (expectedSamples - usableSamples > SAMPLE_TOLERANCE) {
      throw new AudioPairCorrelationDecodeError("audio-pair-range-incomplete", "FFmpeg did not decode the complete requested pair range.");
    }
    const analysis = analyzeAudioPairCorrelation(reference.subarray(0, usableSamples), observation.subarray(0, usableSamples));
    return { ...analysis, ffmpegVersion };
  }

  private async decodeRange(inputPath: string, startSeconds: number, endSeconds: number) {
    const resolvedPath = path.resolve(inputPath);
    const source = await stat(resolvedPath).catch(() => null);
    if (!source?.isFile() || source.size <= 0) throw new AudioPairCorrelationDecodeError("audio-pair-source-unavailable", "Pair analysis requires a non-empty retained source file.");
    const durationSeconds = endSeconds - startSeconds;
    const expectedBytes = Math.round(durationSeconds * SAMPLE_RATE) * BYTES_PER_SAMPLE;
    const chunks: Buffer[] = [];
    let byteCount = 0;
    let stderr = "";
    let overflow = false;
    const filter = `atrim=start=${decimal(startSeconds)}:end=${decimal(endSeconds)},asetpts=PTS-STARTPTS,aresample=${SAMPLE_RATE}:async=0:first_pts=0`;
    const child = spawn(this.ffmpegPath, [
      "-hide_banner", "-loglevel", "error", "-i", resolvedPath,
      "-map", "0:a:0", "-af", filter, "-ac", "1", "-f", "f32le", "-acodec", "pcm_f32le", "pipe:1",
    ], { stdio: ["ignore", "pipe", "pipe"] });
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => { stderr = `${stderr}${chunk}`.slice(-16_384); });
    child.stdout.on("data", (chunk: Buffer) => {
      byteCount += chunk.length;
      if (byteCount > expectedBytes + SAMPLE_TOLERANCE * BYTES_PER_SAMPLE) {
        overflow = true;
        child.kill("SIGTERM");
        return;
      }
      chunks.push(chunk);
    });
    const exitCode = await new Promise<number | null>((resolve, reject) => {
      child.once("error", reject);
      child.once("close", resolve);
    }).catch((error) => {
      throw new AudioPairCorrelationDecodeError("audio-pair-ffmpeg-unavailable", message(error), true);
    });
    if (overflow) throw new AudioPairCorrelationDecodeError("audio-pair-range-overflow", "FFmpeg decoded more than the bounded requested pair range.");
    if (exitCode !== 0) throw new AudioPairCorrelationDecodeError("audio-pair-decode-failed", `FFmpeg pair decode failed (${exitCode}): ${stderr.trim() || "no diagnostic"}`);
    const bytes = Buffer.concat(chunks);
    if (bytes.length % BYTES_PER_SAMPLE !== 0) throw new AudioPairCorrelationDecodeError("audio-pair-partial-sample", "FFmpeg pair decode ended on a partial float sample.");
    const samples = new Float32Array(bytes.length / BYTES_PER_SAMPLE);
    for (let index = 0; index < samples.length; index += 1) {
      const sample = bytes.readFloatLE(index * BYTES_PER_SAMPLE);
      if (!Number.isFinite(sample)) throw new AudioPairCorrelationDecodeError("audio-pair-sample-invalid", "FFmpeg pair decode produced a non-finite sample.");
      samples[index] = sample;
    }
    return samples;
  }

  private async version() {
    const result = await execFile(this.ffmpegPath, ["-version"], { encoding: "utf8", maxBuffer: 64 * 1024 }).catch((error) => {
      throw new AudioPairCorrelationDecodeError("audio-pair-ffmpeg-unavailable", message(error), true);
    });
    return String(result.stdout).split(/\r?\n/, 1)[0].trim();
  }
}

function decimal(value: number) { if (!Number.isFinite(value) || value < 0) throw new AudioPairCorrelationDecodeError("audio-pair-range-invalid", "Pair source time must be finite and non-negative."); return value.toFixed(6); }
function message(error: unknown) { return error instanceof Error ? error.message : String(error); }
