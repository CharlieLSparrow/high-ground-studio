/** @jest-environment node */

import { getPrismaClient } from "@/lib/prisma";
import {
  authorizeCaptureTranscriptFollowThroughWorker,
  runCaptureTranscriptFollowThroughMaintenance,
} from "@/lib/server/capture-transcript-follow-through-worker";
import { POST } from "./route";

jest.mock("@/lib/prisma", () => ({ getPrismaClient: jest.fn() }));
jest.mock("@/lib/server/capture-transcript-follow-through-worker", () => ({
  authorizeCaptureTranscriptFollowThroughWorker: jest.fn(),
  runCaptureTranscriptFollowThroughMaintenance: jest.fn(),
}));

describe("capture transcript follow-through cron", () => {
  beforeEach(() => jest.clearAllMocks());

  it("fails closed before reading persistence when worker identity is unavailable", async () => {
    jest.mocked(authorizeCaptureTranscriptFollowThroughWorker).mockResolvedValue("unauthorized");
    const response = await POST(new Request("https://studio.example/api/cron/capture-transcript-follow-through", { method: "POST" }));
    expect(response.status).toBe(401);
    expect(getPrismaClient).not.toHaveBeenCalled();
  });

  it("runs one bounded maintenance pass for an authorized scheduler", async () => {
    const prisma = {};
    jest.mocked(authorizeCaptureTranscriptFollowThroughWorker).mockResolvedValue("authorized");
    jest.mocked(getPrismaClient).mockReturnValue(prisma as any);
    jest.mocked(runCaptureTranscriptFollowThroughMaintenance).mockResolvedValue({ scanned: 2, ready: 1 } as any);
    const response = await POST(new Request("https://studio.example/api/cron/capture-transcript-follow-through", {
      method: "POST",
      headers: { authorization: "Bearer scheduler-token" },
    }));
    await expect(response.json()).resolves.toEqual({ ok: true, result: { scanned: 2, ready: 1 } });
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(runCaptureTranscriptFollowThroughMaintenance).toHaveBeenCalledWith({ prisma });
  });
});
