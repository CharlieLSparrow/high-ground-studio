/** @jest-environment node */

import { NextRequest } from "next/server";

import { getPrismaClient } from "@/lib/prisma";
import {
  EpisodeRoomRevisionConflict,
  applyEpisodeRoomStoreCommand,
  loadEpisodeRoomRuntime,
  loadEpisodeRoomVault,
  loadEpisodeRoomWritingRuntime,
  loadEpisodeRoomWatchRuntime,
} from "@/lib/server/episode-room-store";
import { resolveEpisodeProductionAccess } from "@/lib/server/episode-production-access";
import { roleAllowsAction } from "@/lib/server/studio-project-access";

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
    loadEpisodeRoomVault: jest.fn(),
    loadEpisodeRoomWritingRuntime: jest.fn(),
    loadEpisodeRoomWatchRuntime: jest.fn(),
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
    jest.mocked(roleAllowsAction).mockReturnValue(true);
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

  it("imports one same-Nest Media Vault source through the authoritative store", async () => {
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
      room: { revision: 3 },
      updatedAt: "2026-07-30T21:51:14.772Z",
      timelineClipCount: 0,
      importedCandidates: [],
      recordingSessions: [],
    } as never);

    const response = await POST(request({
      episodeSlug: "episode-4-part-2",
      type: "IMPORT_VAULT_ASSET",
      assetId: "asset-in-this-nest",
      mediaClipId: "saved-clip-opening",
      clientRequestId: "vault:request-1",
      expectedRevision: 2,
    }), params);

    expect(response.status).toBe(200);
    expect(applyEpisodeRoomStoreCommand).toHaveBeenCalledWith(expect.objectContaining({
      input: {
        type: "IMPORT_VAULT_ASSET",
        assetId: "asset-in-this-nest",
        mediaClipId: "saved-clip-opening",
        clientRequestId: "vault:request-1",
        expectedRevision: 2,
      },
    }));
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
    jest.mocked(roleAllowsAction).mockReturnValue(true);
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
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      canEdit: true,
      room: { revision: 8 },
    });
  });

  it("serves the native Watch poll without loading the writing or editor runtime", async () => {
    jest.mocked(resolveEpisodeProductionAccess).mockResolvedValue({
      allowed: true,
      actor: {
        id: "user-1",
        email: "editor@example.test",
        name: "Episode Editor",
        isStaff: false,
        source: "firebase-bearer",
      },
      access: {
        allowed: true,
        projectId: "project-1",
        role: "EDITOR",
      },
    } as never);
    jest.mocked(loadEpisodeRoomWatchRuntime).mockResolvedValue({
      room: {
        version: "quipsly-episode-room.v1",
        revision: 8,
        status: "paused",
        positionSeconds: 0,
        effectiveAt: "2026-07-29T10:00:00.000Z",
        clips: [],
        segments: [],
        receipts: [],
      },
      updatedAt: "2026-07-29T10:00:00.000Z",
    } as never);

    const response = await GET(new NextRequest(
      "http://localhost/api/nests/high-ground-odyssey/episode-room?episode=episode-4-part-2&watch=1",
      { headers: { authorization: "Bearer firebase-id-token" } },
    ), params);

    expect(response.status).toBe(200);
    expect(loadEpisodeRoomWatchRuntime).toHaveBeenCalledWith(
      "high-ground-odyssey",
      "episode-4-part-2",
    );
    expect(loadEpisodeRoomRuntime).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      canEdit: true,
      room: { revision: 8, status: "paused" },
      watchProtocol: 1,
      watchUpgradeRequired: false,
      serverNow: expect.any(String),
    });
  });

  it("serves exact saved ranges only to the negotiated native Watch protocol", async () => {
    jest.mocked(resolveEpisodeProductionAccess).mockResolvedValue({
      allowed: true,
      actor: {
        id: "user-1",
        email: "editor@example.test",
        name: "Episode Editor",
        isStaff: false,
        source: "firebase-bearer",
      },
      access: {
        allowed: true,
        projectId: "project-1",
        role: "EDITOR",
      },
    } as never);
    const rangeRoom = {
      version: "quipsly-episode-room.v1",
      revision: 9,
      status: "paused",
      selectedClipId: "media-vault-clip:range-1",
      positionSeconds: 4,
      effectiveAt: "2026-07-29T10:00:00.000Z",
      durationSeconds: 12,
      clips: [{
        watchId: "media-vault-clip:range-1",
        assetId: "asset-1",
        title: "Opening exchange",
        kind: "video",
        playbackUrl: "/api/ingest/media/source-1",
        durationSeconds: 74,
        rangeStartSeconds: 4,
        rangeEndSeconds: 12,
        addedAt: "2026-07-29T09:59:00.000Z",
        addedBy: "Episode Editor",
      }],
      segments: [],
      receipts: [],
    };
    jest.mocked(loadEpisodeRoomWatchRuntime).mockResolvedValue({
      room: rangeRoom,
      updatedAt: "2026-07-29T10:00:00.000Z",
    } as never);

    const response = await GET(new NextRequest(
      "http://localhost/api/nests/high-ground-odyssey/episode-room?episode=episode-4-part-2&watch=1&watchProtocol=2",
      { headers: { authorization: "Bearer firebase-id-token" } },
    ), params);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      canEdit: true,
      watchProtocol: 2,
      watchUpgradeRequired: false,
      room: {
        status: "paused",
        selectedClipId: "media-vault-clip:range-1",
        positionSeconds: 4,
        clips: [{
          watchId: "media-vault-clip:range-1",
          rangeStartSeconds: 4,
          rangeEndSeconds: 12,
        }],
      },
    });
  });

  it("fails legacy native Watch safely closed while an exact range is selected", async () => {
    jest.mocked(resolveEpisodeProductionAccess).mockResolvedValue({
      allowed: true,
      actor: {
        id: "user-1",
        email: "editor@example.test",
        name: "Episode Editor",
        isStaff: false,
        source: "firebase-bearer",
      },
      access: {
        allowed: true,
        projectId: "project-1",
        role: "EDITOR",
      },
    } as never);
    jest.mocked(loadEpisodeRoomWatchRuntime).mockResolvedValue({
      room: {
        version: "quipsly-episode-room.v1",
        revision: 9,
        status: "playing",
        selectedClipId: "media-vault-clip:range-1",
        positionSeconds: 8,
        effectiveAt: "2026-07-29T10:00:00.000Z",
        durationSeconds: 12,
        clips: [{
          watchId: "media-vault-clip:range-1",
          assetId: "asset-1",
          title: "Opening exchange",
          kind: "video",
          playbackUrl: "/api/ingest/media/source-1",
          durationSeconds: 74,
          rangeStartSeconds: 4,
          rangeEndSeconds: 12,
          addedAt: "2026-07-29T09:59:00.000Z",
          addedBy: "Episode Editor",
        }],
        segments: [],
        receipts: [],
      },
      updatedAt: "2026-07-29T10:00:00.000Z",
    } as never);

    const response = await GET(new NextRequest(
      "http://localhost/api/nests/high-ground-odyssey/episode-room?episode=episode-4-part-2&watch=1",
      { headers: { authorization: "Bearer firebase-id-token" } },
    ), params);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      canEdit: false,
      watchProtocol: 1,
      watchUpgradeRequired: true,
      room: {
        revision: 9,
        status: "idle",
        positionSeconds: 0,
        clips: [],
      },
    });
  });

  it("loads Media Vault candidates only on the explicit vault projection", async () => {
    jest.mocked(roleAllowsAction).mockReturnValue(false);
    jest.mocked(resolveEpisodeProductionAccess).mockResolvedValue({
      allowed: true,
      actor: {
        id: "user-1",
        email: "viewer@example.test",
        name: "Episode Viewer",
        isStaff: false,
        source: "embedded-cookie",
      },
      access: {
        allowed: true,
        projectId: "project-1",
        role: "VIEWER",
      },
    } as never);
    jest.mocked(loadEpisodeRoomVault).mockResolvedValue([{
      assetId: "asset-1",
      title: "Be Curious.mp4",
      kind: "video",
      mimeType: "video/mp4",
      playbackUrl: "/api/ingest/media/source-1",
      thumbnailUrl: null,
      updatedAt: "2026-07-30T10:00:00.000Z",
      savedClipCount: 1,
      savedClipTitles: ["Opening exchange"],
      savedClips: [{
        mediaClipId: "media-clip-1",
        watchId: "media-vault-clip:media-clip-1",
        title: "Opening exchange",
        rangeStartSeconds: 4,
        rangeEndSeconds: 12,
        durationSeconds: 8,
        attached: false,
      }],
      imported: false,
      attached: false,
      canAddToWatch: true,
      readinessLabel: "playback ready",
    }]);

    const response = await GET(new NextRequest(
      "http://localhost/api/nests/high-ground-odyssey/episode-room?episode=episode-4-part-2&vault=1",
    ), params);

    expect(response.status).toBe(200);
    expect(loadEpisodeRoomVault).toHaveBeenCalledWith(
      "high-ground-odyssey",
      "episode-4-part-2",
    );
    expect(loadEpisodeRoomRuntime).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      canEdit: false,
      vaultCandidates: [{
        assetId: "asset-1",
        savedClipTitles: ["Opening exchange"],
      }],
    });
  });

  it("serves the native manuscript without loading Watch or the full editor runtime", async () => {
    jest.mocked(resolveEpisodeProductionAccess).mockResolvedValue({
      allowed: true,
      actor: {
        id: "user-1",
        email: "editor@example.test",
        name: "Episode Editor",
        isStaff: false,
        source: "firebase-bearer",
      },
      access: {
        allowed: true,
        projectId: "project-1",
        role: "EDITOR",
      },
    } as never);
    jest.mocked(loadEpisodeRoomWritingRuntime).mockResolvedValue({
      episode: {
        id: "episode-1",
        slug: "episode-4-part-2",
        title: "The Swear Jar",
        status: "WRITING",
        updatedAt: "2026-07-29T10:00:00.000Z",
        documentId: "document-1",
        documentTitle: "High Ground Odyssey Episode 4",
      },
      writing: {
        version: "writing-version-8",
        updatedAt: "2026-07-29T10:00:00.000Z",
        blockCount: 34,
        visibleBlockCount: 34,
        truncated: false,
        textBlocks: [{
          id: "block-1",
          stableId: "swear-jar-opening",
          order: 1,
          title: "Homer",
          body: "Opening rehearsal line.",
        }],
      },
    });

    const response = await GET(new NextRequest(
      "http://localhost/api/nests/high-ground-odyssey/episode-room?episode=episode-4-part-2&writing=1&writingVersion=writing-version-7",
      { headers: { authorization: "Bearer firebase-id-token" } },
    ), params);

    expect(response.status).toBe(200);
    expect(loadEpisodeRoomWritingRuntime).toHaveBeenCalledWith(
      "high-ground-odyssey",
      "episode-4-part-2",
      "writing-version-7",
    );
    expect(loadEpisodeRoomRuntime).not.toHaveBeenCalled();
    expect(loadEpisodeRoomWatchRuntime).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      canEdit: true,
      episode: { title: "The Swear Jar" },
      writing: { version: "writing-version-8", blockCount: 34 },
      serverNow: expect.any(String),
    });
  });
});
