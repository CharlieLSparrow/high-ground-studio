/** @jest-environment node */

import { NextRequest } from "next/server";

import { getPrismaClient } from "@/lib/prisma";
import { appendAudibleEventReview, readAudibleEventReviewStatus } from "@/lib/server/audible-event-review";
import { resolveEpisodeProductionAccess } from "@/lib/server/episode-production-access";
import { authorizeStudioMediaSource } from "@/lib/server/studio-media-source-access";

import { GET, POST } from "./route";

jest.mock("@/lib/prisma", () => ({ getPrismaClient: jest.fn() }));
jest.mock("@/lib/server/episode-production-access", () => ({ resolveEpisodeProductionAccess: jest.fn() }));
jest.mock("@/lib/server/studio-media-source-access", () => ({ authorizeStudioMediaSource: jest.fn() }));
jest.mock("@/lib/server/audible-event-review", () => ({
  AudibleEventReviewError: class AudibleEventReviewError extends Error { constructor(message: string, readonly status: number, readonly code: string) { super(message); } },
  appendAudibleEventReview: jest.fn(),
  readAudibleEventReviewStatus: jest.fn(),
}));

const coordinates = { projectSlug: "high-ground-odyssey", assetId: "asset-audio-1", sourceId: "source-audio-1" };
const actor = { id: "editor-1", email: "editor@example.test", isStaff: false, name: "Editor", source: "session" };
function request(body: unknown) { return new NextRequest("http://localhost/api/media-vault/audible-event-reviews", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }); }
function query() { return new NextRequest(`http://localhost/api/media-vault/audible-event-reviews?${new URLSearchParams(coordinates)}`); }

describe("audible-event review route", () => {
  beforeEach(() => { jest.clearAllMocks(); jest.mocked(getPrismaClient).mockReturnValue({} as never); });

  it("keeps source-bound detector evidence private", async () => {
    jest.mocked(resolveEpisodeProductionAccess).mockResolvedValue({ allowed: false, status: 403, code: "denied", error: "Denied.", actor: { id: "", email: "", name: "", isStaff: false, source: "none" }, access: null } as never);
    expect((await GET(query())).status).toBe(403);
    expect(readAudibleEventReviewStatus).not.toHaveBeenCalled();
  });

  it("writes only after project and exact-source authorization", async () => {
    jest.mocked(resolveEpisodeProductionAccess).mockResolvedValue({ allowed: true, actor, access: { allowed: true, projectId: "project-1", role: "EDITOR" } } as never);
    jest.mocked(authorizeStudioMediaSource).mockResolvedValue({ allowed: true } as never);
    jest.mocked(appendAudibleEventReview).mockResolvedValue({ ok: true, idempotentReplay: false, receipt: { id: "audible-review-1" } } as never);
    const playbackEvidence = { protectedPlaybackSourceId: coordinates.sourceId, contextStartSeconds: 7, contextEndSeconds: 9.75, listenedSecondBins: [7, 8, 9], clientTrackedPlaybackIsNotProofOfAudibility: true };
    const response = await POST(request({ ...coordinates, action: "review-suggestion", analysisId: "audible_analysis_test_001", eventId: "audible_cough_test_001", clientRequestId: "audible_request_test_001", decision: "confirmed", playbackEvidence }));
    expect(response.status).toBe(200);
    expect(appendAudibleEventReview).toHaveBeenCalledWith(expect.objectContaining({ prisma: {}, actor: { id: actor.id, email: actor.email }, ...coordinates, playbackEvidence, decision: "confirmed" }));
  });

  it("does not call the service for an unsupported decision", async () => {
    const response = await POST(request({ ...coordinates, action: "review-suggestion", decision: "auto-fix" }));
    expect(response.status).toBe(400);
    expect(resolveEpisodeProductionAccess).not.toHaveBeenCalled();
    expect(appendAudibleEventReview).not.toHaveBeenCalled();
  });
});
