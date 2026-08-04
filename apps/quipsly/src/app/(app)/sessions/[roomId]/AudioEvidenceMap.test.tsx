import { fireEvent, render, screen } from "@testing-library/react";

import type { AudioTranscriptEvidence } from "@/lib/transcript-evidence";

import {
  AudioEvidenceMap,
  audioEvidenceMapSummary,
  audioEvidencePointAt,
  audioEvidenceViewSpan,
} from "./AudioEvidenceMap";

const signal: NonNullable<AudioTranscriptEvidence["audio"]["signal"]> = {
  schemaVersion: 1,
  algorithm: "quipsly-audio-signal-window-v1",
  status: "attention",
  sampleRateHz: 48_000,
  channelCount: 1,
  analyzedFrameCount: 5_760_000,
  durationSeconds: 120,
  windowDurationSeconds: 30,
  rmsDbfs: -24,
  samplePeakDbfs: -0.2,
  clippedFrameCount: 4,
  clippedFrameFraction: 0.00001,
  nearSilentFrameFraction: 0.25,
  leftRmsDbfs: -24,
  rightRmsDbfs: null,
  stereoBalanceDb: null,
  rmsIsNotLufs: true,
  thresholds: {
    clippingAmplitude: 0.999,
    nearSilenceDbfs: -72,
    possibleDropoutMinimumSeconds: 0.25,
    surroundingSignalDbfs: -45,
    stereoImbalanceDb: 12,
  },
  waveform: [
    { startSeconds: 0, durationSeconds: 30, rmsDbfs: -20, samplePeakDbfs: -1, clippedFrameCount: 0 },
    { startSeconds: 30, durationSeconds: 30, rmsDbfs: -80, samplePeakDbfs: -75, clippedFrameCount: 0 },
    { startSeconds: 60, durationSeconds: 30, rmsDbfs: -18, samplePeakDbfs: -0.2, clippedFrameCount: 4 },
    { startSeconds: 90, durationSeconds: 30, rmsDbfs: -26, samplePeakDbfs: -4, clippedFrameCount: 0 },
  ],
  observations: [{
    kind: "possible-dropout",
    severity: "attention",
    startSeconds: 30,
    endSeconds: 60,
    detail: "Listen before classifying this near-silent interval.",
    requiresListening: true,
  }],
};

describe("AudioEvidenceMap", () => {
  it("keeps zoom windows bounded around the selected source time", () => {
    expect(audioEvidenceViewSpan(120, 8, "minute")).toEqual({ startSeconds: 0, endSeconds: 60, durationSeconds: 60 });
    expect(audioEvidenceViewSpan(120, 113, "detail")).toEqual({ startSeconds: 105, endSeconds: 120, durationSeconds: 15 });
    expect(audioEvidenceViewSpan(12, 6, "minute")).toEqual({ startSeconds: 0, endSeconds: 12, durationSeconds: 12 });
  });

  it("reports selected window evidence without calling it sample-level waveform data", () => {
    expect(audioEvidencePointAt(signal, 42)).toEqual(expect.objectContaining({ startSeconds: 30, rmsDbfs: -80 }));
    expect(audioEvidenceMapSummary(signal)).toEqual({ nearSilentWindowCount: 1, clippingWindowCount: 1, observationCount: 1 });

    const onSelect = jest.fn();
    render(<AudioEvidenceMap
      signal={signal}
      timelineEvents={[{ kind: "interruption", startSeconds: 75, detail: "Route lost", routeName: "MV7i", routePortType: "USB" }]}
      transcriptEndSeconds={100}
      playbackReady
      selectedSeconds={42}
      onSelect={onSelect}
    />);

    expect(screen.getByText(/not a sample-level waveform/i)).toBeInTheDocument();
    expect(screen.getByText("-80.0")).toBeInTheDocument();
    expect(screen.getByText(/1 flags/i)).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /windowed decoded audio energy/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /select a position to play/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "15 sec" }));
    expect(screen.getByRole("button", { name: "15 sec" })).toHaveAttribute("aria-pressed", "true");
  });
});
