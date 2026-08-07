import assert from "node:assert/strict";
import { mkdtemp, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  AUDIO_MASTERY_CONTRACT_VERSION,
  AUDIO_MASTERY_MEASUREMENT_KIND,
  buildEpisodeProgramDeliveryTargetLocator,
  newEpisodeProgramDeliveryJob,
  parseEpisodeProgramDeliveryJob,
  type AudioMasteryMeasurement,
  type AudioMasterySourceBinding,
} from "@high-ground/quipsly-media-processing";

import { runOneLocalAudioDeliveryJob, type LocalAudioDeliveryStore } from "./local-audio-delivery-worker.js";
import { sha256File } from "./transcoder.js";

test("Episode program delivery refuses a candidate-byte change without a matching target", () => {
  const job = episodeJob({ locator: "/tmp/quipsly-program.wav", sha256: "a".repeat(64), sizeBytes: 4_096 });
  assert.equal(parseEpisodeProgramDeliveryJob(job).source.programFingerprintSha256, "f".repeat(64));
  const changed = structuredClone(job);
  changed.source.sha256 = "e".repeat(64);
  changed.source.generation = `sha256:${changed.source.sha256}`;
  assert.throws(() => parseEpisodeProgramDeliveryJob(changed), /target authority is invalid/);
});

test("shared local delivery worker encodes a promoted Episode program with its own result authority", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "quipsly-episode-program-delivery-"));
  const sourcePath = path.join(root, "promoted-program.wav");
  await writeFile(sourcePath, Buffer.alloc(4_096, 7));
  const sourceSha256 = await sha256File(sourcePath);
  const job = episodeJob({ locator: sourcePath, sha256: sourceSha256, sizeBytes: (await stat(sourcePath)).size });
  let receipt: any = null;
  const store: LocalAudioDeliveryStore = {
    claim: async () => ({ id: job.jobId, inputJson: job, attempt: 1, executionId: "execution_0001" }),
    complete: async (input) => { receipt = input.receipt; return true; },
    retry: async () => true,
    fail: async () => true,
  };
  const encoder = {
    encode: async (_inputPath: string, outputPath: string) => {
      await writeFile(outputPath, Buffer.alloc(2_048, 9));
      return encoded(outputPath, await sha256File(outputPath));
    },
    inspect: async (outputPath: string) => encoded(outputPath, await sha256File(outputPath)),
  };
  const measurer = {
    measure: async (_inputPath: string, input: { source: AudioMasterySourceBinding; profileId: "apple-podcasts-dialogue-v1"; measurementId?: string; measuredAt?: string }) => measurement(input.source, input.measurementId!, input.measuredAt!),
  };
  const result = await runOneLocalAudioDeliveryJob(store, encoder, measurer, { executionId: "execution_0001", buildId: "build_0001", imageDigest: null, leaseMs: 60_000, localMediaRoot: root, now: () => new Date("2026-08-07T15:05:00.000Z") });
  assert.equal(result.disposition, "completed", JSON.stringify(result));
  assert.equal(receipt.kind, "quipsly-episode-program-delivery-result-v1");
  assert.equal(receipt.source.mixJobId, "episode_mix_job_0001");
  assert.equal(receipt.output.variantKind, "episode-program-delivery-artifact");
  assert.equal(receipt.boundaries.promotedProgramRemainsCandidateTruth, true);
});

function episodeJob(source: { locator: string; sha256: string; sizeBytes: number }) {
  return newEpisodeProgramDeliveryJob({
    jobId: "episode_program_delivery_job_0001",
    projectId: "project_0001",
    requestedByEmail: "tester@quipsly.com",
    queuedAt: "2026-08-07T15:00:00.000Z",
    source: {
      assetId: "episode_program_asset_0001",
      provider: "local",
      locator: source.locator,
      generation: `sha256:${source.sha256}`,
      sha256: source.sha256,
      sizeBytes: source.sizeBytes,
      durationSeconds: 12,
      contentType: "audio/wav",
      episodeProductionId: "episode_production_0001",
      mixJobId: "episode_mix_job_0001",
      mixReviewReceiptId: "episode_mix_review_0001",
      promotionReceiptId: "episode_mix_promotion_0001",
      programFingerprintSha256: "f".repeat(64),
      proposalSha256: "b".repeat(64),
      baselineSha256: "c".repeat(64),
    },
    masteryProfileId: "apple-podcasts-dialogue-v1",
    profileId: "apple-podcasts-aac-stereo-v1",
    target: {
      provider: "local",
      locator: buildEpisodeProgramDeliveryTargetLocator({ episodeProductionId: "episode_production_0001", candidateSha256: source.sha256, profileId: "apple-podcasts-aac-stereo-v1" }),
      contentType: "audio/mp4",
      codec: "aac",
      codecProfile: "LC",
      sampleRateHz: 48_000,
      channels: 2,
      bitrateBps: 128_000,
      fastStartRequired: true,
      variantKind: "episode-program-delivery-artifact",
    },
  });
}

function encoded(outputPath: string, sha256: string) {
  return { outputPath, sha256, sizeBytes: 2_048, contentType: "audio/mp4" as const, codec: "aac" as const, codecProfile: "LC" as const, container: "mov,mp4,m4a,3gp,3g2,mj2" as const, sampleRateHz: 48_000 as const, channels: 2 as const, bitrateBps: 128_000, durationSeconds: 12, fastStart: true as const, completeDecode: true as const, ffmpegVersion: "ffmpeg version test" };
}

function measurement(source: AudioMasterySourceBinding, measurementId: string, measuredAt: string): AudioMasteryMeasurement {
  return { kind: AUDIO_MASTERY_MEASUREMENT_KIND, version: AUDIO_MASTERY_CONTRACT_VERSION, measurementId, measuredAt, source, profileId: "apple-podcasts-dialogue-v1", durationSeconds: 12, channels: 2, sampleRateHz: 48_000, integratedLufs: -16, truePeakDbtp: -2, loudnessRangeLu: 2, thresholdLufs: -40, targetOffsetLu: 0, seriesResolutionMs: 1_000, series: [], analyzer: { name: "ffmpeg-loudnorm-ebur128", version: "test", standard: "ITU-R BS.1770 / EBU R128", completeDecode: true } };
}
