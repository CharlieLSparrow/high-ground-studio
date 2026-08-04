/** @jest-environment node */

import { NextRequest } from "next/server";

import { getPrismaClient } from "@/lib/prisma";
import { resolveEpisodeProductionAccess } from "@/lib/server/episode-production-access";
import { authorizeStudioMediaSource } from "@/lib/server/studio-media-source-access";
import { appendAudioMasterReview } from "@/lib/server/audio-mastery-review";

import { POST } from "./route";

jest.mock("@/lib/prisma", () => ({ getPrismaClient: jest.fn() }));
jest.mock("@/lib/server/episode-production-access", () => ({ resolveEpisodeProductionAccess: jest.fn() }));
jest.mock("@/lib/server/studio-media-source-access", () => ({ authorizeStudioMediaSource: jest.fn() }));
jest.mock("@/lib/server/audio-mastery-review", () => ({
  AudioMasteryReviewError: class AudioMasteryReviewError extends Error {
    constructor(message: string, readonly status: number, readonly code: string) { super(message); }
  },
  appendAudioMasterReview: jest.fn(),
}));

const coordinates = { projectSlug: "high-ground-odyssey", assetId: "asset-audio-1", sourceId: "source-audio-1", jobId: "audio-mastery-job-1" };
const actor = { id: "editor-1", email: "editor@example.test", isStaff: false, name: "Editor", source: "session" };

function request(body: unknown) {
  return new NextRequest("http://localhost/api/media-vault/audio-mastery/review", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("audio mastery review route", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(getPrismaClient).mockReturnValue({} as never);
  });

  it("rejects incomplete source coordinates before authorization", async () => {
    const response = await POST(request({ decision: "approved" }));
    expect(response.status).toBe(400);
    expect(resolveEpisodeProductionAccess).not.toHaveBeenCalled();
  });

  it("does not expose a mastery review boundary to an ungranted account", async () => {
    jest.mocked(resolveEpisodeProductionAccess).mockResolvedValue({ allowed: false, status: 403, code: "denied", error: "Denied.", actor: { id: "", email: "", name: "", isStaff: false, source: "none" }, access: null } as never);
    const response = await POST(request({ ...coordinates, decision: "approved" }));
    expect(response.status).toBe(403);
    expect(authorizeStudioMediaSource).not.toHaveBeenCalled();
    expect(appendAudioMasterReview).not.toHaveBeenCalled();
  });

  it("rechecks the exact protected source before appending a review receipt", async () => {
    jest.mocked(resolveEpisodeProductionAccess).mockResolvedValue({ allowed: true, actor, access: { allowed: true, projectId: "project-1", role: "EDITOR" } } as never);
    jest.mocked(authorizeStudioMediaSource).mockResolvedValue({ allowed: false, status: 423, errorCode: "held", error: "Held." } as never);
    const response = await POST(request({ ...coordinates, decision: "approved" }));
    expect(response.status).toBe(423);
    expect(appendAudioMasterReview).not.toHaveBeenCalled();
  });

  it("passes normalized actor and playback evidence to the append-only service", async () => {
    jest.mocked(resolveEpisodeProductionAccess).mockResolvedValue({ allowed: true, actor, access: { allowed: true, projectId: "project-1", role: "EDITOR" } } as never);
    jest.mocked(authorizeStudioMediaSource).mockResolvedValue({ allowed: true } as never);
    jest.mocked(appendAudioMasterReview).mockResolvedValue({ ok: true, receipt: { id: "review-1" }, review: { latest: { id: "review-1" } } } as never);
    const playbackEvidence = { schema: "quipsly-audio-mastery-playback-review-v1", sourceListenedSecondBins: [1, 2], masteredListenedSecondBins: [1, 2], monitorModes: ["matched", "delivery"], completedAt: "2026-08-04T19:00:00.000Z" };
    const response = await POST(request({ ...coordinates, clientRequestId: "request-1", decision: "approved", playbackEvidence, note: "Sounds ready." }));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(appendAudioMasterReview).toHaveBeenCalledWith(expect.objectContaining({ prisma: {}, actor: { id: actor.id, email: actor.email }, ...coordinates, decision: "approved", playbackEvidence, note: "Sounds ready." }));
  });

  it("returns a bounded service rejection without collapsing it into a server error", async () => {
    const { AudioMasteryReviewError } = jest.requireMock("@/lib/server/audio-mastery-review") as typeof import("@/lib/server/audio-mastery-review");
    jest.mocked(resolveEpisodeProductionAccess).mockResolvedValue({ allowed: true, actor, access: { allowed: true, projectId: "project-1", role: "EDITOR" } } as never);
    jest.mocked(authorizeStudioMediaSource).mockResolvedValue({ allowed: true } as never);
    jest.mocked(appendAudioMasterReview).mockRejectedValue(new AudioMasteryReviewError("Listen to every required moment.", 409, "AUDIO_MASTER_REVIEW_INCOMPLETE"));
    const response = await POST(request({ ...coordinates, clientRequestId: "request-incomplete", decision: "approved", playbackEvidence: {} }));
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ ok: false, code: "AUDIO_MASTER_REVIEW_INCOMPLETE", error: "Listen to every required moment." });
  });
});
