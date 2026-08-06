import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFile as execFileCallback } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";

import {
  newAudioSignalProfileJob,
  parseAudioSignalProfile,
  parseAudioSignalProfileResult,
} from "../packages/quipsly-media-processing/src/index.ts";
import { runOneLocalAudioSignalProfileJob } from "../apps/quipsly-media-processor/src/local-audio-signal-profile-worker.ts";
import { FfmpegAudioSignalProfiler } from "../apps/quipsly-media-processor/src/audio-signal-profile-ffmpeg.ts";

const execFile = promisify(execFileCallback);

function profile() {
  return {
    schemaVersion: 1,
    algorithm: "quipsly-audio-signal-window-v1",
    sampleRate: 48_000,
    channelCount: 1,
    analyzedFrameCount: 48_000,
    durationSeconds: 1,
    windowDurationSeconds: 0.5,
    rmsDbfs: -18,
    samplePeakDbfs: -3,
    clippedFrameCount: 0,
    clippedFrameFraction: 0,
    nearSilentFrameFraction: 0,
    leftRmsDbfs: -18,
    rightRmsDbfs: null,
    stereoBalanceDb: null,
    signalStatus: "signal-present",
    thresholds: { clippingAmplitude: 0.999, nearSilenceDbfs: -72, possibleDropoutMinimumSeconds: 0.25, surroundingSignalDbfs: -45, stereoImbalanceDb: 12 },
    waveform: [
      { startSeconds: 0, durationSeconds: 0.5, rmsDbfs: -18, samplePeakDbfs: -3, clippedFrameCount: 0 },
      { startSeconds: 0.5, durationSeconds: 0.5, rmsDbfs: -19, samplePeakDbfs: -4, clippedFrameCount: 0 },
    ],
    frequencyProfile: {
      algorithm: "quipsly-audio-broad-band-rms-v1",
      completeDecode: true,
      downmixPolicy: "ffmpeg-default-mono-v1",
      windowDurationSeconds: 0.5,
      analyzedFrameCount: 48_000,
      bands: [
        { id: "warmth", label: "Warmth", minimumHz: 80, maximumHz: 250 },
        { id: "speech", label: "Speech", minimumHz: 500, maximumHz: 2_000 },
      ],
      overallBandRmsDbfs: [-28, -20],
      windows: [
        { startSeconds: 0, durationSeconds: 0.5, bandRmsDbfs: [-25, -18] },
        { startSeconds: 0.5, durationSeconds: 0.5, bandRmsDbfs: [-31, -22] },
      ],
      boundaries: {
        broadBandsAreNotARepairSpectrogram: true,
        measurementsAreNotEqDecisions: true,
        stereoIsDownmixedForFrequencyOverview: true,
      },
    },
    observations: [],
  };
}

test("audio signal profile rejects unbounded waveform evidence", () => {
  const unbounded = profile();
  unbounded.waveform = Array.from({ length: 1_201 }, (_, index) => ({ startSeconds: index / 10, durationSeconds: 0.1, rmsDbfs: -18, samplePeakDbfs: -3, clippedFrameCount: 0 }));
  assert.throws(() => parseAudioSignalProfile(unbounded), /invalid or unbounded/);
});

test("local signal worker binds a complete-decode receipt to exact immutable bytes", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "quipsly-signal-worker-"));
  try {
    const sourcePath = path.join(root, "canon-source.mov");
    const bytes = Buffer.from("immutable canon source fixture");
    await writeFile(sourcePath, bytes);
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const job = newAudioSignalProfileJob({
      jobId: "audio_signal_worker_fixture_001",
      projectId: "project_signal_fixture_001",
      requestedByEmail: "editor@example.test",
      queuedAt: "2026-08-04T12:00:00.000Z",
      source: { assetId: "asset_signal_fixture_001", provider: "local", locator: sourcePath, generation: `sha256:${sha256}`, sha256, sizeBytes: bytes.length, contentType: "video/quicktime" },
    });
    let receipt = null;
    const store = {
      async claim() { return { id: job.jobId, inputJson: job, attempt: 1, executionId: "execution_signal_fixture_001" }; },
      async complete(input) { receipt = input.receipt; return true; },
      async retry() { assert.fail("worker must not retry a valid fixture"); },
      async fail() { assert.fail("worker must not fail a valid fixture"); },
    };
    const profiler = {
      async analyze() {
        return { media: { container: "mov", codec: "pcm_s24le", sampleRate: 48_000, channelCount: 1, durationSeconds: 1 }, audioSignal: profile(), ffmpegVersion: "ffmpeg fixture" };
      },
    };
    const result = await runOneLocalAudioSignalProfileJob(store, profiler, {
      executionId: "execution_signal_fixture_001",
      buildId: "build-signal-fixture",
      imageDigest: null,
      leaseMs: 60_000,
      localMediaRoot: root,
      now: () => new Date("2026-08-04T12:01:00.000Z"),
    });
    assert.deepEqual(result, { disposition: "completed", jobId: job.jobId, windowCount: 2 });
    const verified = parseAudioSignalProfileResult(receipt, job);
    assert.equal(verified.source.sha256, sha256);
    assert.equal(verified.analyzer.completeDecode, true);
    assert.equal(verified.analyzer.frequencyAnalysis?.completeDecode, true);
    assert.equal(verified.audioSignal.frequencyProfile?.boundaries.measurementsAreNotEqDecisions, true);
    assert.equal(verified.boundaries.analysisDoesNotChangeMedia, true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("FFmpeg profile distinguishes low warmth from high presence on the immutable source clock", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "quipsly-frequency-profile-"));
  const sourcePath = path.join(root, "warmth-then-presence.wav");
  try {
    await execFile("ffmpeg", [
      "-hide_banner", "-loglevel", "error", "-y",
      "-f", "lavfi", "-i", "sine=frequency=160:duration=1:sample_rate=48000",
      "-f", "lavfi", "-i", "sine=frequency=4000:duration=1:sample_rate=48000",
      "-filter_complex", "[0:a][1:a]concat=n=2:v=0:a=1,volume=0.25[out]",
      "-map", "[out]", "-c:a", "pcm_s24le", sourcePath,
    ]);
    const result = await new FfmpegAudioSignalProfiler().analyze(sourcePath);
    const frequency = result.audioSignal.frequencyProfile;
    assert.ok(frequency, "The complete decode did not produce broad-band frequency evidence.");
    assert.equal(frequency.analyzedFrameCount, result.audioSignal.analyzedFrameCount);
    assert.equal(frequency.windows.at(-1).startSeconds + frequency.windows.at(-1).durationSeconds, result.audioSignal.durationSeconds);
    const warmthIndex = frequency.bands.findIndex((band) => band.id === "warmth");
    const presenceIndex = frequency.bands.findIndex((band) => band.id === "presence");
    assert.ok(warmthIndex >= 0 && presenceIndex >= 0, "Expected speech-oriented frequency bands are missing.");
    const lowWindow = frequency.windows.find((window) => window.startSeconds <= 0.4 && window.startSeconds + window.durationSeconds > 0.4);
    const highWindow = frequency.windows.find((window) => window.startSeconds <= 1.4 && window.startSeconds + window.durationSeconds > 1.4);
    assert.ok(lowWindow && highWindow, "Frequency evidence lost the two source-clock regions.");
    assert.ok(lowWindow.bandRmsDbfs[warmthIndex] > lowWindow.bandRmsDbfs[presenceIndex] + 15, "The low-frequency source did not dominate its warmth band.");
    assert.ok(highWindow.bandRmsDbfs[presenceIndex] > highWindow.bandRmsDbfs[warmthIndex] + 15, "The high-frequency source did not dominate its presence band.");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("FFmpeg profile completely decodes streamed WebM without container duration metadata", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "quipsly-streamed-webm-profile-"));
  const sourcePath = path.join(root, "open-ended-browser-source.webm");
  try {
    const { stdout } = await execFile("ffmpeg", [
      "-hide_banner", "-loglevel", "error",
      "-f", "lavfi", "-i", "anullsrc=r=48000:cl=mono",
      "-t", "1.2", "-c:a", "libopus", "-live", "1", "-f", "webm", "pipe:1",
    ], { encoding: "buffer", maxBuffer: 8 * 1024 * 1024 });
    assert.ok(Buffer.isBuffer(stdout) && stdout.length > 0, "FFmpeg did not emit the streamed WebM fixture.");
    await writeFile(sourcePath, stdout);
    const probe = JSON.parse((await execFile("ffprobe", [
      "-v", "error", "-show_entries", "format=duration", "-of", "json", sourcePath,
    ])).stdout);
    assert.equal(probe.format?.duration, undefined, "The fixture unexpectedly contains seekable duration metadata.");

    const result = await new FfmpegAudioSignalProfiler().analyze(sourcePath);
    assert.equal(result.media.container, "matroska");
    assert.equal(result.media.codec, "opus");
    assert.equal(result.audioSignal.signalStatus, "near-digital-silence");
    assert.ok(result.audioSignal.analyzedFrameCount > 0);
    assert.equal(result.audioSignal.durationSeconds, result.media.durationSeconds);
    assert.ok(result.audioSignal.waveform.length > 0 && result.audioSignal.waveform.length <= 1_200);
    assert.equal(result.audioSignal.frequencyProfile?.completeDecode, true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
