import { fireEvent, render, screen } from "@testing-library/react";

import type { AudioTranscriptEvidence } from "@/lib/transcript-evidence";
import type { AudibleEventDetectorReceipt } from "@/lib/audio/audible-event-analysis";
import type { AudibleEventReviewStatus } from "@/lib/audio/audible-event-review";

import {
  AudibleEventMap,
  audibleEventMapMoments,
  audibleEventMapSummary,
  audibleEventViewSpan,
  type AudibleEventDialogueEntry,
} from "./AudibleEventMap";

const signal: NonNullable<AudioTranscriptEvidence["audio"]["signal"]> = {
  schemaVersion: 1,
  algorithm: "quipsly-audio-signal-window-v1",
  status: "attention",
  sampleRateHz: 48_000,
  channelCount: 1,
  analyzedFrameCount: 4_800_000,
  durationSeconds: 100,
  windowDurationSeconds: 25,
  rmsDbfs: -24,
  samplePeakDbfs: -0.2,
  clippedFrameCount: 3,
  clippedFrameFraction: 0.00001,
  nearSilentFrameFraction: 0.25,
  leftRmsDbfs: -24,
  rightRmsDbfs: null,
  stereoBalanceDb: null,
  rmsIsNotLufs: true,
  thresholds: { clippingAmplitude: 0.999, nearSilenceDbfs: -72, possibleDropoutMinimumSeconds: 0.25, surroundingSignalDbfs: -45, stereoImbalanceDb: 12 },
  waveform: [
    { startSeconds: 0, durationSeconds: 25, rmsDbfs: -20, samplePeakDbfs: -2, clippedFrameCount: 0 },
    { startSeconds: 25, durationSeconds: 25, rmsDbfs: -80, samplePeakDbfs: -76, clippedFrameCount: 0 },
    { startSeconds: 50, durationSeconds: 25, rmsDbfs: -18, samplePeakDbfs: -0.2, clippedFrameCount: 3 },
    { startSeconds: 75, durationSeconds: 25, rmsDbfs: -25, samplePeakDbfs: -3, clippedFrameCount: 0 },
  ],
  frequencyProfile: null,
  observations: [{ kind: "possible-dropout", severity: "attention", startSeconds: 25, endSeconds: 50, detail: "Listen before classifying this interval.", requiresListening: true }],
};

const dialogueEntries: AudibleEventDialogueEntry[] = [
  {
    candidate: { candidateId: "candidate_mouth_001", label: "mouth-click", range: { startSeconds: 61.2, endSeconds: 61.24 }, origin: { kind: "human-marked" }, context: { speakerLabel: "Homer" } },
    latestReview: { decision: "confirmed", note: "Audible between words." },
  },
  {
    candidate: { candidateId: "candidate_noise_001", label: "noise-event", range: { startSeconds: 82, endSeconds: 82.4 }, origin: { kind: "detector-suggestion", detectorId: "sound-analysis-v1", score: 0.78, qualificationStatus: "unqualified" }, context: { speakerLabel: null } },
    latestReview: { decision: "false-positive", note: "Chair movement, not a production defect." },
  },
];

const detectorReceipt: AudibleEventDetectorReceipt = {
  schemaVersion: 1,
  analysisId: "audible_analysis_test_receipt_001",
  supersedesAnalysisId: null,
  status: "completed",
  algorithm: "apple-sound-classifier-file-v1",
  classifierIdentifier: "SNClassifierIdentifierVersion1",
  analyzedAt: "2026-08-05T18:00:00Z",
  sourceSHA256: "b".repeat(64),
  sourceByteCount: 42_000,
  durationSeconds: 100,
  requestedWindowDurationSeconds: 1.5,
  effectiveWindowDurationSeconds: 1.5,
  overlapFactor: 0.5,
  minimumCandidateConfidence: 0.35,
  knownClassificationCount: 300,
  knownClassificationsSHA256: "a".repeat(64),
  resultWindowCount: 80,
  suggestions: [{ eventId: "audible_cough_test_001", classificationIdentifier: "cough", displayLabel: "Cough", family: "dialogue", startSeconds: 10, endSeconds: 11.5, confidence: 0.82, contributingWindowCount: 2, detail: "Listen to the protected source context." }],
  failureCode: null,
  failureDetail: null,
  boundaries: { classifierOutputIsListeningTriageOnly: true, classifierScoreIsNotAudibility: true, noMediaChanged: true, noRepairOrEditAuthorized: true, humanReviewRequired: true },
};

const detectorReviewStatus: AudibleEventReviewStatus = {
  available: true,
  analysis: detectorReceipt,
  entries: [{ suggestion: detectorReceipt.suggestions[0], latestReview: { id: "review_001", analysisId: detectorReceipt.analysisId, eventId: detectorReceipt.suggestions[0].eventId, decision: "confirmed", actorEmail: "editor@example.test", note: null, occurredAt: "2026-08-05T19:00:00Z" }, reviewCounts: { confirmed: 1, falsePositive: 0, needsComparison: 0 } }],
  summary: { suggestionCount: 1, reviewedSuggestionCount: 1, confirmedSuggestionCount: 1, falsePositiveSuggestionCount: 0, needsComparisonSuggestionCount: 0, pendingSuggestionCount: 0 },
  boundaries: { detectorOutputIsListeningTriageOnly: true, humanStateComesFromAppendOnlyReceipts: true, reviewDoesNotAuthorizeRepairOrEdit: true, sourceIdentityIsReverifiedServerSide: true, surfacedSuggestionsAloneCannotMeasureRecall: true },
};

describe("AudibleEventMap", () => {
  it("projects measured evidence and append-only dialogue review onto one source clock", () => {
    const moments = audibleEventMapMoments(signal, dialogueEntries, detectorReceipt);
    expect(moments.map((moment) => [moment.family, moment.startSeconds, moment.reviewState])).toEqual([
      ["dialogue", 10, "unreviewed"],
      ["signal", 25, "measured-needs-listening"],
      ["dialogue", 61.2, "confirmed"],
      ["dialogue", 82, "false-positive"],
    ]);
    expect(moments[0]).toEqual(expect.objectContaining({ confidence: 0.82, originLabel: expect.stringContaining("Unqualified on-device detector") }));
    expect(moments[2]).toEqual(expect.objectContaining({ originLabel: "Human source-clock mark", dialogueCandidateId: "candidate_mouth_001" }));
    expect(moments[3]).toEqual(expect.objectContaining({ confidence: 0.78, originLabel: "Unqualified detector suggestion · sound-analysis-v1" }));
    expect(audibleEventMapSummary(moments)).toEqual({ total: 4, needsReview: 2, confirmed: 1, dismissed: 1, detectorSuggestions: 2 });
  });

  it("projects append-only classifier reviews without turning them into repair candidates", () => {
    const moments = audibleEventMapMoments(signal, dialogueEntries, detectorReceipt, detectorReviewStatus);
    expect(moments[0]).toEqual(expect.objectContaining({ reviewState: "confirmed", detectorAnalysisId: detectorReceipt.analysisId, detectorEventId: detectorReceipt.suggestions[0].eventId, dialogueCandidateId: null }));
  });

  it("keeps zoom bounded and makes filtered event navigation operate the protected source playhead", () => {
    expect(audibleEventViewSpan(100, 96, "detail")).toEqual({ startSeconds: 85, endSeconds: 100, durationSeconds: 15 });
    const moments = audibleEventMapMoments(signal, dialogueEntries);
    const onSelect = jest.fn();
    render(<AudibleEventMap durationSeconds={100} signal={signal} moments={moments} selectedSeconds={26} onSelect={onSelect} />);

    expect(screen.getByRole("region", { name: "Audible event map" })).toHaveTextContent("What happened, where, and who has actually reviewed it");
    expect(screen.getByRole("img", { name: /decoded audio energy/i })).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText(/classifier score is never an audible judgment/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Next event →" }));
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ dialogueCandidateId: "candidate_mouth_001" }), 61.2, true);
    expect(screen.getByRole("button", { name: "15 sec" })).toHaveAttribute("aria-pressed", "true");

    fireEvent.change(screen.getByLabelText("Audible event review state"), { target: { value: "dismissed" } });
    expect(screen.getByRole("list", { name: "Audible event review queue" })).toHaveTextContent("Noise Event");
    expect(screen.getByRole("list", { name: "Audible event review queue" })).not.toHaveTextContent("Mouth Click");
  });

  it("keeps source-clock event marks available before decoded waveform evidence exists", () => {
    const moments = audibleEventMapMoments(null, dialogueEntries.slice(0, 1));
    render(<AudibleEventMap durationSeconds={100} signal={null} moments={moments} selectedSeconds={0} onSelect={jest.fn()} />);
    expect(screen.getByText(/decoded waveform evidence is not attached yet/i)).toBeInTheDocument();
    expect(screen.getByText(/source-clock event marks remain reviewable/i)).toBeInTheDocument();
  });
});
