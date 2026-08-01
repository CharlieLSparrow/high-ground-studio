/** @jest-environment node */

import { getPrismaClient } from "@/lib/prisma";
import { decryptGoogleRefreshToken, getGoogleCalendarOAuthConfig, refreshGoogleCalendarAccess } from "@/lib/server/google-calendar-oauth";
import { cancelSessionGoogleCalendarProjection, writeSessionGoogleCalendarProjection } from "@/lib/server/google-calendar-session-projection";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";

import { DELETE, GET, POST } from "./route";

jest.mock("@/lib/prisma", () => ({ getPrismaClient: jest.fn() }));
jest.mock("@/lib/server/quipsly-session", () => ({ getQuipslySessionFromRequest: jest.fn() }));
jest.mock("@/lib/server/google-calendar-oauth", () => ({
  ...jest.requireActual("@/lib/server/google-calendar-oauth"),
  decryptGoogleRefreshToken: jest.fn(),
  getGoogleCalendarOAuthConfig: jest.fn(),
  refreshGoogleCalendarAccess: jest.fn(),
}));
jest.mock("@/lib/server/google-calendar-session-projection", () => ({
  ...jest.requireActual("@/lib/server/google-calendar-session-projection"),
  cancelSessionGoogleCalendarProjection: jest.fn(),
  writeSessionGoogleCalendarProjection: jest.fn(),
}));

const actor = {
  user: {
    id: "user-1",
    email: "person@example.com",
    primaryEmail: "person@example.com",
    isStaff: false,
  },
};

function room() {
  return {
    id: "room-1",
    title: "Episode recording",
    purpose: "PODCAST",
    status: "PLANNED",
    scheduledStart: new Date("2026-08-10T18:00:00.000Z"),
    scheduledEnd: new Date("2026-08-10T19:00:00.000Z"),
    metadataJson: { scheduledTimezone: "America/Denver" },
    projectId: "project-1",
    booking: null,
  };
}

function collection() {
  return {
    id: "collection-1",
    connectionId: "connection-1",
    displayName: "HGO Production",
    purpose: "PODCAST_PRODUCTION",
    visibility: "TEAM",
    timezone: "America/Denver",
    providerCalendarId: "provider-calendar-id",
    connection: {
      id: "connection-1",
      oauthCredential: { encryptedPayload: "encrypted-token" },
    },
  };
}

function prisma(overrides: Record<string, any> = {}) {
  return {
    callRoom: { findFirst: jest.fn().mockResolvedValue(room()) },
    calendarCollection: { findFirst: jest.fn().mockResolvedValue(collection()) },
    calendarProjection: { findUnique: jest.fn().mockResolvedValue(null) },
    ...overrides,
  };
}

describe("Session calendar projection route", () => {
  beforeEach(() => jest.clearAllMocks());

  it("rejects signed-out preview before reading Session or provider state", async () => {
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue(null);
    const response = await GET(
      new Request("https://nest.quipsly.com/api/calendar/sessions/room-1/projection?collectionId=collection-1"),
      { params: Promise.resolve({ roomId: "room-1" }) },
    );
    expect(response.status).toBe(401);
    expect(getPrismaClient).not.toHaveBeenCalled();
  });

  it("previews only the exact authorized Session and selected owned-calendar boundary without provider access", async () => {
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue(actor as never);
    const database = prisma();
    jest.mocked(getPrismaClient).mockReturnValue(database as never);
    const response = await GET(
      new Request("https://nest.quipsly.com/api/calendar/sessions/room-1/projection?collectionId=collection-1"),
      { params: Promise.resolve({ roomId: "room-1" }) },
    );
    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(payload.preview.action).toBe("CREATE");
    expect(payload.preview.sendUpdates).toBe("none");
    expect(payload.preview.snapshot.attendeesIncluded).toBe(false);
    expect(payload.preview.snapshot.privateSessionContentIncluded).toBe(false);
    expect(payload.preview.snapshot.providerVisibility).toBe("default");
    expect(payload.externalSideEffects).toBe(false);
    expect(refreshGoogleCalendarAccess).not.toHaveBeenCalled();
    expect(database.callRoom.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: "room-1" }),
    }));
    const serialized = JSON.stringify(payload);
    expect(serialized).not.toContain("encrypted-token");
    expect(serialized).not.toContain("provider-calendar-id");
    expect(serialized).not.toContain("person@example.com");
  });

  it("returns not found when the actor-scoped Session query denies access", async () => {
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue(actor as never);
    const database = prisma({ callRoom: { findFirst: jest.fn().mockResolvedValue(null) } });
    jest.mocked(getPrismaClient).mockReturnValue(database as never);
    const response = await GET(
      new Request("https://nest.quipsly.com/api/calendar/sessions/hidden/projection?collectionId=collection-1"),
      { params: Promise.resolve({ roomId: "hidden" }) },
    );
    expect(response.status).toBe(404);
    expect(database.calendarCollection.findFirst).not.toHaveBeenCalled();
  });

  it("rejects a stale preview before decrypting a credential or calling Google", async () => {
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue(actor as never);
    const database = prisma();
    jest.mocked(getPrismaClient).mockReturnValue(database as never);
    const response = await POST(
      new Request("https://nest.quipsly.com/api/calendar/sessions/room-1/projection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ collectionId: "collection-1", expectedSourceRevision: "stale" }),
      }),
      { params: Promise.resolve({ roomId: "room-1" }) },
    );
    const payload = await response.json();
    expect(response.status).toBe(409);
    expect(payload.code).toBe("stale-session-preview");
    expect(payload.externalSideEffects).toBe(false);
    expect(refreshGoogleCalendarAccess).not.toHaveBeenCalled();
  });

  it("uses the canonical Session mutation boundary for provider writes", async () => {
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue(actor as never);
    const database = prisma({ callRoom: { findFirst: jest.fn().mockResolvedValue(null) } });
    jest.mocked(getPrismaClient).mockReturnValue(database as never);
    const response = await POST(
      new Request("https://nest.quipsly.com/api/calendar/sessions/room-1/projection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ collectionId: "collection-1", expectedSourceRevision: "revision" }),
      }),
      { params: Promise.resolve({ roomId: "room-1" }) },
    );
    expect(response.status).toBe(404);
    const where = database.callRoom.findFirst.mock.calls[0][0].where;
    expect(where.OR).toEqual(expect.arrayContaining([
      expect.objectContaining({
        project: {
          accessGrants: {
            some: expect.objectContaining({ role: { in: ["OWNER", "EDITOR"] } }),
          },
        },
      }),
    ]));
    expect(refreshGoogleCalendarAccess).not.toHaveBeenCalled();
    expect(writeSessionGoogleCalendarProjection).not.toHaveBeenCalled();
  });

  it("persists the exact provider version and append-only effect receipt after explicit confirmation", async () => {
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue(actor as never);
    const transaction = {
      calendarProjection: { upsert: jest.fn().mockResolvedValue({ id: "projection-1" }) },
      calendarSyncReceipt: { create: jest.fn().mockResolvedValue({ id: "receipt-1" }) },
    };
    const database = prisma({ $transaction: jest.fn(async (operation) => operation(transaction)) });
    jest.mocked(getPrismaClient).mockReturnValue(database as never);
    jest.mocked(getGoogleCalendarOAuthConfig).mockReturnValue({ encryptionKey: Buffer.alloc(32) } as never);
    jest.mocked(decryptGoogleRefreshToken).mockReturnValue("refresh-token");
    jest.mocked(refreshGoogleCalendarAccess).mockResolvedValue("access-token");
    jest.mocked(writeSessionGoogleCalendarProjection).mockResolvedValue({
      outcome: "SYNCED",
      externalMutated: true,
      providerEventId: "provider-event-1",
      providerEtag: '"etag-2"',
      providerUpdatedAt: "2026-08-02T02:00:00.000Z",
      providerStatus: "confirmed",
      recoveredCreate: false,
    });

    const previewResponse = await GET(
      new Request("https://nest.quipsly.com/api/calendar/sessions/room-1/projection?collectionId=collection-1"),
      { params: Promise.resolve({ roomId: "room-1" }) },
    );
    const preview = (await previewResponse.json()).preview;
    const response = await POST(
      new Request("https://nest.quipsly.com/api/calendar/sessions/room-1/projection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ collectionId: "collection-1", expectedSourceRevision: preview.sourceRevision }),
      }),
      { params: Promise.resolve({ roomId: "room-1" }) },
    );
    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(payload.result).toMatchObject({ projectionId: "projection-1", receiptId: "receipt-1", externalMutated: true });
    expect(writeSessionGoogleCalendarProjection).toHaveBeenCalledWith(expect.objectContaining({
      accessToken: "access-token",
      calendarId: "provider-calendar-id",
      preview: expect.objectContaining({ sourceRevision: preview.sourceRevision, action: "CREATE" }),
    }));
    expect(transaction.calendarProjection.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ providerEventId: "provider-event-1", providerEtag: '"etag-2"', sourceRevision: preview.sourceRevision }),
    }));
    expect(transaction.calendarSyncReceipt.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ operation: "CREATE_EVENT", outcome: "SUCCEEDED", externalMutated: true, requestDigest: preview.sourceRevision }),
    });
  });

  it("requires a separate explicit action for every canceled Session preview", async () => {
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue(actor as never);
    const canceledRoom = { ...room(), status: "CANCELED" };
    const database = prisma({ callRoom: { findFirst: jest.fn().mockResolvedValue(canceledRoom) } });
    jest.mocked(getPrismaClient).mockReturnValue(database as never);
    const previewResponse = await GET(
      new Request("https://nest.quipsly.com/api/calendar/sessions/room-1/projection?collectionId=collection-1"),
      { params: Promise.resolve({ roomId: "room-1" }) },
    );
    const preview = (await previewResponse.json()).preview;
    expect(preview.action).toBe("NOOP");
    const response = await POST(
      new Request("https://nest.quipsly.com/api/calendar/sessions/room-1/projection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ collectionId: "collection-1", expectedSourceRevision: preview.sourceRevision }),
      }),
      { params: Promise.resolve({ roomId: "room-1" }) },
    );
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      ok: false,
      code: "cancellation-requires-separate-action",
      externalSideEffects: false,
    });
    expect(refreshGoogleCalendarAccess).not.toHaveBeenCalled();
  });

  it("records an explicit local cancellation when no provider event was ever projected", async () => {
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue(actor as never);
    const canceledRoom = { ...room(), status: "CANCELED" };
    const transaction = {
      calendarProjection: { upsert: jest.fn().mockResolvedValue({ id: "projection-canceled" }) },
      calendarSyncReceipt: { create: jest.fn().mockResolvedValue({ id: "receipt-canceled" }) },
    };
    const database = prisma({
      callRoom: { findFirst: jest.fn().mockResolvedValue(canceledRoom) },
      $transaction: jest.fn(async (operation) => operation(transaction)),
    });
    jest.mocked(getPrismaClient).mockReturnValue(database as never);
    jest.mocked(cancelSessionGoogleCalendarProjection).mockResolvedValue({
      outcome: "ALREADY_ABSENT",
      externalMutated: false,
      providerEventId: null,
      providerEtag: null,
      providerUpdatedAt: null,
      providerStatus: "not-projected",
      providerAlreadyAbsent: true,
    });
    const previewResponse = await GET(
      new Request("https://nest.quipsly.com/api/calendar/sessions/room-1/projection?collectionId=collection-1"),
      { params: Promise.resolve({ roomId: "room-1" }) },
    );
    const preview = (await previewResponse.json()).preview;
    const response = await DELETE(
      new Request("https://nest.quipsly.com/api/calendar/sessions/room-1/projection", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          collectionId: "collection-1",
          expectedSourceRevision: preview.sourceRevision,
          confirmCancellation: true,
        }),
      }),
      { params: Promise.resolve({ roomId: "room-1" }) },
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ok: true,
      result: {
        action: "CANCEL",
        externalMutated: false,
        providerAlreadyAbsent: true,
      },
    });
    expect(refreshGoogleCalendarAccess).not.toHaveBeenCalled();
    expect(transaction.calendarProjection.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ status: "CANCELED", providerEventId: null }),
    }));
    expect(transaction.calendarSyncReceipt.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        operation: "CANCEL_EVENT",
        outcome: "SKIPPED",
        externalMutated: false,
        providerStatus: "not-projected",
      }),
    });
  });

  it("replays an exact recorded cancellation without another provider call or receipt", async () => {
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue(actor as never);
    const canceledRoom = { ...room(), status: "CANCELED" };
    const canceledProjection = {
      id: "projection-canceled",
      providerEventId: null,
      providerEtag: null,
      sourceRevision: "will-be-replaced",
      conflictState: "NONE",
      status: "CANCELED",
    };
    const database = prisma({
      callRoom: { findFirst: jest.fn().mockResolvedValue(canceledRoom) },
      calendarProjection: { findUnique: jest.fn().mockResolvedValue(canceledProjection) },
      calendarSyncReceipt: {
        findFirst: jest.fn().mockResolvedValue({
          id: "receipt-canceled",
          externalMutated: false,
          providerStatus: "not-projected",
          metadataJson: { providerAlreadyAbsent: true },
        }),
      },
      $transaction: jest.fn(),
    });
    jest.mocked(getPrismaClient).mockReturnValue(database as never);
    const previewResponse = await GET(
      new Request("https://nest.quipsly.com/api/calendar/sessions/room-1/projection?collectionId=collection-1"),
      { params: Promise.resolve({ roomId: "room-1" }) },
    );
    const preview = (await previewResponse.json()).preview;
    const response = await DELETE(
      new Request("https://nest.quipsly.com/api/calendar/sessions/room-1/projection", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          collectionId: "collection-1",
          expectedSourceRevision: preview.sourceRevision,
          confirmCancellation: true,
        }),
      }),
      { params: Promise.resolve({ roomId: "room-1" }) },
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ok: true,
      result: {
        projectionId: "projection-canceled",
        receiptId: "receipt-canceled",
        externalMutated: false,
        providerAlreadyAbsent: true,
        idempotentReplay: true,
      },
    });
    expect(cancelSessionGoogleCalendarProjection).not.toHaveBeenCalled();
    expect(refreshGoogleCalendarAccess).not.toHaveBeenCalled();
    expect((database as any).$transaction).not.toHaveBeenCalled();
  });

  it("removes only the etag-matched provider event and retains its identity for audit", async () => {
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue(actor as never);
    const canceledRoom = { ...room(), status: "CANCELED" };
    const existingProjection = {
      id: "projection-1",
      providerEventId: "provider-event-1",
      providerEtag: '"etag-1"',
      sourceRevision: "old-revision",
      conflictState: "NONE",
      status: "SYNCED",
    };
    const transaction = {
      calendarProjection: { upsert: jest.fn().mockResolvedValue({ id: "projection-1" }) },
      calendarSyncReceipt: { create: jest.fn().mockResolvedValue({ id: "receipt-cancel" }) },
    };
    const database = prisma({
      callRoom: { findFirst: jest.fn().mockResolvedValue(canceledRoom) },
      calendarProjection: { findUnique: jest.fn().mockResolvedValue(existingProjection) },
      $transaction: jest.fn(async (operation) => operation(transaction)),
    });
    jest.mocked(getPrismaClient).mockReturnValue(database as never);
    jest.mocked(getGoogleCalendarOAuthConfig).mockReturnValue({ encryptionKey: Buffer.alloc(32) } as never);
    jest.mocked(decryptGoogleRefreshToken).mockReturnValue("refresh-token");
    jest.mocked(refreshGoogleCalendarAccess).mockResolvedValue("access-token");
    jest.mocked(cancelSessionGoogleCalendarProjection).mockResolvedValue({
      outcome: "CANCELED",
      externalMutated: true,
      providerEventId: "provider-event-1",
      providerEtag: null,
      providerUpdatedAt: null,
      providerStatus: "cancelled",
      providerAlreadyAbsent: false,
    });
    const previewResponse = await GET(
      new Request("https://nest.quipsly.com/api/calendar/sessions/room-1/projection?collectionId=collection-1"),
      { params: Promise.resolve({ roomId: "room-1" }) },
    );
    const preview = (await previewResponse.json()).preview;
    expect(preview.action).toBe("CANCEL");
    const response = await DELETE(
      new Request("https://nest.quipsly.com/api/calendar/sessions/room-1/projection", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          collectionId: "collection-1",
          expectedSourceRevision: preview.sourceRevision,
          confirmCancellation: true,
        }),
      }),
      { params: Promise.resolve({ roomId: "room-1" }) },
    );
    expect(response.status).toBe(200);
    expect(cancelSessionGoogleCalendarProjection).toHaveBeenCalledWith(expect.objectContaining({
      accessToken: "access-token",
      calendarId: "provider-calendar-id",
      preview: expect.objectContaining({ action: "CANCEL" }),
    }));
    expect(transaction.calendarProjection.upsert).toHaveBeenCalledWith(expect.objectContaining({
      update: expect.objectContaining({
        providerEventId: "provider-event-1",
        providerEtag: null,
        status: "CANCELED",
      }),
    }));
    expect(transaction.calendarSyncReceipt.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        operation: "CANCEL_EVENT",
        outcome: "SUCCEEDED",
        externalMutated: true,
        providerStatus: "cancelled",
      }),
    });
  });

  it("records provider truth when Session authority changes after confirmed removal", async () => {
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue(actor as never);
    const canceledRoom = { ...room(), status: "CANCELED" };
    const existingProjection = {
      id: "projection-1",
      providerEventId: "provider-event-1",
      providerEtag: '"etag-1"',
      sourceRevision: "old-revision",
      conflictState: "NONE",
      status: "SYNCED",
    };
    const transaction = {
      calendarProjection: { update: jest.fn().mockResolvedValue({ id: "projection-1" }) },
      calendarSyncReceipt: { create: jest.fn().mockResolvedValue({ id: "receipt-conflict" }) },
    };
    const database = prisma({
      callRoom: {
        findFirst: jest.fn()
          .mockResolvedValueOnce(canceledRoom)
          .mockResolvedValueOnce(canceledRoom)
          .mockResolvedValueOnce(null),
      },
      calendarProjection: { findUnique: jest.fn().mockResolvedValue(existingProjection) },
      $transaction: jest.fn(async (operation) => operation(transaction)),
    });
    jest.mocked(getPrismaClient).mockReturnValue(database as never);
    jest.mocked(getGoogleCalendarOAuthConfig).mockReturnValue({ encryptionKey: Buffer.alloc(32) } as never);
    jest.mocked(decryptGoogleRefreshToken).mockReturnValue("refresh-token");
    jest.mocked(refreshGoogleCalendarAccess).mockResolvedValue("access-token");
    jest.mocked(cancelSessionGoogleCalendarProjection).mockResolvedValue({
      outcome: "CANCELED",
      externalMutated: true,
      providerEventId: "provider-event-1",
      providerEtag: null,
      providerUpdatedAt: null,
      providerStatus: "cancelled",
      providerAlreadyAbsent: false,
    });

    const previewResponse = await GET(
      new Request("https://nest.quipsly.com/api/calendar/sessions/room-1/projection?collectionId=collection-1"),
      { params: Promise.resolve({ roomId: "room-1" }) },
    );
    const preview = (await previewResponse.json()).preview;
    const response = await DELETE(
      new Request("https://nest.quipsly.com/api/calendar/sessions/room-1/projection", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          collectionId: "collection-1",
          expectedSourceRevision: preview.sourceRevision,
          confirmCancellation: true,
        }),
      }),
      { params: Promise.resolve({ roomId: "room-1" }) },
    );
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      code: "post-provider-verification-failed",
      projectionId: "projection-1",
      receiptId: "receipt-conflict",
      externalSideEffects: true,
    });
    expect(transaction.calendarProjection.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "projection-1" },
      data: expect.objectContaining({ status: "CONFLICT", conflictState: "QUIPSLY_CHANGED", providerEtag: null }),
    }));
    expect(transaction.calendarSyncReceipt.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        operation: "CANCEL_EVENT",
        outcome: "CONFLICT",
        externalMutated: true,
        providerStatus: "cancelled",
      }),
    });
  });
});
