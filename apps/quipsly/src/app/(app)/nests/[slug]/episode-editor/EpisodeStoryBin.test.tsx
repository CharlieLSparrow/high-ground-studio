import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { EpisodeStoryBin } from "./EpisodeStoryBin";

const workspace = {
  episodes: [{ id: "episode-9", timelineFingerprint: "fingerprint-9" }],
  timelinePlacements: [],
  boards: [{
    id: "board-360",
    title: "Homer's Insta360 story selects",
    sections: [{ id: "section-opening", key: "opening", title: "Opening", sortOrder: 0 }],
    placements: [{
      id: "board-placement-1",
      cardId: "card-curious",
      groupKey: "opening",
      sortOrder: 0,
      card: {
        id: "card-curious",
        title: "Be Curious",
        synopsis: "A retained 360° moment for the opening.",
        purpose: "evidence",
        revision: 4,
        sourceRange: {
          startSeconds: 58.35,
          endSeconds: 118.36,
          reframeRecipe: { aspectRatio: "16:9", keyframes: [{ sourceSeconds: 60 }] },
          sourceSet: { id: "source-set-360", displayName: "Insta360 day one", completeness: "complete" },
          sourceRevision: {
            mediaAsset: null,
            externalReference: {
              id: "drive-file-1",
              provider: "google-drive",
              fileName: "VID_360.insv",
              accessState: "available",
              capabilityState: "metadata-ready",
            },
            collaborationProxy: { id: "proxy-1" },
            sourceState: "verified",
            verifiedAt: "2026-08-08T17:00:00.000Z",
          },
        },
      },
    }],
  }],
};

function response(body: unknown, status = 200) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response);
}

function renderBin(overrides: Partial<React.ComponentProps<typeof EpisodeStoryBin>> = {}) {
  const onCue = jest.fn();
  const onPromoted = jest.fn().mockResolvedValue(undefined);
  render(<EpisodeStoryBin
    projectSlug="high-ground-odyssey"
    episode={{ id: "episode-9", title: "Episode 9" }}
    canEdit
    playhead={42.25}
    onCue={onCue}
    onPromoted={onPromoted}
    {...overrides}
  />);
  return { onCue, onPromoted };
}

describe("EpisodeStoryBin", () => {
  afterEach(() => {
    jest.restoreAllMocks();
    Reflect.deleteProperty(global, "fetch");
  });

  it("loads the retained library only when the editor asks to browse it", async () => {
    const fetchMock = jest.fn(() => response({ ok: true, workspace }));
    global.fetch = fetchMock;
    const user = userEvent.setup();
    renderBin();

    expect(fetchMock).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Browse" }));

    expect(await screen.findByText("Be Curious")).toBeInTheDocument();
    expect(screen.getByText("360° 16:9 · 1 keyframe")).toBeInTheDocument();
    expect(screen.getByText("proxy ready")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("places an exact board card at the shared playhead and refreshes the editor", async () => {
    const promotedWorkspace = {
      ...workspace,
      timelinePlacements: [{
        id: "timeline-placement-1",
        episodeProductionId: "episode-9",
        cardId: "card-curious",
        originBoardId: "board-360",
        originBoardPlacementId: "board-placement-1",
        trackId: "V3",
        episodeStartSeconds: 42.25,
        durationSeconds: 60.01,
        status: "active",
      }],
    };
    const fetchMock = jest.fn()
      .mockImplementationOnce(() => response({ ok: true, workspace }))
      .mockImplementationOnce(() => response({ ok: true, workspace: promotedWorkspace }));
    global.fetch = fetchMock;
    const user = userEvent.setup();
    const { onPromoted } = renderBin();

    await user.click(screen.getByRole("button", { name: "Browse" }));
    await user.click(await screen.findByRole("button", { name: "Add at 00:42.25" }));

    await waitFor(() => expect(onPromoted).toHaveBeenCalledTimes(1));
    const request = fetchMock.mock.calls[1];
    expect(request[0]).toBe("/api/nests/high-ground-odyssey/source-story");
    expect(JSON.parse((request[1] as RequestInit).body as string)).toMatchObject({
      action: "promote-card-to-episode",
      episodeProductionId: "episode-9",
      cardId: "card-curious",
      originBoardId: "board-360",
      originBoardPlacementId: "board-placement-1",
      expectedTimelineFingerprint: "fingerprint-9",
      placementMode: "at-time",
      episodeStartSeconds: 42.25,
      trackId: "V3",
    });
    expect(await screen.findByRole("button", { name: "Cue V3 · 00:42.25" })).toBeInTheDocument();
    expect(screen.getByText(/original and Story card remain unchanged/i)).toBeInTheDocument();
  });

  it("cues an existing placement instead of duplicating it", async () => {
    const placed = {
      ...workspace,
      timelinePlacements: [{
        id: "timeline-placement-1",
        episodeProductionId: "episode-9",
        cardId: "card-curious",
        originBoardId: "board-360",
        originBoardPlacementId: "board-placement-1",
        trackId: "V5",
        episodeStartSeconds: 17.5,
        durationSeconds: 60.01,
        status: "active",
      }],
    };
    global.fetch = jest.fn(() => response({ ok: true, workspace: placed }));
    const user = userEvent.setup();
    const { onCue } = renderBin();

    await user.click(screen.getByRole("button", { name: "Browse" }));
    await user.click(await screen.findByRole("button", { name: "Cue V5 · 00:17.50" }));

    expect(onCue).toHaveBeenCalledWith(17.5);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("refreshes a stale timeline fingerprint without silently retrying the placement", async () => {
    const refreshed = {
      ...workspace,
      episodes: [{ id: "episode-9", timelineFingerprint: "fingerprint-10" }],
    };
    const fetchMock = jest.fn()
      .mockImplementationOnce(() => response({ ok: true, workspace }))
      .mockImplementationOnce(() => response({ error: "Timeline changed", errorCode: "timeline-conflict" }, 409))
      .mockImplementationOnce(() => response({ ok: true, workspace: refreshed }));
    global.fetch = fetchMock;
    const user = userEvent.setup();
    const { onPromoted } = renderBin();

    await user.click(screen.getByRole("button", { name: "Browse" }));
    await user.click(await screen.findByRole("button", { name: "Add at 00:42.25" }));

    expect(await screen.findByText(/timeline changed while this bin was open/i)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(onPromoted).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Add at 00:42.25" })).toBeEnabled();
  });
});
