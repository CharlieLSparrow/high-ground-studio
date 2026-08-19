import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";

import type { SessionRecordingShareJob } from "@high-ground/quipsly-media-processing";

const execFileAsync = promisify(execFile);

export type SessionRecordingShareTechnical = {
  durationSeconds: number;
  codec: "aac";
  sampleRateHz: 48_000;
  channels: 2;
  completeDecode: true;
  ffmpegVersion: string;
};

export function buildSessionRecordingShareFilterGraph(job: SessionRecordingShareJob) {
  const duration = job.edit.endSeconds - job.edit.startSeconds;
  const tracks = job.sources.map((source, index) => {
    const delayMs = Math.max(0, Math.round(source.programOffsetSeconds * 1_000));
    return [
      `[${index}:a:0]aresample=48000`,
      `adelay=${delayMs}:all=1`,
      `atrim=start=${job.edit.startSeconds}:end=${job.edit.endSeconds}`,
      "asetpts=PTS-STARTPTS",
      `apad=whole_dur=${duration}`,
      `atrim=duration=${duration}[track${index}]`,
    ].join(",");
  });
  const inputs = job.sources.map((_, index) => `[track${index}]`).join("");
  tracks.push(
    `${inputs}amix=inputs=${job.sources.length}:duration=longest:dropout_transition=0:normalize=0,`
      + `loudnorm=I=-16:TP=-1.5:LRA=11,alimiter=limit=0.944,atrim=duration=${duration}[share]`,
  );
  return tracks.join(";");
}

async function run(command: string, args: string[], code: string) {
  try {
    return await execFileAsync(command, args, { timeout: 4 * 60 * 60 * 1_000, maxBuffer: 8 * 1024 * 1024 });
  } catch (error) {
    throw Object.assign(new Error(error instanceof Error ? error.message : code), { code });
  }
}

export class FfmpegSessionRecordingShareRenderer {
  constructor(
    private readonly ffmpegPath = "ffmpeg",
    private readonly ffprobePath = "ffprobe",
  ) {}

  async render(job: SessionRecordingShareJob, outputPath: string) {
    const filterGraph = buildSessionRecordingShareFilterGraph(job);
    await run(this.ffmpegPath, [
      "-hide_banner", "-nostdin", "-v", "error", "-y",
      ...job.sources.flatMap((source) => ["-i", source.locator]),
      "-filter_complex", filterGraph,
      "-map", "[share]",
      "-c:a", "aac", "-profile:a", "aac_low", "-b:a", "128k",
      "-ar", "48000", "-ac", "2", "-movflags", "+faststart",
      outputPath,
    ], "session-recording-share-render-failed");
    const probe = await run(this.ffprobePath, [
      "-v", "error", "-show_entries", "format=duration:stream=codec_name,sample_rate,channels",
      "-select_streams", "a:0", "-of", "json", outputPath,
    ], "session-recording-share-probe-failed");
    const value = JSON.parse(probe.stdout) as {
      format?: { duration?: string };
      streams?: Array<{ codec_name?: string; sample_rate?: string; channels?: number }>;
    };
    const durationSeconds = Number(value.format?.duration);
    const stream = value.streams?.[0];
    const expectedDuration = job.edit.endSeconds - job.edit.startSeconds;
    if (
      !Number.isFinite(durationSeconds) ||
      Math.abs(durationSeconds - expectedDuration) > 0.25 ||
      stream?.codec_name !== "aac" ||
      Number(stream.sample_rate) !== 48_000 ||
      stream.channels !== 2
    ) {
      throw Object.assign(new Error("Rendered Session share failed duration or audio-format verification."), {
        code: "session-recording-share-technical-invalid",
      });
    }
    await run(this.ffmpegPath, ["-hide_banner", "-nostdin", "-v", "error", "-i", outputPath, "-map", "0:a:0", "-f", "null", "-"], "session-recording-share-decode-failed");
    const version = await run(this.ffmpegPath, ["-version"], "session-recording-share-version-failed");
    const bytes = await readFile(outputPath);
    return {
      bytes,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      technical: {
        durationSeconds,
        codec: "aac",
        sampleRateHz: 48_000,
        channels: 2,
        completeDecode: true,
        ffmpegVersion: version.stdout.split(/\r?\n/, 1)[0]?.trim() || "unknown",
      } satisfies SessionRecordingShareTechnical,
    };
  }
}
