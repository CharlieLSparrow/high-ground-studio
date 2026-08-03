/** @jest-environment node */

import { createHash } from "node:crypto";

import { acquirePrismaAdvisoryTransactionLock } from "@/lib/server/prisma-advisory-lock";
import {
  decryptGoogleRefreshToken,
  getGoogleCalendarOAuthConfig,
  refreshGoogleCalendarAccess,
} from "@/lib/server/google-calendar-oauth";

import {
  GoogleCalendarPushError,
  enableGoogleCalendarLiveUpdates,
  queueGoogleCalendarReconciliationWake,
  receiveGoogleCalendarNotification,
  stopGoogleCalendarChannel,
  watchGoogleCalendarEvents,
} from "./google-calendar-push";

jest.mock("@/lib/server/prisma-advisory-lock", () => ({
  acquirePrismaAdvisoryTransactionLock: jest.fn(),
}));
jest.mock("@/lib/server/studio-project-access", () => ({
  resolveStudioProjectAccess: jest.fn(),
}));
jest.mock("@/lib/server/google-calendar-oauth", () => ({
  ...jest.requireActual("@/lib/server/google-calendar-oauth"),
  decryptGoogleRefreshToken: jest.fn(),
  getGoogleCalendarOAuthConfig: jest.fn(),
  refreshGoogleCalendarAccess: jest.fn(),
}));

function tokenDigest(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function channel(overrides: Record<string, unknown> = {}) {
  return {
    id: "channel-row-1",
    channelId: "channel-1",
    collectionId: "collection-1",
    resourceId: "resource-1",
    tokenDigest: tokenDigest("secret-token"),
    status: "ACTIVE",
    expiresAt: new Date("2026-08-10T00:00:00.000Z"),
    lastMessageNumber: null,
    collection: {
      id: "collection-1",
      connectionId: "connection-1",
      status: "ACTIVE",
      liveUpdatesEnabled: true,
      connection: { status: "VERIFIED" },
    },
    ...overrides,
  };
}

describe("Google Calendar watch provider contract", () => {
  it("starts an events watch with an exact HTTPS callback, opaque token, and bounded TTL", async () => {
    const fetchImpl = jest.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "channel-1",
          resourceId: "resource-1",
          expiration: String(new Date("2026-08-10T00:00:00.000Z").getTime()),
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    const result = await watchGoogleCalendarEvents({
      accessToken: "access-token",
      calendarId: "owner@example.com",
      channelId: "channel-1",
      channelToken: "opaque-token",
      address:
        "https://nest.quipsly.com/api/calendar/connections/google/notifications",
      fetchImpl,
    });
    expect(result).toEqual({
      resourceId: "resource-1",
      expiresAt: new Date("2026-08-10T00:00:00.000Z"),
    });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe(
      "https://www.googleapis.com/calendar/v3/calendars/owner%40example.com/events/watch",
    );
    expect(init.headers.Authorization).toBe("Bearer access-token");
    expect(JSON.parse(init.body)).toEqual({
      id: "channel-1",
      type: "web_hook",
      address:
        "https://nest.quipsly.com/api/calendar/connections/google/notifications",
      token: "opaque-token",
      params: { ttl: "604800" },
    });
  });

  it("refuses an unverifiable watch response", async () => {
    await expect(
      watchGoogleCalendarEvents({
        accessToken: "access-token",
        calendarId: "calendar-1",
        channelId: "expected-channel",
        channelToken: "opaque-token",
        address:
          "https://nest.quipsly.com/api/calendar/connections/google/notifications",
        fetchImpl: jest.fn().mockResolvedValue(
          new Response(
            JSON.stringify({ id: "other-channel", resourceId: "resource-1" }),
            {
              status: 200,
            },
          ),
        ),
      }),
    ).rejects.toMatchObject({ code: "calendar-watch-200" });
  });

  it("treats an already-absent channel as stopped", async () => {
    const result = await stopGoogleCalendarChannel({
      accessToken: "access-token",
      channelId: "channel-1",
      resourceId: "resource-1",
      fetchImpl: jest
        .fn()
        .mockResolvedValue(new Response(null, { status: 404 })),
    });
    expect(result).toBe("already-stopped");
  });
});

describe("Google Calendar wake deduplication", () => {
  it("marks a processing wake for a required follow-up reconciliation", async () => {
    const transaction = {
      calendarReconciliationWake: {
        findUnique: jest.fn().mockResolvedValue({
          id: "wake-1",
          status: "PROCESSING",
          availableAt: new Date("2026-08-03T00:00:00.000Z"),
        }),
        update: jest.fn().mockResolvedValue({ id: "wake-1" }),
      },
    };
    await expect(
      queueGoogleCalendarReconciliationWake(transaction, {
        collectionId: "collection-1",
        reason: "google-exists",
        metadataJson: { source: "verified-google-watch-notification" },
        now: new Date("2026-08-03T00:00:01.000Z"),
      }),
    ).resolves.toEqual({ wakeId: "wake-1", deduplicated: true });
    expect(transaction.calendarReconciliationWake.update).toHaveBeenCalledWith({
      where: { id: "wake-1" },
      data: {
        reason: "google-exists",
        metadataJson: {
          source: "verified-google-watch-notification",
          requeueAfterProcessing: true,
        },
      },
    });
  });
});

describe("Google Calendar notification receipt", () => {
  beforeEach(() => jest.clearAllMocks());

  it("rejects a wrong channel token before opening a transaction", async () => {
    const prisma = {
      calendarNotificationChannel: {
        findUnique: jest.fn().mockResolvedValue(channel()),
      },
      $transaction: jest.fn(),
    };
    await expect(
      receiveGoogleCalendarNotification({
        prisma,
        channelId: "channel-1",
        channelToken: "wrong-token",
        resourceId: "resource-1",
        resourceState: "exists",
        messageNumber: "1",
        now: new Date("2026-08-03T00:00:00.000Z"),
      }),
    ).rejects.toMatchObject({ status: 404 });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("accepts the early sync race without trusting an unknown resource identity", async () => {
    const prisma = {
      calendarNotificationChannel: {
        findUnique: jest
          .fn()
          .mockResolvedValue(
            channel({ status: "STARTING", resourceId: null, expiresAt: null }),
          ),
      },
      $transaction: jest.fn(),
    };
    await expect(
      receiveGoogleCalendarNotification({
        prisma,
        channelId: "channel-1",
        channelToken: "secret-token",
        resourceId: "not-yet-bound",
        resourceState: "sync",
        messageNumber: "1",
        now: new Date("2026-08-03T00:00:00.000Z"),
      }),
    ).resolves.toEqual({
      accepted: true,
      queued: false,
      reason: "watch-still-starting",
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("records a verified identity-only notification and creates one active wake", async () => {
    const current = channel();
    const transaction = {
      calendarNotificationChannel: {
        findUnique: jest.fn().mockResolvedValue(current),
        update: jest.fn().mockResolvedValue({}),
      },
      calendarReconciliationWake: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: "wake-1" }),
      },
      calendarSyncReceipt: {
        create: jest.fn().mockResolvedValue({ id: "receipt-1" }),
      },
    };
    const prisma = {
      calendarNotificationChannel: {
        findUnique: jest.fn().mockResolvedValue(current),
      },
      $transaction: jest.fn(async (operation) => operation(transaction)),
    };
    const result = await receiveGoogleCalendarNotification({
      prisma,
      channelId: "channel-1",
      channelToken: "secret-token",
      resourceId: "resource-1",
      resourceState: "exists",
      messageNumber: "90071992547409930001",
      now: new Date("2026-08-03T00:00:00.000Z"),
    });
    expect(result).toMatchObject({
      accepted: true,
      queued: true,
      wakeId: "wake-1",
    });
    expect(acquirePrismaAdvisoryTransactionLock).toHaveBeenNthCalledWith(
      1,
      transaction,
      "google-calendar-notification:channel-1",
    );
    expect(acquirePrismaAdvisoryTransactionLock).toHaveBeenNthCalledWith(
      2,
      transaction,
      "google-calendar-wake:collection-1",
    );
    expect(transaction.calendarNotificationChannel.update).toHaveBeenCalledWith(
      {
        where: { id: "channel-row-1" },
        data: {
          lastMessageNumber: "90071992547409930001",
          lastResourceState: "exists",
          lastNotificationAt: new Date("2026-08-03T00:00:00.000Z"),
        },
      },
    );
    expect(transaction.calendarReconciliationWake.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        activeKey: "collection-1",
        collectionId: "collection-1",
        status: "QUEUED",
      }),
    });
    const serialized = JSON.stringify(
      transaction.calendarSyncReceipt.create.mock.calls,
    );
    expect(serialized).not.toContain("secret-token");
    expect(serialized).not.toContain("resource-1");
  });

  it("deduplicates an older message without creating another wake", async () => {
    const current = channel({ lastMessageNumber: "10" });
    const transaction = {
      calendarNotificationChannel: {
        findUnique: jest.fn().mockResolvedValue(current),
      },
      calendarReconciliationWake: { findUnique: jest.fn(), create: jest.fn() },
      calendarSyncReceipt: { create: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      calendarNotificationChannel: {
        findUnique: jest.fn().mockResolvedValue(current),
      },
      $transaction: jest.fn(async (operation) => operation(transaction)),
    };
    await expect(
      receiveGoogleCalendarNotification({
        prisma,
        channelId: "channel-1",
        channelToken: "secret-token",
        resourceId: "resource-1",
        resourceState: "exists",
        messageNumber: "9",
        now: new Date("2026-08-03T00:00:00.000Z"),
      }),
    ).resolves.toMatchObject({
      queued: false,
      reason: "duplicate-or-out-of-order",
    });
    expect(
      transaction.calendarReconciliationWake.findUnique,
    ).not.toHaveBeenCalled();
    expect(transaction.calendarSyncReceipt.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ outcome: "SKIPPED" }),
    });
  });

  it("rejects a notification after its lease expires", async () => {
    const prisma = {
      calendarNotificationChannel: {
        findUnique: jest
          .fn()
          .mockResolvedValue(
            channel({ expiresAt: new Date("2026-08-02T00:00:00.000Z") }),
          ),
      },
      $transaction: jest.fn(),
    };
    await expect(
      receiveGoogleCalendarNotification({
        prisma,
        channelId: "channel-1",
        channelToken: "secret-token",
        resourceId: "resource-1",
        resourceState: "exists",
        messageNumber: "1",
        now: new Date("2026-08-03T00:00:00.000Z"),
      }),
    ).rejects.toBeInstanceOf(GoogleCalendarPushError);
  });
});

describe("Google Calendar live-update activation", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.GOOGLE_CALENDAR_PUSH_WORKER_SERVICE_ACCOUNT =
      "calendar-push-worker@test-project.iam.gserviceaccount.com";
    process.env.GOOGLE_CALENDAR_PUSH_WORKER_AUDIENCE =
      "https://calendar-push-worker.example.test";
    jest
      .mocked(getGoogleCalendarOAuthConfig)
      .mockReturnValue({ encryptionKey: Buffer.alloc(32) } as never);
    jest.mocked(decryptGoogleRefreshToken).mockReturnValue("refresh-token");
    jest.mocked(refreshGoogleCalendarAccess).mockResolvedValue("access-token");
  });

  it("persists only the token digest, activates before draining the prior lease, and queues an initial check", async () => {
    const expiresAt = new Date("2026-08-10T00:00:00.000Z");
    const providerFetch = jest.fn();
    // The channel id is random, so mirror it into the watch response.
    providerFetch.mockImplementationOnce(
      async (_url: string, init: RequestInit) => {
        const requestBody = JSON.parse(String(init.body));
        return new Response(
          JSON.stringify({
            id: requestBody.id,
            resourceId: "resource-new",
            expiration: String(expiresAt.getTime()),
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      },
    );
    providerFetch.mockResolvedValueOnce(new Response(null, { status: 204 }));
    const collection = {
      id: "collection-1",
      connectionId: "connection-1",
      ownerUserId: "user-1",
      nestId: null,
      nest: null,
      providerCalendarId: "calendar-1",
      connection: { oauthCredential: { encryptedPayload: "encrypted" } },
      notificationChannels: [
        {
          id: "old-row",
          channelId: "old-channel",
          resourceId: "old-resource",
          status: "ACTIVE",
        },
      ],
    };
    const transaction = {
      calendarNotificationChannel: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        update: jest.fn().mockResolvedValue({
          id: "new-row",
          channelId: "new-channel",
          expiresAt,
        }),
      },
      calendarCollection: { update: jest.fn().mockResolvedValue({}) },
      calendarReconciliationWake: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: "wake-1" }),
      },
      calendarSyncReceipt: {
        create: jest.fn().mockResolvedValue({ id: "receipt-1" }),
      },
    };
    const prisma = {
      calendarCollection: {
        findFirst: jest.fn().mockResolvedValue(collection),
      },
      calendarNotificationChannel: {
        create: jest.fn().mockResolvedValue({ id: "new-row" }),
        update: jest.fn().mockResolvedValue({}),
      },
      $transaction: jest.fn(async (operation) => operation(transaction)),
    };
    const result = await enableGoogleCalendarLiveUpdates({
      prisma,
      collectionId: "collection-1",
      actorUserId: "user-1",
      actorEmail: "owner@example.com",
      requestUrl:
        "https://nest.quipsly.com/api/calendar/connections/google/live-updates",
      now: new Date("2026-08-03T00:00:00.000Z"),
      fetchImpl: providerFetch,
    });
    expect(result).toMatchObject({ wakeId: "wake-1", receiptId: "receipt-1" });
    const watchBody = JSON.parse(String(providerFetch.mock.calls[0][1].body));
    expect(watchBody.token).toHaveLength(43);
    expect(prisma.calendarNotificationChannel.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        channelId: expect.any(String),
        tokenDigest: createHash("sha256").update(watchBody.token).digest("hex"),
        status: "STARTING",
      }),
    });
    expect(
      JSON.stringify(prisma.calendarNotificationChannel.create.mock.calls),
    ).not.toContain(watchBody.token);
    expect(
      transaction.calendarNotificationChannel.updateMany.mock
        .invocationCallOrder[0],
    ).toBeLessThan(
      prisma.calendarNotificationChannel.update.mock.invocationCallOrder[0],
    );
    expect(transaction.calendarCollection.update).toHaveBeenCalledWith({
      where: { id: "collection-1" },
      data: { liveUpdatesEnabled: true },
    });
    expect(providerFetch).toHaveBeenCalledTimes(2);
    expect(prisma.calendarNotificationChannel.update).toHaveBeenCalledWith({
      where: { id: "old-row" },
      data: {
        status: "STOPPED",
        stoppedAt: new Date("2026-08-03T00:00:00.000Z"),
      },
    });
  });
});
