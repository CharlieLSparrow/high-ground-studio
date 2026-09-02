import React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
  speakerAuthority: "unresolved" as const,
  confidence: null,
  acceptedCorrection: null,
  confirmedAsIs: null,
  words: [
    { id: "word-1", providerWordIndex: 0, startSeconds: 4, endSeconds: 4.5, punctuatedWord: "Curious,", confidence: 0.98 },
    { id: "word-2", providerWordIndex: 1, startSeconds: 4.6, endSeconds: 5.2, punctuatedWord: "not", confidence: 0.82 },
    { id: "word-3", providerWordIndex: 2, startSeconds: 5.3, endSeconds: 6, punctuatedWord: "judgmental.", confidence: 0.61 },
  ],
};

const audioSignalFixture = {
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
  loudness: null,
  thresholds: { clippingAmplitude: 0.999, nearSilenceDbfs: -72, possibleDropoutMinimumSeconds: 0.25, surroundingSignalDbfs: -45, stereoImbalanceDb: 12 },
  waveform: [
    { startSeconds: 0, durationSeconds: 6, rmsDbfs: -22, samplePeakDbfs: -2, clippedFrameCount: 0 },
    { startSeconds: 6, durationSeconds: 6, rmsDbfs: -26, samplePeakDbfs: -1, clippedFrameCount: 0 },
  ],
  frequencyProfile: null,
  observations: [{ kind: "possible-dropout" as const, severity: "attention" as const, startSeconds: 6, endSeconds: 7, detail: "Listen before classifying.", requiresListening: true as const }],
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

  it("keeps the deep desk out of the narrow media card and restores focus when it closes", async () => {
    jest.mocked(globalThis.fetch).mockResolvedValue({ ok: true, json: async () => payload() } as Response);
    const user = userEvent.setup();
    render(<StudioTranscriptReviewDesk projectId="project-1" projectSlug="hgo" episodeSlug="episode-8" assetId="asset-1" sourceId="source-1" />);

    const opener = screen.getByRole("button", { name: /Open transcript and audio desk/i });
    expect(screen.queryByRole("dialog", { name: /Transcript and audio evidence desk/i })).not.toBeInTheDocument();
    await user.click(opener);
    const dialog = screen.getByRole("dialog", { name: /Transcript and audio evidence desk/i });
    expect(dialog).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "Close" })).toHaveFocus());

    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(dialog).not.toBeInTheDocument());
    await waitFor(() => expect(opener).toHaveFocus());
  });

  it("shows provider word probability without presenting it as accuracy", async () => {
    jest.mocked(globalThis.fetch).mockResolvedValue({ ok: true, json: async () => payload() } as Response);
    render(<StudioTranscriptReviewDesk projectId="project-1" projectSlug="hgo" episodeSlug="episode-8" assetId="asset-1" sourceId="source-1" />);
    await userEvent.click(screen.getByRole("button", { name: /Open transcript and audio desk/i }));

    expect(await screen.findByRole("heading", { name: /Listen, correct, or confirm/i })).toBeInTheDocument();
    expect(screen.getByText(/provider probability, not measured accuracy/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Speaker needs review\. Quipsly has not identified this speaker yet\./i)).toBeInTheDocument();
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
    render(<StudioTranscriptReviewDesk projectId="project-1" projectSlug="hgo" episodeSlug="episode-8" assetId="asset-1" sourceId="source-1" />);
    await user.click(screen.getByRole("button", { name: /Open transcript and audio desk/i }));

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
      projectId: "project-1",
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
    render(<StudioTranscriptReviewDesk projectSlug="hgo" episodeSlug="episode-8" assetId="asset-1" sourceId="source-1" audioSignal={audioSignalFixture} />);
    fireEvent.click(screen.getByRole("button", { name: /Open transcript and audio desk/i }));

    expect(await screen.findByRole("region", { name: "Audio evidence map" })).toBeInTheDocument();
    await screen.findByRole("button", { name: /Review transcript segment at 0:04\.0/i });
    expect(screen.getByRole("img", { name: /windowed decoded audio energy/i })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /windowed decoded audio energy/i })).toHaveTextContent(/Loaded transcript evidence \(1\/1 segments\) · 0\/3 words/i);
    expect(screen.getByRole("img", { name: /windowed decoded audio energy/i })).toHaveTextContent(/no cross-provider confidence threshold/i);

    const map = screen.getByRole("button", { name: /Audio level evidence map from/i });
    fireEvent.click(map, { clientX: 100 });
    expect(screen.getByRole("button", { name: /Confirm exactly as heard/i })).toBeDisabled();
    play.mockRestore();
  });

  it("explains transcript, signal, mastering, treatment, and unapplied edit evidence on one spectral clock", async () => {
    const play = jest.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
    const context = {
      setTransform: jest.fn(), fillRect: jest.fn(), drawImage: jest.fn(), putImageData: jest.fn(),
      fillStyle: "",
    };
    jest.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => context as never);
    Object.defineProperty(globalThis, "ImageData", { configurable: true, writable: true, value: class { width: number; height: number; data: Uint8ClampedArray; constructor(width: number, height: number) { this.width = width; this.height = height; this.data = new Uint8ClampedArray(width * height * 4); } } });
    jest.mocked(globalThis.fetch).mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/audio-spectral-evidence/tile")) return { ok: true, status: 200, arrayBuffer: async () => new Uint8Array(512 * 192).buffer } as Response;
      if (url.includes("/audio-spectral-evidence?")) return { ok: true, status: 200, json: async () => ({
        ok: true,
        jobId: "audio-spectral-1",
        status: "completed",
        media: { sampleRate: 48_000, channelCount: 1, durationSeconds: 12, minimumFrequencyHz: 20, maximumFrequencyHz: 22_800 },
        pyramid: { tileWidth: 512, tileHeight: 192, frequencyScale: "logarithmic", frequencyOrientation: "high-to-low", dynamicRangeDb: 120, upperLimitDbfs: 0, levels: [{ id: "overview", tileSpanSeconds: 300, tileCount: 1 }, { id: "browse", tileSpanSeconds: 30, tileCount: 1 }, { id: "detail", tileSpanSeconds: 5, tileCount: 3 }] },
        error: null,
        updatedAt: "2026-08-04T20:00:00.000Z",
      }) } as Response;
      return { ok: true, json: async () => payload() } as Response;
    });

    render(<StudioTranscriptReviewDesk
      projectId="project-1"
      projectSlug="hgo"
      episodeSlug="episode-8"
      assetId="asset-1"
      sourceId="source-1"
      audioSignal={audioSignalFixture}
      processingEvidenceMarkers={[
        { id: "treatment-1", category: "treatment", startSeconds: 6, endSeconds: 7, label: "Unpromoted treatment output", detail: "Possible dropout no longer crosses the output threshold.", severity: "attention" },
        { id: "edit-1", category: "edit", startSeconds: 7, endSeconds: 8, label: "Unapplied edit proposal", detail: "Proposal only; source unchanged.", severity: "attention" },
      ]}
      loudnessEvidence={{ integratedLufs: -18.2, truePeakDbtp: -1.8, targetLufs: -16, points: [{ timeSeconds: 4, momentaryLufs: -17, shortTermLufs: -18, integratedLufs: -18.2, truePeakDbtp: -1.8 }] }}
    />);
    await userEvent.click(screen.getByRole("button", { name: /Open transcript and audio desk/i }));

    const spectral = await screen.findByRole("region", { name: "High-resolution spectral evidence" });
    const spectralCalls = jest.mocked(globalThis.fetch).mock.calls.filter(([input]) => String(input).includes("/audio-spectral-evidence"));
    expect(spectralCalls.length).toBeGreaterThan(0);
    for (const [input] of spectralCalls) {
      expect(new URL(String(input), "http://localhost").searchParams.get("projectId")).toBe("project-1");
    }
    expect(await screen.findByRole("region", { name: "Shared spectral evidence navigator" })).toHaveTextContent(/One clock · 4 review points/i);
    expect(screen.getByRole("region", { name: "Shared evidence at selected time" })).toHaveTextContent(/Mastering measurement: -18.2 integrated LUFS/i);
    expect(screen.getByRole("region", { name: "Shared evidence at selected time" })).toHaveTextContent(/Transcript “Curious,”/i);
    await userEvent.click(within(spectral).getByRole("button", { name: "Next evidence →" }));
    expect(play).not.toHaveBeenCalled();
    expect(screen.getByRole("region", { name: "Shared evidence at selected time" })).toHaveTextContent(/Possible dropout no longer crosses the output threshold/i);
    expect(screen.getByRole("region", { name: "Shared spectral evidence legend" })).toHaveTextContent(/Treatment/i);
    expect(screen.getByRole("region", { name: "Shared spectral evidence legend" })).toHaveTextContent(/Edit proposal/i);
    expect(spectral).toHaveTextContent(/No interpolation · no automatic decision/i);
    play.mockRestore();
  });
});
