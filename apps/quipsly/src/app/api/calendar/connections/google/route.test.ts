/** @jest-environment node */

import { getPrismaClient } from "@/lib/prisma";
import {
  decryptGoogleRefreshToken,
  getGoogleCalendarOAuthConfig,
  listOwnedGoogleCalendars,
  refreshGoogleCalendarAccess,
} from "@/lib/server/google-calendar-oauth";
import { listProjectsVisibleToEmail } from "@/lib/server/home-nest";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";

import { GET, POST } from "./route";

jest.mock("@/lib/prisma", () => ({ getPrismaClient: jest.fn() }));
jest.mock("@/lib/server/home-nest", () => ({ listProjectsVisibleToEmail: jest.fn() }));
jest.mock("@/lib/server/quipsly-session", () => ({ getQuipslySessionFromRequest: jest.fn() }));
jest.mock("@/lib/server/google-calendar-oauth", () => ({
  ...jest.requireActual("@/lib/server/google-calendar-oauth"),
  decryptGoogleRefreshToken: jest.fn(),
  getGoogleCalendarOAuthConfig: jest.fn(),
  listOwnedGoogleCalendars: jest.fn(),
  refreshGoogleCalendarAccess: jest.fn(),
}));

function connection() {
  return {
    id: "connection-1",
    status: "VERIFIED",
    verifiedAt: new Date("2026-08-02T00:00:00.000Z"),
    metadataJson: { accountLabel: "Calendar account" },
    oauthCredential: { encryptedPayload: "encrypted-not-a-token" },
    collections: [],
  };
}

function configureProvider(prisma: any) {
  jest.mocked(getPrismaClient).mockReturnValue(prisma);
  jest.mocked(getGoogleCalendarOAuthConfig).mockReturnValue({ encryptionKey: Buffer.alloc(32) } as never);
  jest.mocked(decryptGoogleRefreshToken).mockReturnValue("refresh-token");
  jest.mocked(refreshGoogleCalendarAccess).mockResolvedValue("access-token");
  jest.mocked(listOwnedGoogleCalendars).mockResolvedValue([{ id: "owned-1", summary: "Production", primary: true, accessRole: "owner", timeZone: "America/Denver" }]);
}

describe("/api/calendar/connections/google", () => {
  beforeEach(() => jest.clearAllMocks());

  it("rejects all provider reads before database or Google access when signed out", async () => {
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue(null);
    const response = await GET(new Request("https://nest.quipsly.com/api/calendar/connections/google"));
    expect(response.status).toBe(401);
    expect(getPrismaClient).not.toHaveBeenCalled();
    expect(refreshGoogleCalendarAccess).not.toHaveBeenCalled();
  });

  it("returns only safe connection and owned-calendar selection data", async () => {
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue({ user: { id: "user-1", primaryEmail: "person@example.com" } } as never);
    const prisma = {
      calendarConnection: {
        findFirst: jest.fn().mockResolvedValue(connection()),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    configureProvider(prisma);
    const response = await GET(new Request("https://nest.quipsly.com/api/calendar/connections/google"));
    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(payload.connection.accountLabel).toBe("Calendar account");
    expect(payload.calendars[0].accessRole).toBe("owner");
    const serialized = JSON.stringify(payload);
    expect(serialized).not.toContain("refresh-token");
    expect(serialized).not.toContain("access-token");
    expect(serialized).not.toContain("encrypted-not-a-token");
  });

  it("forbids binding a production calendar to an inaccessible Nest", async () => {
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue({ user: { id: "user-1", primaryEmail: "person@example.com" } } as never);
    const prisma = {
      calendarConnection: {
        findFirst: jest.fn().mockResolvedValue(connection()),
        update: jest.fn().mockResolvedValue({}),
      },
      calendarCollection: { create: jest.fn(), update: jest.fn() },
    };
    configureProvider(prisma);
    jest.mocked(listProjectsVisibleToEmail).mockResolvedValue([{ id: "project-allowed" }] as never);
    const response = await POST(new Request("https://nest.quipsly.com/api/calendar/connections/google", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ purpose: "PODCAST_PRODUCTION", projectId: "project-denied", calendarId: "owned-1" }),
    }));
    expect(response.status).toBe(403);
    expect(prisma.calendarCollection.create).not.toHaveBeenCalled();
    expect(prisma.calendarCollection.update).not.toHaveBeenCalled();
  });
});
