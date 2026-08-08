import { execFile } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import type {
  EpisodeProgramRenderJob,
} from "@high-ground/quipsly-media-processing";

import {
  FfmpegEpisodeRenderProofRenderer,
  type EpisodeRenderProofTechnical,
} from "./episode-render-proof-ffmpeg.js";

const execFileAsync = promisify(execFile);

export class EpisodeProgramRenderFfmpegError extends Error {
  constructor(readonly code: string, message: string, readonly retryable: boolean) {
    super(message);
    this.name = "EpisodeProgramRenderFfmpegError";
  }
}

export type EpisodeProgramRenderTechnical = EpisodeRenderProofTechnical & {
  renderedChunkCount: number;
};

export class FfmpegEpisodeProgramRenderer {
  constructor(
    private readonly chunkRenderer = new FfmpegEpisodeRenderProofRenderer(),
    private readonly ffmpeg = "ffmpeg",
    private readonly ffprobe = "ffprobe",
  ) {}

  async render(
    job: EpisodeProgramRenderJob,
    outputPath: string,
    afterChunk: (renderedChunkCount: number) => Promise<void> = async () => undefined,
  ): Promise<EpisodeProgramRenderTechnical> {
    const chunkRoot = outputPath.replace(/\.mp4$/, ".chunks");
    await rm(chunkRoot, { recursive: true, force: true });
    await mkdir(chunkRoot, { recursive: true, mode: 0o700 });
    const chunkPaths: string[] = [];
    let ffmpegVersion = "ffmpeg";
    try {
      for (let index = 0; index < job.chunks.length; index += 1) {
        const chunk = job.chunks[index]!;
        const chunkPath = path.join(chunkRoot, `${String(index).padStart(5, "0")}-${chunk.id}.mp4`);
        const technical = await this.chunkRenderer.render({
          sources: job.sources,
          proof: {
            sequenceStartSeconds: chunk.sequenceStartSeconds,
            sequenceEndSeconds: chunk.sequenceEndSeconds,
            decisionId: chunk.decisionId,
            decisionKind: chunk.decisionKind,
            visualLaneIds: chunk.visualLaneIds,
            clipLaneId: chunk.clipLaneId,
            audioLaneIds: chunk.audioLaneIds,
          },
        }, chunkPath);
        ffmpegVersion = technical.ffmpegVersion;
        chunkPaths.push(chunkPath);
        await afterChunk(index + 1);
      }

      const concatPath = path.join(chunkRoot, "program.ffconcat");
      await writeFile(
        concatPath,
        ["ffconcat version 1.0", ...chunkPaths.map((chunkPath) => `file '${escapeConcatPath(chunkPath)}'`)].join("\n") + "\n",
        { encoding: "utf8", mode: 0o600 },
      );
      await this.execute(
        this.ffmpeg,
        [
          "-hide_banner",
          "-loglevel", "error",
          "-y",
          "-f", "concat",
          "-safe", "0",
          "-i", concatPath,
          "-c", "copy",
          "-movflags", "+faststart",
          outputPath,
        ],
        Math.max(180_000, Math.min(7_200_000, job.program.outputDurationSeconds * 4_000)),
        "episode-program-render-concat-failed",
      );
      const output = await this.probe(outputPath);
      const video = output.streams.find((stream) => stream.codec_type === "video");
      const audio = output.streams.find((stream) => stream.codec_type === "audio");
      const durationSeconds = Number(output.format.duration ?? video?.duration ?? audio?.duration);
      if (
        !video
        || video.width !== 1280
        || video.height !== 720
        || !Number.isFinite(durationSeconds)
        || Math.abs(durationSeconds - job.program.outputDurationSeconds) > 0.25
      ) {
        throw new EpisodeProgramRenderFfmpegError(
          "episode-program-render-output-invalid",
          "The assembled program review does not match its frozen duration or 1280x720 output profile.",
          false,
        );
      }
      await this.execute(
        this.ffmpeg,
        ["-v", "error", "-i", outputPath, "-f", "null", "-"],
        Math.max(120_000, Math.min(7_200_000, durationSeconds * 5_000)),
        "episode-program-render-complete-decode-failed",
      );
      return {
        durationSeconds,
        width: 1280,
        height: 720,
        fps: frameRate(video.avg_frame_rate || video.r_frame_rate),
        videoCodec: String(video.codec_name || "unknown"),
        audioCodec: audio?.codec_name ? String(audio.codec_name) : null,
        completeDecode: true,
        fastStart: true,
        ffmpegVersion,
        renderedChunkCount: chunkPaths.length,
      };
    } catch (error) {
      if (error instanceof EpisodeProgramRenderFfmpegError) throw error;
      const row = error as { code?: string; message?: string; retryable?: boolean };
      throw new EpisodeProgramRenderFfmpegError(
        row.code || "episode-program-render-chunk-failed",
        row.message || "A program render chunk failed.",
        row.retryable !== false,
      );
    } finally {
      await rm(chunkRoot, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  private async probe(locator: string): Promise<ProbeResult> {
    const result = await this.execute(
      this.ffprobe,
      ["-v", "error", "-show_streams", "-show_format", "-of", "json", locator],
      30_000,
      "episode-program-render-probe-failed",
    );
    try {
      const parsed = JSON.parse(result.stdout) as ProbeResult;
      if (!Array.isArray(parsed.streams) || !parsed.format) throw new Error("missing streams");
      return parsed;
    } catch {
      throw new EpisodeProgramRenderFfmpegError(
        "episode-program-render-probe-invalid",
        "FFprobe returned invalid program output metadata.",
        false,
      );
    }
  }

  private async execute(command: string, args: string[], timeout: number, code: string) {
    try {
      return await execFileAsync(command, args, { timeout, maxBuffer: 4 * 1024 * 1024 });
    } catch (error) {
      const row = error as { stderr?: string; message?: string; killed?: boolean };
      throw new EpisodeProgramRenderFfmpegError(
        code,
        String(row.stderr || row.message || "FFmpeg failed.").trim().slice(0, 4_000),
        Boolean(row.killed),
      );
    }
  }
}

type ProbeResult = {
  streams: Array<{
    codec_type?: string;
    codec_name?: string;
    width?: number;
    height?: number;
    duration?: string;
    avg_frame_rate?: string;
    r_frame_rate?: string;
  }>;
  format: { duration?: string };
};

function escapeConcatPath(value: string) {
  return value.replaceAll("'", "'\\''");
}

function frameRate(value: string | undefined) {
  if (!value) return 24;
  const [numerator, denominator] = value.split("/").map(Number);
  const result = denominator ? numerator / denominator : numerator;
  return Number.isFinite(result) && result > 0 ? result : 24;
}
