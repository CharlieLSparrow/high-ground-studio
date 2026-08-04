/** @jest-environment node */

import { getPrismaClient } from "@/lib/prisma";
import {
  appendEpisodeEditReviewReceipt,
  listEpisodeEditReviewLedger,
} from "@/lib/server/episode-edit-review-ledger";
import { resolveEpisodeProductionAccess } from "@/lib/server/episode-production-access";
import { GET, POST } from "./route";

jest.mock("@/lib/prisma", () => ({ getPrismaClient: jest.fn() }));
jest.mock("@/lib/server/episode-production-access", () => ({ resolveEpisodeProductionAccess: jest.fn() }));
jest.mock("@/lib/server/episode-edit-review-ledger", () => ({
  EpisodeEditReviewLedgerError: class EpisodeEditReviewLedgerError extends Error {},
  appendEpisodeEditReviewReceipt: jest.fn(),
  listEpisodeEditReviewLedger: jest.fn(),
  publicEpisodeEditReviewReceipt: jest.fn((receipt) => receipt),
}));

const mockedAccess = jest.mocked(resolveEpisodeProductionAccess);
const mockedAppend = jest.mocked(appendEpisodeEditReviewReceipt);
const mockedList = jest.mocked(listEpisodeEditReviewLedger);
const prisma = {} as never;
const actor = { id: "user-1", email: "editor@example.test", name: "Editor", isStaff: false, source: "embedded-cookie" as const };

describe("episode edit review API", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(getPrismaClient).mockReturnValue(prisma);
    mockedAccess.mockResolvedValue({
      allowed: true,
      actor,
      access: { allowed: true, role: "EDITOR", source: "grant", projectId: "project-1", projectSlug: "high-ground-odyssey" },
    } as never);
  });

  it("enforces project read access before returning the append-only ledger", async () => {
    mockedAccess.mockResolvedValue({
      allowed: false,
      status: 403,
      code: "episode-production-access-denied",
      error: "Denied.",
      actor,
      access: null,
    } as never);
    const response = await GET(new Request("https://quipsly.example/api/editor/edit-review?projectSlug=high-ground-odyssey&episodeSlug=episode-1"));
    expect(response.status).toBe(403);
    expect(mockedList).not.toHaveBeenCalled();
  });

  it("lists only the authorized canonical episode ledger", async () => {
    mockedList.mockResolvedValue({ productionId: "production-1", proposalSets: [], receipts: [] });
    const response = await GET(new Request("https://quipsly.example/api/editor/edit-review?projectSlug=high-ground-odyssey&episodeSlug=episode-1"));
    expect(response.status).toBe(200);
    expect(mockedList).toHaveBeenCalledWith({ prisma, projectId: "project-1", episodeSlug: "episode-1" });
  });

  it("binds a review write to the authorized actor instead of trusting client identity", async () => {
    mockedAppend.mockResolvedValue({ id: "receipt-1" } as never);
    const response = await POST(new Request("https://quipsly.example/api/editor/edit-review", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectSlug: "high-ground-odyssey",
        episodeSlug: "episode-1",
        clientRequestId: "0f981d5d-f453-4b5e-8bb0-b8e359b7b837",
        proposalSetId: "proposal-set-1",
        action: "PROOF_LISTENED",
        subjectId: "proposal-1",
        subjectKind: "proposal",
        sourceRange: { startSeconds: 2, endSeconds: 5 },
        proposalTimelineFingerprintSha256: "a".repeat(64),
        timelineFingerprintBeforeSha256: "b".repeat(64),
      }),
    }));
    expect(response.status).toBe(201);
    expect(mockedAppend).toHaveBeenCalledWith(expect.objectContaining({
      prisma,
      projectId: "project-1",
      episodeSlug: "episode-1",
      actor,
    }));
  });
});
