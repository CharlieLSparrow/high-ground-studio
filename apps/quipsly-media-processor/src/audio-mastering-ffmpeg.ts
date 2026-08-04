import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { stat } from "node:fs/promises";

import {
  AUDIO_MASTERY_PROFILES,
  AUDIO_MASTERY_MEASUREMENT_KIND,
  AUDIO_MASTERY_CONTRACT_VERSION,
  parseAudioMasteryMeasurement,
  type AudioLoudnessPoint,
  type AudioMasteryMeasurement,
  type AudioMasteryProfileId,
  type AudioMasteryProposal,
  type AudioMasterySourceBinding,
} from "@high-ground/quipsly-media-processing";

import { ProxyTranscodeError, sha256File } from "./transcoder.js";

type LoudnormReading = {
  input_i: string;
  input_tp: string;
  input_lra: string;
  input_thresh: string;
  target_offset: string;
};

type AudioProbe = {
  durationSeconds: number;
  channels: number;
  sampleRateHz: number;
};

export class FfmpegAudioMasteringEngine {
  private readonly ffmpegPath: string;
  private readonly ffprobePath: string;

  constructor(
    ffmpegPath = process.env.QUIPSLY_FFMPEG_PATH?.trim() || "ffmpeg",
    ffprobePath = process.env.QUIPSLY_FFPROBE_PATH?.trim() || "ffprobe",
  ) {
    this.ffmpegPath = ffmpegPath;
    this.ffprobePath = ffprobePath;
  }

  async measure(inputPath: string, input: {
    source: AudioMasterySourceBinding;
    profileId: AudioMasteryProfileId;
    measurementId?: string;
    measuredAt?: string;
  }): Promise<AudioMasteryMeasurement> {
    const sourceBefore = await inspectBoundSource(inputPath, input.source);
    const [probe, version, reading, series] = await Promise.all([
      probeAudio(inputPath, this.ffprobePath),
      ffmpegVersion(this.ffmpegPath),
      measureLoudnorm(inputPath, this.ffmpegPath, input.profileId),
      measureSeries(inputPath, this.ffmpegPath),
    ]);
    const sourceAfter = await inspectBoundSource(inputPath, input.source);
    if (sourceBefore.sha256 !== sourceAfter.sha256 || sourceBefore.sizeBytes !== sourceAfter.sizeBytes) {
      throw new ProxyTranscodeError(
        "audio-mastery-source-drift",
        "The immutable audio source changed while Quipsly measured it.",
      );
    }
    return parseAudioMasteryMeasurement({
      kind: AUDIO_MASTERY_MEASUREMENT_KIND,
      version: AUDIO_MASTERY_CONTRACT_VERSION,
      measurementId: input.measurementId ?? `measurement_${randomUUID().replaceAll("-", "")}`,
      measuredAt: input.measuredAt ?? new Date().toISOString(),
      source: input.source,
      profileId: input.profileId,
      durationSeconds: probe.durationSeconds,
      channels: probe.channels,
      sampleRateHz: probe.sampleRateHz,
      integratedLufs: numberField(reading.input_i, "input_i"),
      truePeakDbtp: numberField(reading.input_tp, "input_tp"),
      loudnessRangeLu: numberField(reading.input_lra, "input_lra"),
      thresholdLufs: numberField(reading.input_thresh, "input_thresh"),
      targetOffsetLu: numberField(reading.target_offset, "target_offset"),
      seriesResolutionMs: 1_000,
      series,
      analyzer: {
        name: "ffmpeg-loudnorm-ebur128",
        version,
        standard: "ITU-R BS.1770 / EBU R128",
        completeDecode: true,
      },
    });
  }

  async renderLoudnessMaster(inputPath: string, outputPath: string, input: {
    proposal: AudioMasteryProposal;
    measurement: AudioMasteryMeasurement;
  }) {
    if (input.proposal.action !== "render-loudness-master") {
      throw new ProxyTranscodeError(
        "audio-mastery-render-not-required",
        "This proposal already meets its selected profile and does not authorize a render.",
      );
    }
    const measurement = parseAudioMasteryMeasurement(input.measurement);
    if (
      input.proposal.sourceMeasurementId !== measurement.measurementId
      || input.proposal.source.sha256 !== measurement.source.sha256
      || input.proposal.source.generation !== measurement.source.generation
      || input.proposal.profile.id !== measurement.profileId
    ) {
      throw new ProxyTranscodeError(
        "audio-mastery-proposal-source-mismatch",
        "The proposal is not bound to this exact measurement and immutable source generation.",
      );
    }
    await inspectBoundSource(inputPath, measurement.source);
    const profile = input.proposal.profile;
    const loudnorm = [
      `I=${profile.integratedLufs}`,
      `LRA=${profile.targetLoudnessRangeLu}`,
      `TP=${profile.renderTruePeakDbtp}`,
      `measured_I=${measurement.integratedLufs}`,
      `measured_LRA=${measurement.loudnessRangeLu}`,
      `measured_TP=${measurement.truePeakDbtp}`,
      `measured_thresh=${measurement.thresholdLufs}`,
      `offset=${measurement.targetOffsetLu}`,
      "linear=true",
      "print_format=summary",
    ].join(":");
    await runProcess(this.ffmpegPath, [
      "-hide_banner",
      "-nostdin",
      "-nostats",
      "-n",
      "-i",
      inputPath,
      "-map",
      "0:a:0",
      "-vn",
      "-sn",
      "-dn",
      "-filter:a",
      `loudnorm=${loudnorm}`,
      "-ar",
      "48000",
      "-c:a",
      "pcm_s24le",
      outputPath,
    ], "audio-mastery-render-failed");
    const output = await stat(outputPath);
    if (!output.isFile() || output.size <= 0) {
      throw new ProxyTranscodeError("audio-mastery-output-empty", "The derived loudness master is empty.");
    }
    return {
      outputPath,
      sizeBytes: output.size,
      sha256: await sha256File(outputPath),
      contentType: "audio/wav" as const,
      sampleRateHz: 48_000 as const,
      codec: "pcm_s24le" as const,
      originalRemainsSourceTruth: true as const,
    };
  }
}

export function parseLoudnormReading(stderr: string): LoudnormReading {
  const matches = [...stderr.matchAll(/\{[\s\S]*?"input_i"[\s\S]*?\}/g)];
  const candidate = matches.at(-1)?.[0];
  if (!candidate) {
    throw new ProxyTranscodeError("audio-mastery-measurement-invalid", "FFmpeg did not return a loudnorm measurement.");
  }
  let value: unknown;
  try {
    value = JSON.parse(candidate);
  } catch {
    throw new ProxyTranscodeError("audio-mastery-measurement-invalid", "FFmpeg returned malformed loudnorm JSON.");
  }
  const row = record(value);
  for (const key of ["input_i", "input_tp", "input_lra", "input_thresh", "target_offset"] as const) {
    numberField(row[key], key);
  }
  return row as LoudnormReading;
}

async function inspectBoundSource(inputPath: string, source: AudioMasterySourceBinding) {
  const sourceStat = await stat(inputPath);
  if (!sourceStat.isFile() || sourceStat.size !== source.sizeBytes) {
    throw new ProxyTranscodeError("audio-mastery-source-size-mismatch", "The audio source no longer matches its immutable size binding.");
  }
  const sha256 = await sha256File(inputPath);
  if (sha256 !== source.sha256) {
    throw new ProxyTranscodeError("audio-mastery-source-byte-mismatch", "The audio source no longer matches its immutable SHA-256 binding.");
  }
  return { sizeBytes: sourceStat.size, sha256 };
}

async function probeAudio(inputPath: string, ffprobePath: string): Promise<AudioProbe> {
  const result = await runProcess(ffprobePath, [
    "-v",
    "error",
    "-select_streams",
    "a:0",
    "-show_entries",
    "stream=channels,sample_rate:format=duration",
    "-of",
    "json",
    inputPath,
  ], "audio-mastery-probe-failed");
  const root = record(JSON.parse(result.stdout));
  const stream = Array.isArray(root.streams) ? record(root.streams[0]) : {};
  const format = record(root.format);
  const durationSeconds = numberField(format.duration, "duration");
  const channels = numberField(stream.channels, "channels");
  const sampleRateHz = numberField(stream.sample_rate, "sample_rate");
  if (durationSeconds <= 0 || !Number.isSafeInteger(channels) || channels <= 0 || !Number.isSafeInteger(sampleRateHz) || sampleRateHz <= 0) {
    throw new ProxyTranscodeError("audio-mastery-probe-invalid", "The source has no valid primary audio stream.");
  }
  return { durationSeconds, channels, sampleRateHz };
}

async function ffmpegVersion(ffmpegPath: string) {
  const result = await runProcess(ffmpegPath, ["-version"], "audio-mastery-version-failed");
  const firstLine = result.stdout.split(/\r?\n/, 1)[0]?.trim() ?? "";
  if (!firstLine.startsWith("ffmpeg version ")) {
    throw new ProxyTranscodeError("audio-mastery-version-invalid", "FFmpeg did not identify its analyzer version.");
  }
  return firstLine.slice("ffmpeg version ".length).split(" ", 1)[0] ?? "unknown";
}

async function measureLoudnorm(inputPath: string, ffmpegPath: string, profileId: AudioMasteryProfileId) {
  const profile = AUDIO_MASTERY_PROFILES[profileId];
  const result = await runProcess(ffmpegPath, [
    "-hide_banner",
    "-nostdin",
    "-nostats",
    "-i",
    inputPath,
    "-map",
    "0:a:0",
    "-filter:a",
    `loudnorm=I=${profile.integratedLufs}:LRA=${profile.targetLoudnessRangeLu}:TP=${profile.renderTruePeakDbtp}:print_format=json`,
    "-f",
    "null",
    "-",
  ], "audio-mastery-measurement-failed");
  return parseLoudnormReading(result.stderr);
}

async function measureSeries(inputPath: string, ffmpegPath: string) {
  const child = spawn(ffmpegPath, [
    "-hide_banner",
    "-nostdin",
    "-loglevel",
    "error",
    "-i",
    inputPath,
    "-map",
    "0:a:0",
    "-filter:a",
    "ebur128=metadata=1:peak=true,ametadata=print:file=-",
    "-f",
    "null",
    "-",
  ], { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  let pending = "";
  let stderr = "";
  let frame: Record<string, number> | null = null;
  const seconds = new Map<number, AudioLoudnessPoint>();
  const finishFrame = () => {
    if (!frame || !Number.isFinite(frame.time)) return;
    const second = Math.floor(frame.time);
    seconds.set(second, {
      timeMs: Math.round(frame.time * 1_000),
      momentaryLufs: loudnessOrNull(frame.M, -120),
      shortTermLufs: loudnessOrNull(frame.S, -120),
      integratedLufs: loudnessOrNull(frame.I, -70),
      truePeakDbtp: linearPeakToDbtp(frame.TP),
    });
  };
  const consumeLine = (line: string) => {
    const header = line.match(/^frame:\d+\s+pts:\d+\s+pts_time:([-+0-9.eE]+)/);
    if (header) {
      finishFrame();
      frame = { time: Number(header[1]) };
      return;
    }
    const metric = line.match(/^lavfi\.r128\.(M|S|I|true_peak)=([-+0-9.eE]+)/);
    if (metric && frame) frame[metric[1] === "true_peak" ? "TP" : metric[1]] = Number(metric[2]);
  };
  child.stdout.on("data", (chunk: string) => {
    pending += chunk;
    const lines = pending.split(/\r?\n/);
    pending = lines.pop() ?? "";
    for (const line of lines) consumeLine(line);
  });
  child.stderr.on("data", (chunk: string) => {
    stderr = `${stderr}${chunk}`.slice(-8_000);
  });
  await new Promise<void>((resolve, reject) => {
    child.once("error", (error) => reject(new ProxyTranscodeError("audio-mastery-series-spawn", `FFmpeg could not start: ${error.message}`)));
    child.once("close", (code, signal) => {
      if (pending) consumeLine(pending);
      finishFrame();
      if (code === 0) resolve();
      else reject(new ProxyTranscodeError("audio-mastery-series-failed", `FFmpeg exited ${code ?? "without a code"}${signal ? ` after ${signal}` : ""}: ${stderr}`));
    });
  });
  return [...seconds.values()].sort((left, right) => left.timeMs - right.timeMs);
}

async function runProcess(executable: string, args: string[], code: string) {
  return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(executable, args, { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: string) => { stdout = `${stdout}${chunk}`.slice(-256 * 1024); });
    child.stderr.on("data", (chunk: string) => { stderr = `${stderr}${chunk}`.slice(-256 * 1024); });
    child.once("error", (error) => reject(new ProxyTranscodeError(`${code}-spawn`, `${executable} could not start: ${error.message}`)));
    child.once("close", (exitCode, signal) => {
      if (exitCode === 0) resolve({ stdout, stderr });
      else reject(new ProxyTranscodeError(code, `${executable} exited ${exitCode ?? "without a code"}${signal ? ` after ${signal}` : ""}: ${stderr.slice(-2_000)}`));
    });
  });
}

function numberField(value: unknown, field: string) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw new ProxyTranscodeError("audio-mastery-measurement-invalid", `FFmpeg ${field} is not finite.`);
  }
  return number;
}

function loudnessOrNull(value: number | undefined, floor: number) {
  return Number.isFinite(value) && (value as number) > floor ? round(value as number, 2) : null;
}

function linearPeakToDbtp(value: number | undefined) {
  return Number.isFinite(value) && (value as number) > 0 ? round(20 * Math.log10(value as number), 2) : null;
}

function round(value: number, digits: number) {
  const multiplier = 10 ** digits;
  return Math.round(value * multiplier) / multiplier;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
