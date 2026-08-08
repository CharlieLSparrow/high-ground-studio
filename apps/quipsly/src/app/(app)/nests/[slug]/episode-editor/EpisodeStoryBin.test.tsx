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
            visualOverview: {
              playbackUrl: "/api/media/derivatives/contact-sheet-1",
              navigationFrames: {
                columns: 4,
                rows: 2,
                sampleTimesSeconds: [0, 20, 40, 60, 80, 100, 120, 140],
              },
            },
            sourceState: "verified",
            verifiedAt: "2026-08-08T17:00:00.000Z",
          },
        },
      },
    }],
  }],
};

function sequenceFixtures() {
  const secondPlacement = {
    id: "board-placement-2",
    cardId: "card-payoff",
    groupKey: "opening",
    sortOrder: 1,
    card: {
      ...workspace.boards[0]!.placements[0]!.card,
      id: "card-payoff",
      title: "The payoff",
      synopsis: "The next retained moment.",
      sourceRange: {
        ...workspace.boards[0]!.placements[0]!.card.sourceRange!,
        startSeconds: 10,
        endSeconds: 25.5,
        sourceRevision: {
          ...workspace.boards[0]!.placements[0]!.card.sourceRange!.sourceRevision,
          visualOverview: null,
        },
      },
    },
  };
  const sequenceWorkspace = {
    ...workspace,
    boards: [{
      ...workspace.boards[0]!,
      placements: [...workspace.boards[0]!.placements, secondPlacement],
    }],
  };
  const firstPlaced = {
    ...sequenceWorkspace,
    episodes: [{ id: "episode-9", timelineFingerprint: "fingerprint-10" }],
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
  const bothPlaced = {
    ...firstPlaced,
    episodes: [{ id: "episode-9", timelineFingerprint: "fingerprint-11" }],
    timelinePlacements: [...firstPlaced.timelinePlacements, {
      id: "timeline-placement-2",
      episodeProductionId: "episode-9",
      cardId: "card-payoff",
      originBoardId: "board-360",
      originBoardPlacementId: "board-placement-2",
      trackId: "V3",
      episodeStartSeconds: 102.26,
      durationSeconds: 15.5,
      status: "active",
    }],
  };
  return { sequenceWorkspace, firstPlaced, bothPlaced };
}

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
    expect(screen.getByRole("img", {
      name: "Representative source frame for Be Curious at 01:20.00",
    })).toHaveStyle({
      backgroundImage: "url(/api/media/derivatives/contact-sheet-1)",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("assembles selected cards consecutively in board order with fresh fingerprints", async () => {
    const { sequenceWorkspace, firstPlaced, bothPlaced } = sequenceFixtures();
    const fetchMock = jest.fn()
      .mockImplementationOnce(() => response({ ok: true, workspace: sequenceWorkspace }))
      .mockImplementationOnce(() => response({ ok: true, workspace: firstPlaced }))
      .mockImplementationOnce(() => response({ ok: true, workspace: bothPlaced }));
    global.fetch = fetchMock;
    const user = userEvent.setup();
    const { onPromoted } = renderBin();

    await user.click(screen.getByRole("button", { name: "Browse" }));
    await user.click(await screen.findByRole("checkbox", { name: "Select Be Curious for sequence" }));
    await user.click(screen.getByRole("checkbox", { name: "Select The payoff for sequence" }));
    expect(screen.getByText("2 selected in board order")).toBeInTheDocument();
    expect(screen.getByText("V3 · 00:42.25–01:57.76 · no gaps")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Add sequence" }));

    await waitFor(() => expect(onPromoted).toHaveBeenCalledTimes(1));
    const firstBody = JSON.parse((fetchMock.mock.calls[1]![1] as RequestInit).body as string);
    const secondBody = JSON.parse((fetchMock.mock.calls[2]![1] as RequestInit).body as string);
    expect(firstBody).toMatchObject({
      cardId: "card-curious",
      expectedTimelineFingerprint: "fingerprint-9",
      episodeStartSeconds: 42.25,
    });
    expect(secondBody).toMatchObject({
      cardId: "card-payoff",
      expectedTimelineFingerprint: "fingerprint-10",
      episodeStartSeconds: 102.26,
    });
    expect(await screen.findByText(/Added 2 selects to V3 from 00:42.25–01:57.76/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cue V3 · 00:42.25" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cue V3 · 01:42.26" })).toBeInTheDocument();
  });

  it("keeps partial sequence success explicit and stops after a collaboration conflict", async () => {
    const { sequenceWorkspace, firstPlaced } = sequenceFixtures();
    const refreshed = {
      ...firstPlaced,
      episodes: [{ id: "episode-9", timelineFingerprint: "fingerprint-11" }],
    };
    const fetchMock = jest.fn()
      .mockImplementationOnce(() => response({ ok: true, workspace: sequenceWorkspace }))
      .mockImplementationOnce(() => response({ ok: true, workspace: firstPlaced }))
      .mockImplementationOnce(() => response({ error: "Timeline changed" }, 409))
      .mockImplementationOnce(() => response({ ok: true, workspace: refreshed }));
    global.fetch = fetchMock;
    const user = userEvent.setup();
    const { onPromoted } = renderBin();

    await user.click(screen.getByRole("button", { name: "Browse" }));
    await user.click(await screen.findByRole("checkbox", { name: "Select Be Curious for sequence" }));
    await user.click(screen.getByRole("checkbox", { name: "Select The payoff for sequence" }));
    await user.click(screen.getByRole("button", { name: "Add sequence" }));

    expect(await screen.findByText(/1 select was added before another timeline change/i)).toBeInTheDocument();
    expect(screen.getByText(/remaining sequence was not placed/i)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(onPromoted).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Cue V3 · 00:42.25" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Select The payoff for sequence" })).toBeChecked();
    expect(screen.queryByRole("checkbox", { name: "Select Be Curious for sequence" })).not.toBeInTheDocument();
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

  it("reports a saved placement separately when the editor projection cannot refresh", async () => {
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
    global.fetch = jest.fn()
      .mockImplementationOnce(() => response({ ok: true, workspace }))
      .mockImplementationOnce(() => response({ ok: true, workspace: promotedWorkspace }));
    const user = userEvent.setup();
    const onPromoted = jest.fn().mockRejectedValue(new Error("editor refresh failed"));
    renderBin({ onPromoted });

    await user.click(screen.getByRole("button", { name: "Browse" }));
    await user.click(await screen.findByRole("button", { name: "Add at 00:42.25" }));

    expect(await screen.findByText(/placement is saved, but the editor projection did not refresh/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cue V3 · 00:42.25" })).toBeInTheDocument();
    expect(screen.queryByText(/could not be added/i)).not.toBeInTheDocument();
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
