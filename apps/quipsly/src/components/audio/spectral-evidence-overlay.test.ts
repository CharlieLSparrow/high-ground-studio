import type { AudioEvidenceTranscriptWord } from "./AudioEvidenceMap";
import {
  adjacentSpectralMoment,
  nearestSpectralLoudnessPoint,
  spectralEvidenceAtTime,
  spectralOverlayMoments,
  spectralTranscriptSlices,
  sourceBoundSpectralEditMarkers,
  type SpectralEvidenceMarker,
} from "./spectral-evidence-overlay";

const words: AudioEvidenceTranscriptWord[] = [
  { id: "word-1", segmentId: "segment-1", text: "quiet", startSeconds: 1, endSeconds: 1.4, confidence: 0.31, reviewState: "unchecked" },
  { id: "word-2", segmentId: "segment-1", text: "confirmed", startSeconds: 2, endSeconds: 2.5, confidence: 0.97, reviewState: "confirmed" },
  { id: "word-3", segmentId: "segment-2", text: "corrected", startSeconds: 3, endSeconds: 3.6, confidence: 0.75, reviewState: "corrected" },
];
const markers: SpectralEvidenceMarker[] = [{ id: "signal-1", category: "signal", startSeconds: 2.1, endSeconds: 2.3, label: "Possible dropout", detail: "Listen before classifying.", severity: "attention" }];

describe("spectral evidence overlay", () => {
  it("preserves attention and reviewed transcript states when a whole source is bounded", () => {
    const repeated = Array.from({ length: 900 }, (_, index) => ({ ...words[index % words.length], id: `word-${index}`, startSeconds: index, endSeconds: index + 0.4 }));
    const slices = spectralTranscriptSlices(repeated, 0, 900, 0.65, 120);
    expect(slices.length).toBeLessThanOrEqual(120);
    expect(slices.some((slice) => slice.states.includes("attention"))).toBe(true);
    expect(slices.some((slice) => slice.states.includes("corrected"))).toBe(true);
  });

  it("builds a deterministic review queue without relabeling confidence as accuracy", () => {
    const moments = spectralOverlayMoments(markers, words, 0.65);
    expect(moments.map((moment) => moment.id)).toEqual(["transcript-word-1", "signal-1", "transcript-segment-segment-2"]);
    expect(moments[0].detail).toContain("not measured accuracy");
    expect(adjacentSpectralMoment(moments, 1, "next")?.id).toBe("signal-1");
    expect(adjacentSpectralMoment(moments, 0, "previous")?.id).toBe("transcript-segment-segment-2");
  });

  it("keeps transcript segments navigable when a provider has no comparable confidence threshold", () => {
    const moments = spectralOverlayMoments([], words, null);
    expect(moments.map((moment) => moment.id)).toEqual(["transcript-segment-segment-1", "transcript-segment-segment-2"]);
    expect(moments[0].detail).toContain("Provider-timed segment");
  });

  it("returns only evidence active at the selected immutable source time", () => {
    expect(spectralEvidenceAtTime(markers, words, 2.2)).toEqual({ word: words[1], markers });
    expect(spectralEvidenceAtTime(markers, words, 8)).toEqual({ word: null, markers: [] });
  });

  it("selects the nearest measured loudness point without interpolating evidence", () => {
    expect(nearestSpectralLoudnessPoint([
      { timeSeconds: 1, momentaryLufs: -20, shortTermLufs: -22, integratedLufs: -24, truePeakDbtp: -3 },
      { timeSeconds: 4, momentaryLufs: -15, shortTermLufs: -17, integratedLufs: -20, truePeakDbtp: -1.5 },
    ], 3.6)?.timeSeconds).toBe(4);
  });

  it("admits unapplied edit ranges only for a current exact studio-media binding", () => {
    const binding = {
      projectSlug: "hgo",
      episodeSlug: "episode-8",
      signalEvidence: {
        mediaAssetKind: "studio-media" as const,
        mediaAssetId: "asset-1",
        sourceSha256: "a".repeat(64),
        signalProfileSha256: "b".repeat(64),
        protectedPlaybackSourceId: "source-1",
      },
    };
    const proposals = [{ proposalId: "proposal-1", type: "deactivate_range", sourceRange: { startSeconds: 2, endSeconds: 3 }, rationale: "Possible repeated phrase.", confidence: "medium" as const, applied: false as const }];
    const reviewCandidates = [{ candidateId: "candidate-1", kind: "signal-attention", sourceRange: { startSeconds: 6, endSeconds: 7 }, rationale: "Decoded energy needs a listen.", confidence: "high" as const, suggestedAction: "listen", changesSource: false as const }];
    const base = { currentProjectSlug: "hgo", currentEpisodeSlug: "episode-8", currentAssetId: "asset-1", currentSourceId: "source-1", currentSourceSha256: "a".repeat(64), bindingIsCurrent: true, binding, proposals, reviewCandidates };

    expect(sourceBoundSpectralEditMarkers(base)).toEqual([
      expect.objectContaining({ id: "edit-proposal-proposal-1", category: "edit", label: expect.stringContaining("Unapplied") }),
      expect.objectContaining({ id: "edit-candidate-candidate-1", category: "edit", detail: expect.stringContaining("Source unchanged") }),
    ]);
    expect(sourceBoundSpectralEditMarkers({ ...base, currentAssetId: "other-asset" })).toEqual([]);
    expect(sourceBoundSpectralEditMarkers({ ...base, currentSourceId: "other-source" })).toEqual([]);
    expect(sourceBoundSpectralEditMarkers({ ...base, currentSourceSha256: "c".repeat(64) })).toEqual([]);
    expect(sourceBoundSpectralEditMarkers({ ...base, bindingIsCurrent: false })).toEqual([]);
  });
});
