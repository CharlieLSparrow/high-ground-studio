import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";

import type { AudioTranscriptEvidence } from "@/lib/transcript-evidence";
import { SourceSyncEvidenceMap, sourceSyncDriftModel } from "./SourceSyncEvidenceMap";

const signal = {
  durationSeconds: 60,
  waveform: [
    { startSeconds: 0, durationSeconds: 20, rmsDbfs: -24, samplePeakDbfs: -4, clippedFrameCount: 0 },
    { startSeconds: 20, durationSeconds: 20, rmsDbfs: -42, samplePeakDbfs: -12, clippedFrameCount: 0 },
    { startSeconds: 40, durationSeconds: 20, rmsDbfs: -18, samplePeakDbfs: -2, clippedFrameCount: 0 },
  ],
} as NonNullable<AudioTranscriptEvidence["audio"]["signal"]>;

describe("source sync evidence map", () => {
  it("keeps opening placement, drift rate, and projected end error on one clock", () => {
    expect(sourceSyncDriftModel({ anchorSeconds: 1.25, observationIntervalSeconds: 60, residualDriftMilliseconds: 5, targetDurationSeconds: 120, targetKind: "video" })).toEqual(expect.objectContaining({
      measured: true,
      observationTimelineSeconds: 61.25,
      observedPartsPerMillion: 83.33333333333333,
      projectedEndDriftMilliseconds: 10,
      direction: "target-late",
      videoPerceptionContext: "average-undetectable-window",
    }));
  });

  it("renders decoded source lanes while keeping unmeasured evidence explicit", () => {
    render(<SourceSyncEvidenceMap spineLabel="MV7i master" targetLabel="Canon R8" targetKind="video" anchorSeconds={1.25} observationIntervalSeconds={null} residualDriftMilliseconds={null} targetDurationSeconds={60} spineSignal={signal} targetSignal={signal} />);
    expect(screen.getByRole("img", { name: /Spine and target decoded waveforms/i })).toBeInTheDocument();
    expect(screen.getByText("later point not measured")).toBeInTheDocument();
    expect(screen.getAllByText("not measured")).toHaveLength(3);
    expect(screen.getByText(/Positive residual means the target event arrived late/i)).toBeInTheDocument();
  });

  it("does not apply video perception thresholds to audio-only comparison", () => {
    const model = sourceSyncDriftModel({ anchorSeconds: 0, observationIntervalSeconds: 600, residualDriftMilliseconds: -20, targetDurationSeconds: 1_800, targetKind: "audio" });
    expect(model).toEqual(expect.objectContaining({
      direction: "target-early",
      videoPerceptionContext: "not-applicable",
    }));
    expect(model.projectedEndDriftMilliseconds).toBeCloseTo(-60, 6);
  });
});
