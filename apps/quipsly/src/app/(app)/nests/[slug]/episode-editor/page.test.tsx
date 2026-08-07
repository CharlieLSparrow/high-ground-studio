import { render, screen } from "@testing-library/react";
import { redirect } from "next/navigation";

import { requireProjectAccess } from "@/lib/server/access";
import { loadEpisodeEditDesk } from "@/lib/server/episode-edit-store";

import SharedEpisodeEditorPage from "./page";

jest.mock("next/navigation", () => ({
  redirect: jest.fn((href: string) => {
    throw new Error(`NEXT_REDIRECT:${href}`);
  }),
}));
jest.mock("@/lib/server/access", () => ({
  projectAccessErrorCode: (error: unknown) => error instanceof Error
    ? error.message.split(":", 1)[0]
    : null,
  requireProjectAccess: jest.fn(),
}));
jest.mock("@/lib/server/episode-edit-store", () => ({
  loadEpisodeEditDesk: jest.fn(),
}));

describe("SharedEpisodeEditorPage migration route", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(requireProjectAccess).mockResolvedValue({} as never);
  });

  it("redirects an old editor bookmark into the canonical Episode workspace", async () => {
    jest.mocked(loadEpisodeEditDesk).mockResolvedValue({
      selectedEpisode: { slug: "episode 9" },
    } as never);

    await expect(SharedEpisodeEditorPage({
      params: Promise.resolve({ slug: "high/ground" }),
      searchParams: Promise.resolve({ episode: "episode 9" }),
    })).rejects.toThrow("NEXT_REDIRECT:/nests/high%2Fground/episodes/episode%209?mode=edit");

    expect(redirect).toHaveBeenCalledWith(
      "/nests/high%2Fground/episodes/episode%209?mode=edit",
    );
  });

  it("keeps a useful empty state when the Nest has no episodes", async () => {
    jest.mocked(loadEpisodeEditDesk).mockResolvedValue({
      selectedEpisode: null,
    } as never);

    render(await SharedEpisodeEditorPage({
      params: Promise.resolve({ slug: "empty-nest" }),
      searchParams: Promise.resolve({}),
    }));

    expect(screen.getByRole("heading", { name: "This Nest has no episodes yet." })).toBeInTheDocument();
  });

  it("does not hide infrastructure failures behind a view-only migration", async () => {
    jest.mocked(requireProjectAccess)
      .mockResolvedValueOnce({} as never)
      .mockRejectedValueOnce(new Error("database connection failed"));

    await expect(SharedEpisodeEditorPage({
      params: Promise.resolve({ slug: "high-ground" }),
      searchParams: Promise.resolve({ episode: "episode-9" }),
    })).rejects.toThrow("database connection failed");
    expect(loadEpisodeEditDesk).not.toHaveBeenCalled();
  });
});
