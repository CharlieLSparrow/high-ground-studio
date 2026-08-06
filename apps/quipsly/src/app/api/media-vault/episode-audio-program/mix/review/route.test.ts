/** @jest-environment node */

import { NextRequest } from "next/server";

const access = jest.fn();
const read = jest.fn();
const append = jest.fn();
jest.mock("@/lib/prisma", () => ({ getPrismaClient: () => ({ marker: "prisma" }) }));
jest.mock("@/lib/server/episode-production-access", () => ({ resolveEpisodeProductionAccess: (...args: unknown[]) => access(...args) }));
jest.mock("@/lib/server/episode-audio-mix-review", () => ({
  EpisodeAudioMixReviewError: class EpisodeAudioMixReviewError extends Error { constructor(message: string, readonly status: number, readonly code: string) { super(message); } },
  readEpisodeAudioMixDecisionSummary: (...args: unknown[]) => read(...args),
  appendEpisodeAudioMixReview: (...args: unknown[]) => append(...args),
}));

import { GET, POST } from "./route";

describe("Episode mix review route", () => {
  beforeEach(() => { jest.clearAllMocks(); access.mockResolvedValue({ allowed: true, actor: { email: "editor@example.test" } }); read.mockResolvedValue({ review: { latest: null }, promotion: { active: false } }); append.mockResolvedValue({ ok: true, receipt: { id: "review_0001" } }); });
  it("requires Episode read access for the decision ledger", async () => { const response = await GET(new NextRequest("http://localhost/api/media-vault/episode-audio-program/mix/review?projectSlug=nest-one&episodeProductionId=episode_0001&jobId=mix_0001")); expect(response.status).toBe(200); expect(access).toHaveBeenCalledWith(expect.objectContaining({ action: "read" })); });
  it("writes only through Episode write access", async () => { const response = await POST(new NextRequest("http://localhost/api/media-vault/episode-audio-program/mix/review", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ projectSlug: "nest-one", episodeProductionId: "episode_0001", jobId: "mix_0001", decision: "approved", clientRequestId: "request_0001", playbackEvidence: {} }) })); expect(response.status).toBe(200); expect(access).toHaveBeenCalledWith(expect.objectContaining({ action: "write" })); expect(append).toHaveBeenCalledWith(expect.objectContaining({ actor: { email: "editor@example.test" }, decision: "approved" })); });
});
