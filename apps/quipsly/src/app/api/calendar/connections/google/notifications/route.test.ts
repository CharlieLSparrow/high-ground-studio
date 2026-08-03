/** @jest-environment node */

import { getPrismaClient } from "@/lib/prisma";
import {
  GoogleCalendarPushError,
  receiveGoogleCalendarNotification,
} from "@/lib/server/google-calendar-push";

import { POST } from "./route";

jest.mock("@/lib/prisma", () => ({ getPrismaClient: jest.fn() }));
jest.mock("@/lib/server/google-calendar-push", () => ({
  receiveGoogleCalendarNotification: jest.fn(),
  GoogleCalendarPushError: class GoogleCalendarPushError extends Error {
    constructor(message: string, readonly code: string, readonly status = 502) {
      super(message);
    }
  },
}));

function request(body = "") {
  return new Request(
    "https://nest.quipsly.com/api/calendar/connections/google/notifications",
    {
      method: "POST",
      headers: {
        "x-goog-channel-id": "channel-1",
        "x-goog-channel-token": "token-1",
        "x-goog-resource-id": "resource-1",
        "x-goog-resource-state": "exists",
        "x-goog-message-number": "7",
      },
      body: body || undefined,
    },
  );
}

describe("Google Calendar notification webhook", () => {
  beforeEach(() => jest.clearAllMocks());

  it("acknowledges a verified empty notification without returning content", async () => {
    const prisma = {};
    jest.mocked(getPrismaClient).mockReturnValue(prisma as never);
    jest.mocked(receiveGoogleCalendarNotification).mockResolvedValue({ accepted: true } as never);
    const response = await POST(request());
    expect(response.status).toBe(204);
    expect(await response.text()).toBe("");
    expect(receiveGoogleCalendarNotification).toHaveBeenCalledWith({
      prisma,
      channelId: "channel-1",
      channelToken: "token-1",
      resourceId: "resource-1",
      resourceState: "exists",
      messageNumber: "7",
    });
  });

  it("rejects notification bodies before database access", async () => {
    const response = await POST(request("not-empty"));
    expect(response.status).toBe(400);
    expect(receiveGoogleCalendarNotification).not.toHaveBeenCalled();
  });

  it("does not expose channel verification details", async () => {
    jest.mocked(receiveGoogleCalendarNotification).mockRejectedValue(
      new GoogleCalendarPushError("secret mismatch detail", "mismatch", 404),
    );
    const response = await POST(request());
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ ok: false, error: "Notification not accepted." });
  });
});
