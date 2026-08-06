/** @jest-environment node */

import { NextRequest } from "next/server";

import { getPrismaClient } from "@/lib/prisma";
import { resolveEpisodeProductionAccess } from "@/lib/server/episode-production-access";
import { authorizeStudioMediaSource } from "@/lib/server/studio-media-source-access";
import {
  confirmStudioTranscriptSegmentAsIs,
  correctStudioTranscriptSegment,
  readStudioTranscriptReviewPage,
} from "@/lib/server/studio-transcript-review";

import { GET, POST } from "./route";

jest.mock("@/lib/prisma", () => ({ getPrismaClient: jest.fn() }));
jest.mock("@/lib/server/episode-production-access", () => ({ resolveEpisodeProductionAccess: jest.fn() }));
jest.mock("@/lib/server/studio-media-source-access", () => ({ authorizeStudioMediaSource: jest.fn() }));
jest.mock("@/lib/server/studio-transcript-review", () => ({
  readStudioTranscriptReviewPage: jest.fn(),
  correctStudioTranscriptSegment: jest.fn(),
  confirmStudioTranscriptSegmentAsIs: jest.fn(),
}));

const coordinates = { projectSlug: "high-ground-odyssey", episodeSlug: "episode-8", assetId: "asset-1", sourceId: "source-1" };
const actor = { id: "editor-1", email: "editor@example.test", name: "Editor", isStaff: false, source: "session" };

function post(body: unknown) {
  return new NextRequest("http://localhost/api/media-vault/source-transcript/review", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("Studio source transcript review route", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(getPrismaClient).mockReturnValue({} as never);
  });

  it("rejects incomplete source coordinates before authorization", async () => {
    const response = (await GET(new NextRequest("http://localhost/api/media-vault/source-transcript/review?projectSlug=high-ground-odyssey")))!;
    expect(response.status).toBe(400);
    expect(resolveEpisodeProductionAccess).not.toHaveBeenCalled();
  });

  it("does not reveal review evidence to an ungranted account", async () => {
    jest.mocked(resolveEpisodeProductionAccess).mockResolvedValue({ allowed: false, status: 403, code: "denied", error: "Denied.", actor: { id: "", email: "", name: "", isStaff: false, source: "none" }, access: null } as never);
    const response = (await GET(new NextRequest(`http://localhost/api/media-vault/source-transcript/review?${new URLSearchParams(coordinates)}`)))!;
    expect(response.status).toBe(403);
    expect(authorizeStudioMediaSource).not.toHaveBeenCalled();
    expect(readStudioTranscriptReviewPage).not.toHaveBeenCalled();
  });

  it("denies a mismatched stable project locator before source authorization or transcript mutation", async () => {
    jest.mocked(resolveEpisodeProductionAccess).mockResolvedValue({ allowed: false, status: 404, code: "project-not-found", error: "No matching project was found.", actor, access: null } as never);
    const response = (await POST(post({
      action: "confirm-as-is",
      projectId: "project-1",
      ...coordinates,
      segmentId: "segment-1",
      clientRequestId: "request-1",
      expectedText: "Provider words",
      confirmedAgainstPlayback: true,
      playbackPositionSeconds: 12.4,
    })))!;
    expect(response.status).toBe(404);
    expect(resolveEpisodeProductionAccess).toHaveBeenCalledWith(expect.objectContaining({
      projectId: "project-1",
      projectSlug: coordinates.projectSlug,
      action: "write",
    }));
    expect(authorizeStudioMediaSource).not.toHaveBeenCalled();
    expect(confirmStudioTranscriptSegmentAsIs).not.toHaveBeenCalled();
    expect(correctStudioTranscriptSegment).not.toHaveBeenCalled();
  });

  it("authorizes both the Nest and exact media source before paged readback", async () => {
    jest.mocked(resolveEpisodeProductionAccess).mockResolvedValue({ allowed: true, actor, access: { allowed: true, projectId: "project-1", role: "EDITOR" } } as never);
    jest.mocked(authorizeStudioMediaSource).mockResolvedValue({ allowed: true } as never);
    jest.mocked(readStudioTranscriptReviewPage).mockResolvedValue({ ok: true, segments: [], page: { hasMore: false } } as never);
    const response = (await GET(new NextRequest(`http://localhost/api/media-vault/source-transcript/review?${new URLSearchParams({ ...coordinates, limit: "20" })}`)))!;
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(readStudioTranscriptReviewPage).toHaveBeenCalledWith(expect.objectContaining({ prisma: {}, actor, ...coordinates, limit: 20 }));
  });

  it("passes exact playback evidence to a reviewed correction", async () => {
    jest.mocked(resolveEpisodeProductionAccess).mockResolvedValue({ allowed: true, actor, access: { allowed: true, projectId: "project-1", role: "EDITOR" } } as never);
    jest.mocked(authorizeStudioMediaSource).mockResolvedValue({ allowed: true } as never);
    jest.mocked(correctStudioTranscriptSegment).mockResolvedValue({ ok: true, correction: { id: "correction-1" } } as never);
    const response = (await POST(post({
      action: "correct",
      ...coordinates,
      segmentId: "segment-1",
      clientRequestId: "request-1",
      expectedText: "Provider words",
      expectedSpeakerLabel: null,
      correctedText: "Reviewed words",
      correctedSpeakerLabel: "Charlie",
      confirmedAgainstPlayback: true,
      playbackPositionSeconds: 12.4,
    })))!;
    expect(response.status).toBe(200);
    expect(correctStudioTranscriptSegment).toHaveBeenCalledWith(expect.objectContaining({
      actor,
      ...coordinates,
      segmentId: "segment-1",
      confirmedAgainstPlayback: true,
      playbackPositionSeconds: 12.4,
    }));
    expect(confirmStudioTranscriptSegmentAsIs).not.toHaveBeenCalled();
  });

  it("routes an as-is decision separately from a correction overlay", async () => {
    jest.mocked(resolveEpisodeProductionAccess).mockResolvedValue({ allowed: true, actor, access: { allowed: true, projectId: "project-1", role: "EDITOR" } } as never);
    jest.mocked(authorizeStudioMediaSource).mockResolvedValue({ allowed: true } as never);
    jest.mocked(confirmStudioTranscriptSegmentAsIs).mockResolvedValue({ ok: true, verification: { id: "verification-1" } } as never);
    const response = (await POST(post({ action: "confirm-as-is", ...coordinates, segmentId: "segment-1", clientRequestId: "request-1", expectedText: "Provider words", confirmedAgainstPlayback: true, playbackPositionSeconds: 12.4 })))!;
    expect(response.status).toBe(200);
    expect(confirmStudioTranscriptSegmentAsIs).toHaveBeenCalled();
    expect(correctStudioTranscriptSegment).not.toHaveBeenCalled();
  });
});
