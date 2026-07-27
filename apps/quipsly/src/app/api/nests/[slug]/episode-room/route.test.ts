/** @jest-environment node */

import { NextRequest } from "next/server";

import { getPrismaClient } from "@/lib/prisma";
import {
  EpisodeRoomRevisionConflict,
  applyEpisodeRoomStoreCommand,
  loadEpisodeRoomRuntime,
} from "@/lib/server/episode-room-store";
import { resolveEpisodeProductionAccess } from "@/lib/server/episode-production-access";

import { GET, POST } from "./route";

jest.mock("@/lib/prisma", () => ({ getPrismaClient: jest.fn() }));
jest.mock("@/lib/server/episode-production-access", () => ({
  resolveEpisodeProductionAccess: jest.fn(),
}));
jest.mock("@/lib/server/studio-project-access", () => ({
  roleAllowsAction: jest.fn(() => true),
}));
jest.mock("@/lib/server/episode-room-store", () => {
  class CommandError extends Error {}
  class RevisionConflict extends Error {
    currentRevision: number;

    constructor(currentRevision: number) {
      super(`Expected an older Episode Room revision. Current revision is ${currentRevision}.`);
      this.currentRevision = currentRevision;
    }
  }
  return {
    EpisodeRoomCommandError: CommandError,
    EpisodeRoomRevisionConflict: RevisionConflict,
    applyEpisodeRoomStoreCommand: jest.fn(),
    importEpisodeRoomText: jest.fn(),
    loadEpisodeRoomDesk: jest.fn(),
    loadEpisodeRoomRuntime: jest.fn(),
  };
});

const params = {
  params: Promise.resolve({ slug: "high-ground-odyssey" }),
};

function request(body: unknown) {
  return new NextRequest(
    "http://localhost/api/nests/high-ground-odyssey/episode-room",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    },
  );
}

describe("Episode Room command route", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(getPrismaClient).mockReturnValue({} as never);
  });

  it("rejects malformed commands before authorization or persistence", async () => {
    const response = await POST(request({
      episodeSlug: "episode-4-part-2",
      type: "PLAY",
    }), params);

    expect(response.status).toBe(400);
    expect(resolveEpisodeProductionAccess).not.toHaveBeenCalled();
    expect(applyEpisodeRoomStoreCommand).not.toHaveBeenCalled();
  });

  it("requires project write access before shared playback changes", async () => {
    jest.mocked(resolveEpisodeProductionAccess).mockResolvedValue({
      allowed: false,
      status: 403,
      code: "episode-production-access-denied",
      error: "No write access.",
      actor: { id: "", email: "", name: "", isStaff: false, source: "none" },
      access: null,
    } as never);

    const response = await POST(request({
      episodeSlug: "episode-4-part-2",
      type: "PLAY",
      clientRequestId: "play:request-1",
      expectedRevision: 7,
      positionSeconds: 12.5,
    }), params);

    expect(response.status).toBe(403);
    expect(applyEpisodeRoomStoreCommand).not.toHaveBeenCalled();
  });

  it("binds the accepted command to the authenticated editor", async () => {
    jest.mocked(resolveEpisodeProductionAccess).mockResolvedValue({
      allowed: true,
      actor: {
        id: "user-1",
        email: "editor@example.test",
        name: "Episode Editor",
        isStaff: false,
        source: "embedded-cookie",
      },
      access: {
        allowed: true,
        projectId: "project-1",
        role: "EDITOR",
      },
    } as never);
    jest.mocked(applyEpisodeRoomStoreCommand).mockResolvedValue({
      room: { revision: 8 },
      updatedAt: "2026-07-26T21:51:14.772Z",
      timelineClipCount: 2,
      importedCandidates: [],
    } as never);

    const response = await POST(request({
      episodeSlug: "episode-4-part-2",
      type: "PAUSE",
      clientRequestId: "pause:request-1",
      expectedRevision: 7,
      positionSeconds: 12.5,
    }), params);

    expect(response.status).toBe(200);
    expect(applyEpisodeRoomStoreCommand).toHaveBeenCalledWith({
      projectSlug: "high-ground-odyssey",
      episodeSlug: "episode-4-part-2",
      input: {
        type: "PAUSE",
        clientRequestId: "pause:request-1",
        expectedRevision: 7,
        positionSeconds: 12.5,
      },
      actor: {
        userId: "user-1",
        email: "editor@example.test",
        label: "Episode Editor",
        isStaff: false,
      },
    });
  });

  it("returns the authoritative revision on a write conflict", async () => {
    jest.mocked(resolveEpisodeProductionAccess).mockResolvedValue({
      allowed: true,
      actor: {
        id: "user-1",
        email: "editor@example.test",
        name: "Episode Editor",
        isStaff: false,
        source: "embedded-cookie",
      },
      access: {
        allowed: true,
        projectId: "project-1",
        role: "EDITOR",
      },
    } as never);
    jest.mocked(applyEpisodeRoomStoreCommand).mockRejectedValue(
      new EpisodeRoomRevisionConflict(9),
    );

    const response = await POST(request({
      episodeSlug: "episode-4-part-2",
      type: "PLAY",
      clientRequestId: "play:stale-request",
      expectedRevision: 7,
      positionSeconds: 3,
    }), params);

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      code: "episode-room-revision-conflict",
      currentRevision: 9,
    });
  });

  it("never accepts a client-authored recording start timestamp", async () => {
    jest.mocked(resolveEpisodeProductionAccess).mockResolvedValue({
      allowed: true,
      actor: {
        id: "user-1",
        email: "editor@example.test",
        name: "Episode Editor",
        isStaff: false,
        source: "embedded-cookie",
      },
      access: {
        allowed: true,
        projectId: "project-1",
        role: "EDITOR",
      },
    } as never);
    jest.mocked(applyEpisodeRoomStoreCommand).mockResolvedValue({
      room: { revision: 2 },
      updatedAt: "2026-07-26T21:51:14.772Z",
      timelineClipCount: 0,
      importedCandidates: [],
      recordingSessions: [],
    } as never);

    const response = await POST(request({
      episodeSlug: "episode-4-part-2",
      type: "START_SESSION",
      recordingRoomId: "call-room-1",
      recordingStartedAt: "1999-01-01T00:00:00.000Z",
      clientRequestId: "bind:request-1",
      expectedRevision: 1,
    }), params);

    expect(response.status).toBe(200);
    expect(applyEpisodeRoomStoreCommand).toHaveBeenCalledWith(expect.objectContaining({
      input: {
        type: "START_SESSION",
        recordingRoomId: "call-room-1",
        clientRequestId: "bind:request-1",
        expectedRevision: 1,
      },
    }));
  });
});

describe("Episode Room runtime route", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(getPrismaClient).mockReturnValue({} as never);
  });

  it("passes the caller's opaque writing version to the shared snapshot loader", async () => {
    jest.mocked(resolveEpisodeProductionAccess).mockResolvedValue({
      allowed: true,
      actor: {
        id: "user-1",
        email: "editor@example.test",
        name: "Episode Editor",
        isStaff: false,
        source: "embedded-cookie",
      },
      access: {
        allowed: true,
        projectId: "project-1",
        role: "EDITOR",
      },
    } as never);
    jest.mocked(loadEpisodeRoomRuntime).mockResolvedValue({
      room: { revision: 8 },
      writing: {
        version: "writing-version-8",
        updatedAt: "2026-07-27T10:00:00.000Z",
        blockCount: 4,
        visibleBlockCount: 4,
        truncated: false,
      },
      updatedAt: "2026-07-27T10:00:00.000Z",
      timelineClipCount: 2,
      importedCandidates: [],
      recordingSessions: [],
    } as never);

    const response = await GET(new NextRequest(
      "http://localhost/api/nests/high-ground-odyssey/episode-room?episode=episode-4-part-2&runtime=1&writingVersion=writing-version-7",
    ), params);

    expect(response.status).toBe(200);
    expect(loadEpisodeRoomRuntime).toHaveBeenCalledWith(
      "high-ground-odyssey",
      "episode-4-part-2",
      {
        userId: "user-1",
        email: "editor@example.test",
        label: "Episode Editor",
        isStaff: false,
      },
      "writing-version-7",
    );
  });
});
