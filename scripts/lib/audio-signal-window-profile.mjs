import { execFile as execFileCallback, spawn } from "node:child_process";
import { stat } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);

const THRESHOLDS = Object.freeze({
  clippingAmplitude: 0.999,
  nearSilenceDbfs: -72,
  possibleDropoutMinimumSeconds: 0.25,
  surroundingSignalDbfs: -45,
  stereoImbalanceDb: 12,
});

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function roundedSignal(value) {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function amplitudeDbfs(amplitude) {
  return roundedSignal(20 * Math.log10(Math.max(Math.abs(amplitude), 1e-8)));
}

function appendWindowRanges(windows, predicate, make) {
  const observations = [];
  let index = 0;
  while (index < windows.length) {
    if (!predicate(windows[index])) {
      index += 1;
      continue;
    }
    const startIndex = index;
    while (index + 1 < windows.length && predicate(windows[index + 1])) index += 1;
    const range = windows.slice(startIndex, index + 1);
    observations.push(make(
      range[0].startSeconds,
      range.at(-1).startSeconds + range.at(-1).durationSeconds,
      range,
    ));
    index += 1;
  }
  return observations;
}

function signalObservations(windows, durationSeconds, signalPeakDbfs, stereoBalanceDb) {
  const observations = [];
  if (signalPeakDbfs <= THRESHOLDS.nearSilenceDbfs) {
    observations.push({
      kind: "near-digital-silence",
      severity: "warning",
      startSeconds: 0,
      endSeconds: roundedSignal(durationSeconds),
      detail: "The decoded source peak stayed at or below the recorded near-silence threshold. Listen before relying on this take.",
    });
  }
  if (stereoBalanceDb !== null && Math.abs(stereoBalanceDb) >= THRESHOLDS.stereoImbalanceDb) {
    observations.push({
      kind: "stereo-imbalance",
      severity: "attention",
      startSeconds: 0,
      endSeconds: roundedSignal(durationSeconds),
      detail: `The decoded left/right RMS balance differs by ${Math.abs(stereoBalanceDb).toFixed(1)} dB.`,
    });
  }
  observations.push(...appendWindowRanges(
    windows,
    (window) => window.clippedFrameCount > 0,
    (startSeconds, endSeconds, range) => {
      const count = range.reduce((total, window) => total + window.clippedFrameCount, 0);
      return {
        kind: "sample-clipping",
        severity: "warning",
        startSeconds: roundedSignal(startSeconds),
        endSeconds: roundedSignal(endSeconds),
        detail: `${count} decoded frame${count === 1 ? "" : "s"} reached the clipping observation threshold.`,
      };
    },
  ));
  let index = 0;
  while (index < windows.length) {
    if (windows[index].rmsDbfs > THRESHOLDS.nearSilenceDbfs) {
      index += 1;
      continue;
    }
    const startIndex = index;
    while (index + 1 < windows.length && windows[index + 1].rmsDbfs <= THRESHOLDS.nearSilenceDbfs) index += 1;
    const endIndex = index;
    const startSeconds = windows[startIndex].startSeconds;
    const endSeconds = windows[endIndex].startSeconds + windows[endIndex].durationSeconds;
    const previousHasSignal = startIndex > 0 && windows[startIndex - 1].rmsDbfs >= THRESHOLDS.surroundingSignalDbfs;
    const nextHasSignal = endIndex + 1 < windows.length && windows[endIndex + 1].rmsDbfs >= THRESHOLDS.surroundingSignalDbfs;
    if (endSeconds - startSeconds >= THRESHOLDS.possibleDropoutMinimumSeconds && previousHasSignal && nextHasSignal) {
      observations.push({
        kind: "possible-dropout",
        severity: "attention",
        startSeconds: roundedSignal(startSeconds),
        endSeconds: roundedSignal(endSeconds),
        detail: "A near-silent interval is surrounded by measurable signal. It may be intentional silence; listen before classifying it as a dropout.",
      });
    }
    index += 1;
  }
  return observations.sort((left, right) => left.startSeconds - right.startSeconds || left.kind.localeCompare(right.kind));
}

async function probeAudio(inputPath, ffprobePath) {
  const { stdout } = await execFile(ffprobePath, [
    "-v", "error",
    "-select_streams", "a:0",
    "-show_entries", "stream=codec_name,sample_rate,channels:format=format_name,duration",
    "-of", "json",
    inputPath,
  ], { maxBuffer: 4 * 1024 * 1024 });
  const result = JSON.parse(stdout);
  const stream = Array.isArray(result.streams) ? result.streams[0] : null;
  const sampleRate = Number(stream?.sample_rate);
  const channelCount = Number(stream?.channels);
  const probedDurationSeconds = Number(result.format?.duration);
  assert(Number.isSafeInteger(sampleRate) && sampleRate > 0, "Audio signal probe found no valid sample rate.");
  assert(Number.isSafeInteger(channelCount) && channelCount > 0 && channelCount <= 32, "Audio signal probe found no valid channel layout.");
  return {
    sampleRate,
    channelCount,
    durationSeconds: Number.isFinite(probedDurationSeconds) && probedDurationSeconds > 0
      ? probedDurationSeconds
      : null,
    codec: String(stream?.codec_name || "unknown"),
    container: String(result.format?.format_name || "unknown").split(",")[0],
  };
}

export async function analyzeAudioSignalFile(inputPath, options = {}) {
  const resolvedPath = path.resolve(inputPath);
  const source = await stat(resolvedPath);
  assert(source.isFile() && source.size > 0, "Audio signal source must be a non-empty file.");
  const ffmpegPath = options.ffmpegPath || "ffmpeg";
  const ffprobePath = options.ffprobePath || "ffprobe";
  const probe = await probeAudio(resolvedPath, ffprobePath);
  const minimumWindowFrames = Math.max(Math.round(probe.sampleRate * 0.1), 1);
  let framesPerWindow = probe.durationSeconds === null
    ? minimumWindowFrames
    : Math.max(minimumWindowFrames, Math.ceil(probe.durationSeconds * probe.sampleRate / 1_200));
  const frameBytes = probe.channelCount * 4;
  const nearSilenceAmplitude = 10 ** (THRESHOLDS.nearSilenceDbfs / 20);
  const windowAggregates = [];
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
  let remainder = Buffer.alloc(0);
  let stderr = "";
  let decodeError = null;

  function compactWindowAggregates() {
    if (windowAggregates.length < 1_200) return;
    const compacted = [];
    for (let index = 0; index < windowAggregates.length; index += 2) {
      const left = windowAggregates[index];
      const right = windowAggregates[index + 1];
      compacted.push(right ? {
        startFrame: left.startFrame,
        frameCount: left.frameCount + right.frameCount,
        sumSquares: left.sumSquares + right.sumSquares,
        peak: Math.max(left.peak, right.peak),
        clippedFrameCount: left.clippedFrameCount + right.clippedFrameCount,
      } : left);
    }
    windowAggregates.splice(0, windowAggregates.length, ...compacted);
    framesPerWindow *= 2;
  }

  function finishWindow() {
    if (!windowFrameCount) return;
    const startFrame = decodedFrames - windowFrameCount;
    windowAggregates.push({
      startFrame,
      frameCount: windowFrameCount,
      sumSquares: windowSumSquares,
      peak: windowPeak,
      clippedFrameCount: windowClippedFrames,
    });
    windowFrameCount = 0;
    windowSumSquares = 0;
    windowPeak = 0;
    windowClippedFrames = 0;
    compactWindowAggregates();
  }

  const child = spawn(ffmpegPath, [
    "-hide_banner", "-loglevel", "error",
    "-i", resolvedPath,
    "-map", "0:a:0",
    "-f", "f32le",
    "-acodec", "pcm_f32le",
    "pipe:1",
  ], { stdio: ["ignore", "pipe", "pipe"] });
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => { stderr = `${stderr}${chunk}`.slice(-16_384); });
  child.stdout.on("data", (chunk) => {
    if (decodeError) return;
    try {
      const data = remainder.length ? Buffer.concat([remainder, chunk]) : chunk;
      const completeBytes = data.length - (data.length % frameBytes);
      for (let offset = 0; offset < completeBytes; offset += frameBytes) {
        let channelEnergy = 0;
        let framePeak = 0;
        for (let channel = 0; channel < probe.channelCount; channel += 1) {
          const sample = data.readFloatLE(offset + channel * 4);
          assert(Number.isFinite(sample), "Audio signal decode produced a non-finite sample.");
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
      decodeError = error instanceof Error ? error : new Error(String(error));
      child.kill("SIGTERM");
    }
  });
  const exitCode = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", resolve);
  });
  if (decodeError) throw decodeError;
  assert(exitCode === 0, `FFmpeg audio signal decode failed (${exitCode}): ${stderr.trim() || "no diagnostic"}`);
  assert(remainder.length === 0, "FFmpeg audio signal decode ended on a partial frame.");
  finishWindow();
  const windows = windowAggregates.map((window) => ({
    startSeconds: roundedSignal(window.startFrame / probe.sampleRate),
    durationSeconds: roundedSignal(window.frameCount / probe.sampleRate),
    rmsDbfs: amplitudeDbfs(Math.sqrt(window.sumSquares / window.frameCount)),
    samplePeakDbfs: amplitudeDbfs(window.peak),
    clippedFrameCount: window.clippedFrameCount,
  }));
  assert(decodedFrames > 0 && windows.length > 0 && windows.length <= 1_200, "Audio signal decode produced no bounded evidence windows.");

  const durationSeconds = decodedFrames / probe.sampleRate;
  const leftRmsDbfs = amplitudeDbfs(Math.sqrt(channelSumSquares[0] / decodedFrames));
  const rightRmsDbfs = probe.channelCount > 1 ? amplitudeDbfs(Math.sqrt(channelSumSquares[1] / decodedFrames)) : null;
  const stereoBalanceDb = rightRmsDbfs === null ? null : roundedSignal(rightRmsDbfs - leftRmsDbfs);
  const rmsDbfs = amplitudeDbfs(Math.sqrt(totalSumSquares / decodedFrames));
  const samplePeakDbfs = amplitudeDbfs(totalPeak);
  const observations = signalObservations(windows, durationSeconds, samplePeakDbfs, stereoBalanceDb);
  const signalStatus = samplePeakDbfs <= THRESHOLDS.nearSilenceDbfs
    ? "near-digital-silence"
    : observations.length
      ? "attention"
      : "signal-present";

  return {
    media: {
      container: probe.container,
      codec: probe.codec,
      sampleRate: probe.sampleRate,
      channelCount: probe.channelCount,
      durationSeconds: roundedSignal(durationSeconds),
    },
    audioSignal: {
      schemaVersion: 1,
      algorithm: "quipsly-audio-signal-window-v1",
      sampleRate: probe.sampleRate,
      channelCount: probe.channelCount,
      analyzedFrameCount: decodedFrames,
      durationSeconds: roundedSignal(durationSeconds),
      windowDurationSeconds: roundedSignal(framesPerWindow / probe.sampleRate),
      rmsDbfs,
      samplePeakDbfs,
      clippedFrameCount: clippedFrames,
      clippedFrameFraction: roundedSignal(clippedFrames / decodedFrames),
      nearSilentFrameFraction: roundedSignal(nearSilentFrames / decodedFrames),
      leftRmsDbfs,
      rightRmsDbfs,
      stereoBalanceDb,
      signalStatus,
      thresholds: THRESHOLDS,
      waveform: windows,
      observations,
    },
  };
}
