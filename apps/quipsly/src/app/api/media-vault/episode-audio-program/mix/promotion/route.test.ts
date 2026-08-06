/** @jest-environment node */

import { NextRequest } from "next/server";

const access = jest.fn();
const append = jest.fn();
jest.mock("@/lib/prisma", () => ({ getPrismaClient: () => ({ marker: "prisma" }) }));
jest.mock("@/lib/server/episode-production-access", () => ({ resolveEpisodeProductionAccess: (...args: unknown[]) => access(...args) }));
jest.mock("@/lib/server/episode-audio-mix-review", () => ({
  EpisodeAudioMixReviewError: class EpisodeAudioMixReviewError extends Error { constructor(message: string, readonly status: number, readonly code: string) { super(message); } },
  appendEpisodeAudioMixPromotion: (...args: unknown[]) => append(...args),
}));

import { POST } from "./route";

describe("Episode mix promotion route", () => {
  beforeEach(() => { jest.clearAllMocks(); access.mockResolvedValue({ allowed: true, actor: { email: "editor@example.test" } }); append.mockResolvedValue({ ok: true, receipt: { id: "promotion_0001" } }); });
  it("keeps promotion behind Episode write access", async () => { const response = await POST(new NextRequest("http://localhost/api/media-vault/episode-audio-program/mix/promotion", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ projectSlug: "nest-one", episodeProductionId: "episode_0001", jobId: "mix_0001", operation: "promote", reviewReceiptId: "review_0001", clientRequestId: "request_0001" }) })); expect(response.status).toBe(200); expect(access).toHaveBeenCalledWith(expect.objectContaining({ action: "write" })); expect(append).toHaveBeenCalledWith(expect.objectContaining({ actor: { email: "editor@example.test" }, operation: "promote" })); });
  it("rejects undeclared promotion operations", async () => { const response = await POST(new NextRequest("http://localhost/api/media-vault/episode-audio-program/mix/promotion", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ projectSlug: "nest-one", episodeProductionId: "episode_0001", jobId: "mix_0001", operation: "publish" }) })); expect(response.status).toBe(400); expect(append).not.toHaveBeenCalled(); });
});
