/** @jest-environment node */

import {
  assessAudioMastery,
  buildAudioMasteryTargetLocator,
  newAudioMasteryJob,
  newAudioMasteryProposal,
} from "@high-ground/quipsly-media-processing";

import { toPublicAudioMasteryStatus } from "./audio-mastery";

jest.mock("server-only", () => ({}));

const source = {
  assetId: "asset_privacy_001",
  provider: "local" as const,
  locator: "/private/quipsly/source.wav",
  generation: `sha256:${"a".repeat(64)}`,
  sha256: "a".repeat(64),
  sizeBytes: 48_000,
  contentType: "audio/wav",
};

const job = newAudioMasteryJob({
  jobId: "audio_mastery_privacy_001",
  projectId: "project_privacy_001",
  requestedByEmail: "private-editor@example.test",
  queuedAt: "2026-08-03T20:00:00.000Z",
  source,
  profileId: "apple-podcasts-dialogue-v1",
  target: {
    provider: "local",
    locator: buildAudioMasteryTargetLocator({
      assetId: source.assetId,
      sourceSha256: source.sha256,
      profileId: "apple-podcasts-dialogue-v1",
    }),
    contentType: "audio/wav",
    codec: "pcm_s24le",
    sampleRateHz: 48_000,
    variantKind: "audio-master-preview",
  },
});

describe("public audio mastery status", () => {
  it("does not expose private source, worker, hash, or requester fields", () => {
    const status = toPublicAudioMasteryStatus({
      id: job.jobId,
      status: "queued",
      inputJson: job,
      resultJson: null,
      error: null,
      updatedAt: new Date("2026-08-03T20:00:01.000Z"),
    });
    const serialized = JSON.stringify(status);
    expect(serialized).not.toContain(source.locator);
    expect(serialized).not.toContain(source.sha256);
    expect(serialized).not.toContain(job.requestedByEmail);
    expect(serialized).not.toContain("executionId");
    expect(serialized).not.toContain("providerSourceId");
  });

  it("fails closed when a completed row has no valid evidence receipt", () => {
    const status = toPublicAudioMasteryStatus({
      id: job.jobId,
      status: "completed",
      inputJson: job,
      resultJson: { state: "completed", receipt: { malformed: true } },
      error: null,
      updatedAt: new Date("2026-08-03T20:00:01.000Z"),
    });
    expect(status.status).toBe("failed");
    expect(status.error).toBe("Audio mastery evidence failed integrity validation.");
  });

  it("exposes only the verified derivative identity needed by authenticated mobile playback", () => {
    const derivativeSha256 = "b".repeat(64);
    const sourceMeasurement = {
      kind: "quipsly-audio-measurement-v1" as const,
      version: 1 as const,
      measurementId: "measurement_source_mobile_001",
      measuredAt: "2026-08-22T18:00:00.000Z",
      source,
      profileId: "apple-podcasts-dialogue-v1" as const,
      durationSeconds: 2,
      channels: 1,
      sampleRateHz: 48_000,
      integratedLufs: -24,
      truePeakDbtp: -6,
      loudnessRangeLu: 2,
      thresholdLufs: -34,
      targetOffsetLu: 8,
      seriesResolutionMs: 1_000 as const,
      series: [{ timeMs: 1_000, momentaryLufs: -24, shortTermLufs: null, integratedLufs: -24, truePeakDbtp: -6 }],
      analyzer: { name: "ffmpeg-loudnorm-ebur128" as const, version: "8.1.1", standard: "ITU-R BS.1770 / EBU R128" as const, completeDecode: true as const },
    };
    const proposal = newAudioMasteryProposal({
      proposalId: "proposal_mobile_001",
      createdAt: sourceMeasurement.measuredAt,
      measurement: sourceMeasurement,
      profileId: "apple-podcasts-dialogue-v1",
    });
    const derivativeSource = {
      assetId: source.assetId,
      provider: "local" as const,
      locator: job.target.locator,
      generation: `sha256:${derivativeSha256}`,
      sha256: derivativeSha256,
      sizeBytes: 192_044,
      contentType: "audio/wav",
    };
    const verificationMeasurement = {
      ...sourceMeasurement,
      measurementId: "measurement_derivative_mobile_001",
      source: derivativeSource,
      integratedLufs: -16,
      truePeakDbtp: -1.5,
      thresholdLufs: -26,
      targetOffsetLu: 0,
      series: [{ timeMs: 1_000, momentaryLufs: -16, shortTermLufs: null, integratedLufs: -16, truePeakDbtp: -1.5 }],
    };
    const receipt = {
      kind: "quipsly-audio-mastery-result-v1" as const,
      version: 1 as const,
      jobId: job.jobId,
      completedAt: "2026-08-22T18:01:00.000Z",
      source,
      sourceMeasurement,
      signalDiagnosis: null,
      proposal,
      derivative: {
        ...derivativeSource,
        codec: "pcm_s24le" as const,
        sampleRateHz: 48_000 as const,
        variantKind: "audio-master-preview" as const,
        verificationMeasurement,
        verification: assessAudioMastery(verificationMeasurement, "apple-podcasts-dialogue-v1"),
      },
      worker: { executionId: "private-execution", buildId: "private-build", imageDigest: null, attempt: 1 },
      boundaries: { originalRemainsSourceTruth: true as const, outputIsUnpromotedPreview: true as const, promotionRequiresExplicitApproval: true as const },
    };

    const status = toPublicAudioMasteryStatus({
      id: job.jobId,
      status: "completed",
      inputJson: job,
      resultJson: { state: "completed", receipt, registration: { playbackUrl: "/api/ingest/media/mobile-master" } },
      error: null,
      updatedAt: new Date("2026-08-22T18:01:01.000Z"),
    });

    expect(status.derivative).toMatchObject({
      playbackUrl: "/api/ingest/media/mobile-master",
      sha256: derivativeSha256,
      sizeBytes: derivativeSource.sizeBytes,
    });
    expect(status.reviewPlan?.requiredMoments).toEqual([
      expect.objectContaining({ id: "loudest-source", timeSeconds: 1 }),
    ]);
    const serialized = JSON.stringify(status);
    expect(serialized).not.toContain(source.locator);
    expect(serialized).not.toContain(source.sha256);
    expect(serialized).not.toContain("private-execution");
  });

  it("publishes listening candidates without leaking immutable source or worker authority", () => {
    const measuredAt = "2026-08-03T20:01:00.000Z";
    const sourceMeasurement = {
      kind: "quipsly-audio-measurement-v1" as const,
      version: 1 as const,
      measurementId: "measurement_privacy_001",
      measuredAt,
      source,
      profileId: "apple-podcasts-dialogue-v1" as const,
      durationSeconds: 2,
      channels: 1,
      sampleRateHz: 48_000,
      integratedLufs: -16.2,
      truePeakDbtp: -1.8,
      loudnessRangeLu: 2.5,
      thresholdLufs: -26.2,
      targetOffsetLu: 0,
      seriesResolutionMs: 1_000 as const,
      series: [
        { timeMs: 900, momentaryLufs: -16.2, shortTermLufs: null, integratedLufs: -16.2, truePeakDbtp: -1.8 },
        { timeMs: 1_900, momentaryLufs: -16.1, shortTermLufs: null, integratedLufs: -16.2, truePeakDbtp: -1.8 },
      ],
      analyzer: {
        name: "ffmpeg-loudnorm-ebur128" as const,
        version: "8.1.1",
        standard: "ITU-R BS.1770 / EBU R128" as const,
        completeDecode: true as const,
      },
    };
    const proposal = newAudioMasteryProposal({
      proposalId: "proposal_privacy_001",
      createdAt: measuredAt,
      measurement: sourceMeasurement,
      profileId: "apple-podcasts-dialogue-v1",
    });
    const statistics = {
      channel: null,
      dcOffset: 0.012,
      peakDbfs: -1.8,
      rmsDbfs: -19,
      rmsPeakDbfs: -15,
      rmsTroughDbfs: -24,
      crestFactor: 2.2,
      flatFactor: 0.4,
      peakCount: 4,
      noiseFloorDbfs: -46,
      dynamicRangeDb: 8,
      zeroCrossingRate: 0.1,
      nanCount: 0,
      infCount: 0,
      denormalCount: 0,
    };
    const receipt = {
      kind: "quipsly-audio-mastery-result-v1",
      version: 1,
      jobId: job.jobId,
      completedAt: "2026-08-03T20:02:00.000Z",
      source,
      sourceMeasurement,
      signalDiagnosis: {
        kind: "quipsly-audio-signal-diagnosis-v1",
        version: 1,
        diagnosisId: "diagnosis_privacy_001",
        analyzedAt: measuredAt,
        source,
        durationSeconds: 2,
        sampleRateHz: 48_000,
        channelCount: 1,
        overall: statistics,
        channels: [{ ...statistics, channel: 1 }],
        nearSilenceSpans: [],
        observations: [{
          kind: "dc-offset",
          severity: "attention",
          startSeconds: 0,
          endSeconds: 2,
          detail: "Listen before applying a corrective filter.",
          requiresListening: true,
          evidence: { channel: 1, dcOffset: 0.012, thresholdAmplitude: 0.01 },
        }],
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
      },
      proposal,
      derivative: null,
      worker: { executionId: "execution_privacy_001", buildId: "private-build", imageDigest: null, attempt: 1 },
      boundaries: {
        originalRemainsSourceTruth: true,
        outputIsUnpromotedPreview: true,
        promotionRequiresExplicitApproval: true,
      },
    };
    const status = toPublicAudioMasteryStatus({
      id: job.jobId,
      status: "completed",
      inputJson: job,
      resultJson: { state: "completed", receipt },
      error: null,
      updatedAt: new Date("2026-08-03T20:02:01.000Z"),
    });

    expect(status.status).toBe("completed");
    expect(status.signalDiagnosis?.observations[0]?.kind).toBe("dc-offset");
    expect(status.signalDiagnosis?.analyzer.statisticsAreNotListeningJudgments).toBe(true);
    const serialized = JSON.stringify(status);
    expect(serialized).not.toContain(source.locator);
    expect(serialized).not.toContain(source.sha256);
    expect(serialized).not.toContain("execution_privacy_001");
    expect(serialized).not.toContain("private-build");
  });
});
