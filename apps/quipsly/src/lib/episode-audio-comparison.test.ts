import type { EpisodeAudioActivityLane, EpisodeAudioActivityMap, EpisodeAudioActivityMoment } from "./episode-audio-activity-map";
import { buildEpisodeAudioComparisonPlan } from "./episode-audio-comparison";

function lane(input: { assetId: string; offset: number | null; duration?: number | null; participant?: string }): EpisodeAudioActivityLane {
  return {
    assetId: input.assetId,
    sourceId: `source-${input.assetId}`,
    title: `${input.assetId}.wav`,
    kind: "dialogue",
    role: "dialogue-primary",
    participantId: input.participant ?? input.assetId,
    participantLabel: input.participant ?? input.assetId,
    mixDisposition: "include",
    alignment: input.offset === 0 ? "program-clock" : input.offset === null ? "unavailable" : "qualified-candidate",
    programOffsetSeconds: input.offset,
    sourceDurationSeconds: input.duration === undefined ? 60 : input.duration,
    activityThresholdDbfs: -36,
    evidenceJobId: `signal-${input.assetId}`,
    transcriptEvidenceJobId: null,
    transcriptWordCount: 0,
    cells: [],
    agreement: { comparableCellCount: 0, agreementCellCount: 0, bothActiveCellCount: 0, energyOnlyCellCount: 0, transcriptOnlyCellCount: 0, agreementRatio: null },
  };
}

function map(lanes: EpisodeAudioActivityLane[]): EpisodeAudioActivityMap {
  return {
    schema: "quipsly-episode-audio-activity-map-v1",
    programFingerprintSha256: "f".repeat(64),
    programClock: { assetId: "clock", sourceId: "source-clock" },
    programDurationSeconds: 60,
    resolution: { cellCount: 180, secondsPerCell: 1 / 3 },
    lanes,
    moments: [],
    coverage: { trackCount: lanes.length, profiledTrackCount: lanes.length, plottedTrackCount: lanes.length, missingProfileCount: 0, unalignedProfileCount: 0, unidentifiedDialogueTrackCount: 0, transcribedTrackCount: 0, comparableTranscriptEnergyTrackCount: 0 },
    transcriptEnergyAgreement: { comparableCellCount: 0, agreementCellCount: 0, bothActiveCellCount: 0, energyOnlyCellCount: 0, transcriptOnlyCellCount: 0, agreementRatio: null },
    summary: { possibleOverlapCount: 1, sameParticipantMultideviceCount: 0, unassignedEnergyCount: 0, dialogueGapCount: 0 },
    boundaries: { energyIsNotSpeech: true, overlapRequiresListening: true, candidateAlignmentDoesNotMoveTimeline: true, noMixAutomationWritten: true, sourceBytesRemainImmutable: true, providerWordTimingIsNotVoiceActivity: true, agreementIsNotTranscriptionAccuracy: true },
  };
}

const moment: EpisodeAudioActivityMoment = {
  id: "possible-participant-overlap-30-33",
  kind: "possible-participant-overlap",
  startSeconds: 30,
  endSeconds: 33,
  label: "Possible participant overlap",
  detail: "Listen before classifying this region.",
  assetIds: ["clock", "remote"],
  requiresListening: true,
};

describe("episode audio comparison plan", () => {
  it("maps one bounded program region to exact source-clock ranges", () => {
    const plan = buildEpisodeAudioComparisonPlan({
      map: map([lane({ assetId: "clock", offset: 0 }), lane({ assetId: "remote", offset: 0.35 })]),
      moment,
      playbackSources: [
        { assetId: "clock", sourceId: "source-clock", playbackUrl: "/api/ingest/media/source-clock" },
        { assetId: "remote", sourceId: "source-remote", playbackUrl: "/api/ingest/media/source-remote" },
      ],
    });

    expect(plan).not.toBeNull();
    expect(plan).toMatchObject({ programStartSeconds: 28.5, programEndSeconds: 34.5, durationSeconds: 6 });
    expect(plan?.sources).toEqual([
      expect.objectContaining({ assetId: "clock", sourceStartSeconds: 28.5, sourceEndSeconds: 34.5 }),
      expect.objectContaining({ assetId: "remote", sourceStartSeconds: 28.15, sourceEndSeconds: 34.15 }),
    ]);
    expect(plan?.boundaries.playbackDoesNotConfirmClassification).toBe(true);
  });

  it("refuses an audition when no retained source is both aligned and playable", () => {
    expect(buildEpisodeAudioComparisonPlan({
      map: map([lane({ assetId: "clock", offset: null })]),
      moment: { ...moment, assetIds: ["clock"] },
      playbackSources: [{ assetId: "clock", sourceId: "source-clock", playbackUrl: "/api/ingest/media/source-clock" }],
    })).toBeNull();
  });

  it("clips the review region to the common retained-source range", () => {
    const plan = buildEpisodeAudioComparisonPlan({
      map: map([lane({ assetId: "clock", offset: 0, duration: 32 }), lane({ assetId: "remote", offset: 1, duration: 31 })]),
      moment,
      playbackSources: [
        { assetId: "clock", sourceId: "source-clock", playbackUrl: "/clock" },
        { assetId: "remote", sourceId: "source-remote", playbackUrl: "/remote" },
      ],
    });
    expect(plan).toMatchObject({ programStartSeconds: 28.5, programEndSeconds: 32, durationSeconds: 3.5 });
    expect(plan?.sources[1]).toMatchObject({ sourceStartSeconds: 27.5, sourceEndSeconds: 31 });
  });
});
