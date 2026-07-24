import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import CloudEditor from "./page";

jest.mock("next/navigation", () => ({
  useSearchParams: jest.fn(() => new URLSearchParams()),
}));
jest.mock("@remotion/player", () => ({
  Player: () => <div aria-label="Program preview" />,
}));

function response(payload: unknown, ok = false, status = ok ? 200 : 503) {
  return Promise.resolve({
    ok,
    status,
    json: async () => payload,
    text: async () => JSON.stringify(payload),
  } as Response);
}

describe("CloudEditor production truth UX", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Object.defineProperty(globalThis, "fetch", {
      configurable: true,
      writable: true,
      value: jest.fn((input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/api/ai-edit")) {
          return response({
            ok: true,
            applied: false,
            edits: [{ type: "deactivate", blockId: "t2" }],
          }, true, 200);
        }
        if (url === "/api/episode-production") {
          return response({
            ok: true,
            mode: "database",
            id: "production-1",
            projectSlug: "high-ground-odyssey-manuscript",
            slug: "current-episode",
            title: "Current Episode",
            boundaryLabel: "Current Episode",
            status: "active",
            actorEmail: "editor@example.com",
            accessRole: "EDITOR",
            accessSource: "grant",
            recordingRoomJson: null,
            timelineJson: null,
            transcriptJson: null,
            productionJson: null,
            updatedAt: "2026-07-19T00:00:00.000Z",
          }, true, 200);
        }
        return response({ ok: false, error: "Persistence unavailable in component test" });
      }),
    });
    jest.spyOn(console, "warn").mockImplementation(() => undefined);
    jest.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  it("renders the current editor modes and source/program distinction after access resolves", async () => {
    render(<CloudEditor />);

    expect(await screen.findByRole("heading", { name: /Episode Editor/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "TIMELINE" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "TRANSCRIPT" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Source Monitor" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Program Monitor" })).toBeInTheDocument();
  });

  it("opens the paper edit from the transcript mode control", async () => {
    const user = userEvent.setup();
    render(<CloudEditor />);

    await screen.findByRole("heading", { name: /Episode Editor/i });
    await user.click(screen.getByRole("button", { name: "TRANSCRIPT" }));

    expect(screen.getByRole("heading", { name: "Paper Edit" })).toBeInTheDocument();
    expect(screen.getByText(/Shift\+Click a block/i)).toBeInTheDocument();
  });

  it("shows the honest render-worker boundary without queuing a fake job", async () => {
    const user = userEvent.setup();
    render(<CloudEditor />);

    await screen.findByRole("heading", { name: /Episode Editor/i });
    await user.click(screen.getByRole("button", { name: "Render & Export..." }));

    expect(screen.getByRole("dialog", { name: "Web rendering is not connected yet" })).toBeInTheDocument();
    expect(screen.getByText(/Quipsly will not pretend this timeline was packaged or rendered/i)).toBeInTheDocument();
    expect(screen.getByText("No job queued")).toBeInTheDocument();
    expect(screen.queryByText("Render Package Ready")).not.toBeInTheDocument();
  });

  it("discloses the provider handoff and returns proposals without auto-applying them", async () => {
    const user = userEvent.setup();
    render(<CloudEditor />);

    await screen.findByRole("heading", { name: /Episode Editor/i });
    await user.click(screen.getByRole("button", { name: "Suggest edits" }));

    expect(screen.getByRole("alertdialog", { name: "Send this transcript for suggestions?" })).toBeInTheDocument();
    expect(screen.getByText(/nothing changes until you apply one here/i)).toBeInTheDocument();
    expect((globalThis.fetch as jest.Mock).mock.calls.some(([url]) => String(url).includes("/api/ai-edit"))).toBe(false);

    await user.click(screen.getByRole("button", { name: "Send for suggestions" }));

    await waitFor(() => expect(screen.getByRole("region", { name: "AI edit proposals" })).toBeInTheDocument());
    expect(screen.getByText(/Nothing has been applied/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Apply proposal" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Dismiss" })).toBeInTheDocument();
  });

  it("does not paint a representative timeline when Nest access is denied", async () => {
    jest.mocked(globalThis.fetch).mockImplementation((input: RequestInfo | URL) => {
      if (String(input) === "/api/episode-production") {
        return response({
          ok: true,
          mode: "fallback",
          id: "fallback-private",
          projectSlug: "private-nest",
          slug: "current-episode",
          title: "Current Episode",
          boundaryLabel: "Current Episode",
          status: "access-denied",
          message: "You do not have access to this Nest.",
        }, true, 200);
      }
      return response({ ok: false, error: "Unavailable" });
    });

    render(<CloudEditor />);

    expect(await screen.findByRole("heading", { name: "This Nest editor is private." })).toBeInTheDocument();
    expect(screen.getByText(/No timeline, transcript, media, or representative starter content was loaded/i)).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /Episode Editor/i })).not.toBeInTheDocument();
    expect(screen.queryByText("Episode 4 Intro Audio")).not.toBeInTheDocument();
  });
});
