/** @jest-environment node */

import { NextRequest } from "next/server";

import { getPrismaClient } from "@/lib/prisma";
import { queueAudioMastery, readAudioMasteryStatus, reconcileAudioMastery } from "@/lib/server/audio-mastery";
import { resolveEpisodeProductionAccess } from "@/lib/server/episode-production-access";
import { authorizeStudioMediaSource } from "@/lib/server/studio-media-source-access";

import { GET, POST } from "./route";

jest.mock("@/lib/prisma", () => ({ getPrismaClient: jest.fn() }));
jest.mock("@/lib/server/episode-production-access", () => ({ resolveEpisodeProductionAccess: jest.fn() }));
jest.mock("@/lib/server/studio-media-source-access", () => ({ authorizeStudioMediaSource: jest.fn() }));
jest.mock("@/lib/server/audio-mastery", () => ({
  queueAudioMastery: jest.fn(),
  readAudioMasteryStatus: jest.fn(),
  reconcileAudioMastery: jest.fn(),
}));

const allowed = {
  allowed: true,
  actor: { id: "editor_001", email: "editor@example.test", name: "Editor", isStaff: false, source: "session" },
  access: { allowed: true, projectId: "project_001", role: "EDITOR" },
};
const coordinates = { projectSlug: "high-ground-odyssey", assetId: "asset_audio_001", sourceId: "source_audio_001" };

function post(body: unknown) {
  return new NextRequest("http://localhost/api/media-vault/audio-mastery", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("audio mastery route", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(getPrismaClient).mockReturnValue({} as never);
  });

  it("rejects malformed requests before authorization", async () => {
    const response = await POST(post({ projectSlug: coordinates.projectSlug }));
    expect(response.status).toBe(400);
    expect(resolveEpisodeProductionAccess).not.toHaveBeenCalled();
  });

  it("requires project read access before revealing measurements", async () => {
    jest.mocked(resolveEpisodeProductionAccess).mockResolvedValue({
      allowed: false,
      status: 403,
      code: "denied",
      error: "Denied.",
      actor: { id: "", email: "", name: "", isStaff: false, source: "none" },
      access: null,
    } as never);
    const response = await GET(new NextRequest(`http://localhost/api/media-vault/audio-mastery?projectSlug=${coordinates.projectSlug}&assetId=${coordinates.assetId}`));
    expect(response.status).toBe(403);
    expect(readAudioMasteryStatus).not.toHaveBeenCalled();
  });

  it("binds a stable project id to authorization and stops a mismatched locator before readback", async () => {
    jest.mocked(resolveEpisodeProductionAccess).mockResolvedValue({
      allowed: false,
      status: 404,
      code: "project-not-found",
      error: "No matching project was found.",
      actor: allowed.actor,
      access: null,
    } as never);
    const response = await GET(new NextRequest(`http://localhost/api/media-vault/audio-mastery?projectId=project_001&projectSlug=${coordinates.projectSlug}&assetId=${coordinates.assetId}`));
    expect(response.status).toBe(404);
    expect(resolveEpisodeProductionAccess).toHaveBeenCalledWith(expect.objectContaining({
      projectId: "project_001",
      projectSlug: coordinates.projectSlug,
      action: "read",
    }));
    expect(readAudioMasteryStatus).not.toHaveBeenCalled();
  });

  it("stops a mismatched stable locator before a mastering mutation", async () => {
    jest.mocked(resolveEpisodeProductionAccess).mockResolvedValue({
      allowed: false,
      status: 404,
      code: "project-not-found",
      error: "No matching project was found.",
      actor: allowed.actor,
      access: null,
    } as never);
    const response = await POST(post({ projectId: "project_001", ...coordinates }));
    expect(response.status).toBe(404);
    expect(resolveEpisodeProductionAccess).toHaveBeenCalledWith(expect.objectContaining({
      projectId: "project_001",
      projectSlug: coordinates.projectSlug,
      action: "write",
    }));
    expect(authorizeStudioMediaSource).not.toHaveBeenCalled();
    expect(queueAudioMastery).not.toHaveBeenCalled();
    expect(reconcileAudioMastery).not.toHaveBeenCalled();
  });

  it("fails closed before queueing a held source", async () => {
    jest.mocked(resolveEpisodeProductionAccess).mockResolvedValue(allowed as never);
    jest.mocked(authorizeStudioMediaSource).mockResolvedValue({ allowed: false, status: 423, errorCode: "held", error: "Held." } as never);
    const response = await POST(post(coordinates));
    expect(response.status).toBe(423);
    expect(queueAudioMastery).not.toHaveBeenCalled();
  });

  it("queues the Apple profile through the authorized actor and returns private status", async () => {
    jest.mocked(resolveEpisodeProductionAccess).mockResolvedValue(allowed as never);
    jest.mocked(authorizeStudioMediaSource).mockResolvedValue({ allowed: true } as never);
    jest.mocked(queueAudioMastery).mockResolvedValue({ status: "queued", jobId: "audio_job_001" } as never);
    const response = await POST(post(coordinates));
    expect(response.status).toBe(202);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(queueAudioMastery).toHaveBeenCalledWith({
      prisma: {},
      ...coordinates,
      profileId: "apple-podcasts-dialogue-v1",
      actorEmail: "editor@example.test",
    });
  });

  it("reconcile never promotes the verified preview", async () => {
    jest.mocked(resolveEpisodeProductionAccess).mockResolvedValue(allowed as never);
    jest.mocked(authorizeStudioMediaSource).mockResolvedValue({ allowed: true } as never);
    jest.mocked(reconcileAudioMastery).mockResolvedValue({
      status: "completed",
      boundaries: { originalRemainsSourceTruth: true, outputIsUnpromotedPreview: true, explicitApprovalStillRequired: true },
    } as never);
    const response = await POST(post({ ...coordinates, action: "reconcile" }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      boundaries: { outputIsUnpromotedPreview: true, explicitApprovalStillRequired: true },
    });
  });
});
