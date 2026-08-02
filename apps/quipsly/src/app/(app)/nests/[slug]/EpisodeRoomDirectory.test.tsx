import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { EpisodeRoomDirectory } from "./EpisodeRoomDirectory";

const originalFetch = globalThis.fetch;

describe("Episode Room directory", () => {
  afterEach(() => {
    jest.restoreAllMocks();
    if (originalFetch) globalThis.fetch = originalFetch;
    else Reflect.deleteProperty(globalThis, "fetch");
  });

  it("shows every canonical room instead of hiding all but the latest", () => {
    render(<EpisodeRoomDirectory
      projectSlug="high-ground-odyssey"
      episodes={[
        { id: "episode-4", slug: "episode-4-part-2", title: "Episode 4 Part 2", status: "draft", documentTitle: "Episode 4 manuscript", updatedAt: "2026-08-02T12:00:00.000Z", milestoneCount: 2, completedMilestoneCount: 2, sourceDocumentTitle: null, sourceBlockCount: null },
        { id: "episode-8", slug: "episode-8-i-wasnt-born-a-leader", title: "Episode 8: I wasn't born a leader", status: "draft", documentTitle: "Episode 8 working manuscript", updatedAt: "2026-08-02T12:00:00.000Z", milestoneCount: 1, completedMilestoneCount: 0, sourceDocumentTitle: "Podcast Ep 8: May 13 - I wasn't born a leader", sourceBlockCount: 114 },
      ]}
      sourceCandidates={[]}
      canManage={false}
      collaboratorCount={2}
    />);

    expect(screen.getByRole("link", { name: /Episode 4 Part 2/ })).toHaveAttribute("href", "/nests/high-ground-odyssey/episodes/episode-4-part-2");
    const episodeEight = screen.getByRole("link", { name: /Episode 8: I wasn't born a leader/ });
    expect(episodeEight).toHaveAttribute("href", "/nests/high-ground-odyssey/episodes/episode-8-i-wasnt-born-a-leader");
    expect(episodeEight).toHaveTextContent("114 source blocks");
  });

  it("makes the audience-expanding snapshot boundary explicit before POST", async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ ok: false, error: "Deliberate test stop." }),
    } as Response);
    globalThis.fetch = fetchMock;

    render(<EpisodeRoomDirectory
      projectSlug="high-ground-odyssey"
      episodes={[]}
      sourceCandidates={[{
        id: "episode-8-source",
        projectSlug: "high-ground-odyssey-manuscript",
        title: "Podcast Ep 8: May 13 - I wasn't born a leader",
        suggestedTitle: "Episode 8: I wasn't born a leader",
        suggestedSlug: "episode-8-i-wasnt-born-a-leader",
        episodeNumber: 8,
        blockCount: 114,
        updatedAt: "2026-07-29T03:31:22.000Z",
        existingEpisodeSlug: null,
      }]}
      canManage
      collaboratorCount={2}
    />);

    fireEvent.click(screen.getByRole("button", { name: "Start Episode Room" }));
    expect(screen.getByText(/Everyone with active access to this Nest can read the working copy/)).toBeInTheDocument();
    expect(screen.getByText(/access panel currently lists 2 active grants/)).toBeInTheDocument();
    expect(screen.getByDisplayValue("Episode 8: I wasn't born a leader")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Create private working room" }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Deliberate test stop."));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/nests/high-ground-odyssey/episode-rooms",
      expect.objectContaining({ method: "POST" }),
    );
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual(expect.objectContaining({
      sourceProjectSlug: "high-ground-odyssey-manuscript",
      sourceDocumentId: "episode-8-source",
      title: "Episode 8: I wasn't born a leader",
      episodeSlug: "episode-8-i-wasnt-born-a-leader",
    }));
  });
});
