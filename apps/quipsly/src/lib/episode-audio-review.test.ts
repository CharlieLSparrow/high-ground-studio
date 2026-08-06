import type { EpisodeAudioComparisonPlan } from "./episode-audio-comparison";
import { buildEpisodeAudioReviewPlaybackEvidence, episodeAudioReviewDecisionOptions, episodeAudioReviewPlaybackReady } from "./episode-audio-review";

const plan: EpisodeAudioComparisonPlan = {
  schema: "quipsly-episode-audio-comparison-plan-v1", momentId: "overlap-1", momentKind: "possible-participant-overlap", label: "Possible overlap", detail: "Listen.", programStartSeconds: 10, programEndSeconds: 12, durationSeconds: 2,
  sources: [
    { assetId: "a", sourceId: "sa", title: "A", participantLabel: "A", role: "dialogue-primary", alignment: "program-clock", programOffsetSeconds: 0, sourceStartSeconds: 10, sourceEndSeconds: 12, playbackUrl: "/a" },
    { assetId: "b", sourceId: "sb", title: "B", participantLabel: "B", role: "dialogue-primary", alignment: "qualified-candidate", programOffsetSeconds: 0.2, sourceStartSeconds: 9.8, sourceEndSeconds: 11.8, playbackUrl: "/b" },
  ], omitted: [], boundaries: { protectedSourcePlaybackOnly: true, monitorGainDoesNotChangeMedia: true, playbackDoesNotConfirmClassification: true, candidateAlignmentDoesNotMoveTimeline: true },
};

describe("episode audio review playback evidence", () => {
  it("requires broad all-source and per-source solo coverage for a definitive classification", () => {
    const evidence = buildEpisodeAudioReviewPlaybackEvidence({ analysisId: "analysis-1", plan, allMonitorBins: [0, 1, 2, 3, 4, 5], soloMonitorBinsByAsset: new Map([["a", new Set([0, 1, 2, 3, 4])], ["b", new Set([0, 1, 2, 3, 4])]]), completedAt: "2026-08-06T20:00:00.000Z" });
    expect(evidence.coverage.totalBinCount).toBe(8);
    expect(episodeAudioReviewPlaybackReady(evidence, "confirmed-overlap")).toBe(true);
  });

  it("permits a needs-more-comparison receipt after partial listening but not a definitive claim", () => {
    const evidence = buildEpisodeAudioReviewPlaybackEvidence({ analysisId: "analysis-1", plan, allMonitorBins: [0], soloMonitorBinsByAsset: new Map() });
    expect(episodeAudioReviewPlaybackReady(evidence, "confirmed-overlap")).toBe(false);
    expect(episodeAudioReviewPlaybackReady(evidence, "needs-comparison")).toBe(true);
  });

  it("offers event-specific decisions instead of one generic approval", () => {
    expect(episodeAudioReviewDecisionOptions("dialogue-gap").map((option) => option.value)).toEqual(["confirmed-dialogue-gap", "false-positive", "needs-comparison"]);
    expect(episodeAudioReviewDecisionOptions("same-participant-multidevice").map((option) => option.value)).toContain("same-participant-redundancy");
  });
});
