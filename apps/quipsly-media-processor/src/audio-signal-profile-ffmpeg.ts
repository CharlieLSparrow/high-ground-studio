import { execFile as execFileCallback, spawn } from "node:child_process";
import { stat } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import {
  AUDIO_FREQUENCY_PROFILE_ALGORITHM,
  AUDIO_SIGNAL_PROFILE_ALGORITHM,
  parseAudioSignalProfile,
  type AudioFrequencyProfile,
  type AudioSignalProfile,
} from "@high-ground/quipsly-media-processing";

const execFile = promisify(execFileCallback);
const THRESHOLDS = Object.freeze({
  clippingAmplitude: 0.999,
  nearSilenceDbfs: -72,
  possibleDropoutMinimumSeconds: 0.25,
  surroundingSignalDbfs: -45,
  stereoImbalanceDb: 12,
});

const FREQUENCY_BANDS = Object.freeze([
  { id: "rumble", label: "Rumble", minimumHz: 20, maximumHz: 80 },
  { id: "warmth", label: "Warmth", minimumHz: 80, maximumHz: 250 },
  { id: "body", label: "Body", minimumHz: 250, maximumHz: 500 },
  { id: "speech", label: "Speech", minimumHz: 500, maximumHz: 2_000 },
  { id: "presence", label: "Presence", minimumHz: 2_000, maximumHz: 6_000 },
  { id: "air", label: "Air", minimumHz: 6_000, maximumHz: 20_000 },
] as const);

export type FfmpegAudioSignalProfile = {
  media: {
    container: string;
    codec: string;
    sampleRate: number;
    channelCount: number;
    durationSeconds: number;
  };
  audioSignal: AudioSignalProfile;
  ffmpegVersion: string;
};

export class AudioSignalProfileDecodeError extends Error {
  readonly code: string;
  readonly retryable: boolean;

  constructor(code: string, message: string, retryable = false) {
    super(message);
    this.name = "AudioSignalProfileDecodeError";
    this.code = code;
    this.retryable = retryable;
  }
}

export class FfmpegAudioSignalProfiler {
  private readonly ffmpegPath: string;
  private readonly ffprobePath: string;

  constructor(ffmpegPath = "ffmpeg", ffprobePath = "ffprobe") {
    this.ffmpegPath = ffmpegPath;
    this.ffprobePath = ffprobePath;
  }

  async analyze(inputPath: string, options: { frequencyAnalysis?: boolean } = {}): Promise<FfmpegAudioSignalProfile> {
    const resolvedPath = path.resolve(inputPath);
    const source = await stat(resolvedPath).catch(() => null);
    if (!source?.isFile() || source.size <= 0) {
      throw new AudioSignalProfileDecodeError("audio-signal-source-unavailable", "Audio signal source must be a non-empty file.");
    }
    const [probe, ffmpegVersion] = await Promise.all([this.probe(resolvedPath), this.version()]);
    const estimatedFrames = Math.ceil(probe.durationSeconds * probe.sampleRate);
    const minimumWindowFrames = Math.max(Math.round(probe.sampleRate * 0.1), 1);
    const framesPerWindow = Math.max(minimumWindowFrames, Math.ceil(estimatedFrames / 1_200));
    const frameBytes = probe.channelCount * 4;
    const nearSilenceAmplitude = 10 ** (THRESHOLDS.nearSilenceDbfs / 20);
    const windows: AudioSignalProfile["waveform"] = [];
    const channelSumSquares = Array.from({ length: probe.channelCount }, () => 0);
    let decodedFrames = 0;
    let totalSumSquares = 0;
    let totalPeak = 0;
    let clippedFrames = 0;
    let nearSilentFrames = 0;
    let windowFrameCount = 0;
    let windowSumSquares = 0;
    let windowPeak = 0;
    let windowClippedFrames = 0;
    let remainder: Buffer<ArrayBufferLike> = Buffer.alloc(0);
    let stderr = "";
    const decodeFailure: { value: Error | null } = { value: null };

    const finishWindow = () => {
      if (!windowFrameCount) return;
      const startFrame = decodedFrames - windowFrameCount;
      windows.push({
        startSeconds: rounded(startFrame / probe.sampleRate),
        durationSeconds: rounded(windowFrameCount / probe.sampleRate),
        rmsDbfs: amplitudeDbfs(Math.sqrt(windowSumSquares / windowFrameCount)),
        samplePeakDbfs: amplitudeDbfs(windowPeak),
        clippedFrameCount: windowClippedFrames,
      });
      windowFrameCount = 0;
      windowSumSquares = 0;
      windowPeak = 0;
      windowClippedFrames = 0;
    };

    const child = spawn(this.ffmpegPath, [
      "-hide_banner", "-loglevel", "error", "-i", resolvedPath,
      "-map", "0:a:0", "-f", "f32le", "-acodec", "pcm_f32le", "pipe:1",
    ], { stdio: ["ignore", "pipe", "pipe"] });
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => { stderr = `${stderr}${chunk}`.slice(-16_384); });
    child.stdout.on("data", (chunk: Buffer) => {
      if (decodeFailure.value) return;
      try {
        const data = remainder.length ? Buffer.concat([remainder, chunk]) : chunk;
        const completeBytes = data.length - (data.length % frameBytes);
        for (let offset = 0; offset < completeBytes; offset += frameBytes) {
          let channelEnergy = 0;
          let framePeak = 0;
          for (let channel = 0; channel < probe.channelCount; channel += 1) {
            const sample = data.readFloatLE(offset + channel * 4);
            if (!Number.isFinite(sample)) throw new Error("Audio signal decode produced a non-finite sample.");
            channelEnergy += sample * sample;
            framePeak = Math.max(framePeak, Math.abs(sample));
            channelSumSquares[channel] += sample * sample;
          }
          const square = channelEnergy / probe.channelCount;
          totalSumSquares += square;
          totalPeak = Math.max(totalPeak, framePeak);
          windowSumSquares += square;
          windowPeak = Math.max(windowPeak, framePeak);
          if (framePeak >= THRESHOLDS.clippingAmplitude) {
            clippedFrames += 1;
            windowClippedFrames += 1;
          }
          if (framePeak <= nearSilenceAmplitude) nearSilentFrames += 1;
          windowFrameCount += 1;
          decodedFrames += 1;
          if (windowFrameCount >= framesPerWindow) finishWindow();
        }
        remainder = data.subarray(completeBytes);
      } catch (error) {
        decodeFailure.value = error instanceof Error ? error : new Error(String(error));
        child.kill("SIGTERM");
      }
    });
    const exitCode = await new Promise<number | null>((resolve, reject) => {
      child.once("error", reject);
      child.once("close", resolve);
    }).catch((error) => {
      throw new AudioSignalProfileDecodeError("audio-signal-ffmpeg-unavailable", errorMessage(error), true);
    });
    if (decodeFailure.value) throw new AudioSignalProfileDecodeError("audio-signal-decode-invalid", decodeFailure.value.message);
    if (exitCode !== 0) {
      const noAudio = /matches no streams|does not contain any stream|Stream map.*matches no streams/i.test(stderr);
      throw new AudioSignalProfileDecodeError(
        noAudio ? "audio-signal-no-audio-track" : "audio-signal-decode-failed",
        noAudio ? "The source has no decodable audio track." : `FFmpeg audio signal decode failed (${exitCode}): ${stderr.trim() || "no diagnostic"}`,
        false,
      );
    }
    if (remainder.length !== 0) throw new AudioSignalProfileDecodeError("audio-signal-partial-frame", "FFmpeg audio signal decode ended on a partial frame.");
    finishWindow();
    if (decodedFrames <= 0 || windows.length <= 0 || windows.length > 1_200) {
      throw new AudioSignalProfileDecodeError("audio-signal-empty-decode", "Audio signal decode produced no bounded evidence windows.");
    }
    const durationSeconds = decodedFrames / probe.sampleRate;
    const leftRmsDbfs = amplitudeDbfs(Math.sqrt(channelSumSquares[0] / decodedFrames));
    const rightRmsDbfs = probe.channelCount > 1 ? amplitudeDbfs(Math.sqrt(channelSumSquares[1] / decodedFrames)) : null;
    const stereoBalanceDb = rightRmsDbfs === null ? null : rounded(rightRmsDbfs - leftRmsDbfs);
    const rmsDbfs = amplitudeDbfs(Math.sqrt(totalSumSquares / decodedFrames));
    const samplePeakDbfs = amplitudeDbfs(totalPeak);
    const observations = signalObservations(windows, durationSeconds, samplePeakDbfs, stereoBalanceDb);
    const signalStatus = samplePeakDbfs <= THRESHOLDS.nearSilenceDbfs
      ? "near-digital-silence" as const
      : observations.length ? "attention" as const : "signal-present" as const;
    const frequencyProfile = options.frequencyAnalysis === false
      ? null
      : await this.analyzeFrequencyBands(resolvedPath, probe.sampleRate, framesPerWindow, decodedFrames, durationSeconds);
    const audioSignal = parseAudioSignalProfile({
      schemaVersion: 1,
      algorithm: AUDIO_SIGNAL_PROFILE_ALGORITHM,
      sampleRate: probe.sampleRate,
      channelCount: probe.channelCount,
      analyzedFrameCount: decodedFrames,
      durationSeconds: rounded(durationSeconds),
      windowDurationSeconds: rounded(framesPerWindow / probe.sampleRate),
      rmsDbfs,
      samplePeakDbfs,
      clippedFrameCount: clippedFrames,
      clippedFrameFraction: rounded(clippedFrames / decodedFrames),
      nearSilentFrameFraction: rounded(nearSilentFrames / decodedFrames),
      leftRmsDbfs,
      rightRmsDbfs,
      stereoBalanceDb,
      signalStatus,
      thresholds: THRESHOLDS,
      waveform: windows,
      frequencyProfile,
      observations,
    });
    return {
      media: {
        container: probe.container,
        codec: probe.codec,
        sampleRate: probe.sampleRate,
        channelCount: probe.channelCount,
        durationSeconds: rounded(durationSeconds),
      },
      audioSignal,
      ffmpegVersion,
    };
  }

  private async analyzeFrequencyBands(
    inputPath: string,
    sampleRate: number,
    framesPerWindow: number,
    expectedFrameCount: number,
    expectedDurationSeconds: number,
  ): Promise<AudioFrequencyProfile> {
    const bands = audioFrequencyBandsForSampleRate(sampleRate);
    if (!bands.length) throw new AudioSignalProfileDecodeError("audio-frequency-sample-rate-unsupported", "The decoded sample rate cannot support a bounded frequency overview.");
    const frameBytes = bands.length * 4;
    const overallSumSquares = Array.from({ length: bands.length }, () => 0);
    const windows: AudioFrequencyProfile["windows"] = [];
    let decodedFrames = 0;
    let windowFrameCount = 0;
    let windowSumSquares = Array.from({ length: bands.length }, () => 0);
    let remainder: Buffer<ArrayBufferLike> = Buffer.alloc(0);
    let stderr = "";
    const decodeFailure: { value: Error | null } = { value: null };

    const finishWindow = () => {
      if (!windowFrameCount) return;
      const startFrame = decodedFrames - windowFrameCount;
      windows.push({
        startSeconds: rounded(startFrame / sampleRate),
        durationSeconds: rounded(windowFrameCount / sampleRate),
        bandRmsDbfs: windowSumSquares.map((sum) => amplitudeDbfs(Math.sqrt(sum / windowFrameCount))),
      });
      windowFrameCount = 0;
      windowSumSquares = Array.from({ length: bands.length }, () => 0);
    };

    const child = spawn(this.ffmpegPath, [
      "-hide_banner", "-loglevel", "error", "-i", inputPath,
      "-filter_complex", frequencyFilterGraph(bands),
      "-map", "[frequency_out]", "-f", "f32le", "-acodec", "pcm_f32le", "pipe:1",
    ], { stdio: ["ignore", "pipe", "pipe"] });
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => { stderr = `${stderr}${chunk}`.slice(-16_384); });
    child.stdout.on("data", (chunk: Buffer) => {
      if (decodeFailure.value) return;
      try {
        const data = remainder.length ? Buffer.concat([remainder, chunk]) : chunk;
        const completeBytes = data.length - (data.length % frameBytes);
        for (let offset = 0; offset < completeBytes; offset += frameBytes) {
          for (let bandIndex = 0; bandIndex < bands.length; bandIndex += 1) {
            const sample = data.readFloatLE(offset + bandIndex * 4);
            if (!Number.isFinite(sample)) throw new Error("Audio frequency decode produced a non-finite sample.");
            const square = sample * sample;
            overallSumSquares[bandIndex] += square;
            windowSumSquares[bandIndex] += square;
          }
          decodedFrames += 1;
          windowFrameCount += 1;
          if (windowFrameCount >= framesPerWindow) finishWindow();
        }
        remainder = data.subarray(completeBytes);
      } catch (error) {
        decodeFailure.value = error instanceof Error ? error : new Error(String(error));
        child.kill("SIGTERM");
      }
    });
    const exitCode = await new Promise<number | null>((resolve, reject) => {
      child.once("error", reject);
      child.once("close", resolve);
    }).catch((error) => {
      throw new AudioSignalProfileDecodeError("audio-frequency-ffmpeg-unavailable", errorMessage(error), true);
    });
    if (decodeFailure.value) throw new AudioSignalProfileDecodeError("audio-frequency-decode-invalid", decodeFailure.value.message);
    if (exitCode !== 0) throw new AudioSignalProfileDecodeError("audio-frequency-decode-failed", `FFmpeg broad-band frequency decode failed (${exitCode}): ${stderr.trim() || "no diagnostic"}`);
    if (remainder.length !== 0) throw new AudioSignalProfileDecodeError("audio-frequency-partial-frame", "FFmpeg broad-band frequency decode ended on a partial frame.");
    finishWindow();
    if (decodedFrames !== expectedFrameCount || windows.length < 1 || windows.length > 1_200) {
      throw new AudioSignalProfileDecodeError("audio-frequency-duration-drift", "Broad-band frequency evidence does not cover the exact complete decode.");
    }
    const frequencyEnd = windows.at(-1)!.startSeconds + windows.at(-1)!.durationSeconds;
    if (Math.abs(frequencyEnd - expectedDurationSeconds) > 0.02) {
      throw new AudioSignalProfileDecodeError("audio-frequency-clock-drift", "Broad-band frequency evidence drifted from the immutable source clock.");
    }
    return {
      algorithm: AUDIO_FREQUENCY_PROFILE_ALGORITHM,
      completeDecode: true,
      downmixPolicy: "ffmpeg-default-mono-v1",
      windowDurationSeconds: rounded(framesPerWindow / sampleRate),
      analyzedFrameCount: decodedFrames,
      bands,
      overallBandRmsDbfs: overallSumSquares.map((sum) => amplitudeDbfs(Math.sqrt(sum / decodedFrames))),
      windows,
      boundaries: {
        broadBandsAreNotARepairSpectrogram: true,
        measurementsAreNotEqDecisions: true,
        stereoIsDownmixedForFrequencyOverview: true,
      },
    };
  }

  private async probe(inputPath: string) {
    let stdout = "";
    try {
      ({ stdout } = await execFile(this.ffprobePath, [
        "-v", "error", "-select_streams", "a:0",
        "-show_entries", "stream=codec_name,sample_rate,channels:format=format_name,duration",
        "-of", "json", inputPath,
      ], { maxBuffer: 4 * 1024 * 1024 }));
    } catch (error) {
      throw new AudioSignalProfileDecodeError("audio-signal-probe-failed", errorMessage(error), false);
    }
    const result = JSON.parse(stdout) as { streams?: Array<Record<string, unknown>>; format?: Record<string, unknown> };
    const stream = result.streams?.[0];
    const sampleRate = Number(stream?.sample_rate);
    const channelCount = Number(stream?.channels);
    const durationSeconds = Number(result.format?.duration);
    if (!stream) throw new AudioSignalProfileDecodeError("audio-signal-no-audio-track", "The source has no decodable audio track.");
    if (!Number.isSafeInteger(sampleRate) || sampleRate <= 0 || !Number.isSafeInteger(channelCount) || channelCount <= 0 || channelCount > 32 || !Number.isFinite(durationSeconds) || durationSeconds <= 0) {
      throw new AudioSignalProfileDecodeError("audio-signal-probe-invalid", "Audio signal probe returned invalid stream metadata.");
    }
    return {
      sampleRate,
      channelCount,
      durationSeconds,
      codec: String(stream.codec_name || "unknown"),
      container: String(result.format?.format_name || "unknown").split(",")[0],
    };
  }

  private async version() {
    const { stdout } = await execFile(this.ffmpegPath, ["-version"], { maxBuffer: 1024 * 1024 });
    return String(stdout).split("\n")[0]?.trim() || "ffmpeg-unknown";
  }
}

export function audioFrequencyBandsForSampleRate(sampleRate: number): AudioFrequencyProfile["bands"] {
  const safeMaximumHz = Math.floor(sampleRate * 0.475);
  return FREQUENCY_BANDS.flatMap((band) => {
    const maximumHz = Math.min(band.maximumHz, safeMaximumHz);
    return maximumHz - band.minimumHz >= 40
      ? [{ id: band.id, label: band.label, minimumHz: band.minimumHz, maximumHz }]
      : [];
  });
}

function frequencyFilterGraph(bands: AudioFrequencyProfile["bands"]) {
  const filters = (input: string, band: AudioFrequencyProfile["bands"][number], output: string) =>
    `${input}highpass=f=${band.minimumHz}:p=2:precision=f32,lowpass=f=${band.maximumHz}:p=2:precision=f32${output}`;
  if (bands.length === 1) return filters("[0:a:0]aformat=sample_fmts=fltp:channel_layouts=mono,", bands[0], "[frequency_out]");
  const inputs = bands.map((_, index) => `[frequency_input_${index}]`).join("");
  const outputs = bands.map((_, index) => `[frequency_band_${index}]`).join("");
  const bandFilters = bands.map((band, index) => filters(`[frequency_input_${index}]`, band, `[frequency_band_${index}]`)).join(";");
  return `[0:a:0]aformat=sample_fmts=fltp:channel_layouts=mono,asplit=${bands.length}${inputs};${bandFilters};${outputs}amerge=inputs=${bands.length}[frequency_out]`;
}

function signalObservations(windows: AudioSignalProfile["waveform"], durationSeconds: number, signalPeakDbfs: number, stereoBalanceDb: number | null): AudioSignalProfile["observations"] {
  const observations: AudioSignalProfile["observations"] = [];
  if (signalPeakDbfs <= THRESHOLDS.nearSilenceDbfs) observations.push({ kind: "near-digital-silence", severity: "warning", startSeconds: 0, endSeconds: rounded(durationSeconds), detail: "The decoded source peak stayed at or below the near-silence threshold. Listen before relying on this take." });
  if (stereoBalanceDb !== null && Math.abs(stereoBalanceDb) >= THRESHOLDS.stereoImbalanceDb) observations.push({ kind: "stereo-imbalance", severity: "attention", startSeconds: 0, endSeconds: rounded(durationSeconds), detail: `The decoded left/right RMS balance differs by ${Math.abs(stereoBalanceDb).toFixed(1)} dB.` });
  observations.push(...ranges(windows, (window) => window.clippedFrameCount > 0, (range) => ({
    kind: "sample-clipping" as const,
    severity: "warning" as const,
    startSeconds: range[0].startSeconds,
    endSeconds: rounded(range.at(-1)!.startSeconds + range.at(-1)!.durationSeconds),
    detail: `${range.reduce((total, window) => total + window.clippedFrameCount, 0)} decoded frame(s) reached the clipping observation threshold.`,
  })));
  const silentRanges = ranges(windows, (window) => window.rmsDbfs <= THRESHOLDS.nearSilenceDbfs, (range, startIndex, endIndex) => ({ range, startIndex, endIndex }));
  for (const { range, startIndex, endIndex } of silentRanges) {
    const startSeconds = range[0].startSeconds;
    const endSeconds = range.at(-1)!.startSeconds + range.at(-1)!.durationSeconds;
    const previousHasSignal = startIndex > 0 && windows[startIndex - 1].rmsDbfs >= THRESHOLDS.surroundingSignalDbfs;
    const nextHasSignal = endIndex + 1 < windows.length && windows[endIndex + 1].rmsDbfs >= THRESHOLDS.surroundingSignalDbfs;
    if (endSeconds - startSeconds >= THRESHOLDS.possibleDropoutMinimumSeconds && previousHasSignal && nextHasSignal) {
      observations.push({ kind: "possible-dropout", severity: "attention", startSeconds: rounded(startSeconds), endSeconds: rounded(endSeconds), detail: "A near-silent interval is surrounded by measurable signal. It may be intentional silence; listen before classifying it as a dropout." });
    }
  }
  return observations.sort((left, right) => left.startSeconds - right.startSeconds || left.kind.localeCompare(right.kind));
}

function ranges<T>(windows: AudioSignalProfile["waveform"], predicate: (window: AudioSignalProfile["waveform"][number]) => boolean, make: (range: AudioSignalProfile["waveform"], startIndex: number, endIndex: number) => T): T[] {
  const output: T[] = [];
  let index = 0;
  while (index < windows.length) {
    if (!predicate(windows[index])) { index += 1; continue; }
    const startIndex = index;
    while (index + 1 < windows.length && predicate(windows[index + 1])) index += 1;
    output.push(make(windows.slice(startIndex, index + 1), startIndex, index));
    index += 1;
  }
  return output;
}

function rounded(value: number) { return Math.round(value * 1_000_000) / 1_000_000; }
function amplitudeDbfs(value: number) { return rounded(20 * Math.log10(Math.max(Math.abs(value), 1e-8))); }
function errorMessage(error: unknown) { return error instanceof Error && error.message.trim() ? error.message : "FFmpeg audio signal analysis failed."; }
