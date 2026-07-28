import { act, render, screen } from "@testing-library/react";

import { EPISODE_ROOM_VERSION } from "@/lib/episode-room/episode-room-contract";
import type { EpisodeRoomDeskPayload } from "@/lib/server/episode-room-store";

import EpisodeRoomClient from "./EpisodeRoomClient";

jest.mock("./EpisodeRoomChat", () => function EpisodeRoomChatStub() {
  return <section>Episode chat</section>;
});

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
  recordingSessions: [],
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
  });
});
