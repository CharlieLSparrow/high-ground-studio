import {render, screen} from "@testing-library/react";
import {CoachingSessionMediaLinks} from "./coaching-session-media-links";

describe("coaching session media navigation", () => {
  it("opens recordings and transcript in the exact session without a call detour", () => {
    render(<CoachingSessionMediaLinks roomId="room / one" recordingCount={2} hasTranscript />);
    expect(screen.getByRole("link", {name: "Recordings & edits"})).toHaveAttribute("href", "/sessions/room%20%2F%20one?mode=recordings");
    expect(screen.getByRole("link", {name: "Transcript"})).toHaveAttribute("href", "/sessions/room%20%2F%20one?mode=transcript");
  });
  it("does not invent media for an unrecorded appointment", () => {
    render(<CoachingSessionMediaLinks roomId="room" recordingCount={0} hasTranscript={false} />);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
  it("keeps recordings reachable before transcription is available", () => {
    render(<CoachingSessionMediaLinks roomId="room" recordingCount={1} hasTranscript={false} />);
    expect(screen.getByRole("link", {name: "Recordings & edits"})).toBeVisible();
    expect(screen.queryByRole("link", {name: "Transcript"})).not.toBeInTheDocument();
  });
});
