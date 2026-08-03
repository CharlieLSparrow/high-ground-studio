/** @jest-environment node */

import { getPrismaClient } from "@/lib/prisma";
import {
  disableGoogleCalendarLiveUpdates,
  enableGoogleCalendarLiveUpdates,
} from "@/lib/server/google-calendar-push";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";

import { POST } from "./route";

jest.mock("@/lib/prisma", () => ({ getPrismaClient: jest.fn() }));
jest.mock("@/lib/server/quipsly-session", () => ({ getQuipslySessionFromRequest: jest.fn() }));
jest.mock("@/lib/server/google-calendar-push", () => ({
  enableGoogleCalendarLiveUpdates: jest.fn(),
  disableGoogleCalendarLiveUpdates: jest.fn(),
  GoogleCalendarPushError: class GoogleCalendarPushError extends Error {},
}));

function request(enabled: boolean) {
  return new Request(
    "https://nest.quipsly.com/api/calendar/connections/google/live-updates",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ collectionId: "collection-1", enabled }),
    },
  );
}

describe("Google Calendar live-update control route", () => {
  beforeEach(() => jest.clearAllMocks());

  it("rejects signed-out activation before database or provider access", async () => {
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue(null);
    const response = await POST(request(true));
    expect(response.status).toBe(401);
    expect(getPrismaClient).not.toHaveBeenCalled();
    expect(enableGoogleCalendarLiveUpdates).not.toHaveBeenCalled();
  });

  it("passes the exact signed-in actor and collection to activation", async () => {
    const prisma = {};
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue({
      user: { id: "user-1", primaryEmail: "owner@example.com" },
    } as never);
    jest.mocked(getPrismaClient).mockReturnValue(prisma as never);
    jest.mocked(enableGoogleCalendarLiveUpdates).mockResolvedValue({
      channelId: "channel-1",
      expiresAt: new Date("2026-08-10T00:00:00.000Z"),
    } as never);
    const response = await POST(request(true));
    expect(response.status).toBe(200);
    expect(enableGoogleCalendarLiveUpdates).toHaveBeenCalledWith({
      prisma,
      collectionId: "collection-1",
      actorUserId: "user-1",
      actorEmail: "owner@example.com",
      requestUrl: "https://nest.quipsly.com/api/calendar/connections/google/live-updates",
    });
    expect(disableGoogleCalendarLiveUpdates).not.toHaveBeenCalled();
  });

  it("routes an explicit off state through provider stop and local disable", async () => {
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue({
      user: { id: "user-1", primaryEmail: "owner@example.com" },
    } as never);
    jest.mocked(getPrismaClient).mockReturnValue({} as never);
    jest.mocked(disableGoogleCalendarLiveUpdates).mockResolvedValue({ disabled: true } as never);
    const response = await POST(request(false));
    expect(response.status).toBe(200);
    expect(disableGoogleCalendarLiveUpdates).toHaveBeenCalledTimes(1);
    expect(enableGoogleCalendarLiveUpdates).not.toHaveBeenCalled();
  });
});
