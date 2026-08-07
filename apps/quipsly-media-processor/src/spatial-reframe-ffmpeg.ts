import { execFile } from "node:child_process";
import { writeFile, rm } from "node:fs/promises";
import { promisify } from "node:util";

import {
  spatialRenderProfile,
  type SpatialReframeKeyframe,
  type SpatialRenderJob,
} from "@high-ground/quipsly-media-processing";

const executeFile = promisify(execFile);

export type SpatialReframeTechnical = {
  durationSeconds: number;
  width: number;
  height: number;
  fps: number;
  videoCodec: string;
  audioCodec: string | null;
  completeDecode: true;
  fastStart: true;
  ffmpegVersion: string;
  commandCount: number;
};

export class SpatialReframeFfmpegError extends Error {
  constructor(readonly code: string, message: string, readonly retryable: boolean) {
    super(message);
    this.name = "SpatialReframeFfmpegError";
  }
}

export class FfmpegSpatialReframeRenderer {
  constructor(
    private readonly ffmpegPath = process.env.QUIPSLY_FFMPEG_PATH?.trim() || "ffmpeg",
    private readonly ffprobePath = process.env.QUIPSLY_FFPROBE_PATH?.trim() || "ffprobe",
  ) {}

  async render(job: SpatialRenderJob, stitchedInputPath: string, outputPath: string): Promise<SpatialReframeTechnical> {
    const profile = spatialRenderProfile(job.reframe.profile);
    const durationSeconds = job.selection.endSeconds - job.selection.startSeconds;
    const schedule = buildSpatialReframeCommandSchedule(job.recipe.keyframes, job.selection.startSeconds, job.selection.endSeconds, profile.fps);
    const commandPath = `${outputPath}.v360-commands.txt`;
    const initial = sampleSpatialReframe(job.recipe.keyframes, job.selection.startSeconds);
    await writeFile(commandPath, schedule.commands, { encoding: "utf8", mode: 0o600 });
    try {
      const videoCodec = profile.videoCodec === "h265" ? "libx265" : "libx264";
      const codecOptions = profile.videoCodec === "h265"
        ? ["-c:v", videoCodec, "-preset", "medium", "-crf", "18", "-tag:v", "hvc1"]
        : ["-c:v", videoCodec, "-preset", "medium", "-crf", "17"];
      const filter = [
        "setpts=PTS-STARTPTS",
        `sendcmd=f=${escapeFilterPath(commandPath)}`,
        `v360@quipsly_view=input=equirect:output=flat:interp=lanczos:w=${profile.width}:h=${profile.height}:yaw=${number(initial.panDegrees)}:pitch=${number(initial.tiltDegrees)}:roll=${number(initial.rollDegrees)}:h_fov=${number(initial.fieldOfViewDegrees)}`,
        `fps=${profile.fps}`,
        "format=yuv420p",
      ].join(",");
      await this.execute(this.ffmpegPath, [
        "-hide_banner", "-nostdin", "-v", "error", "-y",
        "-ss", number(job.selection.startSeconds), "-t", number(durationSeconds), "-i", stitchedInputPath,
        "-map", "0:v:0", "-map", "0:a:0?", "-vf", filter,
        ...codecOptions,
        "-c:a", "aac", "-b:a", "192k", "-ar", "48000",
        "-movflags", "+faststart", outputPath,
      ], 30 * 60_000, "spatial-reframe-encode-failed");
      await this.execute(this.ffmpegPath, ["-hide_banner", "-nostdin", "-v", "error", "-i", outputPath, "-map", "0", "-f", "null", "-"], 10 * 60_000, "spatial-reframe-complete-decode-failed");
      const probe = await this.probe(outputPath);
      const version = await this.execute(this.ffmpegPath, ["-version"], 10_000, "spatial-reframe-ffmpeg-unavailable");
      const ffmpegVersion = version.stdout.split(/\r?\n/, 1)[0]?.trim();
      if (!ffmpegVersion) throw new SpatialReframeFfmpegError("spatial-reframe-version-invalid", "FFmpeg did not report its version.", false);
      if (probe.width !== profile.width || probe.height !== profile.height || Math.abs(probe.fps - profile.fps) > 0.01 || probe.durationSeconds <= 0 || probe.durationSeconds > durationSeconds + (2 / profile.fps)) {
        throw new SpatialReframeFfmpegError("spatial-reframe-output-contract-mismatch", "The reframed output did not match its requested dimensions, frame rate, or source range.", false);
      }
      return { ...probe, completeDecode: true, fastStart: true, ffmpegVersion, commandCount: schedule.commandCount };
    } finally {
      await rm(commandPath, { force: true }).catch(() => undefined);
    }
  }

  private async probe(outputPath: string) {
    const result = await this.execute(this.ffprobePath, ["-v", "error", "-show_streams", "-show_format", "-of", "json", outputPath], 60_000, "spatial-reframe-probe-failed");
    const parsed = JSON.parse(result.stdout) as { streams?: Array<Record<string, unknown>>; format?: Record<string, unknown> };
    const video = parsed.streams?.find((stream) => stream.codec_type === "video");
    const audio = parsed.streams?.find((stream) => stream.codec_type === "audio");
    if (!video) throw new SpatialReframeFfmpegError("spatial-reframe-video-missing", "The reframed output has no video stream.", false);
    return {
      durationSeconds: Number(parsed.format?.duration ?? video.duration),
      width: Number(video.width),
      height: Number(video.height),
      fps: rate(video.avg_frame_rate ?? video.r_frame_rate),
      videoCodec: String(video.codec_name ?? "unknown"),
      audioCodec: audio ? String(audio.codec_name ?? "unknown") : null,
    };
  }

  private async execute(command: string, args: string[], timeout: number, code: string) {
    try {
      return await executeFile(command, args, { encoding: "utf8", maxBuffer: 4 * 1024 * 1024, timeout });
    } catch (error) {
      const details = error as Error & { stderr?: string; code?: string | number };
      const message = String(details.stderr || details.message || error).trim().slice(0, 4_000);
      const unavailable = details.code === "ENOENT";
      throw new SpatialReframeFfmpegError(unavailable ? "spatial-reframe-engine-unavailable" : code, message || `${command} failed.`, !unavailable);
    }
  }
}

export function buildSpatialReframeCommandSchedule(keyframes: SpatialReframeKeyframe[], startSeconds: number, endSeconds: number, fps: number) {
  if (!Number.isInteger(fps) || fps <= 0 || !Number.isFinite(startSeconds) || !Number.isFinite(endSeconds) || endSeconds <= startSeconds) {
    throw new SpatialReframeFfmpegError("spatial-reframe-schedule-invalid", "The reframe command clock is invalid.", false);
  }
  const frameCount = Math.max(1, Math.ceil((endSeconds - startSeconds) * fps));
  const lines: string[] = [];
  for (let frame = 1; frame <= frameCount; frame += 1) {
    const outputSeconds = Math.min(frame / fps, endSeconds - startSeconds);
    const view = sampleSpatialReframe(keyframes, startSeconds + outputSeconds);
    lines.push(`${number(outputSeconds)} quipsly_view yaw ${number(view.panDegrees)}, quipsly_view pitch ${number(view.tiltDegrees)}, quipsly_view roll ${number(view.rollDegrees)}, quipsly_view h_fov ${number(view.fieldOfViewDegrees)};`);
  }
  return { commands: `${lines.join("\n")}\n`, commandCount: lines.length * 4, frameCount };
}

export function sampleSpatialReframe(keyframes: SpatialReframeKeyframe[], sourceSeconds: number) {
  if (!keyframes.length) throw new SpatialReframeFfmpegError("spatial-reframe-keyframes-missing", "At least one spatial keyframe is required.", false);
  const ordered = [...keyframes].sort((left, right) => left.sourceSeconds - right.sourceSeconds);
  const nextIndex = ordered.findIndex((keyframe) => keyframe.sourceSeconds >= sourceSeconds);
  if (nextIndex <= 0) return { ...ordered[0]! };
  if (nextIndex === -1) return { ...ordered.at(-1)! };
  const left = ordered[nextIndex - 1]!;
  const right = ordered[nextIndex]!;
  if (left.interpolation === "hold" || right.sourceSeconds <= left.sourceSeconds) return { ...left, sourceSeconds };
  const raw = Math.max(0, Math.min(1, (sourceSeconds - left.sourceSeconds) / (right.sourceSeconds - left.sourceSeconds)));
  const progress = left.interpolation === "ease" ? raw * raw * (3 - 2 * raw) : raw;
  return {
    sourceSeconds,
    panDegrees: interpolateAngle(left.panDegrees, right.panDegrees, progress),
    tiltDegrees: linear(left.tiltDegrees, right.tiltDegrees, progress),
    rollDegrees: interpolateAngle(left.rollDegrees, right.rollDegrees, progress),
    fieldOfViewDegrees: linear(left.fieldOfViewDegrees, right.fieldOfViewDegrees, progress),
    interpolation: left.interpolation,
  };
}

function interpolateAngle(left: number, right: number, progress: number) {
  let delta = ((right - left + 540) % 360) - 180;
  if (delta === -180 && right - left > 0) delta = 180;
  const value = left + delta * progress;
  return ((value + 540) % 360) - 180;
}
function linear(left: number, right: number, progress: number) { return left + (right - left) * progress; }
function rate(value: unknown) { const [numerator, denominator = "1"] = String(value ?? "0/1").split("/"); return Number(numerator) / Math.max(Number(denominator), 1); }
function number(value: number) { return Number(value.toFixed(6)).toString(); }
function escapeFilterPath(value: string) { return `'${value.replaceAll("\\", "\\\\").replaceAll(":", "\\:").replaceAll("'", "'\\''")}'`; }
