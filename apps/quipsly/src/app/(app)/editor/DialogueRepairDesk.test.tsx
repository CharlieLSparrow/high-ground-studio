import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { DialogueRepairDesk, type DialogueRepairStatus } from "./DialogueRepairDesk";

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
});
