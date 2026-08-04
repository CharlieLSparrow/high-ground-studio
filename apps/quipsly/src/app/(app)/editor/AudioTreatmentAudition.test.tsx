import { fireEvent, render, screen } from "@testing-library/react";

import type { AudioMasteryMeasurement, AudioSignalDiagnosisSummary } from "./AudioMasteryAudition";
import { AudioTreatmentAudition, audioTreatmentSignalComparison } from "./AudioTreatmentAudition";

function measurement(integratedLufs: number, values: number[]): AudioMasteryMeasurement {
  return {
    measuredAt: "2026-08-04T12:00:00.000Z",
    durationSeconds: values.length,
    integratedLufs,
    truePeakDbtp: -2,
    loudnessRangeLu: 3,
    thresholdLufs: -40,
    seriesResolutionMs: 1_000,
    series: values.map((value, index) => ({ timeMs: index * 1_000, momentaryLufs: value, shortTermLufs: value, integratedLufs, truePeakDbtp: -3 })),
  };
}

function diagnosis({ rmsDbfs, peakDbfs, noiseFloorDbfs, dcOffset, observationCount }: {
  rmsDbfs: number;
  peakDbfs: number;
  noiseFloorDbfs: number | null;
  dcOffset: number;
  observationCount: number;
}): AudioSignalDiagnosisSummary {
  const statistics = {
    dcOffset,
    peakDbfs,
    rmsDbfs,
    rmsPeakDbfs: rmsDbfs,
    rmsTroughDbfs: rmsDbfs,
    crestFactor: 4,
    flatFactor: 0,
    peakCount: 1,
    noiseFloorDbfs,
    dynamicRangeDb: 12,
    zeroCrossingRate: 0.1,
    nanCount: 0,
    infCount: 0,
    denormalCount: 0,
  };
  return {
    diagnosisId: `diagnosis-${Math.abs(dcOffset)}`,
    analyzedAt: "2026-08-04T12:00:00.000Z",
    durationSeconds: 4,
    sampleRateHz: 48_000,
    channelCount: 1,
    overall: { channel: null, ...statistics },
    channels: [{ channel: 0, ...statistics }],
    nearSilenceSpans: [],
    observations: Array.from({ length: observationCount }, (_, index) => ({
      kind: "dc-offset" as const,
      severity: "attention" as const,
      startSeconds: index,
      endSeconds: index,
      detail: "Measured DC offset requires listening after treatment.",
      requiresListening: true as const,
      evidence: { dcOffset },
    })),
    thresholds: { nearFullScaleDbfs: -0.05, nearSilenceDbfs: -55, nearSilenceMinimumSeconds: 0.25, dcOffsetAmplitude: 0.01, channelImbalanceDb: 6 },
    analyzer: { name: "ffmpeg-astats-silencedetect", version: "test", completeDecode: true, statisticsAreNotListeningJudgments: true, nearSilenceIsNotAutomaticallyADropout: true, noiseFloorIsAnEstimate: true },
  };
}

describe("AudioTreatmentAudition", () => {
  it("compares complete-decode evidence without claiming an audible improvement", () => {
    const sourceDiagnosis = diagnosis({ rmsDbfs: -20, peakDbfs: -1, noiseFloorDbfs: -45, dcOffset: 0.02, observationCount: 1 });
    const treatedDiagnosis = diagnosis({ rmsDbfs: -20.5, peakDbfs: -2, noiseFloorDbfs: -44.5, dcOffset: 0.001, observationCount: 0 });
    expect(audioTreatmentSignalComparison(sourceDiagnosis, treatedDiagnosis)).toEqual({
      rmsDeltaDb: -0.5,
      samplePeakDeltaDb: -1,
      estimatedFloorDeltaDb: 0.5,
      sourceObservationCount: 1,
      treatedObservationCount: 0,
    });

    render(<AudioTreatmentAudition
      sourceUrl="/source.wav"
      treatedUrl="/treated.wav"
      source={measurement(-24, [-30, -26, -22, -18])}
      treated={measurement(-24.2, [-30.4, -26.1, -22.2, -18.1])}
      sourceDiagnosis={sourceDiagnosis}
      treatedDiagnosis={treatedDiagnosis}
      verification={{ maximumAbsoluteDcBefore: 0.02, maximumAbsoluteDcAfter: 0.001, relativeReduction: 0.95, durationDeltaSeconds: 0, passes: true }}
    />);

    fireEvent.click(screen.getByRole("button", { name: "Open full treatment desk" }));
    expect(screen.getByText("Before/after complete-decode evidence")).toBeInTheDocument();
    expect(screen.getByText(/do not prove that bass, phase, tone, or speech quality improved/i)).toBeInTheDocument();
    expect(screen.getByText("Treatment loudness-change map")).toBeInTheDocument();
    expect(screen.getByText(/cannot measure phase or frequency response/i)).toBeInTheDocument();
    expect(screen.getByText("1 → 0")).toBeInTheDocument();
    expect(screen.getByText("-20.00 → -20.50")).toBeInTheDocument();
    expect(screen.getByText("Treatment signal flag")).toBeInTheDocument();
    expect(document.body.querySelector('audio[data-treatment-version="source"]')).toHaveAttribute("data-monitor-gain");
    expect(document.body.querySelector('audio[data-treatment-version="treated"]')).toHaveAttribute("data-monitor-gain");

    fireEvent.click(screen.getByRole("button", { name: "15 sec" }));
    expect(screen.getByRole("button", { name: "15 sec" })).toHaveAttribute("aria-pressed", "true");

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Source-to-treatment evidence desk" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open full treatment desk" })).toHaveFocus();
  });
});
