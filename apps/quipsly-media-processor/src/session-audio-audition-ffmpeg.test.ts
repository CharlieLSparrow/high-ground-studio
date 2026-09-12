import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";

import { FfmpegSessionAudioAuditionEngine } from "./session-audio-audition-ffmpeg.js";

const run = promisify(execFile);
const digest = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");

for (const signal of ["sine=frequency=440:sample_rate=48000:duration=3", "anullsrc=r=48000:cl=mono:d=3"]) {
test(`CAF PCM master produces a seekable AAC listening copy (${signal})`, async () => {
  const directory = await mkdtemp(join(tmpdir(), "quipsly-caf-audition-test-"));
  try {
    const source = join(directory, "source.caf");
    const output = join(directory, "listening.m4a");
    await run("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", signal,
      "-c:a", "pcm_s24le", "-ac", "1", source]);
    const original = await readFile(source);
    const result = await new FfmpegSessionAudioAuditionEngine().extract(source, output);
    assert.equal(digest(await readFile(source)), digest(original));
    assert.equal(result.sha256, digest(await readFile(output)));
    assert.ok(result.sizeBytes > 0 && result.sizeBytes < original.length);
    assert.equal(result.technical.audioCodec, "aac");
    assert.equal(result.technical.decodedToEnd, true);
    assert.equal(result.technical.hasVideo, false);
    assert.ok(Math.abs(result.technical.sourceDurationSeconds - 3) < 0.001);
    assert.ok(Math.abs(result.technical.durationSeconds - 3) < 0.05);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
}
