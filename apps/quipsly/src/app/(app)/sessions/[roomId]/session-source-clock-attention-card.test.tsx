import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { SessionSourceClockAttentionCard } from "./session-source-clock-attention-card";
import { buildSessionSourceClockAttention, type SessionSourceClockSource } from "./session-source-clock-attention";

const mockRefresh = jest.fn();
jest.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mockRefresh }) }));

const source: SessionSourceClockSource = {
  roomId: "room-1",
  recordingAssetId: "recording-1",
  projectSlug: "high-ground-odyssey",
  episodeSlug: "episode-9",
  mediaAssetId: "asset-1",
  sourceId: "source-1",
  sourceUrl: "/api/ingest/media/source-1",
  sourceKind: "audio",
  durationSeconds: 120,
  label: "Charlie source",
};

beforeAll(() => {
  jest.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
  jest.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => undefined);
});

beforeEach(() => {
  mockRefresh.mockClear();
});

afterAll(() => { jest.restoreAllMocks(); });

describe("SessionSourceClockAttentionCard", () => {
  it("shows the authority boundary and direct source-return controls", () => {
    const attention = buildSessionSourceClockAttention({
      transcript: [{ id: "segment-1", segmentId: "segment-1", source, startSeconds: 8, endSeconds: 10, text: "Provider attempt", speakerLabel: "Charlie", providerConfidence: 0.6, reviewState: "unreviewed" }],
      audibleEvents: [], dialogueRepairs: [], mastery: [], edits: [],
    });
    render(<SessionSourceClockAttentionCard attention={attention} />);
    expect(screen.getByRole("heading", { name: "Listen where the evidence points" })).toBeInTheDocument();
    expect(screen.getByText("60% provider confidence · not measured accuracy")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Open Audio Studio/i })).toHaveAttribute("href", expect.stringContaining("at=8.000"));
    expect(screen.getByRole("link", { name: /Open transcript segment/i })).toHaveAttribute("href", "/sessions/room-1?mode=transcript#transcript-segment-segment-1");
    expect(screen.getByLabelText(/Protected source for/i)).toHaveAttribute("src", "/api/ingest/media/source-1");
  });

  it("does not claim an empty queue certifies a full proof-listen", () => {
    const attention = buildSessionSourceClockAttention({ transcript: [], audibleEvents: [], dialogueRepairs: [], mastery: [], edits: [] });
    render(<SessionSourceClockAttentionCard attention={attention} />);
    expect(screen.getByText("No unresolved exact-clock item is projected.")).toBeInTheDocument();
    expect(screen.getByText(/does not certify that the complete source was proof-listened/i)).toBeInTheDocument();
  });

  it("shows one attention budget while preserving every clustered authority and deep link", () => {
    const attention = buildSessionSourceClockAttention({
      transcript: [{ id: "segment-1", segmentId: "segment-1", source, startSeconds: 8, endSeconds: 10, text: "Provider attempt", speakerLabel: "Charlie", providerConfidence: 0.6, reviewState: "unreviewed" }],
      audibleEvents: [{ id: "event-1", analysisId: "analysis-1", eventId: "event-1", source, startSeconds: 9.5, endSeconds: 9.7, displayLabel: "Mouth click", family: "dialogue", detectorConfidence: 0.8, reviewState: "unreviewed", detail: "Detector suggestion." }],
      dialogueRepairs: [], mastery: [], edits: [],
    });
    render(<SessionSourceClockAttentionCard attention={attention} />);

    expect(screen.getAllByText("2 signals share one listening moment")).toHaveLength(2);
    expect(screen.getByText("1 listening moment")).toBeInTheDocument();
    expect(screen.getByText(/Grouped listening avoids about/i)).toBeInTheDocument();
    expect(screen.getByText("Transcript attempt · 0:08–0:10")).toBeInTheDocument();
    expect(screen.getByText("Audible-event detector · 0:09.5–0:09.7")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Open transcript segment/i })).toHaveAttribute("href", "/sessions/room-1?mode=transcript#transcript-segment-segment-1");
    expect(screen.getAllByRole("link", { name: /Open Audio Studio/i })).toHaveLength(2);
  });

  it("records an exact-source detector conclusion only after complete bounded playback", async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: true }) });
    const originalFetch = global.fetch;
    global.fetch = fetchMock as typeof fetch;
    try {
      const attention = buildSessionSourceClockAttention({
        transcript: [],
        audibleEvents: [{ id: "event-1", analysisId: "analysis-1", eventId: "event-1", source, startSeconds: 9.5, endSeconds: 9.7, displayLabel: "Mouth click", family: "dialogue", detectorConfidence: 0.8, reviewState: "unreviewed", detail: "Detector suggestion." }],
        dialogueRepairs: [], mastery: [], edits: [],
      });
      render(<SessionSourceClockAttentionCard attention={attention} />);

      const save = screen.getByRole("button", { name: "Save listening conclusion" });
      expect(save).toBeDisabled();
      const audio = screen.getByLabelText(/Protected source for/i) as HTMLAudioElement;
      Object.defineProperty(audio, "paused", { configurable: true, value: false });
      Object.defineProperty(audio, "seeking", { configurable: true, value: false });
      audio.currentTime = 8.5;
      fireEvent.play(audio);
      for (const time of [9.1, 10.1, 10.7]) {
        audio.currentTime = time;
        fireEvent.timeUpdate(audio);
      }
      expect(screen.getByText("Complete context observed")).toBeInTheDocument();
      expect(save).toBeEnabled();
      fireEvent.click(save);

      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
      const request = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(request[0]).toBe("/api/media-vault/audible-event-reviews");
      expect(JSON.parse(String(request[1].body))).toMatchObject({
        projectSlug: "high-ground-odyssey",
        assetId: "asset-1",
        sourceId: "source-1",
        analysisId: "analysis-1",
        eventId: "event-1",
        decision: "confirmed",
        playbackEvidence: {
          contextStartSeconds: 8.5,
          contextEndSeconds: 10.7,
          listenedSecondBins: [8, 9, 10],
          clientTrackedPlaybackIsNotProofOfAudibility: true,
        },
      });
      await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(/saved as append-only evidence/i));
      expect(mockRefresh).toHaveBeenCalledTimes(1);
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("discloses when a long exact range extends beyond the bounded preview", () => {
    const attention = buildSessionSourceClockAttention({
      transcript: [{ id: "long-segment", segmentId: "long-segment", source, startSeconds: 40, endSeconds: 85, text: "Long uncertain passage", speakerLabel: "Charlie", providerConfidence: 0.6, reviewState: "unreviewed" }],
      audibleEvents: [], dialogueRepairs: [], mastery: [], edits: [],
    });
    render(<SessionSourceClockAttentionCard attention={attention} />);

    expect(screen.getByText(/extends beyond this bounded preview/i)).toBeInTheDocument();
    expect(screen.getByText("Transcript attempt · 0:40–1:25")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Open transcript segment/i })).toBeInTheDocument();
  });
});
