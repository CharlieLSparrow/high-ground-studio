import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { DialogueRepairDesk, type DialogueRepairStatus } from "./DialogueRepairDesk";

const audibleEventAnalysis = {
  schemaVersion: 1 as const,
  analysisId: "audible_analysis_test_receipt_001",
  supersedesAnalysisId: null,
  status: "completed" as const,
  algorithm: "apple-sound-classifier-file-v1" as const,
  classifierIdentifier: "SNClassifierIdentifierVersion1" as const,
  analyzedAt: "2026-08-05T18:00:00Z",
  sourceSHA256: "b".repeat(64),
  sourceByteCount: 42_000,
  durationSeconds: 10,
  requestedWindowDurationSeconds: 1.5,
  effectiveWindowDurationSeconds: 1.5,
  overlapFactor: 0.5,
  minimumCandidateConfidence: 0.35,
  knownClassificationCount: 300,
  knownClassificationsSHA256: "a".repeat(64),
  resultWindowCount: 12,
  suggestions: [{ eventId: "audible_cough_test_001", classificationIdentifier: "cough", displayLabel: "Cough", family: "dialogue" as const, startSeconds: 8, endSeconds: 8.75, confidence: 0.82, contributingWindowCount: 2, detail: "Listen to the protected source context." }],
  failureCode: null,
  failureDetail: null,
  boundaries: { classifierOutputIsListeningTriageOnly: true as const, classifierScoreIsNotAudibility: true as const, noMediaChanged: true as const, noRepairOrEditAuthorized: true as const, humanReviewRequired: true as const },
};

const measurement = {
  measuredAt: "2026-08-05T20:00:00.000Z",
  durationSeconds: 10,
  integratedLufs: -20,
  truePeakDbtp: -3,
  loudnessRangeLu: 4,
  thresholdLufs: -30,
  seriesResolutionMs: 1_000,
  series: [{ timeMs: 0, momentaryLufs: -20, shortTermLufs: -20, integratedLufs: -20, truePeakDbtp: -3 }],
};

const status: DialogueRepairStatus = {
  available: true,
  sourceDurationSeconds: 10,
  candidates: [{
    candidate: {
      kind: "quipsly-dialogue-repair-candidate-v1",
      candidateId: "dialogue_candidate_001",
      label: "mouth-click",
      createdAt: "2026-08-05T20:01:00.000Z",
      createdByEmail: "editor@example.test",
      range: { startSeconds: 4, endSeconds: 4.03, auditionPreRollSeconds: 1.5, auditionPostRollSeconds: 1.5, sourceDurationSeconds: 10 },
      origin: { kind: "human-marked" },
      context: { speakerLabel: "Homer", transcriptWordAnchors: [{ wordId: "word_001", startSeconds: 3.8, endSeconds: 4.4, text: "testing", speakerLabel: "Homer" }] },
    },
    latestReview: null,
    reviewCounts: { confirmed: 0, falsePositive: 0, needsComparison: 0 },
    experiment: null,
  }],
  boundaries: { originalRemainsSourceTruth: true, candidateStateComesFromAppendOnlyReceipts: true, detectorSuggestionsRequireHumanListening: true, confirmedCandidateAuthorizesExperimentOnly: true },
};

function response(payload: unknown, code = 200) {
  return Promise.resolve({ ok: code >= 200 && code < 300, status: code, json: async () => payload } as Response);
}

describe("DialogueRepairDesk", () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    global.fetch = jest.fn((_input, init) => init?.method === "POST" ? response({ ok: true }) : response({ ok: true, ...status }));
  });

  it("links source-clock, speaker, transcript, and append-only review evidence", async () => {
    render(<DialogueRepairDesk projectSlug="high-ground-odyssey" assetId="asset_001" sourceId="source_001" sourceUrl="/api/ingest/media/source_001" sourceMeasurement={measurement} />);
    expect(await screen.findByText("Homer")).toBeInTheDocument();
    expect(screen.getByText("testing")).toBeInTheDocument();
    const confirm = screen.getByRole("button", { name: "Confirm audible event" });
    expect(confirm).toBeDisabled();

    const audio = document.querySelector("audio") as HTMLAudioElement;
    Object.defineProperty(audio, "paused", { configurable: true, get: () => false });
    for (const second of [2.6, 3.1, 4.1, 5.1]) {
      audio.currentTime = second;
      fireEvent.timeUpdate(audio);
    }
    await waitFor(() => expect(confirm).toBeEnabled());
    fireEvent.click(confirm);
    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith("/api/media-vault/dialogue-repair", expect.objectContaining({ method: "POST" })));
    const postCall = jest.mocked(global.fetch).mock.calls.find(([, init]) => init?.method === "POST");
    expect(JSON.parse(String(postCall?.[1]?.body))).toMatchObject({ action: "review-candidate", candidateId: "dialogue_candidate_001", decision: "confirmed", playbackEvidence: { protectedPlaybackSourceId: "source_001", listenedSecondBins: [2, 3, 4, 5] } });
  });

  it("marks a precise editable range from the current source playhead", async () => {
    render(<DialogueRepairDesk projectSlug="high-ground-odyssey" assetId="asset_001" sourceId="source_001" sourceUrl="/api/ingest/media/source_001" sourceMeasurement={measurement} />);
    await screen.findByText("Dialogue Repair");
    const audio = document.querySelector("audio") as HTMLAudioElement;
    audio.currentTime = 6.25;
    fireEvent.timeUpdate(audio);
    fireEvent.click(screen.getByRole("button", { name: /Mark at/ }));
    expect(screen.getByLabelText("Dialogue event start")).toHaveValue(6.235);
    expect(screen.getByLabelText("Dialogue event end")).toHaveValue(6.265);
  });

  it("auditions a mapped event inside bounded protected context instead of playing the rest of the source", async () => {
    render(<DialogueRepairDesk projectSlug="high-ground-odyssey" assetId="asset_001" sourceId="source_001" sourceUrl="/api/ingest/media/source_001" sourceMeasurement={measurement} audibleEventAnalysis={audibleEventAnalysis} />);
    const mapped = await screen.findByRole("button", { name: /00:08 dialogue cough unreviewed/i });
    const audio = document.querySelector("audio") as HTMLAudioElement;
    const play = jest.fn().mockResolvedValue(undefined);
    const pause = jest.fn();
    Object.defineProperty(audio, "play", { configurable: true, value: play });
    Object.defineProperty(audio, "pause", { configurable: true, value: pause });

    fireEvent.click(mapped);
    expect(audio.currentTime).toBe(7);
    expect(play).toHaveBeenCalledTimes(1);
    audio.currentTime = 9.8;
    fireEvent.timeUpdate(audio);
    expect(pause).toHaveBeenCalledTimes(1);
  });
});
