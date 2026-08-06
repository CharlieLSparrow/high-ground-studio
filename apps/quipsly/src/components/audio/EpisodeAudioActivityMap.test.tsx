import { fireEvent, render, screen } from "@testing-library/react";

import type { EpisodeAudioActivityMap as ActivityMap } from "@/lib/episode-audio-activity-map";

import { EpisodeAudioActivityMap } from "./EpisodeAudioActivityMap";

function map(clock = true): ActivityMap {
  const cells = Array.from({ length: 180 }, (_, index) => ({ index, programStartSeconds: index / 30, programEndSeconds: (index + 1) / 30, sourceSeconds: index / 30, rmsDbfs: index >= 60 && index < 90 ? -20 : -80, intensity: index >= 60 && index < 90 ? 0.75 : 0, energyActive: index >= 60 && index < 90, clippingObserved: false }));
  return {
    schema: "quipsly-episode-audio-activity-map-v1",
    programFingerprintSha256: "f".repeat(64),
    programClock: clock ? { assetId: "asset-a", sourceId: "source-a" } : null,
    programDurationSeconds: 6,
    resolution: { cellCount: 180, secondsPerCell: 1 / 30 },
    lanes: [{ assetId: "asset-a", sourceId: "source-a", title: "Homer iPhone.wav", kind: "dialogue", role: "dialogue-primary", participantId: "homer", participantLabel: "Homer Sparrow", mixDisposition: "include", alignment: clock ? "program-clock" : "unavailable", programOffsetSeconds: clock ? 0 : null, sourceDurationSeconds: 6, activityThresholdDbfs: -32, evidenceJobId: "signal-a", cells }],
    moments: clock ? [{ id: "overlap-1", kind: "possible-participant-overlap", startSeconds: 2, endSeconds: 3, label: "Possible participant overlap", detail: "Listen before classifying this region.", assetIds: ["asset-a"], requiresListening: true }] : [],
    coverage: { trackCount: 1, profiledTrackCount: 1, plottedTrackCount: clock ? 1 : 0, missingProfileCount: 0, unalignedProfileCount: clock ? 0 : 1, unidentifiedDialogueTrackCount: 0 },
    summary: { possibleOverlapCount: clock ? 1 : 0, sameParticipantMultideviceCount: 0, unassignedEnergyCount: 0, dialogueGapCount: 0 },
    boundaries: { energyIsNotSpeech: true, overlapRequiresListening: true, candidateAlignmentDoesNotMoveTimeline: true, noMixAutomationWritten: true, sourceBytesRemainImmutable: true },
  };
}

describe("EpisodeAudioActivityMap", () => {
  it("keeps measured-energy language explicit and opens a listen-first region", () => {
    const onSelectTrack = jest.fn();
    const onInspectMoment = jest.fn();
    render(<EpisodeAudioActivityMap map={map()} selectedAssetId="asset-a" onSelectTrack={onSelectTrack} onInspectMoment={onInspectMoment} />);

    expect(screen.getByRole("heading", { name: "Measured energy across the shared clock" })).toBeInTheDocument();
    expect(screen.getByText(/Energy is not speech, speaker identity, bleed, echo/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Homer Sparrow/i }));
    expect(onSelectTrack).toHaveBeenCalledWith("asset-a");
    fireEvent.click(screen.getByRole("button", { name: /Possible participant overlap/i }));
    expect(onInspectMoment).toHaveBeenCalledWith(expect.objectContaining({ startSeconds: 2, requiresListening: true }));
  });

  it("refuses to plot profiles without an explicit program clock", () => {
    render(<EpisodeAudioActivityMap map={map(false)} selectedAssetId={null} onSelectTrack={jest.fn()} onInspectMoment={jest.fn()} />);
    expect(screen.getByText("Choose a reviewed program clock first")).toBeInTheDocument();
    expect(screen.queryByLabelText("Aligned source energy lanes")).not.toBeInTheDocument();
  });

  it("exposes canonical analysis registration separately from listening decisions", () => {
    const onRegisterAnalysis = jest.fn();
    render(<EpisodeAudioActivityMap map={map()} selectedAssetId={null} onSelectTrack={jest.fn()} onInspectMoment={jest.fn()} analysisReceipt={{ id: "analysis-1", stale: false, analyzedAt: "2026-08-06T20:00:00.000Z", momentCount: 1 }} canRegisterAnalysis onRegisterAnalysis={onRegisterAnalysis} />);
    expect(screen.getByText("Current analysis is registered")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Recheck current evidence" }));
    expect(onRegisterAnalysis).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/Register the current evidence references and derived regions/i)).not.toBeInTheDocument();
  });
});
