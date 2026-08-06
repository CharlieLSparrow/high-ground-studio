import { newAudioSignalProfileJob, newStudioSourceTranscriptJob } from "@high-ground/quipsly-media-processing";

import {
  episodeAudioProcessingEvidence,
  episodeAudioSignalActivityEvidence,
  episodeAudioTranscriptActivityEvidence,
} from "./episode-audio-processing-evidence";

const source = {
  assetId: "asset_0001",
  provider: "local" as const,
  locator: "/retained/audio.wav",
  generation: "local-generation-1",
  sha256: "a".repeat(64),
  sizeBytes: 48_000,
  contentType: "audio/wav",
};

function transcriptFixture() {
  const job = newStudioSourceTranscriptJob({
    jobId: "source_transcript_job_0001",
    transcriptJobId: "canonical_transcript_job_0001",
    projectId: "project_0001",
    episodeProductionId: "episode_production_0001",
    episodeSlug: "episode-9",
    sourceId: "source_0001",
    requestedByEmail: "producer@example.com",
    queuedAt: "2026-08-06T12:00:00.000Z",
    source,
    authorization: {
      kind: "participant-consent-confirmed",
      statementVersion: "quipsly-studio-transcription-authorization-v1",
      accepted: true,
      acceptedAt: "2026-08-06T11:59:00.000Z",
      acceptedByEmail: "producer@example.com",
      importRole: "phone-audio",
      purpose: "episode-production-transcription-and-review",
    },
    provider: { name: "openai-whisper-local", model: "small.en", language: "en", wordTimestamps: true, speakerDiarization: false },
  });
  const receipt = {
    kind: "quipsly-studio-source-transcript-result-v1",
    version: 1,
    jobId: job.jobId,
    transcriptJobId: job.transcriptJobId,
    completedAt: "2026-08-06T12:02:00.000Z",
    source,
    language: "en",
    provider: {
      name: "openai-whisper-local",
      model: "small.en",
      rawEvidenceSha256: "b".repeat(64),
      rawEvidenceSizeBytes: 800,
      rawEvidenceLocator: "/evidence/source_transcript_job_0001.json",
      capabilities: { segmentTiming: "provider", wordTiming: "provider", wordConfidence: "provider", segmentConfidence: "unavailable", speakerDiarization: "unavailable", alternatives: "unavailable" },
    },
    segments: [{ ordinal: 0, startSeconds: 0.1, endSeconds: 0.8, text: "Hello there", confidence: null, speakerLabel: null, wordStartIndex: 0, wordEndIndexExclusive: 2 }],
    words: [
      { index: 0, segmentOrdinal: 0, startSeconds: 0.1, endSeconds: 0.35, word: "Hello", punctuatedWord: "Hello", confidence: 0.92, speakerLabel: null },
      { index: 1, segmentOrdinal: 0, startSeconds: 0.4, endSeconds: 0.8, word: "there", punctuatedWord: "there", confidence: null, speakerLabel: null },
    ],
    coverage: { segmentCount: 1, wordCount: 2, timedWordCount: 2, confidenceWordCount: 1, speakerLabeledWordCount: 0, transcriptStartSeconds: 0.1, transcriptEndSeconds: 0.8 },
    worker: { executionId: "execution_transcript_0001", buildId: "build-transcript-fixture", imageDigest: null, attempt: 1 },
    boundaries: { ...job.boundaries, completeSourceRead: true, providerEvidenceRetained: true },
  };
  return { job, receipt };
}

describe("episodeAudioProcessingEvidence", () => {
  it("keeps absent work explicitly not queued", () => {
    expect(episodeAudioProcessingEvidence([])).toMatchObject({
      signal: { jobId: null, status: "not-queued", integrityVerified: false },
      transcript: { jobId: null, status: "not-queued", integrityVerified: false },
      alignment: { jobId: null, status: "not-queued", integrityVerified: false },
      mastery: { jobId: null, status: "not-queued", integrityVerified: false },
    });
  });

  it("validates queued exact-source contracts without pretending a result exists", () => {
    const job = newAudioSignalProfileJob({
      jobId: "signal_job_0001",
      projectId: "project_0001",
      requestedByEmail: "producer@example.com",
      queuedAt: "2026-08-06T12:00:00.000Z",
      source,
    });
    expect(episodeAudioProcessingEvidence([{
      id: job.jobId,
      type: "audio-signal-profile",
      status: "queued",
      inputJson: job,
      resultJson: null,
      updatedAt: new Date("2026-08-06T12:00:00.000Z"),
    }]).signal).toMatchObject({
      jobId: "signal_job_0001",
      status: "queued",
      integrityVerified: true,
      durationSeconds: null,
      observationCount: 0,
    });
  });

  it("fails closed when a completed row has no valid result receipt", () => {
    const evidence = episodeAudioProcessingEvidence([{
      id: "signal_job_0002",
      type: "audio-signal-profile",
      status: "completed",
      inputJson: { kind: "not-a-real-contract" },
      resultJson: {},
      updatedAt: new Date("2026-08-06T12:00:00.000Z"),
    }]);
    expect(evidence.signal).toMatchObject({
      status: "failed",
      integrityVerified: false,
      error: "Audio signal evidence failed integrity validation.",
    });
    expect(episodeAudioSignalActivityEvidence([{
      id: "signal_job_0002",
      type: "audio-signal-profile",
      status: "completed",
      inputJson: { kind: "not-a-real-contract" },
      resultJson: {},
    }])).toBeNull();
  });

  it("publishes bounded complete-decode energy without promoting it to voice activity", () => {
    const job = newAudioSignalProfileJob({
      jobId: "signal_job_activity_0001",
      projectId: "project_0001",
      requestedByEmail: "producer@example.com",
      queuedAt: "2026-08-06T12:00:00.000Z",
      source,
    });
    const audioSignal = {
      schemaVersion: 1,
      algorithm: "quipsly-audio-signal-window-v1",
      sampleRate: 48_000,
      channelCount: 1,
      analyzedFrameCount: 48_000,
      durationSeconds: 1,
      windowDurationSeconds: 0.5,
      rmsDbfs: -18,
      samplePeakDbfs: -3,
      clippedFrameCount: 0,
      clippedFrameFraction: 0,
      nearSilentFrameFraction: 0,
      leftRmsDbfs: -18,
      rightRmsDbfs: null,
      stereoBalanceDb: null,
      signalStatus: "signal-present",
      thresholds: { clippingAmplitude: 0.999, nearSilenceDbfs: -72, possibleDropoutMinimumSeconds: 0.25, surroundingSignalDbfs: -45, stereoImbalanceDb: 12 },
      waveform: [
        { startSeconds: 0, durationSeconds: 0.5, rmsDbfs: -18, samplePeakDbfs: -3, clippedFrameCount: 0 },
        { startSeconds: 0.5, durationSeconds: 0.5, rmsDbfs: -19, samplePeakDbfs: -4, clippedFrameCount: 0 },
      ],
      frequencyProfile: {
        algorithm: "quipsly-audio-broad-band-rms-v1",
        completeDecode: true,
        downmixPolicy: "ffmpeg-default-mono-v1",
        windowDurationSeconds: 0.5,
        analyzedFrameCount: 48_000,
        bands: [{ id: "speech", label: "Speech", minimumHz: 500, maximumHz: 2_000 }],
        overallBandRmsDbfs: [-20],
        windows: [
          { startSeconds: 0, durationSeconds: 0.5, bandRmsDbfs: [-18] },
          { startSeconds: 0.5, durationSeconds: 0.5, bandRmsDbfs: [-22] },
        ],
        boundaries: { broadBandsAreNotARepairSpectrogram: true, measurementsAreNotEqDecisions: true, stereoIsDownmixedForFrequencyOverview: true },
      },
      observations: [],
    };
    const receipt = {
      kind: "quipsly-audio-signal-profile-result-v1",
      version: 1,
      jobId: job.jobId,
      completedAt: "2026-08-06T12:01:00.000Z",
      source,
      media: { container: "wav", codec: "pcm_s24le", sampleRate: 48_000, channelCount: 1, durationSeconds: 1 },
      audioSignal,
      analyzer: { algorithm: "quipsly-audio-signal-window-v1", ffmpegVersion: "ffmpeg fixture", completeDecode: true, maximumWindows: 1_200, frequencyAnalysis: { algorithm: "quipsly-audio-broad-band-rms-v1", maximumBands: 6, maximumWindows: 1_200, completeDecode: true } },
      worker: { executionId: "execution_signal_0001", buildId: "build-signal-fixture", imageDigest: null, attempt: 1 },
      boundaries: { originalRemainsSourceTruth: true, analysisDoesNotChangeMedia: true, observationsRequireHumanInterpretation: true },
    };
    const evidence = episodeAudioSignalActivityEvidence([{ id: job.jobId, type: "audio-signal-profile", status: "completed", inputJson: job, resultJson: { receipt } }]);

    expect(evidence).toMatchObject({
      jobId: job.jobId,
      completeDecode: true,
      waveform: [{ startSeconds: 0, rmsDbfs: -18 }, { startSeconds: 0.5, rmsDbfs: -19 }],
      boundaries: { energyIsNotVoiceActivity: true, measurementDoesNotChangeMedia: true, sourceIdentityBound: true },
    });
  });

  it("projects provider word timing without exposing transcript text or calling it VAD", () => {
    const { job, receipt } = transcriptFixture();
    const evidence = episodeAudioTranscriptActivityEvidence(
      [{ id: job.jobId, type: "source-transcript", status: "completed", inputJson: job, resultJson: { receipt } }],
      [{ id: job.transcriptJobId, status: "COMPLETED", _count: { segments: 1, words: 2 } }],
    );

    expect(evidence).toEqual(expect.objectContaining({
      jobId: job.jobId,
      transcriptJobId: job.transcriptJobId,
      wordCount: 2,
      timedWordCount: 2,
      words: [
        { startSeconds: 0.1, endSeconds: 0.35, confidenceAvailable: true },
        { startSeconds: 0.4, endSeconds: 0.8, confidenceAvailable: false },
      ],
      boundaries: { providerTimingIsNotMeasuredAccuracy: true, wordsAreNotVoiceActivity: true, sourceIdentityBound: true, textExcludedFromActivityProjection: true },
    }));
    expect(JSON.stringify(evidence)).not.toContain("Hello");
  });

  it("fails closed when canonical transcript counts diverge from the provider receipt", () => {
    const { job, receipt } = transcriptFixture();
    expect(episodeAudioTranscriptActivityEvidence(
      [{ id: job.jobId, type: "source-transcript", status: "completed", inputJson: job, resultJson: { receipt } }],
      [{ id: job.transcriptJobId, status: "COMPLETED", _count: { segments: 1, words: 1 } }],
    )).toBeNull();
  });
});
