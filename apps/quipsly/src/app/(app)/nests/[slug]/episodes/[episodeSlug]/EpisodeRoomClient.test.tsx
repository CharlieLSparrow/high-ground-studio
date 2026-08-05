import { act, render, screen } from "@testing-library/react";

import { EPISODE_ROOM_VERSION } from "@/lib/episode-room/episode-room-contract";
import type { EpisodeRoomDeskPayload } from "@/lib/server/episode-room-store";

import EpisodeRoomClient from "./EpisodeRoomClient";

jest.mock("./EpisodeRoomChat", () => function EpisodeRoomChatStub() {
  return <section>Episode chat</section>;
});
jest.mock("@/components/session-thread", () => ({
  SessionThread: ({ scopeLabel }: { scopeLabel?: string }) => <section>{scopeLabel || "Session thread"}</section>,
}));
jest.mock("@/components/session-invitations", () => ({
  SessionInvitations: () => <section>Session invitations</section>,
}));

const originalFetch = globalThis.fetch;

const initialPayload: EpisodeRoomDeskPayload = {
  project: {
    id: "project-1",
    slug: "high-ground-odyssey",
    name: "High Ground Odyssey",
  },
  episode: {
    id: "episode-1",
    slug: "episode-5",
    title: "Episode 5",
    status: "draft",
    updatedAt: "2026-07-27T10:00:00.000Z",
    documentId: "document-episode-5",
    documentTitle: "Episode 5 run of show",
  },
  room: {
    version: EPISODE_ROOM_VERSION,
    revision: 0,
    status: "idle",
    positionSeconds: 0,
    effectiveAt: "2026-07-27T10:00:00.000Z",
    clips: [],
    segments: [],
    receipts: [],
  },
  writing: {
    version: "writing-version-1",
    updatedAt: "2026-07-27T10:00:00.000Z",
    blockCount: 1,
    visibleBlockCount: 1,
    truncated: false,
  },
  textBlocks: [{
    id: "block-1",
    stableId: "episode-5-intro",
    order: 0,
    title: null,
    body: "Original run-of-show sentence.",
  }],
  transcriptSegments: [],
  importedCandidates: [],
  vaultCandidates: [],
      recordingSessions: [],
      milestones: [],
      milestoneAssignees: [],
      timelineClipCount: 0,
  canEdit: true,
};

describe("EpisodeRoomClient shared writing", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
    if (originalFetch) {
      globalThis.fetch = originalFetch;
    } else {
      Reflect.deleteProperty(globalThis, "fetch");
    }
  });

  it("routes to the exact manuscript and applies a changed runtime snapshot", async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        room: initialPayload.room,
        writing: {
          version: "writing-version-2",
          updatedAt: "2026-07-27T10:01:00.000Z",
          blockCount: 1,
          visibleBlockCount: 1,
          truncated: false,
          textBlocks: [{
            ...initialPayload.textBlocks[0],
            body: "Updated shared run-of-show sentence.",
          }],
        },
        importedCandidates: [],
        recordingSessions: [],
        timelineClipCount: 0,
      }),
    } as Response);
    globalThis.fetch = fetchMock;

    render(<EpisodeRoomClient initialPayload={initialPayload} />);

    expect(screen.getByRole("link", { name: "Write" })).toHaveAttribute(
      "href",
      "/create?project=high-ground-odyssey&document=document-episode-5",
    );
    expect(screen.getByRole("link", { name: "Edit timeline" })).toHaveAttribute(
      "href",
      "/editor?project=high-ground-odyssey&episode=episode-5",
    );
    expect(screen.getByRole("link", { name: "Live cut" })).toHaveAttribute(
      "href",
      "/nests/high-ground-odyssey/episode-editor?episode=episode-5",
    );
    expect(screen.getByText("Original run-of-show sentence.")).toBeInTheDocument();

    await act(async () => {
      jest.advanceTimersByTime(800);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/nests/high-ground-odyssey/episode-room?episode=episode-5&runtime=1&writingVersion=writing-version-1",
      { cache: "no-store" },
    );
    expect(screen.getByText("Updated shared run-of-show sentence.")).toBeInTheDocument();
    expect(screen.getByText(
      "Latest episode writing loaded from the shared manuscript.",
    )).toBeInTheDocument();
  });

  it("shows reusable same-Nest Media Vault sources and preserves saved clip context", () => {
    render(<EpisodeRoomClient initialPayload={{
      ...initialPayload,
      vaultCandidates: [{
        assetId: "asset-be-curious",
        title: "Be Curious.mp4",
        kind: "video",
        mimeType: "video/mp4",
        playbackUrl: "/api/ingest/media/source-be-curious",
        durationSeconds: 74,
        thumbnailUrl: null,
        updatedAt: "2026-07-30T10:00:00.000Z",
        savedClipCount: 1,
        savedClipTitles: ["Curiosity opening"],
        savedClips: [{
          mediaClipId: "media-clip-curiosity-opening",
          watchId: "media-vault-clip:media-clip-curiosity-opening",
          title: "Curiosity opening",
          rangeStartSeconds: 4,
          rangeEndSeconds: 12,
          durationSeconds: 8,
          attached: false,
        }],
        imported: false,
        attached: false,
        canAddToWatch: true,
        readinessLabel: "playback ready",
      }],
    }} />);

    expect(screen.getByRole("heading", {
      name: "Add from this Nest’s Media Vault",
    })).toBeInTheDocument();
    expect(screen.getByText("Be Curious.mp4")).toBeInTheDocument();
    expect(screen.getByText("1 saved range")).toBeInTheDocument();
    expect(screen.getByText("Curiosity opening")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Use whole source" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Use saved range" })).toBeEnabled();
    expect(screen.getByText(
      /Saved ranges play from their exact in point to out point/i,
    )).toBeInTheDocument();
  });

  it("lets viewers inspect Media Vault provenance without changing shared Watch", () => {
    render(<EpisodeRoomClient initialPayload={{
      ...initialPayload,
      canEdit: false,
      vaultCandidates: [{
        assetId: "asset-be-curious",
        title: "Be Curious.mp4",
        kind: "video",
        mimeType: "video/mp4",
        playbackUrl: "/api/ingest/media/source-be-curious",
        durationSeconds: 74,
        thumbnailUrl: null,
        updatedAt: "2026-07-30T10:00:00.000Z",
        savedClipCount: 1,
        savedClipTitles: ["Curiosity opening"],
        savedClips: [{
          mediaClipId: "media-clip-curiosity-opening",
          watchId: "media-vault-clip:media-clip-curiosity-opening",
          title: "Curiosity opening",
          rangeStartSeconds: 4,
          rangeEndSeconds: 12,
          durationSeconds: 8,
          attached: false,
        }],
        imported: false,
        attached: false,
        canAddToWatch: true,
        readinessLabel: "playback ready",
      }],
    }} />);

    expect(screen.getByText("Be Curious.mp4")).toBeInTheDocument();
    expect(screen.getByText("1 saved range")).toBeInTheDocument();
    expect(screen.getByText("Curiosity opening")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Use whole source" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Use saved range" })).toBeDisabled();
  });

  it("gives an uploaded video an explicit path from proxy queue to Shared Watch", () => {
    render(<EpisodeRoomClient initialPayload={{
      ...initialPayload,
      importedCandidates: [{
        watchId: "asset-be-curious",
        assetId: "asset-be-curious",
        sourceId: "source-be-curious",
        title: "Be Curious.mp4",
        kind: "video",
        playbackUrl: "/api/ingest/media/source-be-curious",
        importRole: "reference-clip",
        addedAt: "2026-08-04T19:00:00.000Z",
        addedBy: "Imported media",
        attached: false,
        proxyStatus: "queued",
        sourceStatus: "source registered",
        sourceSyncStatus: "ready-to-sync",
        alignmentStatus: "needs alignment",
        captureAlignment: null,
        canAddToWatch: false,
        readinessLabel: "source registered · proxy queued",
      }],
    }} />);

    expect(screen.getByText("Be Curious.mp4")).toBeInTheDocument();
    expect(screen.getByText("video · source registered · proxy queued")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Prepare for Watch" })).toBeEnabled();
  });

  it("carries the exact Capture take into guided sync instead of dropping it in the live-cut editor", () => {
    const captureGroupId = "55555555-5555-4555-8555-555555555555";
    render(<EpisodeRoomClient initialPayload={{
      ...initialPayload,
      importedCandidates: [{
        watchId: "asset-homer-video",
        assetId: "asset-homer-video",
        sourceId: "source-homer-video",
        title: "Homer iPhone 4K.mov",
        kind: "video",
        playbackUrl: "/api/ingest/media/source-homer-video",
        importRole: "camera-video",
        addedAt: "2026-08-05T05:01:01.000Z",
        addedBy: "Imported media",
        attached: false,
        proxyStatus: "ready",
        sourceStatus: "source verified",
        sourceSyncStatus: "ready-to-sync",
        alignmentStatus: "proposal-ready",
        captureGroupId,
        captureAlignment: {
          schema: "quipsly-capture-alignment-proposal-v1",
          status: "proposal-ready",
          contractValid: true,
          method: "lowest-rtt-monotonic-server-projection-v1",
          sourceClockEvidence: "lowest-rtt-monotonic-projection",
          estimatedServerStartedAt: "2026-08-05T05:00:00.240Z",
          uncertaintyMilliseconds: 8.5,
          estimatedOffsetMilliseconds: 240,
          baselineRecordingAssetId: "recording-audio",
          proposalSourceCount: 2,
          startReceiptId: "start-video",
          sampleAccurateClaimed: false,
          reviewRequired: true,
          reviewGate: {
            waveformCorrelationRequired: true,
            driftReviewRequired: true,
            humanApprovalRequired: true,
          },
          reason: "Clock evidence is ready for waveform, drift, and human review.",
        },
        canAddToWatch: true,
        readinessLabel: "source verified · clock proposal ready",
      }],
    }} />);

    expect(screen.getByRole("link", { name: "Open guided sync" })).toHaveAttribute(
      "href",
      "/editor?project=high-ground-odyssey&episode=episode-5#guided-sync-wizard",
    );
    expect(screen.getByRole("link", { name: "Review this take" })).toHaveAttribute(
      "href",
      `/editor?project=high-ground-odyssey&episode=episode-5&captureGroup=${captureGroupId}#guided-sync-wizard`,
    );
    expect(screen.getByText("+0.240s from baseline · ±8.5ms clock uncertainty")).toBeInTheDocument();
  });

  it("shows a bound recording clock without leaking raw Capture-room access", () => {
    render(<EpisodeRoomClient initialPayload={{
      ...initialPayload,
      room: {
        ...initialPayload.room,
        session: {
          id: "episode-room-session-1",
          startedAt: "2026-07-27T19:00:00.000Z",
          startedBy: "Episode Host",
          recordingRoomId: "call-room-1",
          recordingStartedAt: "2026-07-27T18:59:55.000Z",
        },
      },
      recordingSessions: [{
        id: "call-room-1",
        captureGroupId: "55555555-5555-4555-8555-555555555551",
        title: "Episode 5 capture",
        purpose: "PODCAST",
        status: "RECORDING",
        provider: "livekit",
        recordingStartedAt: "2026-07-27T18:59:55.000Z",
        endedAt: null,
        updatedAt: "2026-07-27T19:00:00.000Z",
        participantRole: null,
        canUseRecordingClock: true,
        canOpenSession: false,
      }],
    }} />);

    expect(screen.getByText("Bound to Episode 5 capture")).toBeInTheDocument();
    expect(screen.getByText(
      "Capture access is separate; ask a session participant to add you if you need the raw room.",
    )).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Open session" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Use recording clock" })).toBeDisabled();
    expect(screen.getByText("Persistent live call")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open mic, camera & call" })).toBeInTheDocument();
  });

  it("pauses local playback controls when a bound Capture clock is stale", () => {
    jest.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
    render(<EpisodeRoomClient initialPayload={{
      ...initialPayload,
      room: {
        ...initialPayload.room,
        status: "paused",
        selectedClipId: "watch-clip-1",
        durationSeconds: 30,
        clips: [{
          watchId: "watch-clip-1",
          assetId: "watch-clip-1",
          sourceId: "watch-source-1",
          title: "Reference clip",
          kind: "video",
          playbackUrl: "/api/ingest/media/watch-source-1",
          durationSeconds: 30,
          importRole: "reference-clip",
          addedAt: "2026-07-27T19:00:00.000Z",
          addedBy: "Episode Host",
        }],
        session: {
          id: "episode-room-session-1",
          startedAt: "2026-07-27T19:00:00.000Z",
          startedBy: "Episode Host",
          recordingRoomId: "call-room-1",
          recordingStartedAt: "2026-07-27T18:59:55.000Z",
        },
      },
      recordingSessions: [{
        id: "call-room-1",
        captureGroupId: "55555555-5555-4555-8555-555555555551",
        title: "Stopped Episode 5 capture",
        purpose: "PODCAST",
        status: "OPEN",
        provider: "livekit",
        recordingStartedAt: "2026-07-27T18:59:55.000Z",
        endedAt: "2026-07-27T19:01:00.000Z",
        updatedAt: "2026-07-27T19:01:00.000Z",
        participantRole: "HOST",
        canUseRecordingClock: false,
        canOpenSession: true,
      }],
    }} />);

    expect(screen.getByText(
      "This recording clock is no longer live. Start a rehearsal clock before creating new shared-watch receipts, or begin a new Capture recording and bind that clock.",
    )).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Play for everyone" })).toBeDisabled();
    expect(screen.getByRole("slider", { name: "Shared clip position" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Switch to rehearsal clock" })).toBeEnabled();
  });

  it("shows an exact current-pass sync as complete and starts a distinct next pass", () => {
    jest.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
    render(<EpisodeRoomClient initialPayload={{
      ...initialPayload,
      room: {
        ...initialPayload.room,
        revision: 5,
        status: "paused",
        selectedClipId: "watch-clip-1",
        durationSeconds: 30,
        clips: [{
          watchId: "watch-clip-1",
          assetId: "watch-clip-1",
          sourceId: "watch-source-1",
          title: "Reference clip",
          kind: "video",
          playbackUrl: "/api/ingest/media/watch-source-1",
          durationSeconds: 30,
          importRole: "reference-clip",
          addedAt: "2026-07-27T19:00:00.000Z",
          addedBy: "Episode Host",
        }],
        session: {
          id: "rehearsal-pass-1",
          startedAt: "2026-07-27T19:00:00.000Z",
          startedBy: "Episode Host",
        },
        segments: [{
          id: "watch-segment-1",
          sessionId: "rehearsal-pass-1",
          clipId: "watch-clip-1",
          startedAt: "2026-07-27T19:00:05.000Z",
          endedAt: "2026-07-27T19:00:10.000Z",
          sourceStartSeconds: 2,
          sourceEndSeconds: 7,
          episodeStartSeconds: 5,
          episodeEndSeconds: 10,
          startReceiptId: "receipt-play-1",
          endReceiptId: "receipt-pause-1",
        }],
        timelineSync: {
          syncedAt: "2026-07-27T19:00:11.000Z",
          syncedBy: "Episode Host",
          sourceRevision: 5,
          segmentCount: 1,
          timelineClipCount: 1,
          sourceSegmentIds: ["watch-segment-1"],
        },
      },
      timelineClipCount: 1,
    }} />);

    expect(screen.getByRole("button", { name: "Timeline up to date" })).toBeDisabled();
    expect(screen.getByText(/Timeline current · last synced by Episode Host/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Review production timeline" })).toHaveAttribute(
      "href",
      "/editor?project=high-ground-odyssey&episode=episode-5",
    );
    expect(screen.getByRole("button", { name: "Start new rehearsal pass" })).toBeEnabled();
  });

  it("offers an explicit clear when a new empty pass replaces old Watch derivatives", () => {
    render(<EpisodeRoomClient initialPayload={{
      ...initialPayload,
      room: {
        ...initialPayload.room,
        revision: 6,
        session: {
          id: "rehearsal-pass-2",
          startedAt: "2026-07-27T19:10:00.000Z",
          startedBy: "Episode Host",
        },
        segments: [{
          id: "watch-segment-old",
          sessionId: "rehearsal-pass-1",
          clipId: "watch-clip-old",
          startedAt: "2026-07-27T19:00:05.000Z",
          endedAt: "2026-07-27T19:00:10.000Z",
          sourceStartSeconds: 2,
          sourceEndSeconds: 7,
          episodeStartSeconds: 5,
          episodeEndSeconds: 10,
          startReceiptId: "receipt-play-old",
          endReceiptId: "receipt-pause-old",
        }],
        timelineSync: {
          syncedAt: "2026-07-27T19:00:11.000Z",
          syncedBy: "Episode Host",
          sourceRevision: 5,
          segmentCount: 1,
          timelineClipCount: 1,
          sourceSegmentIds: ["watch-segment-old"],
        },
      },
      timelineClipCount: 1,
    }} />);

    expect(screen.getByRole("button", { name: "Clear previous watch pass" })).toBeEnabled();
    expect(screen.getByText(/Timeline needs review/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start new rehearsal pass" })).toBeEnabled();
  });

  it("keeps the first rehearsal action unambiguous before any clock exists", () => {
    render(<EpisodeRoomClient initialPayload={initialPayload} />);

    expect(screen.getByRole("button", { name: "Start rehearsal clock" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Watch a clip to build timeline" })).toBeDisabled();
  });

  it("ends a saved range from the shared clock when local playback is blocked", async () => {
    jest.setSystemTime(new Date("2026-07-30T10:00:09.000Z"));
    jest.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
    jest.spyOn(HTMLMediaElement.prototype, "play").mockRejectedValue(
      new DOMException("Autoplay blocked", "NotAllowedError"),
    );
    const playingRoom = {
      ...initialPayload.room,
      revision: 1,
      status: "playing" as const,
      selectedClipId: "media-vault-clip:curiosity-opening",
      positionSeconds: 4,
      durationSeconds: 12,
      effectiveAt: "2026-07-30T10:00:00.000Z",
      session: {
        id: "rehearsal-range-pass",
        startedAt: "2026-07-30T10:00:00.000Z",
        startedBy: "Episode Host",
      },
      clips: [{
        watchId: "media-vault-clip:curiosity-opening",
        assetId: "asset-be-curious",
        sourceId: "media-vault-asset:asset-be-curious",
        title: "Curiosity opening",
        kind: "video" as const,
        playbackUrl: "/api/ingest/media/source-be-curious",
        durationSeconds: 74,
        rangeStartSeconds: 4,
        rangeEndSeconds: 12,
        addedAt: "2026-07-30T09:59:00.000Z",
        addedBy: "Episode Host",
      }],
    };
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        room: {
          ...playingRoom,
          revision: 2,
          status: "ended",
          positionSeconds: 12,
          effectiveAt: "2026-07-30T10:00:09.000Z",
        },
      }),
    } as Response);
    globalThis.fetch = fetchMock;

    render(<EpisodeRoomClient initialPayload={{
      ...initialPayload,
      room: playingRoom,
    }} />);

    await act(async () => {
      jest.advanceTimersByTime(250);
      await Promise.resolve();
      await Promise.resolve();
    });

    const [, request] = fetchMock.mock.calls.find(([, init]) => (
      init?.method === "POST"
    )) ?? [];
    expect(request).toMatchObject({ method: "POST" });
    expect(JSON.parse(String(request?.body))).toMatchObject({
      type: "ENDED",
      positionSeconds: 12,
      expectedRevision: 1,
    });
    expect(screen.getByText("ended")).toBeInTheDocument();
  });
});
