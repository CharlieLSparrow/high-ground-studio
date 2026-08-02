/** @jest-environment node */

import { NextRequest } from "next/server";

import { getPrismaClient } from "@/lib/prisma";
import {
  queueEpisodeCollaborationProxy,
  readEpisodeCollaborationProxyStatus,
  reconcileEpisodeCollaborationProxy,
} from "@/lib/server/episode-collaboration-proxy";
import { resolveEpisodeProductionAccess } from "@/lib/server/episode-production-access";
import { authorizeStudioMediaSource } from "@/lib/server/studio-media-source-access";

import { GET, POST } from "./route";

jest.mock("@/lib/prisma", () => ({ getPrismaClient: jest.fn() }));
jest.mock("@/lib/server/episode-production-access", () => ({
  resolveEpisodeProductionAccess: jest.fn(),
}));
jest.mock("@/lib/server/studio-media-source-access", () => ({
  authorizeStudioMediaSource: jest.fn(),
}));
jest.mock("@/lib/server/episode-collaboration-proxy", () => ({
  queueEpisodeCollaborationProxy: jest.fn(),
  readEpisodeCollaborationProxyStatus: jest.fn(),
  reconcileEpisodeCollaborationProxy: jest.fn(),
}));

const coordinates = {
  projectSlug: "high-ground-odyssey",
  episodeSlug: "episode-8-i-wasnt-born-a-leader",
  assetId: "raw-asset-1",
  sourceId: "raw-source-1",
};

function postRequest(body: unknown) {
  return new NextRequest("http://localhost/api/episode-production/collaboration-proxy", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function getRequest(query: Record<string, string>) {
  const params = new URLSearchParams(query);
  return new NextRequest(`http://localhost/api/episode-production/collaboration-proxy?${params}`);
}

const allowedAccess = {
  allowed: true,
  actor: {
    id: "editor-1",
    email: "editor@example.test",
    name: "Episode Editor",
    isStaff: false,
    source: "embedded-cookie",
  },
  access: { allowed: true, projectId: "project-1", role: "EDITOR" },
};

describe("episode collaboration proxy route", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(getPrismaClient).mockReturnValue({} as never);
  });

  it("rejects malformed queue requests before authorization", async () => {
    const response = await POST(postRequest({ projectSlug: coordinates.projectSlug }));

    expect(response.status).toBe(400);
    expect(resolveEpisodeProductionAccess).not.toHaveBeenCalled();
    expect(queueEpisodeCollaborationProxy).not.toHaveBeenCalled();
  });

  it("requires read access before revealing durable job status", async () => {
    jest.mocked(resolveEpisodeProductionAccess).mockResolvedValue({
      allowed: false,
      status: 401,
      code: "episode-production-auth-required",
      error: "Sign in required.",
      actor: { id: "", email: "", name: "", isStaff: false, source: "none" },
      access: null,
    } as never);

    const response = await GET(getRequest(coordinates));

    expect(response.status).toBe(401);
    expect(readEpisodeCollaborationProxyStatus).not.toHaveBeenCalled();
  });

  it("returns private no-store status only after read authorization", async () => {
    jest.mocked(resolveEpisodeProductionAccess).mockResolvedValue(allowedAccess as never);
    jest.mocked(readEpisodeCollaborationProxyStatus).mockResolvedValue({
      jobId: "proxy-job-1",
      status: "processing",
      progress: 0.4,
    } as never);

    const response = await GET(getRequest(coordinates));

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(readEpisodeCollaborationProxyStatus).toHaveBeenCalledWith({
      prisma: {},
      projectSlug: coordinates.projectSlug,
      episodeSlug: coordinates.episodeSlug,
      rawAssetId: coordinates.assetId,
    });
  });

  it("does not inspect or queue a source without project write access", async () => {
    jest.mocked(resolveEpisodeProductionAccess).mockResolvedValue({
      allowed: false,
      status: 403,
      code: "episode-production-access-denied",
      error: "No write access.",
      actor: { id: "", email: "", name: "", isStaff: false, source: "none" },
      access: null,
    } as never);

    const response = await POST(postRequest({ ...coordinates, action: "queue" }));

    expect(response.status).toBe(403);
    expect(authorizeStudioMediaSource).not.toHaveBeenCalled();
    expect(queueEpisodeCollaborationProxy).not.toHaveBeenCalled();
  });

  it("fails closed when the exact raw source is held", async () => {
    jest.mocked(resolveEpisodeProductionAccess).mockResolvedValue(allowedAccess as never);
    jest.mocked(authorizeStudioMediaSource).mockResolvedValue({
      allowed: false,
      status: 423,
      errorCode: "studio-media-source-held",
      error: "Source is held.",
    } as never);

    const response = await POST(postRequest({ ...coordinates, action: "queue" }));

    expect(response.status).toBe(423);
    expect(queueEpisodeCollaborationProxy).not.toHaveBeenCalled();
  });

  it("binds queue and reconcile operations to the authorized actor and source", async () => {
    jest.mocked(resolveEpisodeProductionAccess).mockResolvedValue(allowedAccess as never);
    jest.mocked(authorizeStudioMediaSource).mockResolvedValue({ allowed: true } as never);
    jest.mocked(queueEpisodeCollaborationProxy).mockResolvedValue({
      jobId: "proxy-job-1",
      status: "queued",
      progress: 0,
    } as never);
    jest.mocked(reconcileEpisodeCollaborationProxy).mockResolvedValue({
      jobId: "proxy-job-1",
      status: "completed",
      progress: 1,
      proxyUrl: "/api/media/proxy-1",
    } as never);

    const queued = await POST(postRequest({ ...coordinates, action: "queue" }));
    const reconciled = await POST(postRequest({ ...coordinates, action: "reconcile" }));

    expect(queued.status).toBe(202);
    expect(reconciled.status).toBe(200);
    expect(authorizeStudioMediaSource).toHaveBeenCalledWith({
      prisma: {},
      actor: {
        id: "editor-1",
        email: "editor@example.test",
        isStaff: false,
      },
      sourceId: coordinates.sourceId,
    });
    expect(queueEpisodeCollaborationProxy).toHaveBeenCalledWith({
      prisma: {},
      projectSlug: coordinates.projectSlug,
      episodeSlug: coordinates.episodeSlug,
      rawAssetId: coordinates.assetId,
      sourceId: coordinates.sourceId,
      actorUserId: "editor-1",
      actorEmail: "editor@example.test",
    });
    expect(reconcileEpisodeCollaborationProxy).toHaveBeenCalledWith({
      prisma: {},
      projectSlug: coordinates.projectSlug,
      episodeSlug: coordinates.episodeSlug,
      rawAssetId: coordinates.assetId,
      sourceId: coordinates.sourceId,
    });
  });
});
