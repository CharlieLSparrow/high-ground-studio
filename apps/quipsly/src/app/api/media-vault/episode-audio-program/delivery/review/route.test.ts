/** @jest-environment node */

import { NextRequest } from "next/server";

import { getPrismaClient } from "@/lib/prisma";
import { appendEpisodeProgramDeliveryReview } from "@/lib/server/episode-program-delivery";
import { resolveEpisodeProductionAccess } from "@/lib/server/episode-production-access";

import { POST } from "./route";

jest.mock("@/lib/prisma", () => ({ getPrismaClient: jest.fn() }));
jest.mock("@/lib/server/episode-production-access", () => ({ resolveEpisodeProductionAccess: jest.fn() }));
jest.mock("@/lib/server/episode-program-delivery", () => ({
  EpisodeProgramDeliveryError: class EpisodeProgramDeliveryError extends Error { constructor(message: string, readonly status: number, readonly code: string) { super(message); } },
  appendEpisodeProgramDeliveryReview: jest.fn(), readEpisodeProgramDeliveryReviewSummary: jest.fn(),
}));

const actor = { id: "editor-1", email: "editor@example.test", isStaff: false, name: "Editor", source: "session" };
const body = { projectSlug: "high-ground-odyssey", episodeProductionId: "episode-9", deliveryJobId: "episode-program-delivery-1", clientRequestId: "review-request-1", decision: "approved", playbackEvidence: { schema: "quipsly-audio-delivery-playback-review-v1", listenedSecondBins: [0, 1, 299, 300, 301, 598, 599], completedAt: new Date().toISOString() } };
function request(value: unknown) { return new NextRequest("http://localhost/api/media-vault/episode-audio-program/delivery/review", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(value) }); }

describe("Episode program delivery review route", () => {
  beforeEach(() => { jest.clearAllMocks(); jest.mocked(getPrismaClient).mockReturnValue({} as never); });
  it("rejects incomplete coordinates before authorization", async () => { const response = await POST(request({ decision: "approved" })); expect(response.status).toBe(400); expect(resolveEpisodeProductionAccess).not.toHaveBeenCalled(); });
  it("passes exact encoded-byte playback evidence after Episode authorization", async () => {
    jest.mocked(resolveEpisodeProductionAccess).mockResolvedValue({ allowed: true, actor, access: { allowed: true, projectId: "project-1", role: "EDITOR" } } as never);
    jest.mocked(appendEpisodeProgramDeliveryReview).mockResolvedValue({ ok: true } as never);
    const response = await POST(request(body));
    expect(response.status).toBe(200);
    expect(appendEpisodeProgramDeliveryReview).toHaveBeenCalledWith({ prisma: {}, projectSlug: body.projectSlug, episodeProductionId: body.episodeProductionId, deliveryJobId: body.deliveryJobId, actor: { email: actor.email }, clientRequestId: body.clientRequestId, decision: "approved", playbackEvidence: body.playbackEvidence, note: null });
  });
});
