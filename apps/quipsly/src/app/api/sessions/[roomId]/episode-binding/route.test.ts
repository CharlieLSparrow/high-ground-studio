/** @jest-environment node */

import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";
import {
  repairSessionEpisodeBinding,
  SessionEpisodeBindingRepairError,
} from "@/lib/server/session-episode-binding-repair";

import { PUT } from "./route";

jest.mock("@/lib/prisma", () => ({ getPrismaClient: jest.fn(() => ({ marker: "prisma" })) }));
jest.mock("@/lib/server/quipsly-session", () => ({ getQuipslySessionFromRequest: jest.fn() }));
jest.mock("@/lib/server/session-episode-binding-repair", () => ({
  repairSessionEpisodeBinding: jest.fn(),
  SessionEpisodeBindingRepairError: class SessionEpisodeBindingRepairError extends Error {
    constructor(
      message: string,
      readonly code: string,
      readonly status = 409,
      readonly details: Record<string, unknown> = {},
    ) {
      super(message);
    }
  },
}));

function request(body: Record<string, unknown>) {
  return new Request("https://quipsly.example/api/sessions/room-1/episode-binding", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const context = { params: Promise.resolve({ roomId: "room-1" }) };

describe("Session Episode relationship repair route", () => {
  beforeEach(() => jest.clearAllMocks());

  it("requires a signed-in actor before invoking the mutation service", async () => {
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue(null);
    const response = await PUT(request({}), context);
    expect(response.status).toBe(401);
    expect(repairSessionEpisodeBinding).not.toHaveBeenCalled();
  });

  it("passes the exact optimistic, idempotent repair intent and returns private no-store truth", async () => {
    const actor = { id: "user-1", primaryEmail: "owner@example.test", isStaff: false };
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue({ user: actor } as any);
    jest.mocked(repairSessionEpisodeBinding).mockResolvedValue({
      idempotentReplay: false,
      receipt: { id: "receipt-1", nextEpisodeSlug: "episode-4" },
      boundaries: { externalSideEffects: false },
    } as any);
    const body = {
      episodeSlug: "episode-4",
      requestId: "dd7d786f-f3d7-4f74-b486-c41bd88dbd0e",
      expectedRoomUpdatedAt: "2026-08-04T20:00:00.000Z",
      confirmRebind: true,
      reason: "Correct production continuity",
    };
    const response = await PUT(request(body), context);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("vary")).toBe("Authorization, Cookie");
    expect(repairSessionEpisodeBinding).toHaveBeenCalledWith(expect.objectContaining({
      actor,
      roomId: "room-1",
      ...body,
    }));
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      receipt: { nextEpisodeSlug: "episode-4" },
      boundaries: { externalSideEffects: false },
    });
  });

  it("preserves explicit repair conflicts and safe refresh details", async () => {
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue({
      user: { id: "user-1", primaryEmail: "owner@example.test" },
    } as any);
    jest.mocked(repairSessionEpisodeBinding).mockRejectedValue(new SessionEpisodeBindingRepairError(
      "Refresh before saving.",
      "STALE_SESSION_VERSION",
      409,
      { currentRoomUpdatedAt: "2026-08-04T20:02:00.000Z" },
    ));
    const response = await PUT(request({}), context);
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      code: "STALE_SESSION_VERSION",
      error: "Refresh before saving.",
      currentRoomUpdatedAt: "2026-08-04T20:02:00.000Z",
    });
  });
});
