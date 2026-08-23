/** @jest-environment jsdom */

import "@testing-library/jest-dom";
import { render, screen, waitFor } from "@testing-library/react";

const refresh = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

import { SessionReadinessTopologyCard } from "./session-readiness-topology-card";
import type { SessionReadinessTopology } from "./session-readiness-topology";
import { buildSessionRecordingStatus } from "@/lib/session-recording-status";

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
      clientInstanceId: "ios-installation-1",
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
    endpointQueues: [],
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
      serverRetention: {
        state: "SERVER_COPY_VERIFIED_RELEASED",
        uploadSessionId: "upload-1",
        exactBytesVerified: true,
        processingDisposition: "RELEASED",
        transcriptDisposition: "RELEASED",
        updatedAt: "2026-08-05T17:59:30.000Z",
      },
    }],
  }],
  expectedSources: [{
    id: "expectation-1",
    participantId: "participant-scott",
    participantLabel: "Scott Sparrow",
    label: "Scott iPhone audio master",
    sourceKind: "audio",
    retentionRole: "required-master",
    status: "active",
    expectedClientKind: "ios",
    expectedDeviceLabel: "iPhone 16",
    recordingAssetId: "asset-1",
    captureId: "capture-1",
    revision: 1,
    latestReason: null,
    fulfillment: "fulfilled",
    blocking: false,
    candidateSources: [],
    createdAt: "2026-08-05T16:50:00.000Z",
    updatedAt: "2026-08-05T17:59:30.000Z",
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
    endpointQueueCount: 0,
    drainedEndpointCount: 0,
    plannedSourceCount: 1,
    requiredPlannedSourceCount: 1,
    fulfilledRequiredPlannedSourceCount: 1,
    missingRequiredPlannedSourceCount: 0,
    attentionCount: 0,
  },
  exitReadiness: {
    state: "SERVER_COPY_COMPLETE_DEVICE_CONFIRMATION_REQUIRED",
    label: "Server copy complete · check each recording device",
    detail: "Every server-observed required master is verified and released. Confirm local queues.",
    requiredSourceCount: 1,
    serverSafeRequiredSourceCount: 1,
    pendingCaptureCount: 0,
    endpointQueueCount: 0,
    drainedEndpointCount: 0,
    safeForServerObservedSources: true,
    allEndpointQueuesConfirmedEmpty: false,
    requiredPlannedSourceCount: 1,
    fulfilledRequiredPlannedSourceCount: 1,
    safeForPlannedSources: true,
    safeToLeaveAllEndpoints: false,
  },
  boundaries: {
    personIsNotDevice: true,
    grantIsNotPresence: true,
    callTrackIsNotRetainedSource: true,
    captureReceiptIsNotUploadedMedia: true,
    recordingAssetOwnsRetainedSourceTruth: true,
    serverCopyDoesNotProveEndpointQueueEmpty: true,
    observedSourceDoesNotProvePlannedSourceComplete: true,
  },
};

describe("Session readiness topology card", () => {
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("merges safe current presence into the durable person/source projection", async () => {
    const fetchMock = jest.fn().mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/recording-status")) return {
        ok: true,
        json: async () => ({ ok: true, status: buildSessionRecordingStatus({ roomId: "room-1", roomStatus: "RECORDING", topology }) }),
      };
      return { ok: true, json: async () => ({
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
      }) };
    });
    global.fetch = fetchMock as typeof fetch;

    render(<SessionReadinessTopologyCard roomId="room-1" topology={topology} />);

    expect(screen.getByRole("heading", { name: "Scott Sparrow" })).toBeInTheDocument();
    expect(screen.getByText("Scott master.m4a")).toBeInTheDocument();
    expect(screen.getByText("Scott iPhone audio master")).toBeInTheDocument();
    expect(screen.getByText((_, node) => node?.tagName === "P" && node.textContent?.includes("Output: Shure MV7i Headphones") === true)).toBeInTheDocument();
    expect(screen.getByText("Ready now")).toBeInTheDocument();
    expect(screen.getByText(/sample bytes stayed on that browser tab/i)).toBeInTheDocument();
    expect(screen.getByText("Governed action receipt · 12345678")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Server copies are safe" })).toBeInTheDocument();
    expect(screen.getByText("Confirm device")).toBeInTheDocument();
    expect(screen.getByText("0/1 recording people safe")).toBeInTheDocument();
    expect(screen.getByText(/Safe to leave every endpoint: no/i)).toBeInTheDocument();
    expect(screen.getByText("Server copy safe")).toBeInTheDocument();
    expect(screen.getByText("Upload upload-1")).toBeInTheDocument();
    expect(await screen.findByText(/provider-observed now/i)).toBeInTheDocument();
    expect(screen.getByText("Audio live")).toBeInTheDocument();
    expect(screen.getByText("Video muted")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/sessions/room-1/presence",
      expect.objectContaining({ cache: "no-store" }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/sessions/room-1/recording-status",
      expect.objectContaining({ cache: "no-store" }),
    );
    expect(document.body.textContent).not.toContain("provider-secret");
    expect(screen.getByTestId("recording-status-details")).toHaveAttribute("open");
  });

  it("keeps the lobby calm before recording, then reveals participant upload safety", async () => {
    const inactiveTopology: SessionReadinessTopology = {
      ...topology,
      people: topology.people.map((person) => ({
        ...person,
        endpointQueues: [],
        sources: [],
      })),
      expectedSources: [],
      summary: {
        ...topology.summary,
        retainedSourceCount: 0,
        verifiedSourceCount: 0,
        endpointQueueCount: 0,
        drainedEndpointCount: 0,
        plannedSourceCount: 0,
        requiredPlannedSourceCount: 0,
        fulfilledRequiredPlannedSourceCount: 0,
      },
      exitReadiness: {
        ...topology.exitReadiness,
        state: "NO_CAPTURE_EVIDENCE",
        requiredSourceCount: 0,
        serverSafeRequiredSourceCount: 0,
        endpointQueueCount: 0,
        drainedEndpointCount: 0,
        allEndpointQueuesConfirmedEmpty: false,
        requiredPlannedSourceCount: 0,
        fulfilledRequiredPlannedSourceCount: 0,
        safeForPlannedSources: false,
        safeToLeaveAllEndpoints: false,
      },
    };
    const activeTopology: SessionReadinessTopology = {
      ...inactiveTopology,
      people: inactiveTopology.people.map((person) => ({
        ...person,
        endpointQueues: [{
          id: "queue-active",
          clientInstanceId: "ios-installation-1",
          clientKind: "ios",
          deviceLabel: "Quipsly Capture · iPhone 16",
          queueRevision: "1",
          queueState: "NOT_EMPTY",
          localSourceCount: 1,
          pendingSourceCount: 1,
          failedSourceCount: 0,
          observedCaptureIds: ["capture-active"],
          recordingAssetIds: [],
          latestLocalMutationAt: "2026-08-05T18:00:00.000Z",
          reconciledAt: "2026-08-05T18:00:00.000Z",
        }],
      })),
      summary: {
        ...inactiveTopology.summary,
        pendingCaptureCount: 1,
        endpointQueueCount: 1,
      },
      exitReadiness: {
        ...inactiveTopology.exitReadiness,
        state: "SERVER_COPY_INCOMPLETE",
        pendingCaptureCount: 1,
        endpointQueueCount: 1,
      },
    };
    global.fetch = jest.fn().mockImplementation(async (input: RequestInfo | URL) => {
      if (String(input).endsWith("/recording-status")) {
        return {
          ok: true,
          json: async () => ({
            ok: true,
            status: buildSessionRecordingStatus({
              roomId: "room-live",
              roomStatus: "RECORDING",
              topology: activeTopology,
            }),
          }),
        };
      }
      return {
        ok: true,
        json: async () => ({
          ok: true,
          presence: {
            status: "EMPTY",
            observedAt: "2026-08-05T18:00:01.000Z",
            devices: [],
            nextAction: "No one is in the call.",
          },
        }),
      };
    }) as typeof fetch;

    render(
      <SessionReadinessTopologyCard
        roomId="room-live"
        topology={inactiveTopology}
        hideWhenInactive
      />,
    );

    expect(
      screen.queryByRole("heading", { name: "Are everyone’s recordings safe?" }),
    ).not.toBeInTheDocument();
    expect(
      await screen.findByRole("heading", { name: "Keep recording devices open" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Keep device open")).toBeInTheDocument();
  });

  it("keeps technical receipts collapsed when every recording is safe", async () => {
    const safeTopology: SessionReadinessTopology = {
      ...topology,
      people: topology.people.map((person) => ({
        ...person,
        endpointQueues: [{
          id: "queue-1",
          clientInstanceId: "ios-installation-1",
          clientKind: "ios",
          deviceLabel: "Quipsly Capture · iPhone 16",
          queueRevision: "1",
          queueState: "DRAINED",
          localSourceCount: 1,
          pendingSourceCount: 0,
          failedSourceCount: 0,
          observedCaptureIds: ["capture-1"],
          recordingAssetIds: ["asset-1"],
          latestLocalMutationAt: "2026-08-05T17:59:00.000Z",
          reconciledAt: "2026-08-05T18:00:00.000Z",
        }],
      })),
      summary: { ...topology.summary, endpointQueueCount: 1, drainedEndpointCount: 1 },
      exitReadiness: {
        ...topology.exitReadiness,
        state: "SAFE_TO_LEAVE",
        label: "Every recording is safe",
        detail: "All required recordings are verified and every device upload queue is empty.",
        endpointQueueCount: 1,
        drainedEndpointCount: 1,
        allEndpointQueuesConfirmedEmpty: true,
        safeToLeaveAllEndpoints: true,
      },
    };
    const fetchMock = jest.fn().mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/recording-status")) return {
        ok: true,
        json: async () => ({ ok: true, status: buildSessionRecordingStatus({ roomId: "room-safe", roomStatus: "ENDED", topology: safeTopology }) }),
      };
      return {
        ok: true,
        json: async () => ({ ok: true, presence: { status: "EMPTY", observedAt: "2026-08-05T18:00:01.000Z", devices: [], nextAction: "No one is in the call." } }),
      };
    });
    global.fetch = fetchMock as typeof fetch;

    render(<SessionReadinessTopologyCard roomId="room-safe" topology={safeTopology} />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    expect(screen.getByRole("heading", { name: "Are everyone’s recordings safe?" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Every recording is safe" })).toBeInTheDocument();
    expect(screen.getByText("1/1 recording people safe")).toBeInTheDocument();
    expect(screen.getByText("Safe")).toBeInTheDocument();
    expect(screen.getByTestId("recording-status-details")).not.toHaveAttribute("open");
    expect(screen.getByText("Recording details")).toBeInTheDocument();
  });
});
