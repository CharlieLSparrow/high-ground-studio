import { execFile as execFileCallback, spawn } from "node:child_process";
import { createReadStream, createWriteStream } from "node:fs";
import { appendFile, mkdir, open, readFile, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { promisify } from "node:util";

import {
  AUDIO_SPECTRAL_EVIDENCE_ALGORITHM,
  AUDIO_SPECTRAL_LEVELS,
  AUDIO_SPECTRAL_TILE_BYTES,
  AUDIO_SPECTRAL_TILE_HEIGHT,
  AUDIO_SPECTRAL_TILE_WIDTH,
  type AudioSpectralEvidenceResult,
} from "@high-ground/quipsly-media-processing";

import { sha256File } from "./transcoder.js";

const execFile = promisify(execFileCallback);

export type FfmpegAudioSpectralArtifact = {
  media: AudioSpectralEvidenceResult["media"];
  pyramid: AudioSpectralEvidenceResult["pyramid"];
  ffmpegVersion: string;
  detailFrameCount: number;
};

export class AudioSpectralDecodeError extends Error {
  readonly code: string;
  readonly retryable: boolean;

  constructor(code: string, message: string, retryable = false) {
    super(message);
    this.name = "AudioSpectralDecodeError";
    this.code = code;
    this.retryable = retryable;
  }
}

export class FfmpegAudioSpectralAnalyzer {
  private readonly ffmpegPath: string;
  private readonly ffprobePath: string;

  constructor(ffmpegPath = "ffmpeg", ffprobePath = "ffprobe") {
    this.ffmpegPath = ffmpegPath;
    this.ffprobePath = ffprobePath;
  }

  async analyze(inputPath: string, outputPath: string): Promise<FfmpegAudioSpectralArtifact> {
    const resolvedInput = path.resolve(inputPath);
    const resolvedOutput = path.resolve(outputPath);
    const source = await stat(resolvedInput).catch(() => null);
    if (!source?.isFile() || source.size <= 0) throw new AudioSpectralDecodeError("audio-spectral-source-unavailable", "Audio spectral source must be a non-empty file.");
    const [probe, ffmpegVersion] = await Promise.all([this.probe(resolvedInput), this.version()]);
    const detailCount = Math.ceil(probe.durationSeconds / AUDIO_SPECTRAL_LEVELS[2].tileSpanSeconds);
    const workingRoot = `${resolvedOutput}.working`;
    const detailPath = path.join(workingRoot, "detail.gray8");
    const browsePath = path.join(workingRoot, "browse.gray8");
    const overviewPath = path.join(workingRoot, "overview.gray8");
    const temporaryPack = `${resolvedOutput}.tmp`;
    await rm(workingRoot, { recursive: true, force: true });
    await rm(temporaryPack, { force: true });
    await mkdir(workingRoot, { recursive: true, mode: 0o700 });
    await mkdir(path.dirname(resolvedOutput), { recursive: true, mode: 0o700 });
    try {
      await this.renderDetail(resolvedInput, detailPath, probe.sampleRate, probe.durationSeconds);
      const detailStat = await stat(detailPath);
      if (detailStat.size !== detailCount * AUDIO_SPECTRAL_TILE_BYTES) {
        throw new AudioSpectralDecodeError("audio-spectral-clock-drift", `Spectral detail output produced ${detailStat.size / AUDIO_SPECTRAL_TILE_BYTES} tiles; ${detailCount} exact-clock tiles were required.`);
      }
      const browseCount = Math.ceil(probe.durationSeconds / AUDIO_SPECTRAL_LEVELS[1].tileSpanSeconds);
      const overviewCount = Math.ceil(probe.durationSeconds / AUDIO_SPECTRAL_LEVELS[0].tileSpanSeconds);
      await poolDetailTiles(detailPath, browsePath, 6, browseCount, detailCount);
      await poolDetailTiles(detailPath, overviewPath, 60, overviewCount, detailCount);
      await appendFiles([overviewPath, browsePath, detailPath], temporaryPack);
      const levels: AudioSpectralEvidenceResult["pyramid"]["levels"] = [];
      let byteOffset = 0;
      for (const [index, definition] of AUDIO_SPECTRAL_LEVELS.entries()) {
        const tileCount = Math.ceil(probe.durationSeconds / definition.tileSpanSeconds);
        levels.push({ id: definition.id, tileSpanSeconds: definition.tileSpanSeconds, tileCount, byteOffset });
        byteOffset += tileCount * AUDIO_SPECTRAL_TILE_BYTES;
        if (index === AUDIO_SPECTRAL_LEVELS.length - 1 && tileCount !== detailCount) throw new AudioSpectralDecodeError("audio-spectral-detail-count-invalid", "Spectral detail tile count drifted during packing.");
      }
      const packStat = await stat(temporaryPack);
      if (packStat.size !== byteOffset) throw new AudioSpectralDecodeError("audio-spectral-pack-size-invalid", "Spectral tile pack size does not match its deterministic index.");
      const packSha256 = await sha256File(temporaryPack);
      await rename(temporaryPack, resolvedOutput);
      return {
        media: {
          sampleRate: probe.sampleRate,
          channelCount: probe.channelCount,
          durationSeconds: rounded(probe.durationSeconds),
          minimumFrequencyHz: 20,
          maximumFrequencyHz: Math.floor(probe.sampleRate * 0.475),
        },
        pyramid: {
          algorithm: AUDIO_SPECTRAL_EVIDENCE_ALGORITHM,
          pixelFormat: "gray8-ffmpeg-intensity-v1",
          tileWidth: AUDIO_SPECTRAL_TILE_WIDTH,
          tileHeight: AUDIO_SPECTRAL_TILE_HEIGHT,
          tileByteLength: AUDIO_SPECTRAL_TILE_BYTES,
          frequencyScale: "logarithmic",
          frequencyOrientation: "high-to-low",
          magnitudeScale: "logarithmic-dbfs",
          dynamicRangeDb: 120,
          upperLimitDbfs: 0,
          levels,
          pack: {
            provider: "local",
            locator: resolvedOutput,
            sha256: packSha256,
            sizeBytes: packStat.size,
            generation: `sha256:${packSha256}`,
            contentType: "application/vnd.quipsly.spectral-tile-pack",
          },
        },
        ffmpegVersion,
        detailFrameCount: detailCount,
      };
    } finally {
      await rm(workingRoot, { recursive: true, force: true });
      await rm(temporaryPack, { force: true });
    }
  }

  private async renderDetail(inputPath: string, detailPath: string, sampleRate: number, durationSeconds: number) {
    const maximumFrequencyHz = Math.floor(sampleRate * 0.475);
    if (maximumFrequencyHz <= 40) throw new AudioSpectralDecodeError("audio-spectral-sample-rate-unsupported", "The decoded sample rate cannot support a logarithmic spectral view.");
    const detailSeconds = AUDIO_SPECTRAL_LEVELS[2].tileSpanSeconds;
    const filter = [
      "[0:a:0]aformat=sample_fmts=fltp:channel_layouts=mono",
      `showspectrum=s=${AUDIO_SPECTRAL_TILE_WIDTH}x${AUDIO_SPECTRAL_TILE_HEIGHT}:slide=scroll:mode=combined:color=intensity:scale=log:fscale=log:win_func=hann:overlap=0.75:fps=${AUDIO_SPECTRAL_TILE_WIDTH}/${detailSeconds}:legend=0:drange=120:limit=0:start=20:stop=${maximumFrequencyHz}`,
      "format=gray",
      `fps=1/${detailSeconds}[spectral]`,
    ].join(",");
    let stderr = "";
    const child = spawn(this.ffmpegPath, [
      "-hide_banner", "-loglevel", "error", "-i", inputPath,
      "-filter_complex", filter,
      "-map", "[spectral]", "-f", "rawvideo", "-pix_fmt", "gray", detailPath,
    ], { stdio: ["ignore", "ignore", "pipe"] });
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => { stderr = `${stderr}${chunk}`.slice(-16_384); });
    const exitCode = await new Promise<number | null>((resolve, reject) => {
      child.once("error", reject);
      child.once("close", resolve);
    }).catch((error) => {
      throw new AudioSpectralDecodeError("audio-spectral-ffmpeg-unavailable", message(error), true);
    });
    if (exitCode !== 0) {
      const noAudio = /matches no streams|does not contain any stream|Stream map.*matches no streams/i.test(stderr);
      throw new AudioSpectralDecodeError(
        noAudio ? "audio-spectral-no-audio-track" : "audio-spectral-decode-failed",
        noAudio ? "The source has no decodable audio track." : `FFmpeg spectral decode failed (${exitCode}): ${stderr.trim() || "no diagnostic"}`,
      );
    }
    const completeTileCount = Math.floor(durationSeconds / detailSeconds);
    const rendered = await stat(detailPath);
    const renderedTileCount = rendered.size / AUDIO_SPECTRAL_TILE_BYTES;
    const requiredTileCount = Math.ceil(durationSeconds / detailSeconds);
    if (!Number.isSafeInteger(renderedTileCount) || (renderedTileCount !== completeTileCount && renderedTileCount !== requiredTileCount)) {
      throw new AudioSpectralDecodeError("audio-spectral-complete-tile-drift", "FFmpeg did not produce the required complete five-second spectral clock tiles.");
    }
    const tailSeconds = durationSeconds - completeTileCount * detailSeconds;
    if (tailSeconds > 0.001 && renderedTileCount === completeTileCount) {
      const tailPath = `${detailPath}.tail`;
      let tailStderr = "";
      const tailFilter = `[0:a:0]aformat=sample_fmts=fltp:channel_layouts=mono,showspectrumpic=s=${AUDIO_SPECTRAL_TILE_WIDTH}x${AUDIO_SPECTRAL_TILE_HEIGHT}:mode=combined:color=intensity:scale=log:fscale=log:win_func=hann:legend=0:drange=120:limit=0:start=20:stop=${maximumFrequencyHz},format=gray[spectral_tail]`;
      const tail = spawn(this.ffmpegPath, [
        "-hide_banner", "-loglevel", "error", "-ss", String(completeTileCount * detailSeconds), "-t", String(tailSeconds), "-i", inputPath,
        "-filter_complex", tailFilter, "-map", "[spectral_tail]", "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "gray", tailPath,
      ], { stdio: ["ignore", "ignore", "pipe"] });
      tail.stderr.setEncoding("utf8");
      tail.stderr.on("data", (chunk: string) => { tailStderr = `${tailStderr}${chunk}`.slice(-16_384); });
      const tailExit = await new Promise<number | null>((resolve, reject) => { tail.once("error", reject); tail.once("close", resolve); }).catch((error) => {
        throw new AudioSpectralDecodeError("audio-spectral-tail-ffmpeg-unavailable", message(error), true);
      });
      if (tailExit !== 0) throw new AudioSpectralDecodeError("audio-spectral-tail-decode-failed", `FFmpeg spectral tail decode failed (${tailExit}): ${tailStderr.trim() || "no diagnostic"}`);
      const tailBytes = await readFile(tailPath);
      if (tailBytes.length !== AUDIO_SPECTRAL_TILE_BYTES) throw new AudioSpectralDecodeError("audio-spectral-tail-size-invalid", "The final partial source-clock tile is incomplete.");
      await appendFile(detailPath, tailBytes);
      await rm(tailPath, { force: true });
    }
  }

  private async probe(inputPath: string) {
    let stdout = "";
    try {
      ({ stdout } = await execFile(this.ffprobePath, [
        "-v", "error", "-select_streams", "a:0",
        "-show_entries", "stream=sample_rate,channels:format=duration", "-of", "json", inputPath,
      ], { maxBuffer: 4 * 1024 * 1024 }));
    } catch (error) {
      throw new AudioSpectralDecodeError("audio-spectral-probe-failed", message(error));
    }
    const result = JSON.parse(stdout) as { streams?: Array<Record<string, unknown>>; format?: Record<string, unknown> };
    const stream = result.streams?.[0];
    const sampleRate = Number(stream?.sample_rate);
    const channelCount = Number(stream?.channels);
    const durationSeconds = Number(result.format?.duration);
    if (!stream) throw new AudioSpectralDecodeError("audio-spectral-no-audio-track", "The source has no decodable audio track.");
    if (!Number.isSafeInteger(sampleRate) || sampleRate <= 0 || !Number.isSafeInteger(channelCount) || channelCount <= 0 || channelCount > 32 || !Number.isFinite(durationSeconds) || durationSeconds <= 0) {
      throw new AudioSpectralDecodeError("audio-spectral-probe-invalid", "Audio spectral probe returned invalid stream metadata.");
    }
    return { sampleRate, channelCount, durationSeconds };
  }

  private async version() {
    const { stdout } = await execFile(this.ffmpegPath, ["-version"], { maxBuffer: 1024 * 1024 });
    return String(stdout).split("\n")[0]?.trim() || "ffmpeg-unknown";
  }
}

async function poolDetailTiles(detailPath: string, outputPath: string, groupSize: number, expectedOutputTiles: number, detailTileCount: number) {
  const source = await open(detailPath, "r");
  const output = await open(outputPath, "w", 0o600);
  try {
    for (let outputIndex = 0; outputIndex < expectedOutputTiles; outputIndex += 1) {
      const firstDetail = outputIndex * groupSize;
      const available = Math.min(groupSize, Math.max(0, detailTileCount - firstDetail));
      if (available <= 0) throw new AudioSpectralDecodeError("audio-spectral-pyramid-gap", "Spectral pyramid contains an unbacked time range.");
      const sourceBytes = Buffer.alloc(available * AUDIO_SPECTRAL_TILE_BYTES);
      const read = await source.read(sourceBytes, 0, sourceBytes.length, firstDetail * AUDIO_SPECTRAL_TILE_BYTES);
      if (read.bytesRead !== sourceBytes.length) throw new AudioSpectralDecodeError("audio-spectral-detail-read-short", "Spectral detail evidence ended before its declared clock range.");
      const pooled = poolTileGroup(sourceBytes, available);
      const written = await output.write(pooled, 0, pooled.length, outputIndex * AUDIO_SPECTRAL_TILE_BYTES);
      if (written.bytesWritten !== pooled.length) throw new AudioSpectralDecodeError("audio-spectral-pyramid-write-short", "Spectral pyramid output was incomplete.", true);
    }
  } finally {
    await Promise.all([source.close(), output.close()]);
  }
}

export function poolTileGroup(source: Uint8Array, tileCount: number) {
  if (!Number.isSafeInteger(tileCount) || tileCount <= 0 || source.length !== tileCount * AUDIO_SPECTRAL_TILE_BYTES) throw new Error("Spectral tile pooling input is invalid.");
  const output = Buffer.alloc(AUDIO_SPECTRAL_TILE_BYTES);
  const totalColumns = tileCount * AUDIO_SPECTRAL_TILE_WIDTH;
  for (let row = 0; row < AUDIO_SPECTRAL_TILE_HEIGHT; row += 1) {
    for (let outputColumn = 0; outputColumn < AUDIO_SPECTRAL_TILE_WIDTH; outputColumn += 1) {
      const start = Math.floor(outputColumn * totalColumns / AUDIO_SPECTRAL_TILE_WIDTH);
      const end = Math.max(start + 1, Math.ceil((outputColumn + 1) * totalColumns / AUDIO_SPECTRAL_TILE_WIDTH));
      let maximum = 0;
      for (let flattenedColumn = start; flattenedColumn < end; flattenedColumn += 1) {
        const tile = Math.floor(flattenedColumn / AUDIO_SPECTRAL_TILE_WIDTH);
        const column = flattenedColumn % AUDIO_SPECTRAL_TILE_WIDTH;
        maximum = Math.max(maximum, source[tile * AUDIO_SPECTRAL_TILE_BYTES + row * AUDIO_SPECTRAL_TILE_WIDTH + column]);
      }
      output[row * AUDIO_SPECTRAL_TILE_WIDTH + outputColumn] = maximum;
    }
  }
  return output;
}

async function appendFiles(inputs: string[], outputPath: string) {
  const output = createWriteStream(outputPath, { mode: 0o600 });
  for (const input of inputs) await pipeline(createReadStream(input), output, { end: false });
  await new Promise<void>((resolve, reject) => {
    output.once("error", reject);
    output.end(resolve);
  });
}

function rounded(value: number) { return Math.round(value * 1_000_000) / 1_000_000; }
function message(error: unknown) { return error instanceof Error && error.message.trim() ? error.message : "FFmpeg spectral analysis failed."; }
