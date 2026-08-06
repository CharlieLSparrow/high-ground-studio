import {
  audioMasteryLifecycle,
  audioWorkspaceAssets,
  audioWorkspaceSignal,
  type AudioSignalProfileClientStatus,
  type AudioMasteryClientStatus,
  type AudioWorkspaceInventory,
} from "./audio-mastery-workspace-model";

function inventory(released: boolean): AudioWorkspaceInventory {
  return {
    ok: true,
    project: { id: "project-1", slug: "high-ground-odyssey", name: "High Ground Odyssey" },
    episode: { found: true, id: "episode-1", slug: "episode-9", title: "Episode 9" },
    importedMedia: [{
      id: "asset-1",
      sourceId: "source-1",
      originalName: "Homer local master.wav",
      kind: "audio",
      contentType: "audio/wav",
      importRole: "local-audio-master",
      recordingAssetId: "recording-1",
      unresolvedRecordingReference: false,
      syncStatus: "synced",
      sync: {
        recordingSync: {
          reportedSourceProfile: {
            audibleEventAnalysis: {
              schemaVersion: 1,
              analysisId: "audible_analysis_test_receipt_001",
              supersedesAnalysisId: null,
              status: "completed",
              algorithm: "apple-sound-classifier-file-v1",
              classifierIdentifier: "SNClassifierIdentifierVersion1",
              analyzedAt: "2026-08-05T18:00:00Z",
              sourceSHA256: "b".repeat(64),
              sourceByteCount: 42_000,
              durationSeconds: 10,
              requestedWindowDurationSeconds: 1.5,
              effectiveWindowDurationSeconds: 1.5,
              overlapFactor: 0.5,
              minimumCandidateConfidence: 0.35,
              knownClassificationCount: 300,
              knownClassificationsSHA256: "a".repeat(64),
              resultWindowCount: 12,
              suggestions: [],
              failureCode: null,
              failureDetail: null,
              boundaries: { classifierOutputIsListeningTriageOnly: true, classifierScoreIsNotAudibility: true, noMediaChanged: true, noRepairOrEditAuthorized: true, humanReviewRequired: true },
            },
          },
        },
      },
      storage: { playbackUrl: "/api/media-vault/source/source-1" },
      asset: { readiness: { sourceSafe: true } },
      recording: {
        readiness: {
          mediaProcessingReleased: released,
          transcriptProcessingReleased: released,
        },
      },
      safeNextAction: released ? "Review the source." : "Preserve only; processing is held.",
    }],
    summary: { importedMediaCount: 1, audioCount: 1 },
    safeNextActions: [],
  };
}

describe("Audio Studio workspace projections", () => {
  it("keeps held capture media visible while preventing derivation", () => {
    expect(audioWorkspaceAssets(inventory(false))).toEqual([
      expect.objectContaining({
        id: "asset-1",
        sourceId: "source-1",
        mediaProcessingReleased: false,
        canProcess: false,
        transcriptProcessingReleased: false,
        canTranscribe: false,
        audibleEventAnalysis: expect.objectContaining({ analysisId: "audible_analysis_test_receipt_001" }),
      }),
    ]);
  });

  it("parses only validated durable signal evidence for shared-clock review", () => {
    const status = {
      audioSignal: {
        schemaVersion: 1,
        algorithm: "quipsly-audio-signal-window-v1",
        signalStatus: "signal-present",
        sampleRate: 48_000,
        channelCount: 1,
        analyzedFrameCount: 480_000,
        durationSeconds: 10,
        windowDurationSeconds: 1,
        rmsDbfs: -24,
        samplePeakDbfs: -3,
        clippedFrameCount: 0,
        clippedFrameFraction: 0,
        nearSilentFrameFraction: 0,
        thresholds: { clippingAmplitude: 0.999, nearSilenceDbfs: -72, possibleDropoutMinimumSeconds: 1.25, surroundingSignalDbfs: -45, stereoImbalanceDb: 12 },
        waveform: [{ startSeconds: 0, durationSeconds: 10, rmsDbfs: -24, samplePeakDbfs: -3, clippedFrameCount: 0 }],
        observations: [],
      },
    } as unknown as AudioSignalProfileClientStatus;

    expect(audioWorkspaceSignal(status)).toEqual(expect.objectContaining({ durationSeconds: 10, waveform: expect.any(Array) }));
    expect(audioWorkspaceSignal({ ...status, audioSignal: { schemaVersion: 2 } })).toBeNull();
  });

  it("projects the canonical review and delivery ledger as one lifecycle", () => {
    const status = {
      status: "completed",
      jobId: "mastery-1",
      proposal: { action: "render-loudness-master" },
      derivative: { playbackUrl: "/master.wav" },
      review: { latest: { decision: "approved" } },
      promotion: { active: true, activePromotion: { jobId: "mastery-1" } },
      delivery: {
        status: "completed",
        output: { playbackUrl: "/delivery.m4a" },
        review: { latest: { decision: "approved" } },
      },
    } as unknown as AudioMasteryClientStatus;

    expect(audioMasteryLifecycle(status).map((step) => [step.id, step.complete])).toEqual([
      ["measure", true],
      ["audition", true],
      ["promote", true],
      ["deliver", true],
      ["proof", true],
    ]);
  });
});
