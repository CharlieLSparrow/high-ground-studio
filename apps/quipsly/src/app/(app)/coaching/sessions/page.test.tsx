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

describe("CoachingSessionsPage planned session creation", () => {
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

  it("creates only a planned app-owned session from explicit form values", async () => {
    const user = userEvent.setup();
    render(<CoachingSessionsPage />);

    expect(await screen.findByRole("heading", { name: "Plan a real session" })).toBeInTheDocument();
    expect(screen.getByText(/does not invite, schedule, charge, join, record, transcribe, send, or publish/i)).toBeInTheDocument();

    await user.type(screen.getByLabelText("Session title"), "Episode 8 recording");
    await user.selectOptions(screen.getByLabelText("Purpose"), "PODCAST");
    await user.selectOptions(screen.getByLabelText("Nest"), "high-ground");
    await user.type(screen.getByLabelText(/Episode or boundary slug/i), "episode-8");
    await user.click(screen.getByRole("button", { name: "Create planned session" }));

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

  it("submits the explicit recording and transcription choices shown to the participant", async () => {
    const user = userEvent.setup();
    jest.mocked(globalThis.fetch).mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === "/api/mobile/capture/consent" && init?.method === "POST") {
        return jsonResponse({ ok: true, session: { nextAction: "Consent saved." } });
      }
      return jsonResponse({
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
      });
    });

    render(<CoachingSessionsPage />);
    expect(await screen.findByRole("heading", { name: "Episode 8 recording" })).toBeInTheDocument();

    await user.click(screen.getByLabelText("Allow audio recording of my participation."));
    await user.click(screen.getByLabelText("Separately allow transcription of my recorded participation."));
    await user.click(screen.getByLabelText(/anyone else who may be heard has been told and agreed/i));
    await user.click(screen.getByRole("button", { name: "Grant recording consent" }));

    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/mobile/capture/consent",
      expect.objectContaining({ method: "POST" }),
    ));
    const consentCall = jest.mocked(globalThis.fetch).mock.calls.find(([input]) => String(input) === "/api/mobile/capture/consent");
    expect(JSON.parse(String(consentCall?.[1]?.body))).toEqual(expect.objectContaining({
      callRoomId: "room-1",
      participantId: "participant-1",
      consentAction: "GRANT",
      canRecordAudio: true,
      canRecordVideo: false,
      canTranscribe: true,
      allAudibleParticipantsNotifiedAndAgreed: true,
    }));
  });
});
