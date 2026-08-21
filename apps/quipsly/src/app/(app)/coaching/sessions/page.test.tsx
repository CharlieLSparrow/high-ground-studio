import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import CoachingSessionsPage from "./page";

function jsonResponse(payload: unknown, status = 200) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  } as Response);
}

describe("CoachingSessionsPage", () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, "fetch", {
      configurable: true,
      writable: true,
      value: jest.fn((input: RequestInfo | URL, init?: RequestInit) => {
        if (String(input) === "/api/mobile/capture/sessions" && init?.method === "POST") {
          return jsonResponse({
            ok: true,
            created: true,
            session: { id: "room-1", callRoomId: "room-1", title: "Episode 8 recording" },
            boundaries: {
              recordingStarted: false,
              providerJoined: false,
              providerTokenMinted: false,
              calendarMutated: false,
              stripeMutated: false,
              externalInviteSent: false,
              nextAction: "Collect explicit consent before recording.",
            },
          }, 201);
        }
        return jsonResponse({
          ok: true,
          user: {
            id: "user-1",
            email: "creator@example.com",
            name: "Creator",
            isStaff: false,
            canCreateCaptureSessions: true,
          },
          captureProjects: [{ id: "project-1", slug: "high-ground", name: "High Ground Odyssey", role: "OWNER" }],
          sessions: [],
        });
      }),
    });
  });

  it("opens a first coach's quiet Session planner and creates only the explicit canonical Session", async () => {
    const user = userEvent.setup();
    render(<CoachingSessionsPage />);

    expect(await screen.findByRole("heading", { name: "Create your first coaching Session." })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Name your coaching Session" })).toBeInTheDocument();
    expect(await screen.findByLabelText("Session title")).toBeInTheDocument();
    expect(screen.getByText(/take you to the private Session workspace to schedule it and invite your client/i)).toBeInTheDocument();
    expect(screen.queryByText(/No external side effects/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Session truth loaded/i)).not.toBeInTheDocument();

    await user.type(screen.getByLabelText("Session title"), "Episode 8 recording");
    await user.selectOptions(screen.getByLabelText("Purpose"), "PODCAST");
    await user.selectOptions(screen.getByLabelText("Nest"), "high-ground");
    await user.type(screen.getByLabelText(/Episode slug/i), "episode-8");
    await user.click(screen.getByRole("button", { name: "Create Session" }));

    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/mobile/capture/sessions",
      expect.objectContaining({ method: "POST" }),
    ));
    const postCall = jest.mocked(globalThis.fetch).mock.calls.find(([, init]) => init?.method === "POST");
    expect(JSON.parse(String(postCall?.[1]?.body))).toEqual(expect.objectContaining({
      title: "Episode 8 recording",
      purpose: "PODCAST",
      projectSlug: "high-ground",
      episodeSlug: "episode-8",
      deviceLabel: "Quipsly Nest web",
    }));
    expect(await screen.findByRole("status")).toHaveTextContent("Collect explicit consent before recording.");
    expect(screen.getByRole("link", { name: "Open created session" })).toHaveAttribute("href", "/sessions/room-1");
  });

  it("routes consent into the exact Session workspace instead of multiplying mutation controls across the index", async () => {
    jest.mocked(globalThis.fetch).mockImplementation(() => jsonResponse({
      ok: true,
      user: { id: "user-1", email: "creator@example.com", name: "Creator", canCreateCaptureSessions: false },
      sessions: [{
        id: "room-1",
        callRoomId: "room-1",
        participantId: "participant-1",
        title: "Episode 8 recording",
        purpose: "PODCAST",
        status: "PLANNED",
        recordingConsentStatus: "REQUESTED",
      }],
    }));

    render(<CoachingSessionsPage />);
    expect(await screen.findByRole("heading", { name: "Episode 8 recording" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open workspace" })).toHaveAttribute("href", "/sessions/room-1");
    expect(screen.getByRole("link", { name: "Review consent" })).toHaveAttribute("href", "/sessions/room-1?mode=prepare");
    expect(screen.queryByLabelText("Allow audio recording of my participation.")).not.toBeInTheDocument();
    expect(jest.mocked(globalThis.fetch).mock.calls.some(([input, init]) => String(input) === "/api/mobile/capture/consent" && init?.method === "POST")).toBe(false);
  });

  it("gives a new participant an obvious self-service path to become a coach", async () => {
    jest.mocked(globalThis.fetch).mockImplementation(() => jsonResponse({
      ok: true,
      user: {
        id: "user-1",
        email: "new-coach@example.com",
        name: "New coach",
        canCreateCaptureSessions: false,
      },
      sessions: [],
    }));

    render(<CoachingSessionsPage />);

    expect(await screen.findByRole("heading", { name: "No sessions are visible yet." })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Set up coaching" })).toHaveAttribute("href", "/coaching");
    expect(screen.getByText(/use the private link from your coach/i)).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Plan a real session" })).not.toBeInTheDocument();
  });

  it("bounds a large Session collection and makes an older Episode directly searchable", async () => {
    const user = userEvent.setup();
    const sessions = Array.from({ length: 14 }, (_, index) => ({
      id: `room-${index + 1}`,
      callRoomId: `room-${index + 1}`,
      title: index === 13 ? "Episode 9: The Swear Jar" : `Retained coaching rehearsal ${index + 1}`,
      purpose: index === 13 ? "PODCAST" : "COACHING",
      status: "PLANNED",
      recordingConsentStatus: "REQUESTED",
    }));
    jest.mocked(globalThis.fetch).mockImplementation(() => jsonResponse({
      ok: true,
      user: { id: "user-1", email: "creator@example.com", name: "Creator", canCreateCaptureSessions: true },
      captureProjects: [],
      sessions,
    }));

    render(<CoachingSessionsPage />);
    expect(await screen.findByRole("heading", { name: "Session index" })).toBeInTheDocument();
    expect(screen.getAllByTestId("session-index-card")).toHaveLength(12);
    expect(screen.queryByRole("heading", { name: "Episode 9: The Swear Jar" })).not.toBeInTheDocument();

    await user.type(screen.getByLabelText("Search Sessions"), "Episode 9");
    expect(await screen.findByRole("heading", { name: "Episode 9: The Swear Jar" })).toBeInTheDocument();
    expect(screen.getAllByTestId("session-index-card")).toHaveLength(1);
    expect(screen.getByRole("link", { name: "Open workspace" })).toHaveAttribute("href", "/sessions/room-14");
  });
});
