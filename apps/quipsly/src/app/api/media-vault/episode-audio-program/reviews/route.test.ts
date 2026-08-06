/** @jest-environment node */

import { NextRequest } from "next/server";

import { GET, POST } from "./route";

const access = jest.fn();
const read = jest.fn();
const register = jest.fn();

jest.mock("@/lib/prisma", () => ({ getPrismaClient: () => ({ marker: "prisma" }) }));
jest.mock("@/lib/server/episode-production-access", () => ({ resolveEpisodeProductionAccess: (...args: unknown[]) => access(...args) }));
jest.mock("@/lib/server/episode-audio-activity-review", () => ({
  EpisodeAudioActivityReviewError: class EpisodeAudioActivityReviewError extends Error {
    constructor(message: string, readonly status: number, readonly code: string) { super(message); }
  },
  readEpisodeAudioActivityReviews: (...args: unknown[]) => read(...args),
  registerEpisodeAudioActivityReview: (...args: unknown[]) => register(...args),
}));

describe("Episode audio activity review route", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    access.mockResolvedValue({ allowed: true, actor: { id: "editor-1", email: "editor@example.test" } });
  });

  it("requires permission-filtered read access", async () => {
    access.mockResolvedValue({ allowed: false, status: 403, code: "FORBIDDEN", error: "No access." });
    const response = await GET(new NextRequest("http://localhost/api/media-vault/episode-audio-program/reviews?projectSlug=project-one&episodeProductionId=episode-one"));
    expect(response.status).toBe(403);
    expect(read).not.toHaveBeenCalled();
  });

  it("binds the authenticated actor to a write", async () => {
    register.mockResolvedValue({ ok: true, idempotentReplay: false, review: { id: "review-1" } });
    const response = await POST(new NextRequest("http://localhost/api/media-vault/episode-audio-program/reviews", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ projectId: "project-1", projectSlug: "project-one", episodeProductionId: "episode-one", analysisId: "analysis-1", eventId: "event-1", decision: "needs-comparison", playbackEvidence: { schema: "evidence" }, clientRequestId: "request-1" }) }));
    expect(response.status).toBe(201);
    expect(register).toHaveBeenCalledWith(expect.objectContaining({ prisma: { marker: "prisma" }, actor: { id: "editor-1", email: "editor@example.test" }, analysisId: "analysis-1", eventId: "event-1", decision: "needs-comparison" }));
  });

  it("rejects incomplete writes before checking access", async () => {
    const response = await POST(new NextRequest("http://localhost/api/media-vault/episode-audio-program/reviews", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }));
    expect(response.status).toBe(400);
    expect(access).not.toHaveBeenCalled();
    expect(register).not.toHaveBeenCalled();
  });
});
