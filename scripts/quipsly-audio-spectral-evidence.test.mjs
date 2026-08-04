import assert from "node:assert/strict";
import { execFile as execFileCallback } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, open, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";

import {
  AUDIO_SPECTRAL_TILE_BYTES,
  AUDIO_SPECTRAL_TILE_HEIGHT,
  AUDIO_SPECTRAL_TILE_WIDTH,
  newAudioSpectralEvidenceJob,
  parseAudioSpectralEvidenceResult,
} from "../packages/quipsly-media-processing/src/index.ts";
import { FfmpegAudioSpectralAnalyzer, poolTileGroup } from "../apps/quipsly-media-processor/src/audio-spectral-evidence-ffmpeg.ts";
import { runOneLocalAudioSpectralEvidenceJob } from "../apps/quipsly-media-processor/src/local-audio-spectral-evidence-worker.ts";

const execFile = promisify(execFileCallback);

test("spectral max-pooling preserves a narrow transient in the coarser clock tile", () => {
  const source = Buffer.alloc(AUDIO_SPECTRAL_TILE_BYTES * 2);
  const row = 48;
  const column = 311;
  source[AUDIO_SPECTRAL_TILE_BYTES + row * AUDIO_SPECTRAL_TILE_WIDTH + column] = 237;
  const pooled = poolTileGroup(source, 2);
  assert.equal(Math.max(...pooled), 237);
  const expectedOutputColumn = Math.floor((AUDIO_SPECTRAL_TILE_WIDTH + column) / 2);
  assert.equal(pooled[row * AUDIO_SPECTRAL_TILE_WIDTH + expectedOutputColumn], 237);
});

test("FFmpeg creates an exact-clock three-level logarithmic spectral pack", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "quipsly-spectral-ffmpeg-"));
  const sourcePath = path.join(root, "low-then-high.wav");
  const packPath = path.join(root, "analysis", "evidence.qspx");
  try {
    await execFile("ffmpeg", [
      "-hide_banner", "-loglevel", "error", "-y",
      "-f", "lavfi", "-i", "sine=frequency=220:duration=5:sample_rate=48000",
      "-f", "lavfi", "-i", "sine=frequency=4000:duration=6:sample_rate=48000",
      "-filter_complex", "[0:a][1:a]concat=n=2:v=0:a=1,volume=0.25[out]",
      "-map", "[out]", "-c:a", "pcm_s24le", sourcePath,
    ]);
    const artifact = await new FfmpegAudioSpectralAnalyzer().analyze(sourcePath, packPath);
    assert.equal(artifact.detailFrameCount, 3);
    assert.deepEqual(artifact.pyramid.levels.map(({ id, tileCount }) => ({ id, tileCount })), [
      { id: "overview", tileCount: 1 }, { id: "browse", tileCount: 1 }, { id: "detail", tileCount: 3 },
    ]);
    assert.equal((await stat(packPath)).size, 5 * AUDIO_SPECTRAL_TILE_BYTES);
    const detail = artifact.pyramid.levels.find((level) => level.id === "detail");
    const file = await open(packPath, "r");
    const bytes = Buffer.alloc(2 * AUDIO_SPECTRAL_TILE_BYTES);
    await file.read(bytes, 0, bytes.length, detail.byteOffset);
    await file.close();
    const dominantRows = [0, 1].map((frame) => {
      let bestRow = -1;
      let bestEnergy = -1;
      for (let row = 0; row < AUDIO_SPECTRAL_TILE_HEIGHT; row += 1) {
        let energy = 0;
        for (let column = 0; column < AUDIO_SPECTRAL_TILE_WIDTH; column += 1) energy += bytes[frame * AUDIO_SPECTRAL_TILE_BYTES + row * AUDIO_SPECTRAL_TILE_WIDTH + column];
        if (energy > bestEnergy) { bestEnergy = energy; bestRow = row; }
      }
      return bestRow;
    });
    assert.ok(dominantRows[0] > dominantRows[1] + 40, `Expected 220 Hz below 4 kHz on the high-to-low axis; got rows ${dominantRows.join(", ")}.`);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("local spectral worker binds the pack and receipt to unchanged immutable source bytes", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "quipsly-spectral-worker-"));
  try {
    const sourcePath = path.join(root, "source.wav");
    const sourceBytes = Buffer.from("immutable spectral fixture bytes");
    await writeFile(sourcePath, sourceBytes);
    const sourceSha = createHash("sha256").update(sourceBytes).digest("hex");
    const job = newAudioSpectralEvidenceJob({
      jobId: "audio_spectral_fixture_001",
      projectId: "project_spectral_fixture_001",
      requestedByEmail: "editor@example.test",
      queuedAt: "2026-08-04T14:00:00.000Z",
      source: { assetId: "asset_spectral_fixture_001", provider: "local", locator: sourcePath, generation: `sha256:${sourceSha}`, sha256: sourceSha, sizeBytes: sourceBytes.length, contentType: "audio/wav" },
    });
    let receipt = null;
    const store = {
      async claim() { return { id: job.jobId, inputJson: job, attempt: 1, executionId: "execution_spectral_fixture_001" }; },
      async complete(input) { receipt = input.receipt; return true; },
      async retry() { assert.fail("valid spectral worker fixture must not retry"); },
      async fail() { assert.fail("valid spectral worker fixture must not fail"); },
    };
    const analyzer = {
      async analyze(_inputPath, outputPath) {
        const pack = Buffer.alloc(3 * AUDIO_SPECTRAL_TILE_BYTES, 17);
        await writeFile(outputPath, pack);
        const sha256 = createHash("sha256").update(pack).digest("hex");
        return {
          media: { sampleRate: 48_000, channelCount: 2, durationSeconds: 5, minimumFrequencyHz: 20, maximumFrequencyHz: 22_800 },
          pyramid: {
            algorithm: "quipsly-log-stft-tile-pyramid-v1", pixelFormat: "gray8-ffmpeg-intensity-v1", tileWidth: 512, tileHeight: 192, tileByteLength: AUDIO_SPECTRAL_TILE_BYTES,
            frequencyScale: "logarithmic", frequencyOrientation: "high-to-low", magnitudeScale: "logarithmic-dbfs", dynamicRangeDb: 120, upperLimitDbfs: 0,
            levels: [
              { id: "overview", tileSpanSeconds: 300, tileCount: 1, byteOffset: 0 },
              { id: "browse", tileSpanSeconds: 30, tileCount: 1, byteOffset: AUDIO_SPECTRAL_TILE_BYTES },
              { id: "detail", tileSpanSeconds: 5, tileCount: 1, byteOffset: 2 * AUDIO_SPECTRAL_TILE_BYTES },
            ],
            pack: { provider: "local", locator: outputPath, sha256, sizeBytes: pack.length, generation: `sha256:${sha256}`, contentType: "application/vnd.quipsly.spectral-tile-pack" },
          },
          ffmpegVersion: "ffmpeg fixture",
          detailFrameCount: 1,
        };
      },
    };
    const result = await runOneLocalAudioSpectralEvidenceJob(store, analyzer, { executionId: "execution_spectral_fixture_001", buildId: "spectral-fixture-build", imageDigest: null, leaseMs: 60_000, localMediaRoot: root, now: () => new Date("2026-08-04T14:01:00.000Z") });
    assert.deepEqual(result, { disposition: "completed", jobId: job.jobId, tileCount: 3, packSizeBytes: 3 * AUDIO_SPECTRAL_TILE_BYTES });
    const verified = parseAudioSpectralEvidenceResult(receipt, job);
    assert.equal(verified.source.sha256, sourceSha);
    assert.equal(verified.boundaries.repairCandidatesRequirePlaybackReview, true);
  } finally { await rm(root, { recursive: true, force: true }); }
});
