/** @jest-environment node */

import { getPrismaClient } from "@/lib/prisma";
import {
  decryptGoogleRefreshToken,
  getGoogleCalendarOAuthConfig,
  listOwnedGoogleCalendars,
  refreshGoogleCalendarAccess,
  revokeGoogleCalendarToken,
} from "@/lib/server/google-calendar-oauth";
import { stopGoogleCalendarChannel } from "@/lib/server/google-calendar-push";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";
import { resolveStudioProjectAccess } from "@/lib/server/studio-project-access";

import { DELETE, GET, POST } from "./route";

jest.mock("@/lib/prisma", () => ({ getPrismaClient: jest.fn() }));
jest.mock("@/lib/server/quipsly-session", () => ({
  getQuipslySessionFromRequest: jest.fn(),
}));
jest.mock("@/lib/server/studio-project-access", () => ({
  resolveStudioProjectAccess: jest.fn(),
}));
jest.mock("@/lib/server/google-calendar-oauth", () => ({
  ...jest.requireActual("@/lib/server/google-calendar-oauth"),
  decryptGoogleRefreshToken: jest.fn(),
  getGoogleCalendarOAuthConfig: jest.fn(),
  listOwnedGoogleCalendars: jest.fn(),
  refreshGoogleCalendarAccess: jest.fn(),
  revokeGoogleCalendarToken: jest.fn(),
}));
jest.mock("@/lib/server/google-calendar-push", () => ({
  stopGoogleCalendarChannel: jest.fn(),
}));

function connection() {
  return {
    id: "connection-1",
    status: "VERIFIED",
    verifiedAt: new Date("2026-08-02T00:00:00.000Z"),
    lastCheckedAt: new Date("2026-08-02T01:00:00.000Z"),
    metadataJson: { accountLabel: "Calendar account" },
    oauthCredential: { encryptedPayload: "encrypted-not-a-token" },
    collections: [
      {
        id: "collection-1",
        purpose: "PODCAST_PRODUCTION",
        displayName: "Production",
        providerCalendarId: "owned-1",
        nestId: "project-1",
        timezone: "America/Denver",
        cursor: {
          lastFullSyncAt: new Date("2026-08-01T00:00:00.000Z"),
          lastIncrementalSyncAt: new Date("2026-08-02T00:00:00.000Z"),
          syncTokenRef: "encrypted-cursor-must-not-escape",
        },
      },
    ],
  };
}

function configureProvider(prisma: any) {
  jest.mocked(getPrismaClient).mockReturnValue(prisma);
  jest
    .mocked(getGoogleCalendarOAuthConfig)
    .mockReturnValue({ encryptionKey: Buffer.alloc(32) } as never);
  jest.mocked(decryptGoogleRefreshToken).mockReturnValue("refresh-token");
  jest.mocked(refreshGoogleCalendarAccess).mockResolvedValue("access-token");
  jest.mocked(listOwnedGoogleCalendars).mockResolvedValue([
    {
      id: "owned-1",
      summary: "Production",
      primary: true,
      accessRole: "owner",
      timeZone: "America/Denver",
    },
  ]);
}

describe("/api/calendar/connections/google", () => {
  beforeEach(() => jest.clearAllMocks());

  it("rejects all provider reads before database or Google access when signed out", async () => {
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue(null);
    const response = await GET(
      new Request("https://nest.quipsly.com/api/calendar/connections/google"),
    );
    expect(response.status).toBe(401);
    expect(getPrismaClient).not.toHaveBeenCalled();
    expect(refreshGoogleCalendarAccess).not.toHaveBeenCalled();
  });

  it("returns only safe connection and owned-calendar selection data", async () => {
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue({
      user: { id: "user-1", primaryEmail: "person@example.com" },
    } as never);
    const prisma = {
      calendarConnection: {
        findFirst: jest.fn().mockResolvedValue(connection()),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    configureProvider(prisma);
    const response = await GET(
      new Request("https://nest.quipsly.com/api/calendar/connections/google"),
    );
    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(payload.connection.accountLabel).toBe("Calendar account");
    expect(payload.calendars[0].accessRole).toBe("owner");
    expect(payload.selections[0].cursor).toEqual({
      lastFullSyncAt: "2026-08-01T00:00:00.000Z",
      lastIncrementalSyncAt: "2026-08-02T00:00:00.000Z",
    });
    const serialized = JSON.stringify(payload);
    expect(serialized).not.toContain("refresh-token");
    expect(serialized).not.toContain("access-token");
    expect(serialized).not.toContain("encrypted-not-a-token");
    expect(serialized).not.toContain("encrypted-cursor-must-not-escape");
    expect(payload.providerChecked).toBe(true);
  });

  it("returns a credential-free stored summary for mobile without contacting Google", async () => {
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue({
      user: { id: "user-1", primaryEmail: "person@example.com" },
    } as never);
    const stored = connection();
    const prisma = {
      calendarConnection: {
        findFirst: jest.fn().mockResolvedValue(stored),
      },
    };
    jest.mocked(getPrismaClient).mockReturnValue(prisma as never);

    const response = await GET(
      new Request(
        "https://nest.quipsly.com/api/calendar/connections/google?view=summary",
        { headers: { authorization: "Bearer verified-mobile-token" } },
      ),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.providerChecked).toBe(false);
    expect(payload.connection).toEqual({
      id: "connection-1",
      status: "VERIFIED",
      accountLabel: "Calendar account",
      verifiedAt: "2026-08-02T00:00:00.000Z",
      lastCheckedAt: "2026-08-02T01:00:00.000Z",
    });
    expect(payload.selections).toHaveLength(1);
    expect(payload.selections[0]).not.toHaveProperty("providerCalendarId");
    expect(decryptGoogleRefreshToken).not.toHaveBeenCalled();
    expect(refreshGoogleCalendarAccess).not.toHaveBeenCalled();
    expect(listOwnedGoogleCalendars).not.toHaveBeenCalled();
    expect(prisma.calendarConnection.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          metadataJson: true,
          collections: expect.any(Object),
        }),
      }),
    );
    const serialized = JSON.stringify(payload);
    expect(serialized).not.toContain("providerCalendarId");
    expect(serialized).not.toContain("encrypted-not-a-token");
  });

  it("forbids a read-only collaborator from binding a shared production calendar before Google access", async () => {
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue({
      user: { id: "user-1", primaryEmail: "person@example.com" },
    } as never);
    const prisma = {
      calendarConnection: {
        findFirst: jest.fn().mockResolvedValue(connection()),
        update: jest.fn().mockResolvedValue({}),
      },
      calendarCollection: { create: jest.fn(), update: jest.fn() },
      studioProject: {
        findUnique: jest.fn().mockResolvedValue({ slug: "episode-one" }),
      },
    };
    configureProvider(prisma);
    jest.mocked(resolveStudioProjectAccess).mockResolvedValue({
      allowed: false,
      role: "VIEWER",
      source: "grant",
      projectId: "project-denied",
      projectSlug: "episode-one",
    });
    const response = await POST(
      new Request("https://nest.quipsly.com/api/calendar/connections/google", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          purpose: "PODCAST_PRODUCTION",
          projectId: "project-denied",
          calendarId: "owned-1",
        }),
      }),
    );
    expect(response.status).toBe(403);
    expect(resolveStudioProjectAccess).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "write",
        projectSlug: "episode-one",
      }),
    );
    expect(refreshGoogleCalendarAccess).not.toHaveBeenCalled();
    expect(prisma.calendarCollection.create).not.toHaveBeenCalled();
    expect(prisma.calendarCollection.update).not.toHaveBeenCalled();
  });

  it("stops exact live channels and retires credentials and queued work when disconnected", async () => {
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue({
      user: { id: "user-1", primaryEmail: "person@example.com" },
    } as never);
    const transaction = {
      calendarNotificationChannel: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      calendarReconciliationWake: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      calendarCollection: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      calendarOAuthCredential: {
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      calendarConnection: { update: jest.fn().mockResolvedValue({}) },
      calendarSyncReceipt: {
        create: jest.fn().mockResolvedValue({ id: "receipt-1" }),
      },
    };
    const prisma = {
      calendarConnection: {
        findFirst: jest.fn().mockResolvedValue(connection()),
      },
      calendarNotificationChannel: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: "channel-row-1",
            channelId: "channel-1",
            resourceId: "resource-1",
          },
        ]),
      },
      $transaction: jest.fn(async (operation) => operation(transaction)),
    };
    configureProvider(prisma);
    jest.mocked(stopGoogleCalendarChannel).mockResolvedValue("stopped");
    jest.mocked(revokeGoogleCalendarToken).mockResolvedValue("revoked");

    const response = await DELETE(
      new Request("https://nest.quipsly.com/api/calendar/connections/google", {
        method: "DELETE",
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      disconnected: true,
    });
    expect(stopGoogleCalendarChannel).toHaveBeenCalledWith({
      accessToken: "access-token",
      channelId: "channel-1",
      resourceId: "resource-1",
    });
    expect(revokeGoogleCalendarToken).toHaveBeenCalledWith("refresh-token");
    expect(
      transaction.calendarReconciliationWake.updateMany,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          activeKey: null,
          status: "FAILED",
          lastErrorCode: "calendar-connection-revoked",
        }),
      }),
    );
    expect(transaction.calendarCollection.updateMany).toHaveBeenCalledWith({
      where: { connectionId: "connection-1" },
      data: { status: "REVOKED", liveUpdatesEnabled: false },
    });
    expect(transaction.calendarOAuthCredential.deleteMany).toHaveBeenCalledWith(
      {
        where: { connectionId: "connection-1" },
      },
    );
  });
});
