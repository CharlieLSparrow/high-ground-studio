import { render, screen } from "@testing-library/react";
import { notFound } from "next/navigation";

import { requireProjectAccess } from "@/lib/server/access";
import { ensureEpisodeEditBranch, loadEpisodeEditDesk } from "@/lib/server/episode-edit-store";
import { loadEpisodeRoomDesk } from "@/lib/server/episode-room-store";
import { getQuipslySession } from "@/lib/server/quipsly-session";

import EpisodeRoomPage from "./page";

jest.mock("next/navigation", () => ({
  notFound: jest.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));
jest.mock("@/lib/server/access", () => ({
  projectAccessErrorCode: (error: unknown) => error instanceof Error
    ? error.message.split(":", 1)[0]
    : null,
  requireProjectAccess: jest.fn(),
}));
jest.mock("@/lib/server/episode-room-store", () => ({
  loadEpisodeRoomDesk: jest.fn(),
}));
jest.mock("@/lib/server/episode-edit-store", () => ({
  ensureEpisodeEditBranch: jest.fn(),
  loadEpisodeEditDesk: jest.fn(),
}));
jest.mock("@/lib/server/quipsly-session", () => ({
  getQuipslySession: jest.fn(),
}));
jest.mock("./EpisodeRoomClient", () => function EpisodeRoomClientStub({
  initialPayload,
  initialMode,
}: {
  initialPayload: { canEdit: boolean };
  initialMode?: string;
}) {
  return <div>{initialPayload.canEdit ? "Editable room" : "View-only room"} · {initialMode || "plan"}</div>;
});
jest.mock("../../episode-editor/EpisodeEditorClient", () => function EpisodeEditorClientStub({
  projectName,
  canonicalWorkspace,
  recordingRoomId,
  initialStoryCardId,
  initialStoryPlacementId,
}: {
  projectName?: string;
  canonicalWorkspace?: boolean;
  recordingRoomId?: string | null;
  initialStoryCardId?: string;
  initialStoryPlacementId?: string;
}) {
  return <div
    data-story-card={initialStoryCardId ?? ""}
    data-story-placement={initialStoryPlacementId ?? ""}
  >{canonicalWorkspace ? "Canonical editor" : "Legacy editor"} · {projectName} · {recordingRoomId || "no recording"}</div>;
});

const payload = {
  project: { id: "project-1", slug: "high-ground", name: "High Ground" },
  episode: { id: "episode-4", slug: "episode-4", title: "Episode 4" },
  room: { session: { recordingRoomId: "room-4" } },
  recordingSessions: [],
  canEdit: true,
};

const editPayload = {
  projectSlug: "high-ground",
  episodes: [{ id: "episode-4", slug: "episode-4", title: "Episode 4" }],
  selectedEpisode: { id: "episode-4", slug: "episode-4", title: "Episode 4" },
  branch: { id: "branch-4", headRevision: 3, stateFingerprint: "branch-fingerprint-3" },
};

describe("EpisodeRoomPage access failures", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(getQuipslySession).mockResolvedValue({
      user: {
        id: "user-1",
        primaryEmail: "editor@example.com",
        name: "Editor",
        isStaff: false,
      },
    } as never);
    jest.mocked(loadEpisodeRoomDesk).mockResolvedValue(payload as never);
    jest.mocked(loadEpisodeEditDesk).mockResolvedValue(editPayload as never);
    jest.mocked(ensureEpisodeEditBranch).mockResolvedValue(undefined as never);
  });

  it("maps a missing private Nest to not found instead of a server error", async () => {
    jest.mocked(requireProjectAccess).mockRejectedValueOnce(
      new Error("NOT_FOUND: Project access target was not found"),
    );

    await expect(EpisodeRoomPage({
      params: Promise.resolve({ slug: "missing", episodeSlug: "episode-4" }),
    })).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFound).toHaveBeenCalled();
    expect(loadEpisodeRoomDesk).not.toHaveBeenCalled();
  });

  it("keeps the room available in view-only mode when write access is denied", async () => {
    jest.mocked(requireProjectAccess)
      .mockResolvedValueOnce({} as never)
      .mockRejectedValueOnce(new Error("FORBIDDEN: Insufficient permissions"));
    jest.mocked(loadEpisodeRoomDesk).mockResolvedValueOnce({
      ...payload,
      canEdit: false,
    } as never);

    render(await EpisodeRoomPage({
      params: Promise.resolve({ slug: "high-ground", episodeSlug: "episode-4" }),
    }));

    expect(screen.getByText(/View-only room/)).toBeInTheDocument();
    expect(loadEpisodeRoomDesk).toHaveBeenCalledWith(
      "high-ground",
      "episode-4",
      false,
      expect.objectContaining({ userId: "user-1" }),
    );
  });

  it("does not disguise infrastructure failures as view-only access", async () => {
    jest.mocked(requireProjectAccess)
      .mockResolvedValueOnce({} as never)
      .mockRejectedValueOnce(new Error("database connection failed"));

    await expect(EpisodeRoomPage({
      params: Promise.resolve({ slug: "high-ground", episodeSlug: "episode-4" }),
    })).rejects.toThrow("database connection failed");
    expect(loadEpisodeRoomDesk).not.toHaveBeenCalled();
  });

  it("loads the canonical shared edit branch inside the exact Episode workspace", async () => {
    render(await EpisodeRoomPage({
      params: Promise.resolve({ slug: "high-ground", episodeSlug: "episode-4" }),
      searchParams: Promise.resolve({ mode: "edit" }),
    }));

    expect(loadEpisodeEditDesk).toHaveBeenCalledWith("high-ground", "episode-4", true, {
      selectedMediaAssetId: undefined,
    });
    expect(ensureEpisodeEditBranch).not.toHaveBeenCalled();
    expect(screen.getByText("Canonical editor · High Ground · room-4")).toBeInTheDocument();
  });

  it("preserves an exact Story card and timeline placement into the shared editor", async () => {
    render(await EpisodeRoomPage({
      params: Promise.resolve({ slug: "high-ground", episodeSlug: "episode-4" }),
      searchParams: Promise.resolve({
        mode: "edit",
        storyCard: "card-curious",
        storyPlacement: "timeline-placement-1",
      }),
    }));

    const editor = screen.getByText("Canonical editor · High Ground · room-4");
    expect(editor).toHaveAttribute("data-story-card", "card-curious");
    expect(editor).toHaveAttribute("data-story-placement", "timeline-placement-1");
  });

  it("materializes a missing edit branch with attributable human provenance", async () => {
    jest.mocked(loadEpisodeEditDesk)
      .mockResolvedValueOnce({ ...editPayload, branch: null } as never)
      .mockResolvedValueOnce(editPayload as never);

    render(await EpisodeRoomPage({
      params: Promise.resolve({ slug: "high-ground", episodeSlug: "episode-4" }),
      searchParams: Promise.resolve({ mode: "edit" }),
    }));

    expect(ensureEpisodeEditBranch).toHaveBeenCalledWith(
      "high-ground",
      "episode-4",
      expect.objectContaining({
        userId: "user-1",
        email: "editor@example.com",
        label: "Editor",
        type: "human",
      }),
    );
    expect(loadEpisodeEditDesk).toHaveBeenCalledTimes(2);
  });
});
