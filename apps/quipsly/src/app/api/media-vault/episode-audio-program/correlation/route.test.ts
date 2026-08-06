/** @jest-environment node */

import { NextRequest } from "next/server";

import { GET, POST } from "./route";

const access = jest.fn();
const read = jest.fn();
const queue = jest.fn();
const reconcile = jest.fn();

jest.mock("@/lib/prisma", () => ({ getPrismaClient: () => ({ marker: "prisma" }) }));
jest.mock("@/lib/server/episode-production-access", () => ({ resolveEpisodeProductionAccess: (...args: unknown[]) => access(...args) }));
jest.mock("@/lib/server/episode-audio-pair-correlation", () => ({
  EpisodeAudioPairCorrelationError: class EpisodeAudioPairCorrelationError extends Error { constructor(message: string, readonly status: number, readonly code: string) { super(message); } },
  readEpisodeAudioPairCorrelation: (...args: unknown[]) => read(...args),
  queueEpisodeAudioPairCorrelation: (...args: unknown[]) => queue(...args),
  reconcileEpisodeAudioPairCorrelation: (...args: unknown[]) => reconcile(...args),
}));

const coordinates = { projectId: "project-1", projectSlug: "project-one", episodeProductionId: "episode-one", analysisReceiptId: "analysis-one", activityMomentId: "overlap-1", referenceAssetId: "asset-reference", observationAssetId: "asset-observation" };

describe("Episode audio pair correlation route", () => {
  beforeEach(() => { jest.clearAllMocks(); access.mockResolvedValue({ allowed: true, actor: { id: "editor-1", email: "editor@example.test" } }); });

  it("requires permission-filtered read access", async () => {
    access.mockResolvedValue({ allowed: false, status: 403, code: "FORBIDDEN", error: "No access." });
    const response = await GET(new NextRequest(`http://localhost/api/media-vault/episode-audio-program/correlation?${new URLSearchParams(coordinates)}`));
    expect(response.status).toBe(403);
    expect(read).not.toHaveBeenCalled();
  });

  it("queues only the exact authenticated analysis pair", async () => {
    queue.mockResolvedValue({ jobId: "audio-pair-1", status: "queued" });
    const response = await POST(new NextRequest("http://localhost/api/media-vault/episode-audio-program/correlation", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...coordinates, operation: "queue" }) }));
    expect(response.status).toBe(202);
    expect(queue).toHaveBeenCalledWith(expect.objectContaining({ prisma: { marker: "prisma" }, actorEmail: "editor@example.test", analysisReceiptId: "analysis-one", referenceAssetId: "asset-reference", observationAssetId: "asset-observation" }));
  });

  it("rejects incomplete or unsupported writes before authorization", async () => {
    const response = await POST(new NextRequest("http://localhost/api/media-vault/episode-audio-program/correlation", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ operation: "classify" }) }));
    expect(response.status).toBe(400);
    expect(access).not.toHaveBeenCalled();
    expect(queue).not.toHaveBeenCalled();
    expect(reconcile).not.toHaveBeenCalled();
  });
});
