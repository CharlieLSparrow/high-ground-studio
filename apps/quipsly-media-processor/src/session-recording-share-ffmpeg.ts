import { execFile } from "node:child_process";
import { stat } from "node:fs/promises";
import { promisify } from "node:util";

import {
  sessionRecordingShareOutputDuration,
  type SessionRecordingShareJob,
} from "@high-ground/quipsly-media-processing";

import { sha256File } from "./transcoder.js";

const execFileAsync = promisify(execFile);

export type SessionRecordingShareTechnical = {
  durationSeconds: number;
  mediaKind: "audio";
  codec: "aac";
  sampleRateHz: 48_000;
  channels: 2;
  completeDecode: true;
  ffmpegVersion: string;
} | {
  durationSeconds: number;
  mediaKind: "video";
  videoCodec: "h264";
  audioCodec: "aac";
  widthPixels: 1920;
  heightPixels: 1080;
  frameRate: 24;
  sampleRateHz: 48_000;
  channels: 2;
  completeDecode: true;
  ffmpegVersion: string;
};

export function buildSessionRecordingShareFilterGraph(
  job: SessionRecordingShareJob,
) {
  const duration = job.edit.endSeconds - job.edit.startSeconds;
  const audioSources = job.sources
    .map((source, inputIndex) => ({ source, inputIndex }))
    .filter(({ source }) => source.includeInAudioMix);
  const tracks = audioSources.map(({ source, inputIndex }, index) => {
    const delayMs = Math.max(
      0,
      Math.round(source.programOffsetSeconds * 1_000),
    );
    return [
      `[${inputIndex}:a:0]aresample=48000`,
      `adelay=${delayMs}:all=1`,
      `atrim=start=${job.edit.startSeconds}:end=${job.edit.endSeconds}`,
      "asetpts=PTS-STARTPTS",
      `apad=whole_dur=${duration}`,
      `atrim=duration=${duration}[track${index}]`,
    ].join(",");
  });
  const inputs = audioSources.map((_, index) => `[track${index}]`).join("");
  tracks.push(
    `${inputs}amix=inputs=${audioSources.length}:duration=longest:dropout_transition=0:normalize=0,` +
      `atrim=duration=${duration}[program]`,
  );
  const keptRanges = job.edit.keptRanges;
  if (keptRanges.length === 1) {
    const range = keptRanges[0]!;
    tracks.push(
      `[program]atrim=start=${range.startSeconds - job.edit.startSeconds}:end=${range.endSeconds - job.edit.startSeconds},` +
        `asetpts=PTS-STARTPTS,loudnorm=I=-16:TP=-1.5:LRA=11,alimiter=limit=0.944,` +
        `atrim=duration=${sessionRecordingShareOutputDuration(job.edit)}[share]`,
    );
    return tracks.join(";");
  }
  tracks.push(
    `[program]asplit=${keptRanges.length}${keptRanges.map((_, index) => `[range${index}in]`).join("")}`,
  );
  for (const [index, range] of keptRanges.entries()) {
    tracks.push(
      `[range${index}in]atrim=start=${range.startSeconds - job.edit.startSeconds}:end=${range.endSeconds - job.edit.startSeconds},` +
        `asetpts=PTS-STARTPTS[range${index}]`,
    );
  }
  let joined = "[range0]";
  for (let index = 1; index < keptRanges.length; index += 1) {
    const output = `[joined${index}]`;
    tracks.push(
      `${joined}[range${index}]acrossfade=d=${job.edit.joinCrossfadeSeconds}:c1=tri:c2=tri${output}`,
    );
    joined = output;
  }
  tracks.push(
    `${joined}loudnorm=I=-16:TP=-1.5:LRA=11,alimiter=limit=0.944,` +
      `atrim=duration=${sessionRecordingShareOutputDuration(job.edit)}[share]`,
  );
  return tracks.join(";");
}

export function buildSessionRecordingShareVideoFilterGraph(
  job: SessionRecordingShareJob,
) {
  if (job.target.mediaKind !== "video") {
    throw new Error("A video filter graph requires a video Session share target.");
  }
  const target = job.target;
  const primaryIndex = job.sources.findIndex(
    (source) => source.recordingAssetId === target.primaryVideoRecordingAssetId,
  );
  if (primaryIndex < 0) {
    throw new Error("The exact primary video source is missing from the Session share job.");
  }
  const primary = job.sources[primaryIndex]!;
  const duration = job.edit.endSeconds - job.edit.startSeconds;
  const filters = [buildSessionRecordingShareFilterGraph(job)];
  filters.push(
    `[${primaryIndex}:v:0]fps=${target.frameRate},` +
      `scale=w=${target.widthPixels}:h=${target.heightPixels}:force_original_aspect_ratio=decrease,` +
      `pad=${target.widthPixels}:${target.heightPixels}:(ow-iw)/2:(oh-ih)/2:color=black,` +
      `setsar=1,setpts=PTS-STARTPTS,` +
      `tpad=start_mode=add:start_duration=${primary.programOffsetSeconds}:stop_mode=add:stop_duration=28800:color=black,` +
      `trim=start=${job.edit.startSeconds}:end=${job.edit.endSeconds},setpts=PTS-STARTPTS,` +
      `trim=duration=${duration}[videoProgram]`,
  );
  const ranges = job.edit.keptRanges;
  if (ranges.length === 1) {
    const range = ranges[0]!;
    filters.push(
      `[videoProgram]trim=start=${range.startSeconds - job.edit.startSeconds}:end=${range.endSeconds - job.edit.startSeconds},` +
        `setpts=PTS-STARTPTS,fps=${target.frameRate},format=yuv420p,` +
        `trim=duration=${sessionRecordingShareOutputDuration(job.edit)}[shareVideo]`,
    );
    return filters.join(";");
  }
  filters.push(
    `[videoProgram]split=${ranges.length}${ranges.map((_, index) => `[videoRange${index}in]`).join("")}`,
  );
  for (const [index, range] of ranges.entries()) {
    const relativeStart = range.startSeconds - job.edit.startSeconds;
    const relativeEnd = range.endSeconds - job.edit.startSeconds
      - (index < ranges.length - 1 ? job.edit.joinCrossfadeSeconds : 0);
    filters.push(
      `[videoRange${index}in]trim=start=${relativeStart}:end=${relativeEnd},` +
        `setpts=PTS-STARTPTS[videoRange${index}]`,
    );
  }
  filters.push(
    `${ranges.map((_, index) => `[videoRange${index}]`).join("")}concat=n=${ranges.length}:v=1:a=0,` +
      `fps=${target.frameRate},format=yuv420p,` +
      `trim=duration=${sessionRecordingShareOutputDuration(job.edit)}[shareVideo]`,
  );
  return filters.join(";");
}

async function run(command: string, args: string[], code: string) {
  try {
    return await execFileAsync(command, args, {
      timeout: 4 * 60 * 60 * 1_000,
      maxBuffer: 8 * 1024 * 1024,
    });
  } catch (error) {
    throw Object.assign(
      new Error(error instanceof Error ? error.message : code),
      { code },
    );
  }
}

export class FfmpegSessionRecordingShareRenderer {
  constructor(
    private readonly ffmpegPath = "ffmpeg",
    private readonly ffprobePath = "ffprobe",
  ) {}

  async render(job: SessionRecordingShareJob, outputPath: string) {
    const isVideo = job.target.mediaKind === "video";
    const filterGraph = isVideo
      ? buildSessionRecordingShareVideoFilterGraph(job)
      : buildSessionRecordingShareFilterGraph(job);
    await run(
      this.ffmpegPath,
      [
        "-hide_banner",
        "-nostdin",
        "-v",
        "error",
        "-y",
        ...job.sources.flatMap((source) => ["-i", source.locator]),
        "-filter_complex",
        filterGraph,
        "-map",
        ...(isVideo ? ["[shareVideo]", "-map", "[share]"] : ["[share]"]),
        ...(isVideo ? [
          "-c:v", "libx264",
          "-preset", "medium",
          "-crf", "18",
          "-pix_fmt", "yuv420p",
          "-r", "24",
        ] : []),
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
      "session-recording-share-render-failed",
    );
    const probe = await run(
      this.ffprobePath,
      [
        "-v",
        "error",
        "-show_entries",
        "format=duration:stream=codec_type,codec_name,sample_rate,channels,width,height,r_frame_rate,pix_fmt",
        "-of",
        "json",
        outputPath,
      ],
      "session-recording-share-probe-failed",
    );
    const value = JSON.parse(probe.stdout) as {
      format?: { duration?: string };
      streams?: Array<{
        codec_type?: string;
        codec_name?: string;
        sample_rate?: string;
        channels?: number;
        width?: number;
        height?: number;
        r_frame_rate?: string;
        pix_fmt?: string;
      }>;
    };
    const durationSeconds = Number(value.format?.duration);
    const audioStream = value.streams?.find((stream) => stream.codec_type === "audio");
    const videoStream = value.streams?.find((stream) => stream.codec_type === "video");
    const expectedDuration = sessionRecordingShareOutputDuration(job.edit);
    if (
      !Number.isFinite(durationSeconds) ||
      Math.abs(durationSeconds - expectedDuration) > 0.25 ||
      audioStream?.codec_name !== "aac" ||
      Number(audioStream.sample_rate) !== 48_000 ||
      audioStream.channels !== 2 ||
      (isVideo && (
        videoStream?.codec_name !== "h264" ||
        videoStream.width !== 1920 ||
        videoStream.height !== 1080 ||
        videoStream.r_frame_rate !== "24/1" ||
        videoStream.pix_fmt !== "yuv420p"
      )) ||
      (!isVideo && videoStream != null)
    ) {
      throw Object.assign(
        new Error(
          "Rendered Session share failed duration or media-format verification.",
        ),
        {
          code: "session-recording-share-technical-invalid",
        },
      );
    }
    await run(
      this.ffmpegPath,
      [
        "-hide_banner",
        "-nostdin",
        "-v",
        "error",
        "-i",
        outputPath,
        "-map",
        ...(isVideo ? ["0:v:0", "-map", "0:a:0"] : ["0:a:0"]),
        "-f",
        "null",
        "-",
      ],
      "session-recording-share-decode-failed",
    );
    const version = await run(
      this.ffmpegPath,
      ["-version"],
      "session-recording-share-version-failed",
    );
    const output = await stat(outputPath);
    if (!output.isFile() || output.size <= 0) {
      throw Object.assign(
        new Error("Rendered Session share produced no regular output file."),
        { code: "session-recording-share-output-empty" },
      );
    }
    return {
      sizeBytes: output.size,
      sha256: await sha256File(outputPath),
      technical: {
        durationSeconds,
        ...(isVideo ? {
          mediaKind: "video" as const,
          videoCodec: "h264" as const,
          audioCodec: "aac" as const,
          widthPixels: 1920 as const,
          heightPixels: 1080 as const,
          frameRate: 24 as const,
        } : {
          mediaKind: "audio" as const,
          codec: "aac" as const,
        }),
        sampleRateHz: 48_000,
        channels: 2,
        completeDecode: true,
        ffmpegVersion: version.stdout.split(/\r?\n/, 1)[0]?.trim() || "unknown",
      } satisfies SessionRecordingShareTechnical,
    };
  }
}
