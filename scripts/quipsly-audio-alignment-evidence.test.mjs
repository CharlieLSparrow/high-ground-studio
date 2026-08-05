#!/usr/bin/env node

import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdtemp, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";

import { FfmpegAudioAlignmentAnalyzer, normalizedCrossCorrelation } from "../apps/quipsly-media-processor/src/audio-alignment-ffmpeg.ts";
import { parseAudioAlignmentEvidence } from "../packages/quipsly-media-processing/src/audio-alignment-evidence.ts";

const run = promisify(execFile);

test("FFT correlation finds a distinct offset without mutating samples", () => {
  const reference = Float64Array.from({ length: 1_024 }, (_, index) => (
    Math.sin(index * 0.071) * (0.2 + (index % 113) / 113)
  ));
  const candidate = new Float64Array(2_048);
  candidate.set(reference, 437);
  const result = normalizedCrossCorrelation(reference, candidate, 8_000);
  assert.equal(result.startSample, 437);
  assert.ok(result.best > 0.999999);
  assert.ok(result.best - result.secondBest > 0.05);
});

test("FFmpeg analysis binds two separated waveform peaks and measured drift to exact source bytes", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "quipsly-audio-alignment-"));
  const spinePath = path.join(root, "spine.wav");
  const targetPath = path.join(root, "target.m4a");
  await run("ffmpeg", [
    "-hide_banner", "-loglevel", "error", "-y",
    "-f", "lavfi", "-i", "aevalsrc=0.32*sin(2*PI*(180+11*t)*t)+0.12*sin(2*PI*(731+3*t)*t):s=48000:d=14",
    "-c:a", "pcm_s24le", spinePath,
  ]);
  await run("ffmpeg", [
    "-hide_banner", "-loglevel", "error", "-y", "-i", spinePath,
    "-af", "adelay=350|350", "-c:a", "aac", "-b:a", "192k", targetPath,
  ]);
  const spine = await binding("spine-asset", spinePath, "audio/wav");
  const target = await binding("target-asset", targetPath, "audio/mp4");
  const analyzer = new FfmpegAudioAlignmentAnalyzer();
  const evidence = await analyzer.analyze({
    spinePath,
    targetPath,
    spine,
    target,
    createdAt: "2026-08-05T12:00:00.000Z",
    options: {
      initialOffsetSeconds: -0.3,
      openingTargetSeconds: 2,
      laterTargetSeconds: 9,
      windowSeconds: 2,
      searchRadiusSeconds: 0.5,
      sampleRate: 8_000,
      minimumCorrelation: 0.75,
      minimumPeakMargin: 0.03,
    },
  });
  assert.ok(Math.abs(evidence.opening.measuredOffsetSeconds + 0.35) <= 0.003, JSON.stringify(evidence.opening));
  assert.ok(Math.abs(evidence.later.measuredOffsetSeconds + 0.35) <= 0.003, JSON.stringify(evidence.later));
  assert.ok(Math.abs(evidence.drift.residualDriftMilliseconds) <= 1);
  assert.equal(evidence.qualification.qualifiedForAuthorizedAgentReview, true);
  assert.equal(evidence.boundaries.timelinePlacementApplied, false);
  assert.equal(parseAudioAlignmentEvidence(evidence).target.sha256, target.sha256);
  assert.throws(
    () => parseAudioAlignmentEvidence({ ...evidence, drift: { ...evidence.drift, observedPartsPerMillion: 99 } }),
    /integrity/,
  );
});

async function binding(assetId, filePath, contentType) {
  const file = await stat(filePath);
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  const sha256 = hash.digest("hex");
  return {
    assetId,
    provider: "local",
    locator: filePath,
    generation: `sha256:${sha256}`,
    sha256,
    sizeBytes: file.size,
    contentType,
  };
}
