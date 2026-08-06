import { buildEpisodeAudioActivityMap, episodeAudioEnergyActivityThreshold } from "./episode-audio-activity-map";
import { buildEpisodeAudioProgram } from "./episode-audio-program";

const emptyProcessing = {
  signal: { jobId: "signal-1", status: "completed", integrityVerified: true, error: null, updatedAt: null, durationSeconds: 6, signalStatus: "signal-present", observationCount: 0 },
  transcript: { jobId: null, status: "not-queued", integrityVerified: false, error: null, updatedAt: null, transcriptJobId: null, segmentCount: 0, wordCount: 0, timedWordCount: 0 },
  alignment: { jobId: null, status: "not-queued", integrityVerified: false, error: null, updatedAt: null, spineAssetId: null, qualifiedForReview: null, openingOffsetSeconds: null, residualDriftMilliseconds: null },
  mastery: { jobId: null, status: "not-queued", integrityVerified: false, error: null, updatedAt: null, action: null, sourcePassesProfile: null, previewVerified: false },
};

function activity(jobId: string, levels: number[]) {
  return {
    schema: "quipsly-episode-audio-signal-activity-evidence-v1",
    jobId,
    source: { sha256: "a".repeat(64), generation: "generation-1", sizeBytes: 48_000 },
    algorithm: "quipsly-audio-signal-window-v1",
    completeDecode: true,
    durationSeconds: levels.length,
    windowDurationSeconds: 1,
    rmsDbfs: -30,
    thresholds: { nearSilenceDbfs: -72 },
    waveform: levels.map((rmsDbfs, index) => ({ startSeconds: index, durationSeconds: 1, rmsDbfs, samplePeakDbfs: rmsDbfs + 6, clippedFrameCount: 0 })),
    observations: [],
    boundaries: { energyIsNotVoiceActivity: true, measurementDoesNotChangeMedia: true, sourceIdentityBound: true },
  };
}

function source(input: { id: string; participantId: string | null; levels: number[]; alignedTo?: string; words?: Array<{ startSeconds: number; endSeconds: number }> }) {
  return {
    id: input.id,
    sourceId: `source-${input.id}`,
    originalName: `${input.id}.wav`,
    kind: "audio",
    contentType: "audio/wav",
    importRole: "phone-audio",
    syncStatus: null,
    recording: { participantId: input.participantId, readiness: { mediaProcessingReleased: true } },
    asset: {
      duration: 6,
      readiness: { sourceSafe: true },
      audioSignalActivityEvidence: activity(`signal-${input.id}`, input.levels),
      audioTranscriptActivityEvidence: input.words ? {
        schema: "quipsly-episode-audio-transcript-activity-evidence-v1",
        jobId: `transcript-${input.id}`,
        transcriptJobId: `canonical-transcript-${input.id}`,
        source: { sha256: "a".repeat(64), generation: "generation-1", sizeBytes: 48_000 },
        provider: { name: "openai-whisper-local", model: "small.en" },
        completeSourceRead: true,
        wordCount: input.words.length,
        timedWordCount: input.words.length,
        transcriptStartSeconds: input.words[0].startSeconds,
        transcriptEndSeconds: input.words.at(-1)!.endSeconds,
        words: input.words.map((word) => ({ ...word, confidenceAvailable: true })),
        boundaries: { providerTimingIsNotMeasuredAccuracy: true, wordsAreNotVoiceActivity: true, sourceIdentityBound: true, textExcludedFromActivityProjection: true },
      } : null,
      audioProcessingEvidence: input.alignedTo ? {
        ...emptyProcessing,
        alignment: { jobId: `align-${input.id}`, status: "completed", integrityVerified: true, error: null, updatedAt: null, spineAssetId: input.alignedTo, qualifiedForReview: true, openingOffsetSeconds: 0, residualDriftMilliseconds: 1 },
      } : emptyProcessing,
    },
  };
}

function decision(id: string, kind: string, assetId: string, sourceId: string, value: string, label: string) {
  return { id, operation: "set", kind, assetId, sourceId, value, label, targetReceiptId: null, stale: false, actorEmail: "editor@example.test", occurredAt: "2026-08-06T20:00:00.000Z" };
}

describe("episode audio activity map", () => {
  it("requires an explicit program clock before plotting sources on a shared clock", () => {
    const program = buildEpisodeAudioProgram({ importedMedia: [source({ id: "charlie", participantId: "charlie", levels: [-80, -20, -20, -80, -80, -80] })] });
    const map = buildEpisodeAudioActivityMap(program);
    expect(map.programClock).toBeNull();
    expect(map.coverage).toMatchObject({ profiledTrackCount: 1, plottedTrackCount: 0, unalignedProfileCount: 1 });
    expect(map.moments).toEqual([]);
  });

  it("surfaces measured overlap and same-participant redundancy without claiming speech or bleed", () => {
    const importedMedia = [
      source({ id: "charlie", participantId: "charlie", levels: [-80, -20, -20, -80, -80, -80] }),
      source({ id: "homer-mic", participantId: "homer", levels: [-80, -80, -18, -18, -80, -80], alignedTo: "charlie" }),
      source({ id: "homer-camera", participantId: "homer", levels: [-80, -80, -24, -24, -80, -80], alignedTo: "charlie" }),
    ];
    const active = [
      decision("clock-1", "program-clock", "charlie", "source-charlie", "primary", "Program clock"),
    ];
    const program = buildEpisodeAudioProgram({ importedMedia, audioProgram: { fingerprintSha256: "f".repeat(64), participants: [], decisions: { active, summary: { activeCount: 1, staleCount: 0 } } } });
    const map = buildEpisodeAudioActivityMap(program);

    expect(map.coverage).toMatchObject({ trackCount: 3, profiledTrackCount: 3, plottedTrackCount: 3, missingProfileCount: 0, unalignedProfileCount: 0 });
    expect(map.summary.possibleOverlapCount).toBe(1);
    expect(map.summary.sameParticipantMultideviceCount).toBe(1);
    expect(map.moments.find((moment) => moment.kind === "possible-participant-overlap")).toMatchObject({ requiresListening: true, assetIds: ["charlie", "homer-camera", "homer-mic"] });
    expect(map.boundaries).toMatchObject({ energyIsNotSpeech: true, overlapRequiresListening: true, noMixAutomationWritten: true });
  });

  it("derives a bounded per-track threshold from the measured distribution", () => {
    const program = buildEpisodeAudioProgram({ importedMedia: [source({ id: "threshold", participantId: "person", levels: [-80, -78, -44, -22, -20, -18] })] });
    const evidence = program.tracks[0].activityEvidence;
    expect(evidence).not.toBeNull();
    expect(episodeAudioEnergyActivityThreshold(evidence!)).toBeGreaterThanOrEqual(-56);
    expect(episodeAudioEnergyActivityThreshold(evidence!)).toBeLessThanOrEqual(-22);
  });

  it("compares exact-source provider word timing with energy while keeping mismatches review-only", () => {
    const importedMedia = [source({
      id: "timed",
      participantId: "host",
      levels: [-80, -20, -20, -80, -80, -80],
      words: [{ startSeconds: 1.2, endSeconds: 1.8 }, { startSeconds: 4.1, endSeconds: 4.3 }],
    })];
    const active = [decision("clock-timed", "program-clock", "timed", "source-timed", "primary", "Program clock")];
    const program = buildEpisodeAudioProgram({ importedMedia, audioProgram: { fingerprintSha256: "f".repeat(64), participants: [], decisions: { active, summary: { activeCount: 1, staleCount: 0 } } } });
    const map = buildEpisodeAudioActivityMap(program);

    expect(map.coverage).toMatchObject({ transcribedTrackCount: 1, comparableTranscriptEnergyTrackCount: 1 });
    expect(map.transcriptEnergyAgreement).toEqual(expect.objectContaining({ comparableCellCount: 180 }));
    expect(map.transcriptEnergyAgreement.bothActiveCellCount).toBeGreaterThan(0);
    expect(map.transcriptEnergyAgreement.energyOnlyCellCount).toBeGreaterThan(0);
    expect(map.transcriptEnergyAgreement.transcriptOnlyCellCount).toBeGreaterThan(0);
    expect(map.boundaries).toMatchObject({ providerWordTimingIsNotVoiceActivity: true, agreementIsNotTranscriptionAccuracy: true });
  });
});
