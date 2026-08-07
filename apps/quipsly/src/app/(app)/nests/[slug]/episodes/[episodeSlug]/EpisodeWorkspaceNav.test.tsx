import { render, screen } from "@testing-library/react";

import { EpisodeWorkspaceNav } from "./EpisodeWorkspaceNav";

describe("EpisodeWorkspaceNav", () => {
  it("keeps the production journey under one exact Episode identity", () => {
    render(<EpisodeWorkspaceNav
      projectSlug="high-ground/odyssey"
      episodeSlug="episode 9"
      activeMode="record"
      recordingRoomId="room/9"
    />);

    expect(screen.getByRole("link", { name: "Plan & collaborate" })).toHaveAttribute(
      "href",
      "/nests/high-ground%2Fodyssey/episodes/episode%209",
    );
    expect(screen.getByRole("link", { name: "Record" })).toHaveAttribute(
      "href",
      "/nests/high-ground%2Fodyssey/episodes/episode%209?mode=record#record",
    );
    expect(screen.getByRole("link", { name: "Record" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Edit" })).toHaveAttribute(
      "href",
      "/nests/high-ground%2Fodyssey/episodes/episode%209?mode=edit",
    );
    expect(screen.getByRole("link", { name: "Audio" })).toHaveAttribute(
      "href",
      "/audio?project=high-ground%2Fodyssey&episode=episode%209",
    );
    expect(screen.getByRole("link", { name: "Review & finish" })).toHaveAttribute(
      "href",
      "/sessions/room%2F9?mode=outputs",
    );
  });
});
