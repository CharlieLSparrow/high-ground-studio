import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";

import { FfmpegAudioSignalProfiler } from "./audio-signal-profile-ffmpeg.js";

const run = promisify(execFile);

test("FFmpeg complete decode carries calibrated programme loudness into the shared profile", async (context) => {
  const directory = await mkdtemp(path.join(tmpdir(), "quipsly-loudness-"));
  context.after(async () => { await rm(directory, { recursive: true, force: true }); });
  const sourcePath = path.join(directory, "ebu-calibration.wav");
  await run("ffmpeg", [
    "-hide_banner", "-loglevel", "error",
    "-f", "lavfi", "-i", "aevalsrc=0.0707945784*sin(2*PI*1000*t)|0.0707945784*sin(2*PI*1000*t):s=48000:d=20",
    "-c:a", "pcm_f32le", sourcePath,
  ]);

  const result = await new FfmpegAudioSignalProfiler().analyze(sourcePath, { frequencyAnalysis: false });

  assert.equal(result.media.sampleRate, 48_000);
  assert.equal(result.media.channelCount, 2);
  assert.equal(result.audioSignal.loudness?.standard, "ITU-R BS.1770-5");
  assert.equal(result.audioSignal.loudness?.status, "measured");
  const measuredLufs = result.audioSignal.loudness?.integratedLoudnessLufs ?? null;
  assert.notEqual(measuredLufs, null);
  assert.ok(Math.abs(measuredLufs! - -23) <= 0.1, `expected -23 ±0.1 LUFS, received ${measuredLufs}`);
  assert.equal(result.audioSignal.loudness?.analyzedFrameCount, result.audioSignal.analyzedFrameCount);
  assert.equal(result.audioSignal.loudness?.measurementBlockCount, 197);
});
