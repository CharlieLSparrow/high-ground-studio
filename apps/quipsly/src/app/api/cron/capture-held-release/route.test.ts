/** @jest-environment node */

import { getPrismaClient } from "@/lib/prisma";
import { authorizeCaptureTranscriptFollowThroughWorker } from "@/lib/server/capture-transcript-follow-through-worker";
import { runHeldMobileCaptureReleaseMaintenance } from "@/lib/server/mobile-capture-held-release-worker";
import { POST } from "./route";

jest.mock("@/lib/prisma", () => ({ getPrismaClient: jest.fn() }));
jest.mock("@/lib/server/capture-transcript-follow-through-worker", () => ({
  authorizeCaptureTranscriptFollowThroughWorker: jest.fn(),
}));
jest.mock("@/lib/server/mobile-capture-held-release-worker", () => ({
  runHeldMobileCaptureReleaseMaintenance: jest.fn(),
}));

describe("capture held release cron", () => {
  beforeEach(() => jest.clearAllMocks());

  it("fails closed before reading persistence when worker identity is unavailable", async () => {
    jest.mocked(authorizeCaptureTranscriptFollowThroughWorker).mockResolvedValue("unauthorized");
    const response = await POST(new Request("https://studio.example/api/cron/capture-held-release", { method: "POST" }));
    expect(response.status).toBe(401);
    expect(getPrismaClient).not.toHaveBeenCalled();
  });

  it("rehashes at most one retained source per authorized maintenance request", async () => {
    const prisma = {};
    jest.mocked(authorizeCaptureTranscriptFollowThroughWorker).mockResolvedValue("authorized");
    jest.mocked(getPrismaClient).mockReturnValue(prisma as any);
    jest.mocked(runHeldMobileCaptureReleaseMaintenance).mockResolvedValue({
      scanned: 4,
      attempted: 1,
      releasedMedia: 1,
    } as any);

    const response = await POST(new Request("https://studio.example/api/cron/capture-held-release", {
      method: "POST",
      headers: { authorization: "Bearer scheduler-token" },
    }));

    await expect(response.json()).resolves.toEqual({
      ok: true,
      result: { scanned: 4, attempted: 1, releasedMedia: 1 },
    });
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(runHeldMobileCaptureReleaseMaintenance).toHaveBeenCalledWith({ prisma, limit: 1 });
  });
});
