import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { StudioTranscriptReviewDesk } from "./StudioTranscriptReviewDesk";

const segment = {
  id: "segment-1",
  startSeconds: 4,
  endSeconds: 8,
  providerText: "Curious, not judgmental.",
  providerTextSha256: "a".repeat(64),
  providerSpeakerLabel: null,
  text: "Curious, not judgmental.",
  speakerLabel: null,
  confidence: null,
  acceptedCorrection: null,
  confirmedAsIs: null,
  words: [
    { id: "word-1", providerWordIndex: 0, startSeconds: 4, endSeconds: 4.5, punctuatedWord: "Curious,", confidence: 0.98 },
    { id: "word-2", providerWordIndex: 1, startSeconds: 4.6, endSeconds: 5.2, punctuatedWord: "not", confidence: 0.82 },
    { id: "word-3", providerWordIndex: 2, startSeconds: 5.3, endSeconds: 6, punctuatedWord: "judgmental.", confidence: 0.61 },
  ],
};

function payload() {
  return {
    ok: true,
    transcriptJobId: "transcript-1",
    provider: "openai-whisper-local",
    language: "en",
    playback: { sourceId: "source-1", url: "/api/ingest/media/source-1", kind: "audio", label: "Source clip", durationSeconds: 12 },
    source: { assetId: "asset-1", sourceId: "source-1", sha256: "b".repeat(64), generation: "local:test" },
    coverage: { segmentCount: 1, wordCount: 3, correctionReceiptCount: 0, activeCorrectionCount: 0, playbackVerificationCount: 0 },
    page: { count: 1, hasMore: false, nextAfterSegmentId: null },
    segments: [segment],
  };
}

describe("StudioTranscriptReviewDesk", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Object.defineProperty(globalThis, "fetch", { configurable: true, writable: true, value: jest.fn() });
  });

  it("shows provider word probability without presenting it as accuracy", async () => {
    jest.mocked(globalThis.fetch).mockResolvedValue({ ok: true, json: async () => payload() } as Response);
    render(<StudioTranscriptReviewDesk projectSlug="hgo" episodeSlug="episode-8" assetId="asset-1" sourceId="source-1" />);

    expect(screen.getByRole("heading", { name: /Listen, correct, or confirm/i })).toBeInTheDocument();
    expect(screen.getByText(/provider probability, not measured accuracy/i)).toBeInTheDocument();
    expect(await screen.findByText("Curious,")).toHaveAttribute("title", expect.stringContaining("98.0%"));
    expect(screen.getByRole("button", { name: /Save reviewed correction/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Confirm exactly as heard/i })).toBeDisabled();
  });

  it("records a correction only after the protected player reaches the selected source range", async () => {
    const play = jest.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
    const fetchMock = jest.mocked(globalThis.fetch).mockImplementation(async (_input, init) => {
      if (init?.method === "POST") {
        return {
          ok: true,
          json: async () => ({
            ok: true,
            correction: {
              id: "correction-1",
              status: "accepted",
              origin: "human",
              correctedText: "Be curious, not judgmental.",
              correctedSpeakerLabel: "Ted",
              reason: "Reviewed against source",
              reviewedAt: "2026-08-04T18:00:00.000Z",
              createdAt: "2026-08-04T18:00:00.000Z",
              revisions: [{ revision: 1, operation: "created-and-accepted-after-studio-playback", createdAt: "2026-08-04T18:00:00.000Z" }],
            },
          }),
        } as Response;
      }
      return { ok: true, json: async () => payload() } as Response;
    });
    const user = userEvent.setup();
    render(<StudioTranscriptReviewDesk projectSlug="hgo" episodeSlug="episode-8" assetId="asset-1" sourceId="source-1" />);

    await user.click(await screen.findByRole("button", { name: /Review transcript segment at 0:04\.0/i }));
    expect(play).toHaveBeenCalled();
    const audio = screen.getByLabelText("Protected transcript source: Source clip");
    Object.defineProperty(audio, "currentTime", { configurable: true, value: 4.4, writable: true });
    fireEvent.play(audio);
    fireEvent.timeUpdate(audio);

    const text = screen.getByRole("textbox", { name: "Reviewed transcript text" });
    await user.clear(text);
    await user.type(text, "Be curious, not judgmental.");
    await user.type(screen.getByRole("textbox", { name: "Reviewed speaker label" }), "Ted");
    await user.click(screen.getByRole("button", { name: /Save reviewed correction/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/media-vault/source-transcript/review", expect.objectContaining({ method: "POST" })));
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === "POST");
    expect(JSON.parse(String(post?.[1]?.body))).toEqual(expect.objectContaining({
      action: "correct",
      segmentId: "segment-1",
      confirmedAgainstPlayback: true,
      playbackPositionSeconds: 4.4,
      correctedSpeakerLabel: "Ted",
    }));
    expect(await screen.findByRole("status")).toHaveTextContent(/provider words and media are unchanged/i);
    play.mockRestore();
  });

  it("shares the decoded waveform, timed words, and protected player without treating a scrub as listening", async () => {
    const play = jest.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
    jest.mocked(globalThis.fetch).mockResolvedValue({ ok: true, json: async () => payload() } as Response);
    const audioSignal = {
      schemaVersion: 1 as const,
      algorithm: "quipsly-audio-signal-window-v1",
      status: "attention" as const,
      sampleRateHz: 48_000,
      channelCount: 1,
      analyzedFrameCount: 576_000,
      durationSeconds: 12,
      windowDurationSeconds: 6,
      rmsDbfs: -24,
      samplePeakDbfs: -1,
      clippedFrameCount: 0,
      clippedFrameFraction: 0,
      nearSilentFrameFraction: 0.1,
      leftRmsDbfs: -24,
      rightRmsDbfs: null,
      stereoBalanceDb: null,
      rmsIsNotLufs: true as const,
      thresholds: { clippingAmplitude: 0.999, nearSilenceDbfs: -72, possibleDropoutMinimumSeconds: 0.25, surroundingSignalDbfs: -45, stereoImbalanceDb: 12 },
      waveform: [
        { startSeconds: 0, durationSeconds: 6, rmsDbfs: -22, samplePeakDbfs: -2, clippedFrameCount: 0 },
        { startSeconds: 6, durationSeconds: 6, rmsDbfs: -26, samplePeakDbfs: -1, clippedFrameCount: 0 },
      ],
      observations: [{ kind: "possible-dropout" as const, severity: "attention" as const, startSeconds: 6, endSeconds: 7, detail: "Listen before classifying.", requiresListening: true as const }],
    };
    render(<StudioTranscriptReviewDesk projectSlug="hgo" episodeSlug="episode-8" assetId="asset-1" sourceId="source-1" audioSignal={audioSignal} />);

    expect(await screen.findByRole("region", { name: "Audio evidence map" })).toBeInTheDocument();
    await screen.findByRole("button", { name: /Review transcript segment at 0:04\.0/i });
    expect(screen.getByRole("img", { name: /windowed decoded audio energy/i })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /windowed decoded audio energy/i })).toHaveTextContent(/Loaded transcript evidence \(1\/1 segments\) · 0\/3 words/i);

    const map = screen.getByRole("button", { name: /Audio evidence map from/i });
    fireEvent.click(map, { clientX: 100 });
    expect(screen.getByRole("button", { name: /Confirm exactly as heard/i })).toBeDisabled();
    play.mockRestore();
  });
});
