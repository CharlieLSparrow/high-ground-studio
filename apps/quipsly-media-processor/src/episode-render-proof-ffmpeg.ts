import { execFile } from "node:child_process";
import { promisify } from "node:util";

import type {
  EpisodeRenderProofJob,
  EpisodeRenderProofSource,
} from "@high-ground/quipsly-media-processing";

const execFileAsync = promisify(execFile);

export class EpisodeRenderProofFfmpegError extends Error {
  constructor(readonly code: string, message: string, readonly retryable: boolean) {
    super(message);
    this.name = "EpisodeRenderProofFfmpegError";
  }
}

export type EpisodeRenderProofTechnical = {
  durationSeconds: number;
  width: 1280;
  height: 720;
  fps: number;
  videoCodec: string;
  audioCodec: string | null;
  completeDecode: true;
  fastStart: true;
  ffmpegVersion: string;
};

export type EpisodeRenderComposition = {
  sources: EpisodeRenderProofSource[];
  proof: EpisodeRenderProofJob["proof"];
};

export class FfmpegEpisodeRenderProofRenderer {
  constructor(
    private readonly ffmpeg = "ffmpeg",
    private readonly ffprobe = "ffprobe",
  ) {}

  async render(job: EpisodeRenderComposition, outputPath: string): Promise<EpisodeRenderProofTechnical> {
    const duration = job.proof.sequenceEndSeconds - job.proof.sequenceStartSeconds;
    const sourceIndexes = new Map(job.sources.map((source, index) => [source.laneId, index]));
    const probeRows = await Promise.all(job.sources.map((source) => this.probe(source.locator)));
    const args: string[] = ["-hide_banner", "-loglevel", "error", "-y"];
    for (const source of job.sources) {
      const sourceTime = job.proof.sequenceStartSeconds - source.sequenceOffsetSeconds + source.sourceStartSeconds;
      if (sourceTime < -0.001 || sourceTime + duration > source.sourceStartSeconds + source.sourceDurationSeconds + 0.05) {
        throw new EpisodeRenderProofFfmpegError("episode-render-proof-source-window-invalid", `${source.label} does not cover the frozen proof window.`, false);
      }
      args.push("-ss", Math.max(0, sourceTime).toFixed(6), "-t", duration.toFixed(6), "-i", source.locator);
    }
    const filter = this.filterGraph(job, sourceIndexes, probeRows, duration);
    args.push(
      "-filter_complex", filter,
      "-map", "[vout]",
      "-map", "[aout]",
      "-t", duration.toFixed(6),
      "-r", "24",
      "-c:v", "libx264",
      "-preset", "veryfast",
      "-crf", "21",
      "-pix_fmt", "yuv420p",
      "-c:a", "aac",
      "-b:a", "160k",
      "-ar", "48000",
      "-movflags", "+faststart",
      outputPath,
    );
    await this.execute(this.ffmpeg, args, 180_000, "episode-render-proof-encode-failed");
    const output = await this.probe(outputPath);
    const video = output.streams.find((stream) => stream.codec_type === "video");
    const audio = output.streams.find((stream) => stream.codec_type === "audio");
    const outputDuration = Number(output.format.duration ?? video?.duration ?? audio?.duration);
    if (!video || video.width !== 1280 || video.height !== 720 || !Number.isFinite(outputDuration)) {
      throw new EpisodeRenderProofFfmpegError("episode-render-proof-output-invalid", "The rendered proof does not have the required 1280x720 video stream.", false);
    }
    await this.execute(this.ffmpeg, ["-v", "error", "-i", outputPath, "-f", "null", "-"], 60_000, "episode-render-proof-complete-decode-failed");
    const ffmpegVersion = (await this.execute(this.ffmpeg, ["-version"], 10_000, "episode-render-proof-ffmpeg-unavailable")).stdout.split("\n")[0]?.trim() || "ffmpeg";
    return {
      durationSeconds: outputDuration,
      width: 1280,
      height: 720,
      fps: frameRate(video.avg_frame_rate || video.r_frame_rate),
      videoCodec: String(video.codec_name || "unknown"),
      audioCodec: audio?.codec_name ? String(audio.codec_name) : null,
      completeDecode: true,
      fastStart: true,
      ffmpegVersion,
    };
  }

  private filterGraph(
    job: EpisodeRenderComposition,
    indexes: ReadonlyMap<string, number>,
    probes: ProbeResult[],
    duration: number,
  ) {
    const filters: string[] = [];
    const visualIds = job.proof.visualLaneIds.filter((id) => {
      const index = indexes.get(id);
      return index !== undefined && probes[index]?.streams.some((stream) => stream.codec_type === "video");
    });
    const clipId = job.proof.clipLaneId && visualIds.includes(job.proof.clipLaneId)
      ? job.proof.clipLaneId
      : null;
    const hostIds = visualIds.filter((id) => id !== clipId).slice(0, 2);
    if (clipId && hostIds.length) {
      const clipIndex = indexes.get(clipId)!;
      filters.push(`[${clipIndex}:v]setpts=PTS-STARTPTS,scale=922:720:force_original_aspect_ratio=increase,crop=922:720,setsar=1[vclip]`);
      hostIds.forEach((id, index) => {
        const height = Math.floor(720 / hostIds.length);
        filters.push(`[${indexes.get(id)!}:v]setpts=PTS-STARTPTS,scale=358:${height}:force_original_aspect_ratio=increase,crop=358:${height},setsar=1[vhost${index}]`);
      });
      const inputs = ["[vclip]", ...hostIds.map((_, index) => `[vhost${index}]`)].join("");
      const layout = ["0_0", ...hostIds.map((_, index) => `922_${index * Math.floor(720 / hostIds.length)}`)].join("|");
      filters.push(`${inputs}xstack=inputs=${1 + hostIds.length}:layout=${layout}:fill=black[vout]`);
    } else if (hostIds.length >= 2) {
      hostIds.forEach((id, index) => filters.push(`[${indexes.get(id)!}:v]setpts=PTS-STARTPTS,scale=640:720:force_original_aspect_ratio=increase,crop=640:720,setsar=1[v${index}]`));
      filters.push("[v0][v1]hstack=inputs=2[vout]");
    } else if (visualIds.length) {
      filters.push(`[${indexes.get(visualIds[0]!)!}:v]setpts=PTS-STARTPTS,scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720,setsar=1[vout]`);
    } else {
      filters.push(`color=c=0x07110d:s=1280x720:r=24:d=${duration.toFixed(6)},format=yuv420p[vout]`);
    }

    const audibleIds = job.proof.audioLaneIds.filter((id) => {
      const index = indexes.get(id);
      return index !== undefined && probes[index]?.streams.some((stream) => stream.codec_type === "audio");
    });
    if (!audibleIds.length) {
      filters.push(`anullsrc=r=48000:cl=stereo:d=${duration.toFixed(6)}[aout]`);
    } else {
      audibleIds.forEach((id, index) => filters.push(`[${indexes.get(id)!}:a]atrim=duration=${duration.toFixed(6)},asetpts=PTS-STARTPTS,aresample=48000,apad=whole_dur=${duration.toFixed(6)}[a${index}]`));
      if (audibleIds.length === 1) filters.push("[a0]anull[aout]");
      else filters.push(`${audibleIds.map((_, index) => `[a${index}]`).join("")}amix=inputs=${audibleIds.length}:duration=longest:normalize=0,alimiter=limit=0.95[aout]`);
    }
    return filters.join(";");
  }

  private async probe(locator: string): Promise<ProbeResult> {
    const result = await this.execute(this.ffprobe, ["-v", "error", "-show_streams", "-show_format", "-of", "json", locator], 30_000, "episode-render-proof-probe-failed");
    try {
      const parsed = JSON.parse(result.stdout) as ProbeResult;
      if (!Array.isArray(parsed.streams) || !parsed.format) throw new Error("missing streams");
      return parsed;
    } catch {
      throw new EpisodeRenderProofFfmpegError("episode-render-proof-probe-invalid", "FFprobe returned invalid source metadata.", false);
    }
  }

  private async execute(command: string, args: string[], timeout: number, code: string) {
    try {
      return await execFileAsync(command, args, { timeout, maxBuffer: 4 * 1024 * 1024 });
    } catch (error) {
      const row = error as { stderr?: string; message?: string; killed?: boolean };
      throw new EpisodeRenderProofFfmpegError(code, String(row.stderr || row.message || "FFmpeg failed.").trim().slice(0, 4_000), Boolean(row.killed));
    }
  }
}

type ProbeResult = {
  streams: Array<{ codec_type?: string; codec_name?: string; width?: number; height?: number; duration?: string; avg_frame_rate?: string; r_frame_rate?: string }>;
  format: { duration?: string };
};

function frameRate(value: string | undefined) {
  if (!value) return 24;
  const [numerator, denominator] = value.split("/").map(Number);
  const result = denominator ? numerator / denominator : numerator;
  return Number.isFinite(result) && result > 0 ? result : 24;
}
