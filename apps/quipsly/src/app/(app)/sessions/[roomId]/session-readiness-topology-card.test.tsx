/** @jest-environment jsdom */

import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";

import { SessionReadinessTopologyCard } from "./session-readiness-topology-card";
import type { SessionReadinessTopology } from "./session-readiness-topology";

const originalFetch = global.fetch;

const topology: SessionReadinessTopology = {
  generatedAt: "2026-08-05T18:00:00.000Z",
  people: [{
    id: "participant-scott",
    label: "Scott Sparrow",
    role: "CO_HOST",
    isCurrentActor: false,
    consent: "ready",
    videoConsent: true,
    transcriptionConsent: true,
    attentionCount: 0,
    endpoints: [{
      id: "grant-1",
      clientKind: "ios",
      deviceLabel: "Quipsly Capture · iPhone 16",
      preparedAt: "2026-08-05T17:50:00.000Z",
      leaseExpiresAt: "2026-08-05T19:50:00.000Z",
      leaseActive: true,
      truth: "join-grant-receipt",
    }],
    preflights: [{
      id: "preflight-1",
      governedActionId: "governed-action-12345678",
      clientInstanceId: "mac-browser",
      clientKind: "web",
      deviceLabel: "Quipsly Web · Mac",
      microphoneLabel: "Shure MV7i",
      cameraLabel: "Canon EOS R8",
      outputLabel: "Shure MV7i Headphones",
      cameraWanted: true,
      status: "READY",
      audioSignalState: "ready",
      privateSamplePlaybackComplete: true,
      playbackDecision: "HEARD_CLEAR",
      issueCodes: [],
      testedAt: "2026-08-05T17:55:00.000Z",
      expiresAt: "2026-08-05T19:55:00.000Z",
      current: true,
    }],
    sources: [{
      id: "asset-1",
      evidenceKind: "recording-asset",
      sourceKind: "audio",
      label: "Scott master.m4a",
      status: "VERIFIED",
      clientKind: "ios",
      deviceLabel: "iPhone17,3 · DJI Mic 2",
      captureId: "capture-1",
      startedAt: "2026-08-05T17:00:00.000Z",
      stoppedAt: "2026-08-05T17:10:00.000Z",
      durationSeconds: 600,
      byteSize: "1024",
      verified: true,
    }],
  }],
  unassignedSources: [],
  summary: {
    peopleCount: 1,
    consentReadyCount: 1,
    knownEndpointCount: 1,
    currentPreflightCount: 1,
    retainedSourceCount: 1,
    verifiedSourceCount: 1,
    pendingCaptureCount: 0,
    attentionCount: 0,
  },
  boundaries: {
    personIsNotDevice: true,
    grantIsNotPresence: true,
    callTrackIsNotRetainedSource: true,
    captureReceiptIsNotUploadedMedia: true,
    recordingAssetOwnsRetainedSourceTruth: true,
  },
};

describe("Session readiness topology card", () => {
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("merges safe current presence into the durable person/source projection", async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        presence: {
          status: "LIVE",
          errorCode: null,
          observedAt: "2026-08-05T18:00:01.000Z",
          connectedDeviceCount: 1,
          connectedParticipantCount: 1,
          unknownDeviceCount: 0,
          attentionCount: 0,
          nextAction: "Current provider observation.",
          devices: [{
            id: "presence-safe",
            participantId: "participant-scott",
            participantLabel: "Scott Sparrow",
            clientKind: "ios",
            deviceLabel: "Quipsly Capture · iPhone 16",
            joinedAt: "2026-08-05T17:59:00.000Z",
            audio: { published: true, muted: false },
            video: { published: true, muted: true },
            matchedToCanonicalParticipant: true,
          }],
        },
      }),
    });
    global.fetch = fetchMock as typeof fetch;

    render(<SessionReadinessTopologyCard roomId="room-1" topology={topology} />);

    expect(screen.getByRole("heading", { name: "Scott Sparrow" })).toBeInTheDocument();
    expect(screen.getByText("Scott master.m4a")).toBeInTheDocument();
    expect(screen.getByText((_, node) => node?.tagName === "P" && node.textContent?.includes("Output: Shure MV7i Headphones") === true)).toBeInTheDocument();
    expect(screen.getByText("Ready now")).toBeInTheDocument();
    expect(screen.getByText(/sample bytes stayed on that browser tab/i)).toBeInTheDocument();
    expect(screen.getByText("Governed action receipt · 12345678")).toBeInTheDocument();
    expect(await screen.findByText(/provider-observed now/i)).toBeInTheDocument();
    expect(screen.getByText("Audio live")).toBeInTheDocument();
    expect(screen.getByText("Video muted")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/sessions/room-1/presence",
      expect.objectContaining({ cache: "no-store" }),
    );
    expect(document.body.textContent).not.toContain("provider-secret");
  });
});
