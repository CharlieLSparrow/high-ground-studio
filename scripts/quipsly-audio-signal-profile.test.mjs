import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  newAudioSignalProfileJob,
  parseAudioSignalProfile,
  parseAudioSignalProfileResult,
} from "../packages/quipsly-media-processing/src/index.ts";
import { runOneLocalAudioSignalProfileJob } from "../apps/quipsly-media-processor/src/local-audio-signal-profile-worker.ts";

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
    assert.equal(verified.boundaries.analysisDoesNotChangeMedia, true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
