import { render, screen } from "@testing-library/react";
import { notFound } from "next/navigation";

import { requireProjectAccess } from "@/lib/server/access";
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
jest.mock("@/lib/server/quipsly-session", () => ({
  getQuipslySession: jest.fn(),
}));
jest.mock("./EpisodeRoomClient", () => function EpisodeRoomClientStub({
  initialPayload,
}: {
  initialPayload: { canEdit: boolean };
}) {
  return <div>{initialPayload.canEdit ? "Editable room" : "View-only room"}</div>;
});

const payload = {
  project: { id: "project-1", slug: "high-ground", name: "High Ground" },
  episode: { id: "episode-4", slug: "episode-4", title: "Episode 4" },
  canEdit: true,
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

    expect(screen.getByText("View-only room")).toBeInTheDocument();
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
});
