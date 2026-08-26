import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";

import {
  AUDIO_ALIGNMENT_ALGORITHM,
  AUDIO_ALIGNMENT_EVIDENCE_KIND,
  AUDIO_ALIGNMENT_WINDOW_FIT_POLICY,
  fitAudioAlignmentWindows,
  parseAudioAlignmentEvidence,
  type AudioAlignmentEvidence,
  type AudioAlignmentMoment,
  type AudioMasterySourceBinding,
} from "@high-ground/quipsly-media-processing";

export { fitAudioAlignmentWindows } from "@high-ground/quipsly-media-processing";

export type AudioAlignmentAnalysisOptions = {
  initialOffsetSeconds: number;
  openingTargetSeconds: number;
  laterTargetSeconds: number;
  windowSeconds?: number;
  searchRadiusSeconds?: number;
  sampleRate?: number;
  minimumCorrelation?: number;
  minimumPeakMargin?: number;
};

export class FfmpegAudioAlignmentAnalyzer {
  private readonly ffmpegPath: string;
  private readonly ffprobePath: string;

  constructor(ffmpegPath = "ffmpeg", ffprobePath = "ffprobe") {
    this.ffmpegPath = ffmpegPath;
    this.ffprobePath = ffprobePath;
  }

  async analyze(input: {
    spinePath: string;
    targetPath: string;
    spine: AudioMasterySourceBinding;
    target: AudioMasterySourceBinding;
    options: AudioAlignmentAnalysisOptions;
    createdAt?: string;
  }): Promise<AudioAlignmentEvidence> {
    const sampleRate = boundedInteger(input.options.sampleRate ?? 12_000, 4_000, 48_000, "sampleRate");
    const windowSeconds = boundedNumber(input.options.windowSeconds ?? 6, 1, 30, "windowSeconds");
    const searchRadiusSeconds = boundedNumber(input.options.searchRadiusSeconds ?? 1, 0.05, 30, "searchRadiusSeconds");
    const minimumCorrelation = boundedNumber(input.options.minimumCorrelation ?? 0.78, 0, 1, "minimumCorrelation");
    const minimumPeakMargin = boundedNumber(input.options.minimumPeakMargin ?? 0.04, 0, 1, "minimumPeakMargin");
    const initialOffsetSeconds = finiteNumber(input.options.initialOffsetSeconds, "initialOffsetSeconds");
    const requestedOpeningTargetSeconds = nonNegativeNumber(input.options.openingTargetSeconds, "openingTargetSeconds");
    const requestedLaterTargetSeconds = nonNegativeNumber(input.options.laterTargetSeconds, "laterTargetSeconds");
    if (requestedLaterTargetSeconds <= requestedOpeningTargetSeconds) throw new Error("The later alignment point must follow the opening point.");

    const spinePath = path.resolve(input.spinePath);
    const targetPath = path.resolve(input.targetPath);
    const [spineDuration, targetDuration, ffmpegVersion] = await Promise.all([
      this.probeDuration(spinePath),
      this.probeDuration(targetPath),
      this.version(),
      verifySourceBinding(spinePath, input.spine),
      verifySourceBinding(targetPath, input.target),
    ]).then(([spine, target, version]) => [spine, target, version] as const);
    const fittedWindows = fitAudioAlignmentWindows({
      spineDurationSeconds: spineDuration,
      targetDurationSeconds: targetDuration,
      initialOffsetSeconds,
      requestedOpeningTargetSeconds,
      requestedLaterTargetSeconds,
      windowSeconds,
    });
    const { openingTargetSeconds, laterTargetSeconds } = fittedWindows;
    for (const [label, point] of [["opening", openingTargetSeconds], ["later", laterTargetSeconds]] as const) {
      if (point + windowSeconds > targetDuration + 0.001) throw new Error(`The ${label} target window exceeds the target duration.`);
      const expectedSpine = point + initialOffsetSeconds;
      if (expectedSpine + windowSeconds > spineDuration + searchRadiusSeconds + 0.001) throw new Error(`The ${label} spine search window exceeds the spine duration.`);
    }

    const [opening, later] = await Promise.all([
      this.measureMoment({ spinePath, targetPath, targetStartSeconds: openingTargetSeconds, expectedOffsetSeconds: initialOffsetSeconds, sampleRate, windowSeconds, searchRadiusSeconds }),
      this.measureMoment({ spinePath, targetPath, targetStartSeconds: laterTargetSeconds, expectedOffsetSeconds: initialOffsetSeconds, sampleRate, windowSeconds, searchRadiusSeconds }),
    ]);
    const observationIntervalSeconds = rounded(later.targetStartSeconds - opening.targetStartSeconds);
    const residualDriftMilliseconds = rounded((later.measuredOffsetSeconds - opening.measuredOffsetSeconds) * 1_000);
    const observedPartsPerMillion = rounded(residualDriftMilliseconds * 1_000 / observationIntervalSeconds);
    const qualified = opening.normalizedCorrelation >= minimumCorrelation
      && later.normalizedCorrelation >= minimumCorrelation
      && opening.peakMargin >= minimumPeakMargin
      && later.peakMargin >= minimumPeakMargin;

    return parseAudioAlignmentEvidence({
      kind: AUDIO_ALIGNMENT_EVIDENCE_KIND,
      createdAt: input.createdAt ?? new Date().toISOString(),
      spine: input.spine,
      target: input.target,
      analyzer: {
        algorithm: AUDIO_ALIGNMENT_ALGORITHM,
        sampleRate,
        windowSeconds,
        searchRadiusSeconds,
        ffmpegVersion,
        windowFit: {
          policy: AUDIO_ALIGNMENT_WINDOW_FIT_POLICY,
          spineDecodedDurationSeconds: rounded(spineDuration),
          targetDecodedDurationSeconds: rounded(targetDuration),
          initialOffsetSeconds: rounded(initialOffsetSeconds),
          requestedOpeningTargetSeconds: rounded(requestedOpeningTargetSeconds),
          requestedLaterTargetSeconds: rounded(requestedLaterTargetSeconds),
          analyzedOpeningTargetSeconds: openingTargetSeconds,
          analyzedLaterTargetSeconds: laterTargetSeconds,
          windowSeconds,
          adjustedToDecodedDuration: fittedWindows.adjustedToDecodedDuration,
        },
      },
      opening,
      later,
      drift: { observationIntervalSeconds, residualDriftMilliseconds, observedPartsPerMillion },
      qualification: {
        minimumCorrelation,
        minimumPeakMargin,
        qualifiedForAuthorizedAgentReview: qualified,
        reason: qualified
          ? "Two separated decoded-audio windows produced distinct, source-bound correlation peaks. A delegated reviewer may inspect and approve the reversible placement."
          : "The decoded-audio peaks are weak or ambiguous. Keep the placement held for person review or collect stronger source evidence.",
      },
      boundaries: {
        sampleAccurateClaimed: false,
        sourceBytesMutated: false,
        timelinePlacementApplied: false,
        personOrDelegatedApprovalStillRequired: true,
      },
    });
  }

  private async measureMoment(input: {
    spinePath: string;
    targetPath: string;
    targetStartSeconds: number;
    expectedOffsetSeconds: number;
    sampleRate: number;
    windowSeconds: number;
    searchRadiusSeconds: number;
  }): Promise<AudioAlignmentMoment> {
    const expectedSpineStartSeconds = input.targetStartSeconds + input.expectedOffsetSeconds;
    const searchStartSeconds = Math.max(0, expectedSpineStartSeconds - input.searchRadiusSeconds);
    const searchEndSeconds = expectedSpineStartSeconds + input.windowSeconds + input.searchRadiusSeconds;
    const [reference, candidate] = await Promise.all([
      this.decodeMono(input.targetPath, input.targetStartSeconds, input.windowSeconds, input.sampleRate),
      this.decodeMono(input.spinePath, searchStartSeconds, searchEndSeconds - searchStartSeconds, input.sampleRate),
    ]);
    const correlation = normalizedCrossCorrelation(reference, candidate, input.sampleRate);
    const measuredSpineStartSeconds = rounded(searchStartSeconds + correlation.startSample / input.sampleRate);
    const targetStartSeconds = rounded(input.targetStartSeconds);
    const normalizedCorrelation = rounded(correlation.best);
    const secondBestCorrelation = rounded(correlation.secondBest);
    return {
      targetStartSeconds,
      expectedSpineStartSeconds: rounded(expectedSpineStartSeconds),
      measuredSpineStartSeconds,
      measuredOffsetSeconds: rounded(measuredSpineStartSeconds - targetStartSeconds),
      normalizedCorrelation,
      secondBestCorrelation,
      peakMargin: rounded(normalizedCorrelation - secondBestCorrelation),
    };
  }

  private async decodeMono(inputPath: string, startSeconds: number, durationSeconds: number, sampleRate: number) {
    const chunks: Buffer[] = [];
    let bytes = 0;
    let stderr = "";
    const maximumBytes = Math.ceil(durationSeconds * sampleRate * 4 * 1.1) + 65_536;
    const child = spawn(this.ffmpegPath, [
      "-hide_banner", "-loglevel", "error", "-i", inputPath,
      "-ss", startSeconds.toFixed(6), "-t", durationSeconds.toFixed(6),
      "-map", "0:a:0", "-vn", "-ac", "1", "-ar", String(sampleRate),
      "-f", "f32le", "-acodec", "pcm_f32le", "pipe:1",
    ], { stdio: ["ignore", "pipe", "pipe"] });
    child.stdout.on("data", (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > maximumBytes) {
        child.kill("SIGTERM");
        return;
      }
      chunks.push(chunk);
    });
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => { stderr = `${stderr}${chunk}`.slice(-8_192); });
    const exitCode = await waitForChild(child);
    if (bytes > maximumBytes) throw new Error("Decoded alignment window exceeded its bounded memory contract.");
    if (exitCode !== 0) throw new Error(`FFmpeg alignment decode failed (${exitCode}): ${stderr.trim() || "no diagnostic"}`);
    const buffer = Buffer.concat(chunks);
    if (buffer.length === 0 || buffer.length % 4 !== 0) throw new Error("FFmpeg alignment decode returned no complete float samples.");
    const samples = new Float64Array(buffer.length / 4);
    for (let index = 0; index < samples.length; index += 1) {
      const sample = buffer.readFloatLE(index * 4);
      if (!Number.isFinite(sample)) throw new Error("FFmpeg alignment decode produced a non-finite sample.");
      samples[index] = sample;
    }
    return samples;
  }

  private async probeDuration(inputPath: string) {
    const source = await stat(inputPath).catch(() => null);
    if (!source?.isFile() || source.size <= 0) throw new Error("Audio alignment source must be a non-empty local file.");
    const child = spawn(this.ffprobePath, ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", inputPath], { stdio: ["ignore", "pipe", "pipe"] });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    const exitCode = await waitForChild(child);
    if (exitCode !== 0) throw new Error(`FFprobe alignment probe failed (${exitCode}): ${Buffer.concat(stderr).toString("utf8").trim()}`);
    const containerDuration = Number(Buffer.concat(stdout).toString("utf8").trim());
    if (Number.isFinite(containerDuration) && containerDuration >= 0.001 && containerDuration <= 86_400) {
      return containerDuration;
    }
    // MediaRecorder WebM commonly has no format-level duration until it is
    // remuxed. The retained bytes are still valid and fully decodable, so use
    // FFmpeg's decoded audio clock as the authoritative fallback instead of
    // rejecting a normal browser capture or mutating it just to add metadata.
    return this.probeDecodedDuration(inputPath);
  }

  private async probeDecodedDuration(inputPath: string) {
    let stdout = "";
    let stderr = "";
    let outputExceeded = false;
    const child = spawn(this.ffmpegPath, [
      "-hide_banner", "-loglevel", "error", "-i", inputPath,
      "-map", "0:a:0", "-vn", "-f", "null", "-",
      "-progress", "pipe:1", "-nostats",
    ], { stdio: ["ignore", "pipe", "pipe"] });
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
      if (stdout.length > 128 * 1_024) {
        outputExceeded = true;
        child.kill("SIGTERM");
      }
    });
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      stderr = `${stderr}${chunk}`.slice(-8_192);
    });
    const exitCode = await waitForChild(child);
    if (outputExceeded) {
      throw new Error("Decoded duration probe exceeded its bounded output contract.");
    }
    if (exitCode !== 0) {
      throw new Error(`FFmpeg decoded duration probe failed (${exitCode}): ${stderr.trim() || "no diagnostic"}`);
    }
    const matches = [...stdout.matchAll(/^out_time_us=([0-9]+)$/gm)];
    const microseconds = Number(matches.at(-1)?.[1]);
    return boundedNumber(microseconds / 1_000_000, 0.001, 86_400, "decoded duration");
  }

  private async version() {
    const child = spawn(this.ffmpegPath, ["-version"], { stdio: ["ignore", "pipe", "ignore"] });
    const stdout: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    const exitCode = await waitForChild(child);
    if (exitCode !== 0) throw new Error("FFmpeg version readback failed.");
    return Buffer.concat(stdout).toString("utf8").split("\n")[0]?.trim() || "ffmpeg unknown";
  }
}

export function normalizedCrossCorrelation(reference: Float64Array, candidate: Float64Array, sampleRate: number) {
  if (reference.length < 128 || candidate.length < reference.length) throw new Error("Audio correlation requires a bounded reference and a longer candidate window.");
  const centered = new Float64Array(reference.length);
  let mean = 0;
  for (const sample of reference) mean += sample;
  mean /= reference.length;
  let referenceEnergy = 0;
  for (let index = 0; index < reference.length; index += 1) {
    const sample = reference[index] - mean;
    centered[index] = sample;
    referenceEnergy += sample * sample;
  }
  if (referenceEnergy <= 1e-12) throw new Error("Audio correlation reference is effectively silent.");

  const fftLength = nextPowerOfTwo(reference.length + candidate.length - 1);
  const leftReal = new Float64Array(fftLength);
  const leftImag = new Float64Array(fftLength);
  const rightReal = new Float64Array(fftLength);
  const rightImag = new Float64Array(fftLength);
  for (let index = 0; index < candidate.length; index += 1) leftReal[index] = candidate[index];
  for (let index = 0; index < centered.length; index += 1) rightReal[index] = centered[centered.length - 1 - index];
  fft(leftReal, leftImag, false);
  fft(rightReal, rightImag, false);
  for (let index = 0; index < fftLength; index += 1) {
    const real = leftReal[index] * rightReal[index] - leftImag[index] * rightImag[index];
    const imag = leftReal[index] * rightImag[index] + leftImag[index] * rightReal[index];
    leftReal[index] = real;
    leftImag[index] = imag;
  }
  fft(leftReal, leftImag, true);

  const prefix = new Float64Array(candidate.length + 1);
  const prefixSquares = new Float64Array(candidate.length + 1);
  for (let index = 0; index < candidate.length; index += 1) {
    prefix[index + 1] = prefix[index] + candidate[index];
    prefixSquares[index + 1] = prefixSquares[index] + candidate[index] * candidate[index];
  }
  const values = new Float64Array(candidate.length - reference.length + 1);
  let best = -Infinity;
  let bestStart = 0;
  for (let start = 0; start < values.length; start += 1) {
    const sum = prefix[start + reference.length] - prefix[start];
    const sumSquares = prefixSquares[start + reference.length] - prefixSquares[start];
    const candidateEnergy = Math.max(0, sumSquares - sum * sum / reference.length);
    const value = candidateEnergy <= 1e-12 ? -1 : leftReal[start + reference.length - 1] / Math.sqrt(referenceEnergy * candidateEnergy);
    values[start] = Math.max(-1, Math.min(1, value));
    if (values[start] > best) {
      best = values[start];
      bestStart = start;
    }
  }
  const exclusionSamples = Math.max(1, Math.round(sampleRate * 0.05));
  let secondBest = -1;
  for (let start = 0; start < values.length; start += 1) {
    if (Math.abs(start - bestStart) <= exclusionSamples) continue;
    secondBest = Math.max(secondBest, values[start]);
  }
  return { startSample: bestStart, best, secondBest };
}

function fft(real: Float64Array, imaginary: Float64Array, inverse: boolean) {
  const length = real.length;
  for (let index = 1, reversed = 0; index < length; index += 1) {
    let bit = length >> 1;
    for (; reversed & bit; bit >>= 1) reversed ^= bit;
    reversed ^= bit;
    if (index < reversed) {
      [real[index], real[reversed]] = [real[reversed], real[index]];
      [imaginary[index], imaginary[reversed]] = [imaginary[reversed], imaginary[index]];
    }
  }
  for (let size = 2; size <= length; size <<= 1) {
    const angle = (inverse ? 2 : -2) * Math.PI / size;
    const stepReal = Math.cos(angle);
    const stepImag = Math.sin(angle);
    for (let offset = 0; offset < length; offset += size) {
      let twiddleReal = 1;
      let twiddleImag = 0;
      for (let index = 0; index < size / 2; index += 1) {
        const even = offset + index;
        const odd = even + size / 2;
        const oddReal = real[odd] * twiddleReal - imaginary[odd] * twiddleImag;
        const oddImag = real[odd] * twiddleImag + imaginary[odd] * twiddleReal;
        real[odd] = real[even] - oddReal;
        imaginary[odd] = imaginary[even] - oddImag;
        real[even] += oddReal;
        imaginary[even] += oddImag;
        const nextReal = twiddleReal * stepReal - twiddleImag * stepImag;
        twiddleImag = twiddleReal * stepImag + twiddleImag * stepReal;
        twiddleReal = nextReal;
      }
    }
  }
  if (inverse) {
    for (let index = 0; index < length; index += 1) {
      real[index] /= length;
      imaginary[index] /= length;
    }
  }
}

async function verifySourceBinding(inputPath: string, binding: AudioMasterySourceBinding) {
  const source = await stat(inputPath);
  if (!source.isFile() || source.size !== binding.sizeBytes) throw new Error(`Audio alignment source size does not match ${binding.assetId}.`);
  const digest = await sha256File(inputPath);
  if (digest !== binding.sha256) throw new Error(`Audio alignment source SHA-256 does not match ${binding.assetId}.`);
}

async function sha256File(inputPath: string) {
  const hash = createHash("sha256");
  const stream = createReadStream(inputPath);
  for await (const chunk of stream) hash.update(chunk);
  return hash.digest("hex");
}

function waitForChild(child: ReturnType<typeof spawn>) {
  return new Promise<number | null>((resolve, reject) => {
    child.once("error", reject);
    child.once("close", resolve);
  });
}

function nextPowerOfTwo(value: number) {
  let result = 1;
  while (result < value) result <<= 1;
  return result;
}

function finiteNumber(value: unknown, label: string) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`${label} must be finite.`);
  return parsed;
}

function nonNegativeNumber(value: unknown, label: string) {
  const parsed = finiteNumber(value, label);
  if (parsed < 0) throw new Error(`${label} must be non-negative.`);
  return parsed;
}

function boundedNumber(value: unknown, minimum: number, maximum: number, label: string) {
  const parsed = finiteNumber(value, label);
  if (parsed < minimum || parsed > maximum) throw new Error(`${label} must be between ${minimum} and ${maximum}.`);
  return parsed;
}

function boundedInteger(value: unknown, minimum: number, maximum: number, label: string) {
  const parsed = boundedNumber(value, minimum, maximum, label);
  if (!Number.isInteger(parsed)) throw new Error(`${label} must be an integer.`);
  return parsed;
}

function rounded(value: number, places = 6) {
  const scale = 10 ** places;
  return Math.round((value + Number.EPSILON) * scale) / scale;
}
