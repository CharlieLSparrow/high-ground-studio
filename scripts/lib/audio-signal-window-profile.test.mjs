import assert from "node:assert/strict";
import { execFile as execFileCallback } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";

import { analyzeAudioSignalFile } from "./audio-signal-window-profile.mjs";

const execFile = promisify(execFileCallback);

test("streams a complete bounded decode into the iPhone-compatible signal profile", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "quipsly-signal-profile-"));
  const source = path.join(root, "signal-and-gap.wav");
  try {
    await execFile("ffmpeg", [
      "-hide_banner", "-loglevel", "error", "-y",
      "-f", "lavfi", "-i", "sine=frequency=440:duration=0.8:sample_rate=48000",
      "-f", "lavfi", "-i", "anullsrc=r=48000:cl=mono:d=0.4",
      "-f", "lavfi", "-i", "sine=frequency=660:duration=0.8:sample_rate=48000",
      "-filter_complex", "[0:a][1:a][2:a]concat=n=3:v=0:a=1,volume=0.25[out]",
      "-map", "[out]", "-c:a", "pcm_s24le", source,
    ]);
    const result = await analyzeAudioSignalFile(source);
    assert.equal(result.media.sampleRate, 48_000);
    assert.equal(result.media.channelCount, 1);
    assert.ok(result.audioSignal.analyzedFrameCount >= 95_000);
    assert.ok(result.audioSignal.waveform.length > 10 && result.audioSignal.waveform.length <= 1_200);
    assert.equal(result.audioSignal.algorithm, "quipsly-audio-signal-window-v1");
    assert.equal(result.audioSignal.thresholds.nearSilenceDbfs, -72);
    assert.ok(result.audioSignal.observations.some((observation) => observation.kind === "possible-dropout"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
