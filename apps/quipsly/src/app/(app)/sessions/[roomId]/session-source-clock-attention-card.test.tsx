import { render, screen } from "@testing-library/react";

import { SessionSourceClockAttentionCard } from "./session-source-clock-attention-card";
import { buildSessionSourceClockAttention, type SessionSourceClockSource } from "./session-source-clock-attention";

const source: SessionSourceClockSource = {
  roomId: "room-1",
  recordingAssetId: "recording-1",
  projectSlug: "high-ground-odyssey",
  episodeSlug: "episode-9",
  mediaAssetId: "asset-1",
  sourceId: "source-1",
  sourceUrl: "/api/ingest/media/source-1",
  sourceKind: "audio",
  label: "Charlie source",
};

beforeAll(() => {
  jest.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
  jest.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => undefined);
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
    expect(screen.getByText(/Shared context avoids about/i)).toBeInTheDocument();
    expect(screen.getByText("Transcript attempt · 0:08–0:10")).toBeInTheDocument();
    expect(screen.getByText("Audible-event detector · 0:09.5–0:09.7")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Open transcript segment/i })).toHaveAttribute("href", "/sessions/room-1?mode=transcript#transcript-segment-segment-1");
    expect(screen.getAllByRole("link", { name: /Open Audio Studio/i })).toHaveLength(2);
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
