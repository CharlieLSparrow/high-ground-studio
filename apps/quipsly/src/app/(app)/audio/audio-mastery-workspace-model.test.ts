import {
  audioMasteryLifecycle,
  audioWorkspaceGuide,
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

  it("keeps a validated classifier receipt available without exposing arbitrary capture profile fields", () => {
    const projected = audioWorkspaceAssets(inventory(true))[0];
    expect(projected.audibleEventAnalysis).toEqual(expect.objectContaining({ analysisId: "audible_analysis_test_receipt_001", sourceByteCount: 42_000 }));
    expect(projected.audibleEventAnalysis?.boundaries.noRepairOrEditAuthorized).toBe(true);
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

  it("turns deep audio ledgers into one evidence-bound recommended next step", () => {
    const asset = audioWorkspaceAssets(inventory(true))[0];
    const guide = audioWorkspaceGuide({
      asset,
      program: { includedTrackCount: 2, alignedIncludedTrackCount: 1, hasProgramClock: true },
      signalStatus: null,
      transcriptStatus: null,
      masteryStatus: null,
    });

    expect(guide.next).toEqual(expect.objectContaining({
      href: "#audio-program",
      label: "Finish source alignment",
    }));
    expect(guide.items.map((item) => [item.id, item.state, item.statusLabel])).toEqual([
      ["source", "complete", "Retained"],
      ["program", "attention", "Needs decisions"],
      ["evidence", "available", "Available"],
      ["finish", "available", "Available"],
    ]);
  });

  it("prioritizes suspicious provider evidence before mastering", () => {
    const asset = audioWorkspaceAssets(inventory(true))[0];
    const guide = audioWorkspaceGuide({
      asset,
      program: { includedTrackCount: 1, alignedIncludedTrackCount: 1, hasProgramClock: true },
      signalStatus: { status: "completed", audioSignal: { schemaVersion: 1 } } as unknown as AudioSignalProfileClientStatus,
      transcriptStatus: {
        status: "completed",
        coverage: { segmentCount: 2 },
        quality: { disposition: "review-required" },
      } as unknown as import("@/lib/media-workflow-client-status").StudioSourceTranscriptClientStatus,
      masteryStatus: null,
    });

    expect(guide.next).toEqual(expect.objectContaining({
      href: "#source-clock",
      label: "Review suspicious transcript evidence",
    }));
    expect(guide.items.find((item) => item.id === "evidence")).toEqual(expect.objectContaining({
      state: "attention",
      statusLabel: "Listen first",
    }));
  });

  it("makes a held source the first intervention without hiding later stages", () => {
    const asset = audioWorkspaceAssets(inventory(false))[0];
    const guide = audioWorkspaceGuide({
      asset,
      program: { includedTrackCount: 1, alignedIncludedTrackCount: 0, hasProgramClock: false },
      signalStatus: null,
      transcriptStatus: null,
      masteryStatus: null,
    });

    expect(guide.next).toEqual({
      href: "#selected-source",
      label: "Resolve the source hold",
      detail: "Preserve only; processing is held.",
    });
    expect(guide.items).toHaveLength(4);
    expect(guide.items[0]).toEqual(expect.objectContaining({ state: "held", statusLabel: "Held" }));
  });

  it("keeps a partially released source operable in the lane that is actually authorized", () => {
    const asset = { ...audioWorkspaceAssets(inventory(true))[0], canProcess: true, canTranscribe: false };
    const guide = audioWorkspaceGuide({
      asset,
      program: { includedTrackCount: 1, alignedIncludedTrackCount: 1, hasProgramClock: true },
      signalStatus: { status: "completed", audioSignal: { schemaVersion: 1 } } as unknown as AudioSignalProfileClientStatus,
      transcriptStatus: null,
      masteryStatus: null,
    });

    expect(guide.items[0]).toEqual(expect.objectContaining({
      state: "attention",
      statusLabel: "Partially released",
      detail: "Media processing released · transcription held.",
    }));
    expect(guide.next).toEqual(expect.objectContaining({ label: "Resolve the transcription hold" }));
    expect(guide.items.find((item) => item.id === "finish")).toEqual(expect.objectContaining({ state: "available" }));
  });
});
