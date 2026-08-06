import assert from "node:assert/strict";
import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  AUDIO_MASTERY_CONTRACT_VERSION,
  AUDIO_MASTERY_MEASUREMENT_KIND,
  newAutomaticEpisodeAudioMixProposal,
  parseEpisodeAudioMixResult,
  type AudioMasteryMeasurement,
  type AudioMasterySourceBinding,
  type EpisodeAudioMixTrack,
} from "@high-ground/quipsly-media-processing";

import { runOneLocalEpisodeAudioMixJob, type LocalEpisodeAudioMixStore } from "./local-episode-audio-mix-worker.js";
import { sha256File } from "./transcoder.js";

test("local mix worker renders, masters, independently measures, and stages an unpromoted receipt", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "quipsly-episode-mix-worker-"));
  const primaryPath = path.join(root, "primary.wav");
  const scratchPath = path.join(root, "scratch.wav");
  const outputPath = path.join(root, "previews", "mix.wav");
  const baselinePath = path.join(root, "previews", "baseline.wav");
  await writeFile(primaryPath, Buffer.alloc(512, 1));
  await writeFile(scratchPath, Buffer.alloc(768, 2));
  const [primary, scratch] = await Promise.all([binding("asset_primary", primaryPath), binding("asset_scratch", scratchPath)]);
  const tracks: EpisodeAudioMixTrack[] = [
    { assetId: "asset_primary", sourceId: "source_primary", title: "Primary", participantId: "participant_primary", participantLabel: "Charlie", role: "dialogue-primary", mixDisposition: "include", alignment: "program-clock", programOffsetSeconds: 0, sourceDurationSeconds: 2, alignmentEvidenceJobId: null, source: primary },
    { assetId: "asset_scratch", sourceId: "source_scratch", title: "Scratch", participantId: "participant_scratch", participantLabel: "Camera", role: "camera-scratch", mixDisposition: "include", alignment: "qualified-candidate", programOffsetSeconds: 0.1, sourceDurationSeconds: 2, alignmentEvidenceJobId: "alignment_0001", source: scratch },
  ];
  const proposal = newAutomaticEpisodeAudioMixProposal({ proposalId: "mix_job_0001", createdAt: "2026-08-06T12:00:00.000Z", projectId: "project_0001", episodeProductionId: "episode_0001", programFingerprintSha256: "f".repeat(64), activeDecisionReceiptIds: ["decision_0001"], tracks, evidenceReviews: [{ receiptId: "review_0001", analysisReceiptId: "analysis_0001", eventId: "event_0001", decision: "mic-bleed", startSeconds: 0.5, endSeconds: 1.2, involvedAssetIds: ["asset_primary", "asset_scratch"], playbackEvidenceSha256: "c".repeat(64) }], output: { assetId: "mix_asset_0001", provider: "local", locator: outputPath, contentType: "audio/wav", codec: "pcm_s24le", sampleRateHz: 48_000, channelCount: 2, variantKind: "episode-mix-preview", masteryProfileId: "apple-podcasts-dialogue-v1" }, baselineOutput: { assetId: "mix_baseline_0001", provider: "local", locator: baselinePath, contentType: "audio/wav", codec: "pcm_s24le", sampleRateHz: 48_000, channelCount: 2, variantKind: "episode-mix-baseline", masteryProfileId: "apple-podcasts-dialogue-v1" } });
  let receipt: any = null;
  const store: LocalEpisodeAudioMixStore = {
    claim: async () => ({ id: proposal.proposalId, inputJson: proposal, attempt: 1, executionId: "execution_0001" }),
    complete: async (input) => { receipt = input.receipt; return true; },
    retry: async () => true,
    fail: async () => true,
  };
  const renderActionCounts: number[] = [];
  const renderer = {
    renderUnmasteredPreview: async (input: any) => { renderActionCounts.push(input.proposal.actions.length); await writeFile(input.outputPath, Buffer.alloc(2_048, input.proposal.actions.length ? 3 : 6)); return { outputPath: input.outputPath, sizeBytes: 2_048, sha256: "0".repeat(64), durationSeconds: 2.1, sampleRateHz: 48_000 as const, channels: 2 as const, codec: "pcm_f32le" as const, ffmpegVersion: "ffmpeg version test", exactSourcesVerifiedBeforeAndAfter: true as const, originalTracksRemainSourceTruth: true as const }; },
    encodePcm24: async (inputPath: string, targetPath: string) => { await writeFile(targetPath, Buffer.alloc(2_048, 4)); return { sizeBytes: 2_048, sha256: "0".repeat(64) }; },
  };
  const mastery = {
    measure: async (inputPath: string, input: { source: AudioMasterySourceBinding; profileId: "apple-podcasts-dialogue-v1"; measurementId?: string; measuredAt?: string }) => measurement(input.source, input.measurementId!, input.measuredAt!, inputPath.includes("unmastered") ? -30 : input.source.assetId.includes("baseline") ? -15.9 : -16),
    renderLoudnessMaster: async (inputPath: string, targetPath: string) => { await writeFile(targetPath, await readFile(inputPath)); },
  };
  const result = await runOneLocalEpisodeAudioMixJob(store, renderer, mastery, { executionId: "execution_0001", buildId: "build_0001", imageDigest: null, leaseMs: 60_000, localMediaRoot: root, now: () => new Date("2026-08-06T12:05:00.000Z") });
  assert.equal(result.disposition, "completed", JSON.stringify(result));
  assert.equal(receipt.derivative.assetId, "mix_asset_0001");
  assert.equal(receipt.baselineDerivative.assetId, "mix_baseline_0001");
  assert.equal(receipt.derivative.measurement.integratedLufs, -16);
  assert.equal(receipt.baselineDerivative.measurement.integratedLufs, -15.9);
  assert.deepEqual(renderActionCounts, [1, 0], "proposal and untouched baseline must be rendered independently");
  assert.equal(receipt.verification.levelMatchedDeltaLufs, 0.1);
  assert.equal(receipt.verification.levelMatchedWithinPointTwoLu, true);
  assert.equal(receipt.verification.outputByteRelationship, "different");
  assert.equal(receipt.verification.outputRelationshipMatchesProposal, true);
  assert.equal(receipt.verification.integratedLoudnessPasses, true);
  assert.equal(receipt.boundaries.outputIsUnpromotedPreview, true);
  const automatedNoOp = structuredClone(receipt);
  automatedNoOp.baselineDerivative.sha256 = automatedNoOp.derivative.sha256;
  automatedNoOp.baselineDerivative.generation = automatedNoOp.derivative.generation;
  automatedNoOp.baselineDerivative.sizeBytes = automatedNoOp.derivative.sizeBytes;
  automatedNoOp.baselineDerivative.measurement.source.sha256 = automatedNoOp.derivative.sha256;
  automatedNoOp.baselineDerivative.measurement.source.generation = automatedNoOp.derivative.generation;
  automatedNoOp.baselineDerivative.measurement.source.sizeBytes = automatedNoOp.derivative.sizeBytes;
  assert.throws(() => parseEpisodeAudioMixResult(automatedNoOp), /automation did not change/);
  const changedNoOp = structuredClone(receipt);
  changedNoOp.proposal.actions = [];
  assert.throws(() => parseEpisodeAudioMixResult(changedNoOp), /no-op Episode mix proposal did not remain bit-identical/);
});

async function binding(assetId: string, locator: string): Promise<AudioMasterySourceBinding> { const file = await stat(locator); const sha256 = await sha256File(locator); return { assetId, provider: "local", locator, generation: `sha256:${sha256}`, sha256, sizeBytes: file.size, contentType: "audio/wav" }; }
function measurement(source: AudioMasterySourceBinding, measurementId: string, measuredAt: string, integratedLufs: number): AudioMasteryMeasurement { return { kind: AUDIO_MASTERY_MEASUREMENT_KIND, version: AUDIO_MASTERY_CONTRACT_VERSION, measurementId, measuredAt, source, profileId: "apple-podcasts-dialogue-v1", durationSeconds: 2.1, channels: 2, sampleRateHz: 48_000, integratedLufs, truePeakDbtp: -2, loudnessRangeLu: 2, thresholdLufs: -40, targetOffsetLu: integratedLufs === -16 ? 0 : 14, seriesResolutionMs: 1_000, series: [], analyzer: { name: "ffmpeg-loudnorm-ebur128", version: "test", standard: "ITU-R BS.1770 / EBU R128", completeDecode: true } }; }
