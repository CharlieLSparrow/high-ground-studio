/** @jest-environment node */

import { NextRequest } from "next/server";
import { getPrismaClient } from "@/lib/prisma";
import { appendAudioDeliveryReview } from "@/lib/server/audio-delivery";
import { resolveEpisodeProductionAccess } from "@/lib/server/episode-production-access";
import { authorizeStudioMediaSource } from "@/lib/server/studio-media-source-access";
import { POST } from "./route";

jest.mock("@/lib/prisma", () => ({ getPrismaClient: jest.fn() }));
jest.mock("@/lib/server/episode-production-access", () => ({ resolveEpisodeProductionAccess: jest.fn() }));
jest.mock("@/lib/server/studio-media-source-access", () => ({ authorizeStudioMediaSource: jest.fn() }));
jest.mock("@/lib/server/audio-delivery", () => ({
  AudioDeliveryError: class AudioDeliveryError extends Error { constructor(message: string, readonly status: number, readonly code: string) { super(message); } },
  appendAudioDeliveryReview: jest.fn(),
}));

const actor = { id: "editor-1", email: "editor@example.test", isStaff: false, name: "Editor", source: "session" };
const body = { projectSlug: "high-ground-odyssey", assetId: "asset-audio-1", sourceId: "source-audio-1", deliveryJobId: "audio-delivery-job-1", clientRequestId: "delivery-review-request-1", decision: "approved", playbackEvidence: { schema: "quipsly-audio-delivery-playback-review-v1", listenedSecondBins: [0, 1], completedAt: new Date().toISOString() } };
function request(value: unknown) { return new NextRequest("http://localhost/api/media-vault/audio-delivery/review", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(value) }); }

describe("audio delivery review route", () => {
  beforeEach(() => { jest.clearAllMocks(); jest.mocked(getPrismaClient).mockReturnValue({} as never); });
  it("rejects incomplete coordinates before authorization", async () => { const response = await POST(request({ decision: "approved" })); expect(response.status).toBe(400); expect(resolveEpisodeProductionAccess).not.toHaveBeenCalled(); });
  it("passes exact playback evidence only after Nest and source authorization", async () => {
    jest.mocked(resolveEpisodeProductionAccess).mockResolvedValue({ allowed: true, actor, access: { allowed: true, projectId: "project-1", role: "EDITOR" } } as never);
    jest.mocked(authorizeStudioMediaSource).mockResolvedValue({ allowed: true } as never);
    jest.mocked(appendAudioDeliveryReview).mockResolvedValue({ ok: true, review: { latest: { decision: "approved" } } } as never);
    const response = await POST(request(body));
    expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(appendAudioDeliveryReview).toHaveBeenCalledWith({ prisma: {}, projectSlug: body.projectSlug, assetId: body.assetId, deliveryJobId: body.deliveryJobId, actor: { id: actor.id, email: actor.email }, clientRequestId: body.clientRequestId, decision: "approved", playbackEvidence: body.playbackEvidence, note: null });
  });
});
