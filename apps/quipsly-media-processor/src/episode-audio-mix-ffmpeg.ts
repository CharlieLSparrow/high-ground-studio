import { execFile as execFileCallback } from "node:child_process";
import { stat } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import {
  parseEpisodeAudioMixProposal,
  type EpisodeAudioMixGainAction,
  type EpisodeAudioMixProposal,
} from "@high-ground/quipsly-media-processing";

import { ProxyTranscodeError, sha256File } from "./transcoder.js";

const execFile = promisify(execFileCallback);

export class EpisodeAudioMixRenderError extends Error {
  constructor(readonly code: string, message: string, readonly retryable = false) {
    super(message);
    this.name = "EpisodeAudioMixRenderError";
  }
}

export class FfmpegEpisodeAudioMixRenderer {
  constructor(
    private readonly ffmpegPath = process.env.QUIPSLY_FFMPEG_PATH?.trim() || "ffmpeg",
    private readonly ffprobePath = process.env.QUIPSLY_FFPROBE_PATH?.trim() || "ffprobe",
  ) {}

  async renderUnmasteredPreview(input: {
    proposal: EpisodeAudioMixProposal | unknown;
    sourcePathsByAssetId: ReadonlyMap<string, string>;
    outputPath: string;
  }) {
    const proposal = parseEpisodeAudioMixProposal(input.proposal);
    const paths = proposal.tracks.map((track) => {
      const sourcePath = input.sourcePathsByAssetId.get(track.assetId);
      if (!sourcePath) throw new EpisodeAudioMixRenderError("episode-mix-source-path-missing", `No retained source path was supplied for ${track.assetId}.`);
      return path.resolve(sourcePath);
    });
    const before = await Promise.all(proposal.tracks.map((track, index) => inspectExactSource(paths[index]!, track.source)));
    const graph = buildEpisodeAudioMixFilterGraph(proposal);
    const outputPath = path.resolve(input.outputPath);
    await run(this.ffmpegPath, [
      "-hide_banner", "-nostdin", "-nostats", "-n",
      ...paths.flatMap((sourcePath) => ["-i", sourcePath]),
      "-filter_complex", graph.filterComplex,
      "-map", `[${graph.outputLabel}]`,
      "-vn", "-sn", "-dn", "-ar", "48000", "-ac", "2", "-c:a", "pcm_f32le",
      outputPath,
    ]);
    const [after, output, probe, version] = await Promise.all([
      Promise.all(proposal.tracks.map((track, index) => inspectExactSource(paths[index]!, track.source))),
      inspectOutput(outputPath),
      probeAudio(outputPath, this.ffprobePath),
      ffmpegVersion(this.ffmpegPath),
    ]);
    for (let index = 0; index < before.length; index += 1) {
      if (before[index]!.sha256 !== after[index]!.sha256 || before[index]!.sizeBytes !== after[index]!.sizeBytes) {
        throw new EpisodeAudioMixRenderError("episode-mix-source-drift", "A retained source changed while the mix preview was rendered.");
      }
    }
    if (Math.abs(probe.durationSeconds - graph.programDurationSeconds) > 0.05 || probe.channels !== 2 || probe.sampleRateHz !== 48_000) {
      throw new EpisodeAudioMixRenderError("episode-mix-output-invalid", "The unmastered mix preview failed duration or format verification.");
    }
    return {
      outputPath,
      sizeBytes: output.sizeBytes,
      sha256: output.sha256,
      durationSeconds: probe.durationSeconds,
      sampleRateHz: 48_000 as const,
      channels: 2 as const,
      codec: "pcm_f32le" as const,
      ffmpegVersion: version,
      exactSourcesVerifiedBeforeAndAfter: true as const,
      originalTracksRemainSourceTruth: true as const,
    };
  }

  async encodePcm24(inputPath: string, outputPath: string) {
    const source = path.resolve(inputPath);
    const output = path.resolve(outputPath);
    await run(this.ffmpegPath, ["-hide_banner", "-nostdin", "-nostats", "-n", "-i", source, "-map", "0:a:0", "-vn", "-sn", "-dn", "-ar", "48000", "-ac", "2", "-c:a", "pcm_s24le", output]);
    return inspectOutput(output);
  }
}

export function buildEpisodeAudioMixFilterGraph(proposalValue: EpisodeAudioMixProposal | unknown) {
  const proposal = parseEpisodeAudioMixProposal(proposalValue);
  const programDurationSeconds = round(Math.max(...proposal.tracks.map((track) => Math.max(0, track.programOffsetSeconds) + Math.max(0, track.sourceDurationSeconds + Math.min(0, track.programOffsetSeconds)))), 6);
  if (programDurationSeconds <= 0 || programDurationSeconds > 172_800) throw new EpisodeAudioMixRenderError("episode-mix-duration-invalid", "The mix preview program duration is invalid.");
  const filters: string[] = [];
  proposal.tracks.forEach((track, index) => {
    const steps = ["aresample=48000:async=0:first_pts=0", "aformat=sample_fmts=fltp:channel_layouts=stereo"];
    if (track.programOffsetSeconds > 0) steps.push(`adelay=${Math.round(track.programOffsetSeconds * 1_000)}:all=1`);
    if (track.programOffsetSeconds < 0) steps.push(`atrim=start=${decimal(-track.programOffsetSeconds)}`, "asetpts=PTS-STARTPTS");
    const actions = proposal.actions.filter((action) => action.targetAssetId === track.assetId).sort((left, right) => left.programStartSeconds - right.programStartSeconds);
    if (actions.length > 0) steps.push(`volume='${gainExpression(actions)}':eval=frame`);
    steps.push(`atrim=end=${decimal(programDurationSeconds)}`, "asetpts=PTS-STARTPTS");
    filters.push(`[${index}:a:0]${steps.join(",")}[mix_track_${index}]`);
  });
  const inputs = proposal.tracks.map((_, index) => `[mix_track_${index}]`).join("");
  filters.push(`${inputs}amix=inputs=${proposal.tracks.length}:duration=longest:dropout_transition=0:normalize=0,atrim=end=${decimal(programDurationSeconds)},apad=whole_dur=${decimal(programDurationSeconds)}[mix_unmastered]`);
  return { filterComplex: filters.join(";"), outputLabel: "mix_unmastered", programDurationSeconds };
}

function gainExpression(actions: EpisodeAudioMixGainAction[]) {
  return actions.map((action) => {
    const attackStart = Math.max(0, action.programStartSeconds - action.attackMilliseconds / 1_000);
    const releaseEnd = action.programEndSeconds + action.releaseMilliseconds / 1_000;
    const gain = 10 ** (action.gainDb / 20);
    const attack = action.programStartSeconds === attackStart
      ? decimal(gain)
      : `1+((${decimal(gain)})-1)*(t-${decimal(attackStart)})/${decimal(action.programStartSeconds - attackStart)}`;
    const release = `(${decimal(gain)})+(1-(${decimal(gain)}))*(t-${decimal(action.programEndSeconds)})/${decimal(releaseEnd - action.programEndSeconds)}`;
    return `if(lt(t\\,${decimal(attackStart)})\\,1\\,if(lt(t\\,${decimal(action.programStartSeconds)})\\,${attack}\\,if(lt(t\\,${decimal(action.programEndSeconds)})\\,${decimal(gain)}\\,if(lt(t\\,${decimal(releaseEnd)})\\,${release}\\,1))))`;
  }).join("*");
}

async function inspectExactSource(sourcePath: string, binding: EpisodeAudioMixProposal["tracks"][number]["source"]) {
  const source = await stat(sourcePath).catch(() => null);
  if (!source?.isFile() || source.size !== binding.sizeBytes) throw new EpisodeAudioMixRenderError("episode-mix-source-size-mismatch", "A retained source no longer matches its immutable size receipt.");
  const sha256 = await sha256File(sourcePath);
  if (sha256 !== binding.sha256) throw new EpisodeAudioMixRenderError("episode-mix-source-byte-mismatch", "A retained source no longer matches its immutable SHA-256 receipt.");
  return { sizeBytes: source.size, sha256 };
}

async function inspectOutput(outputPath: string) {
  const output = await stat(outputPath).catch(() => null);
  if (!output?.isFile() || output.size <= 0) throw new EpisodeAudioMixRenderError("episode-mix-output-empty", "FFmpeg produced an empty mix preview.");
  return { sizeBytes: output.size, sha256: await sha256File(outputPath) };
}

async function probeAudio(outputPath: string, ffprobePath: string) {
  const result = await execFile(ffprobePath, ["-v", "error", "-select_streams", "a:0", "-show_entries", "stream=channels,sample_rate:format=duration", "-of", "json", outputPath], { encoding: "utf8", maxBuffer: 128 * 1024 }).catch((error) => { throw unavailable("episode-mix-ffprobe-unavailable", error); });
  const root = JSON.parse(result.stdout) as { streams?: Array<{ channels?: number; sample_rate?: string }>; format?: { duration?: string } };
  const stream = root.streams?.[0];
  const durationSeconds = Number(root.format?.duration);
  const channels = Number(stream?.channels);
  const sampleRateHz = Number(stream?.sample_rate);
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0 || !Number.isSafeInteger(channels) || !Number.isSafeInteger(sampleRateHz)) throw new EpisodeAudioMixRenderError("episode-mix-probe-invalid", "FFprobe returned invalid mix preview metadata.");
  return { durationSeconds, channels, sampleRateHz };
}

async function ffmpegVersion(ffmpegPath: string) {
  const result = await execFile(ffmpegPath, ["-version"], { encoding: "utf8", maxBuffer: 64 * 1024 }).catch((error) => { throw unavailable("episode-mix-ffmpeg-unavailable", error); });
  const firstLine = result.stdout.split(/\r?\n/, 1)[0]?.trim() ?? "";
  if (!firstLine.startsWith("ffmpeg version ")) throw new EpisodeAudioMixRenderError("episode-mix-version-invalid", "FFmpeg did not identify its renderer version.");
  return firstLine;
}

async function run(command: string, args: string[]) {
  await execFile(command, args, { encoding: "utf8", maxBuffer: 4 * 1024 * 1024 }).catch((error: any) => {
    const detail = typeof error?.stderr === "string" ? error.stderr.trim().slice(-4_000) : error instanceof Error ? error.message : String(error);
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") throw new EpisodeAudioMixRenderError("episode-mix-ffmpeg-unavailable", detail, true);
    throw new EpisodeAudioMixRenderError("episode-mix-render-failed", detail || "FFmpeg failed to render the mix preview.");
  });
}

function unavailable(code: string, error: unknown) { return new EpisodeAudioMixRenderError(code, error instanceof Error ? error.message : String(error), true); }
function decimal(value: number) { return round(value, 6).toFixed(6); }
function round(value: number, digits: number) { const multiplier = 10 ** digits; return Math.round(value * multiplier) / multiplier; }
