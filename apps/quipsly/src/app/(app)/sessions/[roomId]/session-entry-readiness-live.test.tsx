import React from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
import { buildQuipslySessionEntryReadiness } from "@high-ground/quipsly-domain/session-entry-readiness";

import { SessionEntryReadinessLive } from "./session-entry-readiness-live";

const refresh = jest.fn();
jest.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

function readiness(overrides: Record<string, unknown> = {}) {
  return buildQuipslySessionEntryReadiness({
    roomStatus: "PLANNED",
    purpose: "COACHING",
    actorAttached: true,
    actorAudioConsentGranted: false,
    actorVideoConsentGranted: false,
    actorTranscriptionConsentGranted: false,
    participantCount: 1,
    requiredParticipantCount: 2,
    audioConsentGrantedParticipantCount: 0,
    videoConsentGrantedParticipantCount: 0,
    transcriptionConsentGrantedParticipantCount: 0,
    allParticipantAudioConsentGranted: false,
    allParticipantVideoConsentGranted: false,
    allParticipantTranscriptionConsentGranted: false,
    providerCanJoin: true,
    providerReadiness: "livekit-ready",
    localCaptureAvailable: true,
    paymentBlocked: false,
    ...overrides,
  });
}

describe("live Session entry readiness", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("refreshes the canonical Session view only when participant readiness changes", async () => {
    const initial = readiness();
    const ready = readiness({
      actorAudioConsentGranted: true,
      actorVideoConsentGranted: true,
      actorTranscriptionConsentGranted: true,
      participantCount: 2,
      audioConsentGrantedParticipantCount: 2,
      videoConsentGrantedParticipantCount: 2,
      transcriptionConsentGrantedParticipantCount: 2,
      allParticipantAudioConsentGranted: true,
      allParticipantVideoConsentGranted: true,
      allParticipantTranscriptionConsentGranted: true,
    });
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, entryReadiness: ready }),
    });
    global.fetch = fetchMock as typeof fetch;

    render(<SessionEntryReadinessLive roomId="room-1" initial={initial} />);
    expect(screen.getByText("Allow recording?")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Allow recording" })).toHaveAttribute(
      "href",
      "#my-session-consent-heading",
    );

    await act(async () => {
      jest.advanceTimersByTime(6_000);
      await Promise.resolve();
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(screen.getByText("Ready to join")).toBeInTheDocument();
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/sessions/room-1/entry-readiness",
      expect.objectContaining({ cache: "no-store" }),
    );
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
