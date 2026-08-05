/** @jest-environment node */

import { NextRequest } from "next/server";

import { getPrismaClient } from "@/lib/prisma";
import { resolveEpisodeProductionAccess } from "@/lib/server/episode-production-access";
import { appendAudioMasterPromotion } from "@/lib/server/audio-mastery-promotion";
import { authorizeStudioMediaSource } from "@/lib/server/studio-media-source-access";

import { POST } from "./route";

jest.mock("@/lib/prisma", () => ({ getPrismaClient: jest.fn() }));
jest.mock("@/lib/server/episode-production-access", () => ({ resolveEpisodeProductionAccess: jest.fn() }));
jest.mock("@/lib/server/studio-media-source-access", () => ({ authorizeStudioMediaSource: jest.fn() }));
jest.mock("@/lib/server/audio-mastery-promotion", () => ({
  AudioMasteryPromotionError: class AudioMasteryPromotionError extends Error {
    constructor(message: string, readonly status: number, readonly code: string) { super(message); }
  },
  appendAudioMasterPromotion: jest.fn(),
}));

const coordinates = {
  projectSlug: "high-ground-odyssey",
  assetId: "asset-audio-1",
  sourceId: "source-audio-1",
  jobId: "audio-mastery-job-1",
};
const actor = {
  id: "editor-1",
  email: "editor@example.test",
  isStaff: false,
  name: "Editor",
  source: "session",
};

function request(body: unknown) {
  return new NextRequest("http://localhost/api/media-vault/audio-mastery/promotion", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("audio master promotion route", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(getPrismaClient).mockReturnValue({} as never);
  });

  it("rejects incomplete coordinates before authorization", async () => {
    const response = await POST(request({ operation: "promote" }));
    expect(response.status).toBe(400);
    expect(resolveEpisodeProductionAccess).not.toHaveBeenCalled();
  });

  it("does not expose the promotion boundary to an ungranted account", async () => {
    jest.mocked(resolveEpisodeProductionAccess).mockResolvedValue({
      allowed: false,
      status: 403,
      code: "denied",
      error: "Denied.",
      actor: { id: "", email: "", name: "", isStaff: false, source: "none" },
      access: null,
    } as never);
    const response = await POST(request({ ...coordinates, operation: "promote" }));
    expect(response.status).toBe(403);
    expect(authorizeStudioMediaSource).not.toHaveBeenCalled();
    expect(appendAudioMasterPromotion).not.toHaveBeenCalled();
  });

  it("rechecks protected source access before promotion", async () => {
    jest.mocked(resolveEpisodeProductionAccess).mockResolvedValue({
      allowed: true,
      actor,
      access: { allowed: true, projectId: "project-1", role: "EDITOR" },
    } as never);
    jest.mocked(authorizeStudioMediaSource).mockResolvedValue({
      allowed: false,
      status: 423,
      errorCode: "held",
      error: "Held.",
    } as never);
    const response = await POST(request({ ...coordinates, operation: "promote" }));
    expect(response.status).toBe(423);
    expect(appendAudioMasterPromotion).not.toHaveBeenCalled();
  });

  it("passes the exact approval and actor to the append-only promotion service", async () => {
    jest.mocked(resolveEpisodeProductionAccess).mockResolvedValue({
      allowed: true,
      actor,
      access: { allowed: true, projectId: "project-1", role: "EDITOR" },
    } as never);
    jest.mocked(authorizeStudioMediaSource).mockResolvedValue({ allowed: true } as never);
    jest.mocked(appendAudioMasterPromotion).mockResolvedValue({
      ok: true,
      receipt: { id: "promotion-1" },
      promotion: { active: true },
    } as never);
    const response = await POST(request({
      ...coordinates,
      operation: "promote",
      clientRequestId: "request-1",
      reviewReceiptId: "review-1",
    }));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(appendAudioMasterPromotion).toHaveBeenCalledWith({
      prisma: {},
      actor: { id: actor.id, email: actor.email },
      ...coordinates,
      operation: "promote",
      clientRequestId: "request-1",
      reviewReceiptId: "review-1",
      reason: null,
    });
  });

  it("returns bounded stale-approval failures", async () => {
    const { AudioMasteryPromotionError } = jest.requireMock("@/lib/server/audio-mastery-promotion") as typeof import("@/lib/server/audio-mastery-promotion");
    jest.mocked(resolveEpisodeProductionAccess).mockResolvedValue({
      allowed: true,
      actor,
      access: { allowed: true, projectId: "project-1", role: "EDITOR" },
    } as never);
    jest.mocked(authorizeStudioMediaSource).mockResolvedValue({ allowed: true } as never);
    jest.mocked(appendAudioMasterPromotion).mockRejectedValue(new AudioMasteryPromotionError(
      "Approval is stale.",
      409,
      "AUDIO_MASTER_PROMOTION_APPROVAL_STALE",
    ));
    const response = await POST(request({
      ...coordinates,
      operation: "promote",
      clientRequestId: "request-stale",
      reviewReceiptId: "review-old",
    }));
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      code: "AUDIO_MASTER_PROMOTION_APPROVAL_STALE",
      error: "Approval is stale.",
    });
  });
});
