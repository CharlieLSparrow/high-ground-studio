import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  AUDIO_DELIVERY_REVIEW_EVIDENCE_SCHEMA,
  audioDeliveryReviewCoverage,
  assessAudioMastery,
  buildAudioDeliveryTargetLocator,
  buildDialogueRepairFilterGraph,
  buildDialogueRepairTargetLocator,
  buildAudioTreatmentTargetLocator,
  buildAudioSignalObservations,
  buildAudioMasteryTargetLocator,
  newAudioMasteryJob,
  newAudioDeliveryJob,
  newAudioMasteryProposal,
  newAudioTreatmentProposal,
  newAudioTreatmentJob,
  newDialogueRepairCandidate,
  newDialogueRepairAuditionReceipt,
  newDialogueRepairJob,
  newDialogueRepairProposal,
  newDialogueRepairReviewReceipt,
  parseDialogueRepairResult,
  parseDialogueRepairAuditionReceipt,
  parseDialogueRepairReviewReceipt,
  parseAudioSignalDiagnosis,
  parseAudioTreatmentResult,
  parseAudioMasteryJob,
  parseAudioMasteryResult,
  parseAudioMasteryMeasurement,
  parseAudioDeliveryResult,
} from "../packages/quipsly-media-processing/src/index.ts";
import { FfmpegAudioDeliveryEncoder } from "../apps/quipsly-media-processor/src/audio-delivery-ffmpeg.ts";
import {
  FfmpegAudioMasteringEngine,
  parseFfmpegProgressDuration,
  parseLoudnormReading,
} from "../apps/quipsly-media-processor/src/audio-mastering-ffmpeg.ts";
import { sha256File } from "../apps/quipsly-media-processor/src/transcoder.ts";
import { runOneLocalAudioMasteryJob } from "../apps/quipsly-media-processor/src/local-audio-mastery-worker.ts";
import { runOneLocalAudioDeliveryJob } from "../apps/quipsly-media-processor/src/local-audio-delivery-worker.ts";
import { runOneLocalAudioTreatmentJob } from "../apps/quipsly-media-processor/src/local-audio-treatment-worker.ts";
import { runOneLocalDialogueRepairJob } from "../apps/quipsly-media-processor/src/local-dialogue-repair-worker.ts";

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

test("MediaRecorder sources can recover duration from a complete FFmpeg decode", () => {
  assert.equal(parseFfmpegProgressDuration([
    "bitrate=N/A",
    "out_time_us=10080000",
    "out_time_ms=10080000",
    "out_time=00:00:10.080000",
    "progress=end",
    "",
  ].join("\n")), 10.08);
  assert.throws(
    () => parseFfmpegProgressDuration("out_time_us=N/A\nprogress=end\n"),
    /complete audio decode did not produce a finite source duration/i,
  );
  assert.throws(
    () => parseFfmpegProgressDuration("out_time_us=10080000\nprogress=continue\n"),
    /did not complete its full decode/i,
  );
  assert.equal(
    parseFfmpegProgressDuration("out_time=00:01:02.500000\nprogress=end\n"),
    62.5,
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

test("DC treatment proposals require measured source evidence", () => {
  assert.throws(
    () => newAudioTreatmentProposal({ proposalId: "proposal_treatment_001", createdAt: "2026-08-03T20:00:00.000Z", diagnosis: fixtureSignalDiagnosis() }),
    /requires measured DC-offset evidence/,
  );
  const diagnosis = fixtureSignalDiagnosis({
    diagnosisId: "diagnosis_treatment_001",
    channels: [fixtureSignalStatistics({ channel: 1, dcOffset: 0.02 })],
    observations: [{ kind: "dc-offset", severity: "attention", startSeconds: 0, endSeconds: 2, detail: "Listen before treatment.", requiresListening: true, evidence: { channel: 1, dcOffset: 0.02, thresholdAmplitude: 0.01 } }],
  });
  const proposal = newAudioTreatmentProposal({ proposalId: "proposal_treatment_001", createdAt: "2026-08-03T20:00:00.000Z", diagnosis });
  assert.equal(proposal.trigger.maximumAbsoluteDcOffset, 0.02);
  assert.deepEqual(proposal.trigger.affectedChannels, [1]);
  assert.equal(proposal.graph.find((node) => node.id === "dc-rumble-filter").parameters.frequencyHz, 20);
  assert.equal(proposal.graph.find((node) => node.id === "audition-output").automatic, false);
  assert.equal(proposal.boundaries.createsVersionedExperimentOnly, true);
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

test("local treatment worker leases, verifies, and recovers a versioned experiment", async (context) => {
  const root = await mkdtemp(path.join(tmpdir(), "quipsly-audio-treatment-worker-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const sourcePath = path.join(root, "media-vault", "raw", "dc-source.wav");
  await mkdir(path.dirname(sourcePath), { recursive: true });
  await run("ffmpeg", [
    "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i",
    "aevalsrc=0.12+0.1*sin(2*PI*440*t):s=48000:d=3",
    "-c:a", "pcm_s24le", sourcePath,
  ]);
  const sourceSha256 = await sha256File(sourcePath);
  const sourceStat = await stat(sourcePath);
  const source = { assetId: "asset_treatment_worker_001", provider: "local", locator: sourcePath, generation: `sha256:${sourceSha256}`, sha256: sourceSha256, sizeBytes: sourceStat.size, contentType: "audio/wav" };
  const job = newAudioTreatmentJob({
    jobId: "audio_treatment_worker_001",
    projectId: "project_treatment_worker_001",
    requestedByEmail: "audio-treatment@example.test",
    queuedAt: "2026-08-04T12:00:00.000Z",
    source,
    triggerDiagnosisId: "diagnosis_treatment_worker_001",
    profileId: "dc-rumble-correction-v1",
    target: { provider: "local", locator: buildAudioTreatmentTargetLocator({ assetId: source.assetId, sourceSha256, profileId: "dc-rumble-correction-v1" }), contentType: "audio/wav", codec: "pcm_s24le", sampleRateHz: 48_000, variantKind: "audio-treatment-preview" },
  });
  const options = { executionId: "execution_treatment_worker_001", buildId: "test-build", imageDigest: null, leaseMs: 60_000, localMediaRoot: root, now: () => new Date("2026-08-04T12:01:00.000Z") };
  const store = new FakeTreatmentStore(job);
  const first = await runOneLocalAudioTreatmentJob(store, new FfmpegAudioMasteringEngine(), options);
  assert.equal(first.disposition, "completed");
  assert.equal(first.recoveredExistingOutput, false);
  const receipt = parseAudioTreatmentResult(store.completed[0].receipt, job);
  assert.equal(receipt.boundaries.outputIsUnpromotedExperiment, true);
  assert.ok(receipt.verification.maximumAbsoluteDcAfter <= 0.005);
  assert.equal(await sha256File(sourcePath), sourceSha256);

  const recoveryStore = new FakeTreatmentStore(job);
  const recovered = await runOneLocalAudioTreatmentJob(recoveryStore, new FfmpegAudioMasteringEngine(), options);
  assert.equal(recovered.disposition, "completed");
  assert.equal(recovered.recoveredExistingOutput, true);
  parseAudioTreatmentResult(recoveryStore.completed[0].receipt, job);
});

test("local Dialogue Repair worker renders only an exact confirmed range and recovers its versioned output", async (context) => {
  const root = await mkdtemp(path.join(tmpdir(), "quipsly-dialogue-repair-worker-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const sourcePath = path.join(root, "media-vault", "raw", "dialogue-source.wav");
  await mkdir(path.dirname(sourcePath), { recursive: true });
  await run("ffmpeg", [
    "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i",
    "aevalsrc=0.04*sin(2*PI*220*t)+if(lt(abs(t-1.5)\\,0.00002)\\,0.95\\,0):s=48000:d=3",
    "-c:a", "pcm_s24le", sourcePath,
  ]);
  const sourceSha256 = await sha256File(sourcePath);
  const sourceStat = await stat(sourcePath);
  const source = { assetId: "asset_dialogue_worker_001", provider: "local", locator: sourcePath, generation: `sha256:${sourceSha256}`, sha256: sourceSha256, sizeBytes: sourceStat.size, contentType: "audio/wav" };
  const candidate = newDialogueRepairCandidate({
    candidateId: "candidate_dialogue_worker_001",
    createdAt: "2026-08-05T23:00:00.000Z",
    createdByEmail: "editor@example.test",
    label: "mouth-click",
    source,
    range: { startSeconds: 1.49, endSeconds: 1.51, auditionPreRollSeconds: 0.45, auditionPostRollSeconds: 0.45, sourceDurationSeconds: 3 },
    origin: { kind: "human-marked" },
    context: { speakerId: null, speakerLabel: null, transcriptWordAnchors: [] },
  });
  const reviewReceipt = newDialogueRepairReviewReceipt({
    receiptId: "review_dialogue_worker_001",
    occurredAt: "2026-08-05T23:01:00.000Z",
    actorEmail: "editor@example.test",
    decision: "confirmed",
    candidate,
    evidence: { protectedPlaybackSourceId: "source_dialogue_worker_001", contextStartSeconds: 1.04, contextEndSeconds: 1.96, listenedSecondBins: [1], clientTrackedPlaybackIsNotProofOfAudibility: true },
  });
  const proposal = newDialogueRepairProposal({ proposalId: "proposal_dialogue_worker_001", createdAt: "2026-08-05T23:02:00.000Z", candidate, reviewReceipt });
  const job = newDialogueRepairJob({
    jobId: "dialogue_repair_worker_001",
    projectId: "project_dialogue_worker_001",
    requestedByEmail: "editor@example.test",
    queuedAt: "2026-08-05T23:03:00.000Z",
    source,
    proposal,
    target: { provider: "local", locator: buildDialogueRepairTargetLocator({ assetId: source.assetId, sourceSha256, candidateId: candidate.candidateId, range: candidate.range }), contentType: "audio/wav", codec: "pcm_s24le", sampleRateHz: 48_000, variantKind: "dialogue-repair-preview" },
  });
  const options = { executionId: "execution_dialogue_worker_001", buildId: "test-build", imageDigest: null, leaseMs: 60_000, localMediaRoot: root, now: () => new Date("2026-08-05T23:04:00.000Z") };
  const store = new FakeDialogueRepairStore(job);
  const first = await runOneLocalDialogueRepairJob(store, new FfmpegAudioMasteringEngine(), options);
  assert.equal(first.disposition, "completed");
  assert.equal(first.recoveredExistingOutput, false);
  const receipt = parseDialogueRepairResult(store.completed[0].receipt, job);
  assert.equal(receipt.proposal.authorizingReviewReceiptId, reviewReceipt.receiptId);
  assert.equal(receipt.boundaries.outputIsUnpromotedExperiment, true);
  assert.equal(receipt.verification.completeOutputDecode, true);
  assert.equal(await sha256File(sourcePath), sourceSha256);
  const completedAt = new Date().toISOString();
  const audition = newDialogueRepairAuditionReceipt({
    receiptId: "dialogue_audition_worker_001",
    occurredAt: completedAt,
    actorEmail: "editor@example.test",
    decision: "repair-preferred",
    candidate,
    job,
    result: receipt,
    evidence: {
      protectedPlaybackSourceId: "source_dialogue_worker_001",
      protectedPlaybackJobId: job.jobId,
      contextStartSeconds: 1.04,
      contextEndSeconds: 1.96,
      sourceListenedSecondBins: [1],
      repairedListenedSecondBins: [1],
      comparisonMode: "matched-loudness",
      completedAt,
      clientTrackedPlaybackIsNotProofOfAudibility: true,
    },
    note: "The impulse is reduced without changing the surrounding tone.",
  });
  assert.equal(audition.boundaries.repairPreferenceDoesNotPromote, true);
  assert.equal(parseDialogueRepairAuditionReceipt(audition, candidate, job, receipt).decision, "repair-preferred");
  assert.throws(() => parseDialogueRepairAuditionReceipt({ ...audition, evidence: { ...audition.evidence, repairedListenedSecondBins: [] } }, candidate, job, receipt), /matched-audition evidence/);
  assert.throws(() => newDialogueRepairAuditionReceipt({ ...audition, decision: "source-preferred", candidate, job, result: receipt, evidence: audition.evidence, note: null }), /requires a listening note/);

  const recoveryStore = new FakeDialogueRepairStore(job);
  const recovered = await runOneLocalDialogueRepairJob(recoveryStore, new FfmpegAudioMasteringEngine(), options);
  assert.equal(recovered.disposition, "completed");
  assert.equal(recovered.recoveredExistingOutput, true);
  parseDialogueRepairResult(recoveryStore.completed[0].receipt, job);
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

test("delivery evidence requires beginning, midpoint, and ending playback", () => {
  const evidence = { schema: AUDIO_DELIVERY_REVIEW_EVIDENCE_SCHEMA, listenedSecondBins: [0, 1, 4, 5, 6, 9], completedAt: new Date().toISOString() };
  const incomplete = audioDeliveryReviewCoverage(evidence, 10);
  assert.equal(incomplete.approvalReady, false);
  assert.deepEqual(incomplete.missingSecondBins, [8]);
  const complete = audioDeliveryReviewCoverage({ ...evidence, listenedSecondBins: [...evidence.listenedSecondBins, 8] }, 10);
  assert.equal(complete.approvalReady, true);
});

test("real AAC delivery worker preserves the promoted WAV and verifies encoded bytes", async (context) => {
  const root = await mkdtemp(path.join(tmpdir(), "quipsly-audio-delivery-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const sourcePath = path.join(root, "media-vault", "mastering", "promoted-master.wav");
  await mkdir(path.dirname(sourcePath), { recursive: true });
  await run("ffmpeg", [
    "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i",
    "sine=frequency=330:duration=8:sample_rate=48000",
    "-filter:a", "volume=1.8", "-c:a", "pcm_s24le", sourcePath,
  ]);
  const engine = new FfmpegAudioMasteringEngine();
  const sourceStat = await stat(sourcePath);
  const sourceSha = await sha256File(sourcePath);
  const unmasteredBinding = { assetId: "asset_delivery_real_001", provider: "local", locator: sourcePath, generation: `sha256:${sourceSha}`, sha256: sourceSha, sizeBytes: sourceStat.size, contentType: "audio/wav" };
  const measured = await engine.measure(sourcePath, { source: unmasteredBinding, profileId: "apple-podcasts-dialogue-v1", measurementId: "measurement_delivery_source_001", measuredAt: "2026-08-05T19:30:00.000Z" });
  assert.equal(assessAudioMastery(measured, "apple-podcasts-dialogue-v1").passes, true);
  const source = { ...unmasteredBinding, durationSeconds: measured.durationSeconds, masteryJobId: "audio_mastery_delivery_001", masterReviewReceiptId: "review_delivery_master_001", promotionReceiptId: "promotion_delivery_001" };
  const profileId = "apple-podcasts-aac-stereo-v1";
  const job = newAudioDeliveryJob({
    jobId: "audio_delivery_real_001", projectId: "project_delivery_real_001", requestedByEmail: "delivery@example.test", queuedAt: "2026-08-05T19:30:00.000Z",
    source, masteryProfileId: "apple-podcasts-dialogue-v1", profileId,
    target: { provider: "local", locator: buildAudioDeliveryTargetLocator({ assetId: source.assetId, candidateSha256: source.sha256, profileId }), contentType: "audio/mp4", codec: "aac", codecProfile: "LC", sampleRateHz: 48_000, channels: 2, bitrateBps: 128_000, fastStartRequired: true, variantKind: "audio-delivery-artifact" },
  });
  const store = new FakeMasteryStore(job);
  const result = await runOneLocalAudioDeliveryJob(store, new FfmpegAudioDeliveryEncoder(), engine, { executionId: "execution_delivery_real_001", buildId: "test-build", imageDigest: null, leaseMs: 60_000, localMediaRoot: root, now: () => new Date("2026-08-05T19:31:00.000Z") });
  assert.equal(result.disposition, "completed", JSON.stringify(store.retried));
  assert.equal(result.recoveredExistingOutput, false);
  const receipt = parseAudioDeliveryResult(store.completed[0].receipt, job);
  assert.equal(receipt.output.codec, "aac");
  assert.equal(receipt.output.codecProfile, "LC");
  assert.equal(receipt.output.fastStart, true);
  assert.equal(receipt.output.completeDecode, true);
  assert.equal(receipt.output.verification.passes, true);
  assert.equal(receipt.boundaries.proofListenRequiredBeforeOutputPacket, true);
  assert.equal(await sha256File(sourcePath), sourceSha);
  assert.throws(() => parseAudioDeliveryResult({ ...receipt, output: { ...receipt.output, fastStart: false } }, job), /safety boundary|verification/);

  const recovery = new FakeMasteryStore(job);
  const recovered = await runOneLocalAudioDeliveryJob(recovery, new FfmpegAudioDeliveryEncoder(), engine, { executionId: "execution_delivery_real_002", buildId: "test-build", imageDigest: null, leaseMs: 60_000, localMediaRoot: root, now: () => new Date("2026-08-05T19:32:00.000Z") });
  assert.equal(recovered.disposition, "completed");
  assert.equal(recovered.recoveredExistingOutput, true);
  parseAudioDeliveryResult(recovery.completed[0].receipt, job);
});

test("real FFmpeg DC and rumble experiment is source-bound, reversible, and independently diagnosable", async (context) => {
  const fixtureRoot = await mkdtemp(path.join(tmpdir(), "quipsly-audio-treatment-"));
  context.after(() => rm(fixtureRoot, { recursive: true, force: true }));
  const sourcePath = path.join(fixtureRoot, "dc-source.wav");
  const outputPath = path.join(fixtureRoot, "dc-treatment-v1.wav");
  await run("ffmpeg", [
    "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i",
    "aevalsrc=0.12+0.1*sin(2*PI*440*t):s=48000:d=3",
    "-c:a", "pcm_s24le", sourcePath,
  ]);
  const sourceStat = await stat(sourcePath);
  const sourceSha256 = await sha256File(sourcePath);
  const source = { assetId: "asset_treatment_001", provider: "local", locator: sourcePath, generation: `sha256:${sourceSha256}`, sha256: sourceSha256, sizeBytes: sourceStat.size, contentType: "audio/wav" };
  const engine = new FfmpegAudioMasteringEngine();
  const sourceDiagnosis = await engine.diagnose(sourcePath, { source, diagnosisId: "diagnosis_treatment_real_001", analyzedAt: "2026-08-03T20:00:00.000Z" });
  assert.ok(Math.abs(sourceDiagnosis.channels[0].dcOffset) >= 0.1);
  assert.ok(sourceDiagnosis.observations.some((observation) => observation.kind === "dc-offset"));
  const proposal = newAudioTreatmentProposal({ proposalId: "proposal_treatment_real_001", createdAt: "2026-08-03T20:00:10.000Z", diagnosis: sourceDiagnosis });
  const job = newAudioTreatmentJob({
    jobId: "audio_treatment_real_001",
    projectId: "project_treatment_001",
    requestedByEmail: "audio-treatment@example.test",
    queuedAt: "2026-08-03T20:00:05.000Z",
    source,
    triggerDiagnosisId: sourceDiagnosis.diagnosisId,
    profileId: "dc-rumble-correction-v1",
    target: { provider: "local", locator: buildAudioTreatmentTargetLocator({ assetId: source.assetId, sourceSha256, profileId: "dc-rumble-correction-v1" }), contentType: "audio/wav", codec: "pcm_s24le", sampleRateHz: 48_000, variantKind: "audio-treatment-preview" },
  });
  const rendered = await engine.renderTreatmentExperiment(sourcePath, outputPath, { proposal, diagnosis: sourceDiagnosis });
  assert.equal(rendered.outputIsUnpromotedExperiment, true);
  const outputSource = { ...source, locator: job.target.locator, generation: `sha256:${rendered.sha256}`, sha256: rendered.sha256, sizeBytes: rendered.sizeBytes, contentType: rendered.contentType };
  const outputDiagnosis = await engine.diagnose(outputPath, { source: outputSource, diagnosisId: "diagnosis_treatment_output_001", analyzedAt: "2026-08-03T20:00:20.000Z" });
  const sourceMeasurement = await engine.measure(sourcePath, { source, profileId: "apple-podcasts-dialogue-v1", measurementId: "measurement_treatment_source_001", measuredAt: "2026-08-03T20:00:25.000Z" });
  const outputMeasurement = await engine.measure(outputPath, { source: outputSource, profileId: "apple-podcasts-dialogue-v1", measurementId: "measurement_treatment_output_001", measuredAt: "2026-08-03T20:00:30.000Z" });
  const before = Math.abs(sourceDiagnosis.channels[0].dcOffset);
  const after = Math.abs(outputDiagnosis.channels[0].dcOffset);
  assert.ok(after <= 0.005, `expected corrected DC <= 0.005, got ${after}`);
  assert.ok(after <= before * 0.25, `expected at least 75% DC reduction, got ${before} -> ${after}`);
  assert.equal(await sha256File(sourcePath), sourceSha256);
  const durationDeltaSeconds = Math.round(Math.abs(sourceDiagnosis.durationSeconds - outputDiagnosis.durationSeconds) * 1_000_000) / 1_000_000;
  const result = parseAudioTreatmentResult({
    kind: "quipsly-audio-treatment-result-v1",
    version: 1,
    jobId: job.jobId,
    completedAt: "2026-08-03T20:00:35.000Z",
    source,
    sourceMeasurement,
    sourceDiagnosis,
    proposal,
    derivative: { provider: "local", locator: job.target.locator, generation: outputSource.generation, sha256: rendered.sha256, sizeBytes: rendered.sizeBytes, contentType: "audio/wav", codec: "pcm_s24le", sampleRateHz: 48_000, variantKind: "audio-treatment-preview", measurement: outputMeasurement, diagnosis: outputDiagnosis },
    verification: { maximumAbsoluteDcBefore: before, maximumAbsoluteDcAfter: after, requiredMaximumAbsoluteDcAfter: 0.005, requiredRelativeReduction: 0.75, durationDeltaSeconds, sourceBytesPreserved: true, completeOutputDecode: true, passes: true },
    worker: { executionId: "execution_treatment_001", buildId: "test-build", imageDigest: null, attempt: 1 },
    boundaries: { originalRemainsSourceTruth: true, outputIsUnpromotedExperiment: true, outputIsNotAMasteredDeliveryFile: true, promotionRequiresExplicitApproval: true },
  }, job);
  assert.equal(result.verification.passes, true);
  assert.equal(result.boundaries.outputIsNotAMasteredDeliveryFile, true);
  assert.throws(() => parseAudioTreatmentResult({ ...result, verification: { ...result.verification, maximumAbsoluteDcAfter: 0.02 } }, job), /verification is invalid/);
  assert.throws(() => parseAudioTreatmentResult({ ...result, sourceMeasurement: { ...result.sourceMeasurement, source: { ...result.sourceMeasurement.source, generation: `sha256:${"f".repeat(64)}` } } }, job), /verification is invalid/);
});

test("dialogue repair requires source-bound listening evidence before it can authorize a range-scoped experiment", () => {
  const source = {
    assetId: "asset_dialogue_repair_001",
    provider: "local",
    locator: "/tmp/dialogue-source.wav",
    generation: `sha256:${"c".repeat(64)}`,
    sha256: "c".repeat(64),
    sizeBytes: 144_000,
    contentType: "audio/wav",
  };
  const candidate = newDialogueRepairCandidate({
    candidateId: "candidate_mouth_click_001",
    createdAt: "2026-08-05T22:00:00.000Z",
    createdByEmail: "editor@example.test",
    label: "mouth-click",
    source,
    range: { startSeconds: 2.4, endSeconds: 2.46, auditionPreRollSeconds: 0.2, auditionPostRollSeconds: 0.3, sourceDurationSeconds: 6 },
    origin: { kind: "human-marked" },
    context: {
      speakerId: "speaker_homer_001",
      speakerLabel: "Homer",
      transcriptWordAnchors: [{ wordId: "word_dialogue_001", startSeconds: 2.1, endSeconds: 2.8, text: "testing", speakerId: "speaker_homer_001", speakerLabel: "Homer" }],
    },
  });
  assert.equal(candidate.boundaries.candidateDoesNotAuthorizeTreatment, true);
  const evidence = {
    protectedPlaybackSourceId: "source_dialogue_001",
    contextStartSeconds: 2.1,
    contextEndSeconds: 2.8,
    listenedSecondBins: [2],
    clientTrackedPlaybackIsNotProofOfAudibility: true,
  };
  const falsePositive = newDialogueRepairReviewReceipt({
    receiptId: "review_dialogue_false_001",
    occurredAt: "2026-08-05T22:01:00.000Z",
    actorEmail: "editor@example.test",
    decision: "false-positive",
    candidate,
    evidence,
    note: "Intentional consonant.",
  });
  assert.throws(() => newDialogueRepairProposal({ proposalId: "proposal_dialogue_false_001", createdAt: "2026-08-05T22:02:00.000Z", candidate, reviewReceipt: falsePositive }), /confirmed dialogue event/);
  const confirmed = newDialogueRepairReviewReceipt({
    receiptId: "review_dialogue_confirmed_001",
    occurredAt: "2026-08-05T22:03:00.000Z",
    actorEmail: "editor@example.test",
    decision: "confirmed",
    candidate,
    evidence,
    note: "Audible mouth click between words.",
  });
  const proposal = newDialogueRepairProposal({ proposalId: "proposal_dialogue_repair_001", createdAt: "2026-08-05T22:04:00.000Z", candidate, reviewReceipt: confirmed });
  assert.deepEqual(proposal.treatmentRange, { startSeconds: 2.38, endSeconds: 2.48 });
  assert.equal(proposal.graph.find((step) => step.id === "audition-output").automatic, false);
  assert.equal(buildDialogueRepairFilterGraph(proposal), "adeclick=window=55:overlap=75:arorder=2:threshold=2:burst=2:method=add:enable='between(t,2.38,2.48)'");
  assert.equal(buildDialogueRepairFilterGraph(sortObjectKeysLikeJsonb(proposal)), buildDialogueRepairFilterGraph(proposal));
  assert.match(buildDialogueRepairTargetLocator({ assetId: source.assetId, sourceSha256: source.sha256, candidateId: candidate.candidateId, range: candidate.range }), /candidate_mouth_click_001-2400000-2460000\/preview-v1\.wav$/);
  assert.notEqual(
    buildDialogueRepairTargetLocator({ assetId: source.assetId, sourceSha256: source.sha256, candidateId: candidate.candidateId, range: candidate.range }),
    buildDialogueRepairTargetLocator({ assetId: source.assetId, sourceSha256: source.sha256, candidateId: candidate.candidateId, range: { ...candidate.range, endSeconds: 2.47 } }),
  );
  assert.throws(() => parseDialogueRepairReviewReceipt({ ...confirmed, source: { ...source, sha256: "d".repeat(64) } }, candidate), /immutable candidate snapshot/);
  assert.throws(() => parseDialogueRepairReviewReceipt({ ...confirmed, evidence: { ...confirmed.evidence, listenedSecondBins: [] } }, candidate), /review evidence/);
  const plosive = newDialogueRepairCandidate({ ...candidate, candidateId: "candidate_plosive_001", label: "plosive" });
  const plosiveReview = newDialogueRepairReviewReceipt({ receiptId: "review_dialogue_plosive_001", occurredAt: "2026-08-05T22:05:00.000Z", actorEmail: "editor@example.test", decision: "confirmed", candidate: plosive, evidence });
  assert.throws(() => newDialogueRepairProposal({ proposalId: "proposal_dialogue_plosive_001", createdAt: "2026-08-05T22:06:00.000Z", candidate: plosive, reviewReceipt: plosiveReview }), /qualified only for confirmed mouth-click/);
});

test("real range-scoped de-click changes the reviewed event while preserving source bytes, clock, channels, and untreated audio", async (context) => {
  const root = await mkdtemp(path.join(tmpdir(), "quipsly-dialogue-repair-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const sourcePath = path.join(root, "source.wav");
  const outputPath = path.join(root, "candidate.wav");
  await run("ffmpeg", [
    "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i",
    "aevalsrc=0.04*sin(2*PI*220*t)+if(lt(abs(t-1.5)\\,0.00002)\\,0.95\\,0)+if(lt(abs(t-3.5)\\,0.00002)\\,0.95\\,0):s=48000:d=5",
    "-c:a", "pcm_s24le", sourcePath,
  ]);
  const sourceStat = await stat(sourcePath);
  const sourceSha256 = await sha256File(sourcePath);
  const source = { assetId: "asset_dialogue_real_001", provider: "local", locator: sourcePath, generation: `sha256:${sourceSha256}`, sha256: sourceSha256, sizeBytes: sourceStat.size, contentType: "audio/wav" };
  const candidate = newDialogueRepairCandidate({
    candidateId: "candidate_dialogue_real_001", createdAt: "2026-08-05T22:10:00.000Z", createdByEmail: "editor@example.test", label: "mouth-click", source,
    range: { startSeconds: 1.49, endSeconds: 1.51, auditionPreRollSeconds: 0.45, auditionPostRollSeconds: 0.45, sourceDurationSeconds: 5 },
    origin: { kind: "human-marked" }, context: { speakerId: null, speakerLabel: null, transcriptWordAnchors: [] },
  });
  const reviewReceipt = newDialogueRepairReviewReceipt({
    receiptId: "review_dialogue_real_001", occurredAt: "2026-08-05T22:11:00.000Z", actorEmail: "editor@example.test", decision: "confirmed", candidate,
    evidence: { protectedPlaybackSourceId: "source_dialogue_real_001", contextStartSeconds: 1.04, contextEndSeconds: 1.96, listenedSecondBins: [1], clientTrackedPlaybackIsNotProofOfAudibility: true },
  });
  const proposal = newDialogueRepairProposal({ proposalId: "proposal_dialogue_real_001", createdAt: "2026-08-05T22:12:00.000Z", candidate, reviewReceipt });
  const engine = new FfmpegAudioMasteringEngine();
  const rendered = await engine.renderDialogueRepairExperiment(sourcePath, outputPath, { proposal });
  assert.equal(rendered.outputIsUnpromotedExperiment, true);
  assert.deepEqual(rendered.treatmentRange, { startSeconds: 1.47, endSeconds: 1.53 });
  assert.equal(await sha256File(sourcePath), sourceSha256);
  const outputSource = { ...source, locator: outputPath, generation: `sha256:${rendered.sha256}`, sha256: rendered.sha256, sizeBytes: rendered.sizeBytes };
  const [sourceDiagnosis, outputDiagnosis] = await Promise.all([
    engine.diagnose(sourcePath, { source, diagnosisId: "diagnosis_dialogue_source_001", analyzedAt: "2026-08-05T22:13:00.000Z" }),
    engine.diagnose(outputPath, { source: outputSource, diagnosisId: "diagnosis_dialogue_output_001", analyzedAt: "2026-08-05T22:13:00.000Z" }),
  ]);
  assert.equal(outputDiagnosis.analyzer.completeDecode, true);
  assert.equal(outputDiagnosis.channelCount, sourceDiagnosis.channelCount);
  assert.ok(Math.abs(outputDiagnosis.durationSeconds - sourceDiagnosis.durationSeconds) <= 0.05);
  const sourceInside = path.join(root, "source-inside.wav");
  const outputInside = path.join(root, "output-inside.wav");
  const sourceOutside = path.join(root, "source-outside.wav");
  const outputOutside = path.join(root, "output-outside.wav");
  await Promise.all([
    extractPcmRange(sourcePath, sourceInside, 1.45, 0.1),
    extractPcmRange(outputPath, outputInside, 1.45, 0.1),
    extractPcmRange(sourcePath, sourceOutside, 3.45, 0.1),
    extractPcmRange(outputPath, outputOutside, 3.45, 0.1),
  ]);
  assert.notEqual(await sha256File(sourceInside), await sha256File(outputInside), "the reviewed impulse should be treated");
  assert.equal(await sha256File(sourceOutside), await sha256File(outputOutside), "audio outside the enabled repair range must remain sample-identical");
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

class FakeTreatmentStore extends FakeMasteryStore {}
class FakeDialogueRepairStore extends FakeMasteryStore {}

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

function extractPcmRange(inputPath, outputPath, startSeconds, durationSeconds) {
  return run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-ss", String(startSeconds), "-i", inputPath, "-t", String(durationSeconds), "-map", "0:a:0", "-ar", "48000", "-c:a", "pcm_s24le", outputPath]);
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
