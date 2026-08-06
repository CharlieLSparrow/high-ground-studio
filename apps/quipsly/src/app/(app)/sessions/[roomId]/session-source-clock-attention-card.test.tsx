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
});
