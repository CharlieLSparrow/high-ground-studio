import { fireEvent, render, screen } from "@testing-library/react";

import type { AudioTranscriptEvidence } from "@/lib/transcript-evidence";

import {
  AudioEvidenceMap,
  audioEvidenceAdjacentMoment,
  audioEvidenceAttentionMoments,
  audioEvidenceMapSummary,
  audioEvidencePointAt,
  audioEvidenceTranscriptSummary,
  audioEvidenceViewSpan,
  audioEvidenceWordAt,
  type AudioEvidenceTranscriptWord,
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

const transcriptWords: AudioEvidenceTranscriptWord[] = [
  { id: "word-1", segmentId: "segment-1", text: "quiet", startSeconds: 40, endSeconds: 43, confidence: 0.42, reviewState: "unchecked" },
  { id: "word-2", segmentId: "segment-2", text: "checked", startSeconds: 70, endSeconds: 73, confidence: 0.96, reviewState: "confirmed" },
  { id: "word-3", segmentId: "segment-3", text: "corrected", startSeconds: 90, endSeconds: 94, confidence: 0.88, reviewState: "corrected" },
];

describe("AudioEvidenceMap", () => {
  it("keeps zoom windows bounded around the selected source time", () => {
    expect(audioEvidenceViewSpan(120, 8, "minute")).toEqual({ startSeconds: 0, endSeconds: 60, durationSeconds: 60 });
    expect(audioEvidenceViewSpan(120, 113, "detail")).toEqual({ startSeconds: 105, endSeconds: 120, durationSeconds: 15 });
    expect(audioEvidenceViewSpan(12, 6, "minute")).toEqual({ startSeconds: 0, endSeconds: 12, durationSeconds: 12 });
  });

  it("reports selected window evidence without calling it sample-level waveform data", () => {
    expect(audioEvidencePointAt(signal, 42)).toEqual(expect.objectContaining({ startSeconds: 30, rmsDbfs: -80 }));
    expect(audioEvidenceMapSummary(signal)).toEqual({
      nearSilentWindowCount: 1,
      nearSilentDurationSeconds: 30,
      clippingWindowCount: 1,
      clippingDurationSeconds: 30,
      observationCount: 1,
    });
    expect(audioEvidenceWordAt(transcriptWords, 42)).toEqual(expect.objectContaining({ id: "word-1", text: "quiet" }));
    expect(audioEvidenceWordAt(transcriptWords, 50)).toBeNull();
    expect(audioEvidenceTranscriptSummary(transcriptWords, 0.65)).toEqual({ timedWordCount: 3, reviewedWordCount: 2, correctedWordCount: 1, attentionWordCount: 1 });

    const onSelect = jest.fn();
    render(<AudioEvidenceMap
      signal={signal}
      timelineEvents={[{ kind: "interruption", startSeconds: 75, detail: "Route lost", routeName: "MV7i", routePortType: "USB" }]}
      transcriptEndSeconds={100}
      playbackReady
      selectedSeconds={42}
      transcriptWords={transcriptWords}
      lowConfidenceThreshold={0.65}
      providerLabel="Deepgram"
      onSelect={onSelect}
    />);

    expect(screen.getByText(/not a sample-level waveform/i)).toBeInTheDocument();
    expect(screen.getByText("-80.0")).toBeInTheDocument();
    expect(screen.getByText(/1 windows · 1 flags/i)).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /windowed decoded audio energy/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /select a position to play/i })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Selected transcript word evidence" })).toHaveTextContent("quiet");
    expect(screen.getByText(/Deepgram confidence 42%/i)).toBeInTheDocument();
    expect(screen.getByText(/only reviewed reference text measures error/i)).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Audio evidence review navigator" })).toHaveTextContent("3 source-clock review points");

    const moments = audioEvidenceAttentionMoments(signal, [{ kind: "interruption", startSeconds: 75, detail: "Route lost", routeName: "MV7i", routePortType: "USB" }], transcriptWords, 0.65);
    expect(moments.map((moment) => [moment.category, moment.startSeconds])).toEqual([
      ["signal", 30],
      ["transcript", 40],
      ["capture", 75],
    ]);
    expect(audioEvidenceAdjacentMoment(moments, 42, "next")).toEqual(expect.objectContaining({ category: "capture", startSeconds: 75 }));
    expect(audioEvidenceAdjacentMoment(moments, 42, "previous")).toEqual(expect.objectContaining({ category: "transcript", startSeconds: 40 }));

    fireEvent.click(screen.getByRole("button", { name: /Next evidence/i }));
    expect(onSelect).toHaveBeenLastCalledWith(75, true);
    expect(screen.getByRole("button", { name: "15 sec" })).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(screen.getByRole("button", { name: "15 sec" }));
    expect(screen.getByRole("button", { name: "15 sec" })).toHaveAttribute("aria-pressed", "true");
  });
});
