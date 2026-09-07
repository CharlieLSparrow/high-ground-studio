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

  it("shows loading rather than telling an invited person they have no sessions", () => {
    jest.mocked(globalThis.fetch).mockReturnValue(new Promise(() => {}));
    render(<CoachingSessionsPage />);
    expect(screen.getByRole("status")).toHaveTextContent("Loading your sessions");
    expect(screen.queryByRole("heading", { name: "No sessions are visible yet." })).not.toBeInTheDocument();
    expect(screen.queryByText(/ask your coach to resend/i)).not.toBeInTheDocument();
  });

  it("keeps a ready call clear of proof-only warnings, with diagnostics available on demand", async () => {
    const user = userEvent.setup();
    jest.mocked(globalThis.fetch).mockImplementation(() => jsonResponse({
      ok: true, sessions: [{
        id: "ready", callRoomId: "ready", title: "Ready coaching call", status: "PLANNED",
        providerCanJoin: true, canRecordNow: true, recordingConsentGranted: true,
        captureReadiness: { label: "Ready to join", blockers: ["substantial-recording-evidence-needed"] },
        journeySummary: { blockers: ["calendar-receipt:missing"] },
      }],
    }));
    render(<CoachingSessionsPage />);
    expect(await screen.findByRole("heading", { name: "Ready coaching call" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Join call" })).toHaveAttribute("href", "/sessions/ready?mode=live");
    expect(screen.queryByLabelText("Next steps")).not.toBeInTheDocument();
    expect(screen.getByText("substantial-recording-evidence-needed").closest("details")).not.toHaveAttribute("open");
    await user.selectOptions(screen.getByLabelText("View"), "ATTENTION");
    expect(screen.queryByTestId("session-index-card")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "No Sessions match these filters." })).toBeInTheDocument();
  });

  it("keeps failed transcription actionable after a call ends", async () => {
    const user = userEvent.setup();
    jest.mocked(globalThis.fetch).mockImplementation(() => jsonResponse({
      ok: true, sessions: [{ id: "ended", callRoomId: "ended", title: "Finished coaching call", status: "ENDED",
        providerCanJoin: false, latestTranscriptStatus: "FAILED" }],
    }));
    render(<CoachingSessionsPage />);
    await screen.findByLabelText("View");
    await user.selectOptions(screen.getByLabelText("View"), "ATTENTION");
    expect(screen.getByText("Transcription needs a retry.")).toBeInTheDocument();
    expect(screen.queryByText("Open the session to check call setup.")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open session" })).toHaveAttribute("href", "/sessions/ended");
  });

  it("keeps loaded sessions during a refresh failure without blaming the account or invitation", async () => {
    const user = userEvent.setup();
    jest.mocked(globalThis.fetch)
      .mockImplementationOnce(() => jsonResponse({ ok: true, sessions: [
        { id: "saved", callRoomId: "saved", title: "My scheduled call", providerCanJoin: true },
      ] }))
      .mockImplementationOnce(() => jsonResponse({ ok: false, error: "Temporarily unavailable." }, 503));
    render(<CoachingSessionsPage />);
    await screen.findByRole("heading", { name: "My scheduled call" });
    await user.click(screen.getByRole("button", { name: "Refresh" }));
    expect(await screen.findByText(/Temporarily unavailable\. Try Refresh/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Join call" })).toHaveAttribute("href", "/sessions/saved?mode=live");
    expect(screen.queryByText(/sign in with the invited email|ask your coach to resend/i)).not.toBeInTheDocument();
  });

  it("routes first-time coaching to the canonical scheduler and keeps the generic planner secondary", async () => {
    const user = userEvent.setup();
    render(<CoachingSessionsPage />);

    expect(await screen.findByRole("heading", { name: "Your Sessions start here." })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Schedule coaching—or plan another kind of Session" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Schedule coaching" })).toHaveAttribute("href", "/coaching#create-appointment");
    expect(screen.queryByLabelText("Session title")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Plan another kind" }));
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
    expect(await screen.findByRole("status")).toHaveTextContent("Session created. Open it to invite people and choose recording options.");
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
    expect(screen.getByRole("link", { name: "Open session" })).toHaveAttribute("href", "/sessions/room-1");
    expect(screen.getByRole("link", { name: "Recording options" })).toHaveAttribute("href", "/sessions/room-1?mode=prepare");
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
    expect(screen.getByRole("link", { name: "Schedule coaching" })).toHaveAttribute("href", "/coaching");
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
    expect(await screen.findByRole("heading", { name: "Sessions" })).toBeInTheDocument();
    expect(screen.getAllByTestId("session-index-card")).toHaveLength(12);
    expect(screen.queryByRole("heading", { name: "Episode 9: The Swear Jar" })).not.toBeInTheDocument();

    await user.type(screen.getByLabelText("Search Sessions"), "Episode 9");
    expect(await screen.findByRole("heading", { name: "Episode 9: The Swear Jar" })).toBeInTheDocument();
    expect(screen.getAllByTestId("session-index-card")).toHaveLength(1);
    expect(screen.getByRole("link", { name: "Open session" })).toHaveAttribute("href", "/sessions/room-14");
  });
});
