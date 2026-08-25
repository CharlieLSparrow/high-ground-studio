import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import test from "node:test";

import {
  DIALOGUE_REPAIR_CLOUD_QUEUE_KIND,
  buildDialogueRepairCloudManifestObjectName,
  buildDialogueRepairCloudQueueObjectName,
  buildDialogueRepairCloudResultObjectName,
  buildDialogueRepairTargetLocator,
  newDialogueRepairCandidate,
  newDialogueRepairCloudManifest,
  newDialogueRepairJob,
  newDialogueRepairProposal,
  newDialogueRepairReviewReceipt,
  parseDialogueRepairCloudManifest,
  parseDialogueRepairResult,
} from "../packages/quipsly-media-processing/src/audio-dialogue-repair.ts";
import { processDialogueRepairCloudQueueObject } from "../apps/quipsly-media-processor/src/dialogue-repair-cloud-worker.ts";

const digest = (value) => createHash("sha256").update(value).digest("hex");
const bucketName = "quipsly-test-bucket";
const sourceBytes = Buffer.from("cloud-dialogue-source-audio");
const outputBytes = Buffer.from("verified-dialogue-repair-preview");
const sourceBinding = {
  assetId: "asset_dialogue_cloud",
  provider: "gcs",
  locator: `gcs://${bucketName}/media-vault/raw/dialogue.wav?generation=201`,
  generation: "201",
  sha256: digest(sourceBytes),
  sizeBytes: sourceBytes.length,
  contentType: "audio/wav",
};
const candidate = newDialogueRepairCandidate({
  candidateId: "candidate_dialogue_cloud",
  createdAt: "2026-08-25T13:00:00.000Z",
  createdByEmail: "reviewer@example.test",
  label: "mouth-click",
  source: sourceBinding,
  range: {
    startSeconds: 4,
    endSeconds: 4.03,
    auditionPreRollSeconds: 1.5,
    auditionPostRollSeconds: 1.5,
    sourceDurationSeconds: 12,
  },
  origin: { kind: "human-marked" },
  context: { speakerId: null, speakerLabel: null, transcriptWordAnchors: [] },
});
const review = newDialogueRepairReviewReceipt({
  receiptId: "review_dialogue_cloud",
  occurredAt: "2026-08-25T13:01:00.000Z",
  actorEmail: "reviewer@example.test",
  decision: "confirmed",
  candidate,
  evidence: {
    protectedPlaybackSourceId: "source_dialogue_cloud",
    contextStartSeconds: 2.5,
    contextEndSeconds: 5.53,
    listenedSecondBins: [2, 3, 4, 5],
    clientTrackedPlaybackIsNotProofOfAudibility: true,
  },
});
const proposal = newDialogueRepairProposal({
  proposalId: "proposal_dialogue_cloud",
  createdAt: "2026-08-25T13:02:00.000Z",
  candidate,
  reviewReceipt: review,
});
const job = newDialogueRepairJob({
  jobId: "dialogue_repair_cloud123",
  projectId: "project_dialogue_cloud",
  requestedByEmail: "reviewer@example.test",
  queuedAt: "2026-08-25T13:03:00.000Z",
  source: sourceBinding,
  proposal,
  target: {
    provider: "gcs",
    locator: buildDialogueRepairTargetLocator({
      assetId: sourceBinding.assetId,
      sourceSha256: sourceBinding.sha256,
      candidateId: candidate.candidateId,
      range: candidate.range,
    }),
    contentType: "audio/wav",
    codec: "pcm_s24le",
    sampleRateHz: 48_000,
    variantKind: "dialogue-repair-preview",
  },
});

function measurement(source, measuredAt) {
  return {
    kind: "quipsly-audio-measurement-v1",
    version: 1,
    measurementId: `measurement_${digest(`${source.sha256}:${measuredAt}`).slice(0, 24)}`,
    measuredAt,
    source,
    profileId: "apple-podcasts-dialogue-v1",
    durationSeconds: 12,
    channels: 1,
    sampleRateHz: 48_000,
    integratedLufs: -18,
    truePeakDbtp: -2,
    loudnessRangeLu: 4,
    thresholdLufs: -28,
    targetOffsetLu: 2,
    seriesResolutionMs: 1_000,
    series: [{ timeMs: 1_000, momentaryLufs: -18, shortTermLufs: -18, integratedLufs: -18, truePeakDbtp: -2 }],
    analyzer: { name: "ffmpeg-loudnorm-ebur128", version: "ffmpeg cloud fixture", standard: "ITU-R BS.1770 / EBU R128", completeDecode: true },
  };
}

function diagnosis(source, analyzedAt) {
  const statistics = (channel) => ({
    channel,
    dcOffset: 0,
    peakDbfs: -2,
    rmsDbfs: -18,
    rmsPeakDbfs: -16,
    rmsTroughDbfs: -22,
    crestFactor: 4,
    flatFactor: 0,
    peakCount: 1,
    noiseFloorDbfs: -60,
    dynamicRangeDb: 20,
    zeroCrossingRate: 0.1,
    nanCount: 0,
    infCount: 0,
    denormalCount: 0,
  });
  return {
    kind: "quipsly-audio-signal-diagnosis-v1",
    version: 1,
    diagnosisId: `diagnosis_${digest(`${source.sha256}:${analyzedAt}`).slice(0, 24)}`,
    analyzedAt,
    source,
    durationSeconds: 12,
    sampleRateHz: 48_000,
    channelCount: 1,
    overall: statistics(null),
    channels: [statistics(1)],
    nearSilenceSpans: [],
    observations: [],
    thresholds: { nearFullScaleDbfs: -0.05, nearSilenceDbfs: -55, nearSilenceMinimumSeconds: 0.25, dcOffsetAmplitude: 0.01, channelImbalanceDb: 6 },
    analyzer: {
      name: "ffmpeg-astats-silencedetect",
      version: "ffmpeg cloud fixture",
      completeDecode: true,
      statisticsAreNotListeningJudgments: true,
      nearSilenceIsNotAutomaticallyADropout: true,
      noiseFloorIsAnEstimate: true,
    },
  };
}

class MemoryStorage {
  objects = new Map();
  media = new Map([["media-vault/raw/dialogue.wav@201", { bytes: sourceBytes, contentType: "audio/wav", customMetadata: {} }]]);
  generation = 20;
  put(name, value) { const generation = String(++this.generation); this.objects.set(name, { value, generation }); return generation; }
  async listQueueObjects() { return []; }
  async listQueueObjectsUnder() { return []; }
  async loadJson(name, generation) { const row = this.objects.get(name); if (!row || (generation && row.generation !== generation)) throw Object.assign(new Error("missing"), { code: 404 }); return structuredClone(row); }
  async saveJson(name, value, expected) { const row = this.objects.get(name); if (!row || row.generation !== expected) throw Object.assign(new Error("precondition"), { code: 412 }); this.put(name, value); return this.loadJson(name); }
  async saveJsonIfAbsent(name, value) { if (!this.objects.has(name)) this.put(name, value); return this.loadJson(name); }
  async objectEvidence(name, generation) { const row = this.media.get(`${name}@${generation}`); return row ? { bucketName, objectName: name, generation, sizeBytes: row.bytes.length, contentType: row.contentType, crc32c: "fixture-crc", customMetadata: row.customMetadata } : null; }
  async materializeObject(name, generation, destination) { const row = this.media.get(`${name}@${generation}`); if (!row) throw new Error("missing source"); await writeFile(destination, row.bytes); return { sizeBytes: row.bytes.length, sha256: digest(row.bytes) }; }
  async uploadProxy(sourcePath, objectName, contentType, customMetadata) { const bytes = await readFile(sourcePath); const generation = String(++this.generation); this.media.set(`${objectName}@${generation}`, { bytes, contentType, customMetadata }); return { bucketName, objectName, generation, sizeBytes: bytes.length, contentType, crc32c: "fixture-crc", customMetadata }; }
  async deleteObject(name, generation) { const row = this.objects.get(name); if (row?.generation === generation) this.objects.delete(name); }
  async writeDeadLetter(name, value) { if (!this.objects.has(name)) this.put(name, value); }
}

function queued(storage) {
  const manifestName = buildDialogueRepairCloudManifestObjectName(job.jobId);
  const manifestGeneration = storage.put(manifestName, newDialogueRepairCloudManifest(job));
  const queueName = buildDialogueRepairCloudQueueObjectName(job.jobId);
  const queueGeneration = storage.put(queueName, {
    kind: DIALOGUE_REPAIR_CLOUD_QUEUE_KIND,
    version: 1,
    jobId: job.jobId,
    manifestObjectName: manifestName,
    manifestGeneration,
    enqueuedAt: job.queuedAt,
  });
  return { manifestName, queueName, queueGeneration };
}

test("cloud Dialogue Repair renders, independently verifies, and keeps a matched-audition preview", async () => {
  const storage = new MemoryStorage();
  const control = queued(storage);
  const engine = {
    measure: async (_path, input) => measurement(input.source, input.measuredAt),
    diagnose: async (_path, input) => diagnosis(input.source, input.analyzedAt),
    renderDialogueRepairExperiment: async (_source, outputPath, input) => {
      await writeFile(outputPath, outputBytes);
      return {
        outputPath,
        sizeBytes: outputBytes.length,
        sha256: digest(outputBytes),
        contentType: "audio/wav",
        sampleRateHz: 48_000,
        codec: "pcm_s24le",
        originalRemainsSourceTruth: true,
        outputIsUnpromotedExperiment: true,
        treatmentRange: input.proposal.treatmentRange,
        authorizingReviewReceiptId: input.proposal.authorizingReviewReceiptId,
      };
    },
  };
  const result = await processDialogueRepairCloudQueueObject(storage, engine, {
    executionId: "execution_dialogue_cloud",
    buildId: "cloud-test-build",
    imageDigest: "sha256:test",
    leaseDurationMs: 60_000,
    now: () => new Date("2026-08-25T13:04:00.000Z"),
  }, { name: control.queueName, generation: control.queueGeneration });
  assert.deepEqual(result, { disposition: "completed", jobId: job.jobId, outputGeneration: "24" });
  const manifest = parseDialogueRepairCloudManifest((await storage.loadJson(control.manifestName)).value, job.jobId);
  assert.equal(manifest.status, "completed");
  const receipt = parseDialogueRepairResult((await storage.loadJson(buildDialogueRepairCloudResultObjectName(job.jobId))).value, job);
  assert.equal(receipt.derivative.provider, "gcs");
  assert.equal(receipt.derivative.locator, `gcs://${bucketName}/${job.target.locator}?generation=${receipt.derivative.generation}`);
  assert.equal(receipt.verification.passes, true);
  assert.equal(receipt.boundaries.matchedAuditionRequired, true);
  assert.equal(receipt.boundaries.promotionRequiresSeparateApproval, true);
  assert.equal(storage.objects.has(control.queueName), false);
});

test("cloud Dialogue Repair fails closed when its immutable source generation disappears", async () => {
  const storage = new MemoryStorage();
  storage.media.clear();
  const control = queued(storage);
  const result = await processDialogueRepairCloudQueueObject(storage, {}, {
    executionId: "execution_dialogue_missing",
    buildId: "cloud-test-build",
    imageDigest: null,
    leaseDurationMs: 60_000,
    now: () => new Date("2026-08-25T13:04:00.000Z"),
  }, { name: control.queueName, generation: control.queueGeneration });
  assert.deepEqual(result, { disposition: "terminal", jobId: job.jobId, code: "dialogue-repair-source-generation-mismatch" });
});
