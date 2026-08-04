import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  assessAudioMastery,
  buildAudioSignalObservations,
  buildAudioMasteryTargetLocator,
  newAudioMasteryJob,
  newAudioMasteryProposal,
  parseAudioSignalDiagnosis,
  parseAudioMasteryJob,
  parseAudioMasteryResult,
  parseAudioMasteryMeasurement,
} from "../packages/quipsly-media-processing/src/index.ts";
import {
  FfmpegAudioMasteringEngine,
  parseLoudnormReading,
} from "../apps/quipsly-media-processor/src/audio-mastering-ffmpeg.ts";
import { sha256File } from "../apps/quipsly-media-processor/src/transcoder.ts";
import { runOneLocalAudioMasteryJob } from "../apps/quipsly-media-processor/src/local-audio-mastery-worker.ts";

test("mastery proposal is a reversible source-bound graph", () => {
  const measurement = fixtureMeasurement();
  const proposal = newAudioMasteryProposal({
    proposalId: "proposal_contract_001",
    createdAt: "2026-08-03T20:00:00.000Z",
    measurement,
    profileId: "apple-podcasts-dialogue-v1",
  });
  assert.equal(proposal.action, "render-loudness-master");
  assert.deepEqual(proposal.graph.map((step) => step.operation), [
    "measure-source",
    "loudness-normalize",
    "verify-output",
  ]);
  assert.equal(proposal.profile.integratedLufs, -16);
  assert.equal(proposal.profile.maximumTruePeakDbtp, -1);
  assert.equal(proposal.profile.renderTruePeakDbtp, -1.5);
  assert.equal(proposal.boundaries.originalRemainsSourceTruth, true);
  assert.equal(proposal.boundaries.excludesDenoiseEqDeessingAndEditorialCuts, true);
});

test("a compliant source yields a measured no-change proposal", () => {
  const measurement = fixtureMeasurement({ integratedLufs: -16.4, truePeakDbtp: -2 });
  const assessment = assessAudioMastery(measurement, "apple-podcasts-dialogue-v1");
  assert.deepEqual(assessment, {
    profileId: "apple-podcasts-dialogue-v1",
    integratedStatus: "within-target",
    truePeakStatus: "within-ceiling",
    integratedDeltaLu: -0.4,
    passes: true,
  });
  const proposal = newAudioMasteryProposal({
    proposalId: "proposal_contract_002",
    createdAt: "2026-08-03T20:00:00.000Z",
    measurement,
    profileId: "apple-podcasts-dialogue-v1",
  });
  assert.equal(proposal.action, "no-change");
  assert.deepEqual(proposal.graph.map((step) => step.operation), ["measure-source", "verify-output"]);
  assert.throws(
    () => assessAudioMastery(measurement, "ebu-r128-broadcast-v1"),
    /different mastering profile/,
  );
});

test("measurement parser rejects false completeness and source or timeline drift", () => {
  const measurement = fixtureMeasurement();
  assert.throws(() => parseAudioMasteryMeasurement({
    ...measurement,
    analyzer: { ...measurement.analyzer, completeDecode: false },
  }), /completeDecode/);
  assert.throws(() => parseAudioMasteryMeasurement({
    ...measurement,
    source: { ...measurement.source, sha256: "not-a-hash" },
  }), /sha256/);
  assert.throws(() => parseAudioMasteryMeasurement({
    ...measurement,
    series: [measurement.series[1], measurement.series[0]],
  }), /monotonic/);
});

test("signal diagnosis emits listening candidates instead of automatic repair claims", () => {
  const observations = buildAudioSignalObservations({
    durationSeconds: 2,
    overall: fixtureSignalStatistics({ peakDbfs: -0.01 }),
    channels: [
      fixtureSignalStatistics({ channel: 1, dcOffset: 0.012, rmsDbfs: -18, nanCount: 1 }),
      fixtureSignalStatistics({ channel: 2, rmsDbfs: -30 }),
    ],
    nearSilenceSpans: [{ startSeconds: 0.5, endSeconds: 1, durationSeconds: 0.5 }],
  });
  assert.deepEqual(observations.map((observation) => observation.kind), [
    "near-full-scale",
    "dc-offset",
    "channel-imbalance",
    "invalid-samples",
    "near-silence",
  ]);
  assert.ok(observations.every((observation) => observation.requiresListening === true));
  assert.match(observations[0].detail, /not proof/i);
  assert.match(observations[4].detail, /pause, or a dropout/i);
});

test("signal diagnosis parser rejects false decode and channel evidence", () => {
  const diagnosis = fixtureSignalDiagnosis();
  assert.doesNotThrow(() => parseAudioSignalDiagnosis(diagnosis));
  assert.throws(() => parseAudioSignalDiagnosis({
    ...diagnosis,
    analyzer: { ...diagnosis.analyzer, completeDecode: false },
  }), /completeDecode/);
  assert.throws(() => parseAudioSignalDiagnosis({
    ...diagnosis,
    channels: [{ ...diagnosis.channels[0], channel: 2 }],
  }), /cardinality/);
});

test("loudnorm parser accepts the final FFmpeg JSON object and fails malformed output", () => {
  const reading = parseLoudnormReading(`noise\n{
    "input_i": "-21.40", "input_tp": "-4.20", "input_lra": "3.10",
    "input_thresh": "-31.40", "target_offset": "0.10"
  }\ntrailer`);
  assert.equal(reading.input_i, "-21.40");
  assert.throws(() => parseLoudnormReading("no measurement here"), /did not return/);
});

test("job target is deterministic and cannot be redirected", () => {
  const job = fixtureJob();
  assert.equal(job.target.locator, buildAudioMasteryTargetLocator({
    assetId: job.source.assetId,
    sourceSha256: job.source.sha256,
    profileId: job.profileId,
  }));
  assert.throws(() => parseAudioMasteryJob({
    ...job,
    target: { ...job.target, locator: "../../outside.wav" },
  }, job.jobId), /target authority/);
});

test("result parser recomputes proposals and binds every verification attribute", () => {
  const job = fixtureJob();
  const sourceMeasurement = fixtureMeasurement({ source: job.source });
  const proposal = newAudioMasteryProposal({
    proposalId: "proposal_integrity_001",
    createdAt: "2026-08-03T20:01:00.000Z",
    measurement: sourceMeasurement,
    profileId: job.profileId,
  });
  const outputSource = {
    assetId: job.source.assetId,
    provider: "local",
    locator: job.target.locator,
    generation: `sha256:${"b".repeat(64)}`,
    sha256: "b".repeat(64),
    sizeBytes: 96_000,
    contentType: "audio/wav",
  };
  const verificationMeasurement = fixtureMeasurement({
    measurementId: "measurement_integrity_output_001",
    source: outputSource,
    integratedLufs: -16,
    truePeakDbtp: -2,
  });
  const receipt = {
    kind: "quipsly-audio-mastery-result-v1",
    version: 1,
    jobId: job.jobId,
    completedAt: "2026-08-03T20:02:00.000Z",
    source: job.source,
    sourceMeasurement,
    proposal,
    derivative: {
      ...outputSource,
      codec: "pcm_s24le",
      sampleRateHz: 48_000,
      variantKind: "audio-master-preview",
      verificationMeasurement,
      verification: assessAudioMastery(verificationMeasurement, job.profileId),
    },
    worker: { executionId: "execution_integrity_001", buildId: "test-build", imageDigest: null, attempt: 1 },
    boundaries: { originalRemainsSourceTruth: true, outputIsUnpromotedPreview: true, promotionRequiresExplicitApproval: true },
  };
  assert.doesNotThrow(() => parseAudioMasteryResult(receipt, job));
  assert.doesNotThrow(() => parseAudioMasteryResult(sortObjectKeysLikeJsonb(receipt), job));
  assert.throws(() => parseAudioMasteryResult({
    ...receipt,
    proposal: { ...proposal, assessment: { ...proposal.assessment, integratedDeltaLu: 999 } },
  }, job), /binding or safety boundary/);
  assert.throws(() => parseAudioMasteryResult({
    ...receipt,
    derivative: { ...receipt.derivative, sizeBytes: receipt.derivative.sizeBytes + 1 },
  }, job), /derivative or independent verification/);
});

test("local worker creates only a verified unpromoted derivative and can recover it", async (context) => {
  const root = await mkdtemp(path.join(tmpdir(), "quipsly-audio-worker-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const sourcePath = path.join(root, "media-vault", "raw", "source.wav");
  await mkdir(path.dirname(sourcePath), { recursive: true });
  await writeFile(sourcePath, "source audio bytes");
  const sourceSha = await sha256File(sourcePath);
  const sourceStat = await stat(sourcePath);
  const job = fixtureJob({ sourcePath, sourceSha, sourceSize: sourceStat.size });
  const store = new FakeMasteryStore(job);
  const engine = new FakeMasteringEngine();
  const options = {
    executionId: "execution_audio_001",
    buildId: "test-build",
    imageDigest: null,
    leaseMs: 60_000,
    localMediaRoot: root,
    now: () => new Date("2026-08-03T20:03:00.000Z"),
  };
  const first = await runOneLocalAudioMasteryJob(store, engine, options);
  assert.equal(first.disposition, "completed");
  assert.equal(first.recoveredExistingOutput, false);
  assert.equal(engine.renderCount, 1);
  const receipt = parseAudioMasteryResult(store.completed[0].receipt, job);
  assert.equal(receipt.derivative.verification.passes, true);
  assert.equal(receipt.boundaries.outputIsUnpromotedPreview, true);
  assert.equal(receipt.boundaries.promotionRequiresExplicitApproval, true);

  const recoveryStore = new FakeMasteryStore(job);
  const recoveryEngine = new FakeMasteringEngine();
  const recovered = await runOneLocalAudioMasteryJob(recoveryStore, recoveryEngine, options);
  assert.equal(recovered.disposition, "completed");
  assert.equal(recovered.recoveredExistingOutput, true);
  assert.equal(recoveryEngine.renderCount, 0);
  parseAudioMasteryResult(recoveryStore.completed[0].receipt, job);
});

test("real FFmpeg measurement, double-pass PCM render, and independent verification preserve source bytes", async (context) => {
  const fixtureRoot = await mkdtemp(path.join(tmpdir(), "quipsly-audio-mastery-"));
  context.after(() => rm(fixtureRoot, { recursive: true, force: true }));
  const sourcePath = path.join(fixtureRoot, "quiet-source.wav");
  const masterPath = path.join(fixtureRoot, "master-v1.wav");
  await run("ffmpeg", [
    "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i",
    "sine=frequency=220:duration=6:sample_rate=48000",
    "-filter:a", "volume=0.08", "-c:a", "pcm_s24le", sourcePath,
  ]);
  const sourceStat = await stat(sourcePath);
  const sourceSha256 = await sha256File(sourcePath);
  const source = {
    assetId: "asset_audio_001",
    provider: "local",
    locator: sourcePath,
    generation: `sha256:${sourceSha256}`,
    sha256: sourceSha256,
    sizeBytes: sourceStat.size,
    contentType: "audio/wav",
  };
  const engine = new FfmpegAudioMasteringEngine();
  const measurement = await engine.measure(sourcePath, {
    source,
    profileId: "apple-podcasts-dialogue-v1",
    measurementId: "measurement_real_001",
    measuredAt: "2026-08-03T20:00:00.000Z",
  });
  assert.equal(measurement.analyzer.completeDecode, true);
  assert.equal(measurement.sampleRateHz, 48_000);
  assert.equal(measurement.channels, 1);
  assert.ok(measurement.series.length >= 5);
  assert.ok(measurement.integratedLufs < -20);
  const diagnosis = await engine.diagnose(sourcePath, {
    source,
    diagnosisId: "diagnosis_real_001",
    analyzedAt: "2026-08-03T20:00:15.000Z",
  });
  assert.equal(diagnosis.analyzer.completeDecode, true);
  assert.equal(diagnosis.analyzer.statisticsAreNotListeningJudgments, true);
  assert.equal(diagnosis.channelCount, 1);
  assert.equal(diagnosis.channels.length, 1);
  assert.equal(diagnosis.overall.channel, null);
  assert.ok(diagnosis.overall.peakDbfs < -10);
  assert.ok(diagnosis.overall.noiseFloorDbfs < -10);
  assert.deepEqual(diagnosis.nearSilenceSpans, []);
  assert.deepEqual(diagnosis.observations, []);
  assert.equal(await sha256File(sourcePath), sourceSha256);
  const ebuMeasurement = await engine.measure(sourcePath, {
    source,
    profileId: "ebu-r128-broadcast-v1",
    measurementId: "measurement_real_ebu_001",
    measuredAt: "2026-08-03T20:00:30.000Z",
  });
  assert.equal(ebuMeasurement.profileId, "ebu-r128-broadcast-v1");
  const ebuProposal = newAudioMasteryProposal({
    proposalId: "proposal_real_ebu_001",
    createdAt: "2026-08-03T20:00:45.000Z",
    measurement: ebuMeasurement,
    profileId: "ebu-r128-broadcast-v1",
  });
  assert.equal(ebuProposal.profile.integratedLufs, -23);
  const proposal = newAudioMasteryProposal({
    proposalId: "proposal_real_001",
    createdAt: "2026-08-03T20:01:00.000Z",
    measurement,
    profileId: "apple-podcasts-dialogue-v1",
  });
  const derivative = await engine.renderLoudnessMaster(sourcePath, masterPath, { proposal, measurement });
  assert.equal(derivative.codec, "pcm_s24le");
  assert.equal(derivative.originalRemainsSourceTruth, true);
  assert.equal(await sha256File(sourcePath), sourceSha256);
  const verified = await engine.measure(masterPath, {
    source: {
      assetId: "asset_master_001",
      provider: "local",
      locator: masterPath,
      generation: `sha256:${derivative.sha256}`,
      sha256: derivative.sha256,
      sizeBytes: derivative.sizeBytes,
      contentType: derivative.contentType,
    },
    profileId: "apple-podcasts-dialogue-v1",
    measurementId: "measurement_real_output_001",
    measuredAt: "2026-08-03T20:02:00.000Z",
  });
  const verification = assessAudioMastery(verified, "apple-podcasts-dialogue-v1");
  assert.equal(verification.passes, true);
  assert.ok(verified.integratedLufs >= -17 && verified.integratedLufs <= -15);
  assert.ok(verified.truePeakDbtp <= -1);
});

function fixtureMeasurement(overrides = {}) {
  return parseAudioMasteryMeasurement({
    kind: "quipsly-audio-measurement-v1",
    version: 1,
    measurementId: "measurement_fixture_001",
    measuredAt: "2026-08-03T20:00:00.000Z",
    source: {
      assetId: "asset_fixture_001",
      provider: "local",
      locator: "/tmp/source.wav",
      generation: `sha256:${"a".repeat(64)}`,
      sha256: "a".repeat(64),
      sizeBytes: 48_000,
      contentType: "audio/wav",
    },
    profileId: "apple-podcasts-dialogue-v1",
    durationSeconds: 2,
    channels: 1,
    sampleRateHz: 48_000,
    integratedLufs: -22,
    truePeakDbtp: -5,
    loudnessRangeLu: 2.5,
    thresholdLufs: -32,
    targetOffsetLu: 0.1,
    seriesResolutionMs: 1_000,
    series: [
      { timeMs: 900, momentaryLufs: -22, shortTermLufs: null, integratedLufs: -22, truePeakDbtp: -5 },
      { timeMs: 1_900, momentaryLufs: -21, shortTermLufs: null, integratedLufs: -21.5, truePeakDbtp: -4.8 },
    ],
    analyzer: {
      name: "ffmpeg-loudnorm-ebur128",
      version: "8.1.1",
      standard: "ITU-R BS.1770 / EBU R128",
      completeDecode: true,
    },
    ...overrides,
  });
}

function fixtureSignalStatistics(overrides = {}) {
  return {
    channel: null,
    dcOffset: 0,
    peakDbfs: -12,
    rmsDbfs: -20,
    rmsPeakDbfs: -16,
    rmsTroughDbfs: -28,
    crestFactor: 2,
    flatFactor: 0.5,
    peakCount: 4,
    noiseFloorDbfs: -48,
    dynamicRangeDb: 10,
    zeroCrossingRate: 0.1,
    nanCount: 0,
    infCount: 0,
    denormalCount: 0,
    ...overrides,
  };
}

function fixtureSignalDiagnosis(overrides = {}) {
  const source = fixtureMeasurement().source;
  return {
    kind: "quipsly-audio-signal-diagnosis-v1",
    version: 1,
    diagnosisId: "diagnosis_fixture_001",
    analyzedAt: "2026-08-03T20:00:00.000Z",
    source,
    durationSeconds: 2,
    sampleRateHz: 48_000,
    channelCount: 1,
    overall: fixtureSignalStatistics(),
    channels: [fixtureSignalStatistics({ channel: 1 })],
    nearSilenceSpans: [],
    observations: [],
    thresholds: {
      nearFullScaleDbfs: -0.05,
      nearSilenceDbfs: -55,
      nearSilenceMinimumSeconds: 0.25,
      dcOffsetAmplitude: 0.01,
      channelImbalanceDb: 6,
    },
    analyzer: {
      name: "ffmpeg-astats-silencedetect",
      version: "8.1.1",
      completeDecode: true,
      statisticsAreNotListeningJudgments: true,
      nearSilenceIsNotAutomaticallyADropout: true,
      noiseFloorIsAnEstimate: true,
    },
    ...overrides,
  };
}

function fixtureJob({ sourcePath = "/tmp/source.wav", sourceSha = "a".repeat(64), sourceSize = 48_000 } = {}) {
  const source = {
    assetId: "asset_audio_job_001",
    provider: "local",
    locator: sourcePath,
    generation: `sha256:${sourceSha}`,
    sha256: sourceSha,
    sizeBytes: sourceSize,
    contentType: "audio/wav",
  };
  return newAudioMasteryJob({
    jobId: "audio_mastery_job_001",
    projectId: "project_audio_001",
    requestedByEmail: "charlie@example.com",
    queuedAt: "2026-08-03T20:00:00.000Z",
    source,
    profileId: "apple-podcasts-dialogue-v1",
    target: {
      provider: "local",
      locator: buildAudioMasteryTargetLocator({ assetId: source.assetId, sourceSha256: source.sha256, profileId: "apple-podcasts-dialogue-v1" }),
      contentType: "audio/wav",
      codec: "pcm_s24le",
      sampleRateHz: 48_000,
      variantKind: "audio-master-preview",
    },
  });
}

class FakeMasteryStore {
  constructor(job) {
    this.job = job;
    this.completed = [];
    this.failed = [];
    this.retried = [];
  }
  async claim({ executionId }) {
    return { id: this.job.jobId, inputJson: this.job, attempt: 1, executionId };
  }
  async complete(value) { this.completed.push(value); return true; }
  async fail(value) { this.failed.push(value); return true; }
  async retry(value) { this.retried.push(value); return true; }
}

class FakeMasteringEngine {
  constructor() { this.renderCount = 0; }
  async measure(inputPath, { source, profileId, measurementId, measuredAt }) {
    const isOutput = inputPath.includes("mastering");
    return fixtureMeasurement({
      measurementId,
      measuredAt,
      source,
      profileId,
      durationSeconds: 2,
      integratedLufs: isOutput ? -16 : -22,
      truePeakDbtp: isOutput ? -2 : -5,
    });
  }
  async renderLoudnessMaster(_inputPath, outputPath) {
    this.renderCount += 1;
    await writeFile(outputPath, "verified master bytes", { flag: "wx" });
    const outputStat = await stat(outputPath);
    return {
      outputPath,
      sizeBytes: outputStat.size,
      sha256: await sha256File(outputPath),
      contentType: "audio/wav",
      sampleRateHz: 48_000,
      codec: "pcm_s24le",
      originalRemainsSourceTruth: true,
    };
  }
}

function run(executable, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => { stderr = `${stderr}${chunk}`.slice(-4_000); });
    child.once("error", reject);
    child.once("close", (code) => code === 0 ? resolve() : reject(new Error(`${executable} exited ${code}: ${stderr}`)));
  });
}

function sortObjectKeysLikeJsonb(value) {
  if (Array.isArray(value)) return value.map(sortObjectKeysLikeJsonb);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, sortObjectKeysLikeJsonb(entry)]),
  );
}
