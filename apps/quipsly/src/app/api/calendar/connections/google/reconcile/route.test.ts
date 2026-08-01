/** @jest-environment node */

import { getPrismaClient } from "@/lib/prisma";
import {
  decryptGoogleCalendarSyncToken,
  decryptGoogleRefreshToken,
  encryptGoogleCalendarSyncToken,
  getGoogleCalendarOAuthConfig,
  refreshGoogleCalendarAccess,
} from "@/lib/server/google-calendar-oauth";
import { readGoogleCalendarReconciliation } from "@/lib/server/google-calendar-reconciliation";
import { acquirePrismaAdvisoryTransactionLock } from "@/lib/server/prisma-advisory-lock";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";
import { resolveStudioProjectAccess } from "@/lib/server/studio-project-access";

import { POST } from "./route";

jest.mock("@/lib/prisma", () => ({ getPrismaClient: jest.fn() }));
jest.mock("@/lib/server/quipsly-session", () => ({
  getQuipslySessionFromRequest: jest.fn(),
}));
jest.mock("@/lib/server/studio-project-access", () => ({
  resolveStudioProjectAccess: jest.fn(),
}));
jest.mock("@/lib/server/prisma-advisory-lock", () => ({
  acquirePrismaAdvisoryTransactionLock: jest.fn(),
}));
jest.mock("@/lib/server/google-calendar-oauth", () => ({
  ...jest.requireActual("@/lib/server/google-calendar-oauth"),
  decryptGoogleCalendarSyncToken: jest.fn(),
  decryptGoogleRefreshToken: jest.fn(),
  encryptGoogleCalendarSyncToken: jest.fn(),
  getGoogleCalendarOAuthConfig: jest.fn(),
  refreshGoogleCalendarAccess: jest.fn(),
}));
jest.mock("@/lib/server/google-calendar-reconciliation", () => ({
  ...jest.requireActual("@/lib/server/google-calendar-reconciliation"),
  readGoogleCalendarReconciliation: jest.fn(),
}));

const actor = {
  user: {
    id: "user-1",
    email: "editor@example.com",
    primaryEmail: "editor@example.com",
    isStaff: false,
  },
};

function collection(overrides: Record<string, unknown> = {}) {
  return {
    id: "collection-1",
    connectionId: "connection-1",
    ownerUserId: "user-1",
    nestId: null,
    providerCalendarId: "provider-calendar",
    nest: null,
    cursor: null,
    connection: { oauthCredential: { encryptedPayload: "encrypted-refresh" } },
    ...overrides,
  };
}

function configureSecrets() {
  jest
    .mocked(getGoogleCalendarOAuthConfig)
    .mockReturnValue({ encryptionKey: Buffer.alloc(32) } as never);
  jest.mocked(decryptGoogleRefreshToken).mockReturnValue("refresh-token");
  jest.mocked(decryptGoogleCalendarSyncToken).mockReturnValue("prior-token");
  jest
    .mocked(encryptGoogleCalendarSyncToken)
    .mockReturnValue("encrypted-next-token");
  jest.mocked(refreshGoogleCalendarAccess).mockResolvedValue("access-token");
}

function request() {
  return new Request(
    "https://nest.quipsly.com/api/calendar/connections/google/reconcile",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ collectionId: "collection-1" }),
    },
  );
}

describe("Google Calendar reconciliation route", () => {
  beforeEach(() => jest.clearAllMocks());

  it("denies a viewer-owned legacy team selection before token or provider access", async () => {
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue(actor as never);
    const database = {
      calendarCollection: {
        findFirst: jest.fn().mockResolvedValue(
          collection({
            ownerUserId: null,
            nestId: "project-1",
            nest: { id: "project-1", slug: "episode-one" },
          }),
        ),
      },
    };
    jest.mocked(getPrismaClient).mockReturnValue(database as never);
    jest.mocked(resolveStudioProjectAccess).mockResolvedValue({
      allowed: false,
      role: "VIEWER",
      source: "grant",
      projectId: "project-1",
      projectSlug: "episode-one",
    });
    const response = await POST(request());
    expect(response.status).toBe(403);
    expect(resolveStudioProjectAccess).toHaveBeenCalledWith(
      expect.objectContaining({ action: "write" }),
    );
    expect(decryptGoogleRefreshToken).not.toHaveBeenCalled();
    expect(readGoogleCalendarReconciliation).not.toHaveBeenCalled();
  });

  it("persists a privacy-safe full cursor and provider conflict receipt", async () => {
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue(actor as never);
    configureSecrets();
    const initial = collection();
    const projection = {
      id: "projection-1",
      providerEventId: "event-1",
      providerEtag: '"etag-1"',
      providerUpdatedAt: null,
      sourceType: "CallRoom",
      sourceId: "room-1",
      sourceRevision: "revision-1",
      status: "SYNCED",
      conflictState: "NONE",
    };
    const transaction = {
      calendarCollection: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ id: initial.id, nestId: null }),
      },
      calendarSyncReceipt: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest
          .fn()
          .mockResolvedValueOnce({ id: "event-receipt" })
          .mockResolvedValueOnce({ id: "sync-receipt" }),
      },
      calendarProjection: {
        findMany: jest.fn().mockResolvedValue([projection]),
        update: jest.fn().mockResolvedValue({}),
      },
      calendarSyncCursor: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockResolvedValue({}),
      },
    };
    const database = {
      calendarCollection: { findFirst: jest.fn().mockResolvedValue(initial) },
      $transaction: jest.fn(async (operation) => operation(transaction)),
    };
    jest.mocked(getPrismaClient).mockReturnValue(database as never);
    jest.mocked(readGoogleCalendarReconciliation).mockResolvedValue({
      status: "SYNCED",
      mode: "FULL",
      events: [
        {
          id: "event-1",
          etag: '"etag-external"',
          status: "confirmed",
          updatedAt: "2026-08-01T01:00:00.000Z",
          quipslySourceType: "CallRoom",
          quipslySourceId: "room-1",
          quipslySourceRevision: "revision-1",
          quipslySchema: "quipsly-session-calendar-snapshot-v1",
        },
      ],
      nextSyncToken: "next-token",
      pageCount: 1,
    });
    const response = await POST(request());
    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(payload.result).toMatchObject({
      mode: "FULL",
      changedProjectionCount: 1,
      conflictCount: 1,
      externalMutated: false,
    });
    expect(acquirePrismaAdvisoryTransactionLock).toHaveBeenCalledWith(
      transaction,
      "google-calendar-reconciliation:collection-1",
    );
    expect(transaction.calendarProjection.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "CONFLICT",
          conflictState: "EXTERNAL_CHANGED",
          providerEtag: '"etag-external"',
        }),
      }),
    );
    expect(transaction.calendarSyncCursor.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          syncTokenRef: "encrypted-next-token",
        }),
      }),
    );
    expect(transaction.calendarSyncReceipt.create).toHaveBeenLastCalledWith({
      data: expect.objectContaining({
        operation: "FULL_SYNC",
        outcome: "CONFLICT",
        externalMutated: false,
      }),
    });
    expect(
      JSON.stringify(transaction.calendarSyncReceipt.create.mock.calls),
    ).not.toContain("next-token");
    expect(JSON.stringify(payload)).not.toContain("event-1");
  });

  it("recovers an expired incremental token through a bounded full sync", async () => {
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue(actor as never);
    configureSecrets();
    const initial = collection({ cursor: { syncTokenRef: "encrypted-prior" } });
    const transaction = {
      calendarCollection: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ id: initial.id, nestId: null }),
      },
      calendarSyncReceipt: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: "sync-receipt" }),
      },
      calendarProjection: {
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn(),
      },
      calendarSyncCursor: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ syncTokenRef: "encrypted-prior" }),
        upsert: jest.fn().mockResolvedValue({}),
      },
    };
    const database = {
      calendarCollection: { findFirst: jest.fn().mockResolvedValue(initial) },
      $transaction: jest.fn(async (operation) => operation(transaction)),
    };
    jest.mocked(getPrismaClient).mockReturnValue(database as never);
    jest
      .mocked(readGoogleCalendarReconciliation)
      .mockResolvedValueOnce({
        status: "RESET_REQUIRED",
        mode: "INCREMENTAL",
        events: [],
        nextSyncToken: null,
        pageCount: 1,
      })
      .mockResolvedValueOnce({
        status: "SYNCED",
        mode: "FULL",
        events: [],
        nextSyncToken: "fresh-token",
        pageCount: 2,
      });
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      result: {
        mode: "FULL",
        resetFromExpiredToken: true,
        externalMutated: false,
      },
    });
    expect(readGoogleCalendarReconciliation).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ syncToken: "prior-token" }),
    );
    expect(readGoogleCalendarReconciliation).toHaveBeenNthCalledWith(
      2,
      expect.not.objectContaining({ syncToken: expect.anything() }),
    );
    expect(transaction.calendarSyncReceipt.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        providerStatus: "expired-token-full-sync",
        operation: "FULL_SYNC",
      }),
    });
  });

  it("discards a provider read when another reconciliation advances the cursor first", async () => {
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue(actor as never);
    configureSecrets();
    const initial = collection({ cursor: { syncTokenRef: "encrypted-prior" } });
    const transaction = {
      calendarCollection: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ id: initial.id, nestId: null }),
      },
      calendarSyncReceipt: { findFirst: jest.fn(), create: jest.fn() },
      calendarProjection: { findMany: jest.fn(), update: jest.fn() },
      calendarSyncCursor: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ syncTokenRef: "newer-cursor" }),
        upsert: jest.fn(),
      },
    };
    const database = {
      calendarCollection: { findFirst: jest.fn().mockResolvedValue(initial) },
      $transaction: jest.fn(async (operation) => operation(transaction)),
    };
    jest.mocked(getPrismaClient).mockReturnValue(database as never);
    jest.mocked(readGoogleCalendarReconciliation).mockResolvedValue({
      status: "SYNCED",
      mode: "INCREMENTAL",
      events: [],
      nextSyncToken: "next-token",
      pageCount: 1,
    });
    const response = await POST(request());
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      code: "calendar-reconciliation-superseded",
      externalSideEffects: false,
    });
    expect(transaction.calendarSyncCursor.upsert).not.toHaveBeenCalled();
    expect(transaction.calendarSyncReceipt.create).not.toHaveBeenCalled();
  });

  it("rejects a team reconciliation if edit access is revoked during the provider read", async () => {
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue(actor as never);
    configureSecrets();
    const initial = collection({
      ownerUserId: null,
      nestId: "project-1",
      nest: { id: "project-1", slug: "episode-one" },
    });
    const transaction = {
      calendarCollection: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ id: initial.id, nestId: "project-1" }),
      },
      studioProject: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: "project-1", slug: "episode-one" }),
      },
      calendarSyncReceipt: { create: jest.fn() },
      calendarProjection: { findMany: jest.fn(), update: jest.fn() },
      calendarSyncCursor: { findUnique: jest.fn(), upsert: jest.fn() },
    };
    const database = {
      calendarCollection: { findFirst: jest.fn().mockResolvedValue(initial) },
      $transaction: jest.fn(async (operation) => operation(transaction)),
    };
    jest.mocked(getPrismaClient).mockReturnValue(database as never);
    jest
      .mocked(resolveStudioProjectAccess)
      .mockResolvedValueOnce({
        allowed: true,
        role: "EDITOR",
        source: "grant",
        projectId: "project-1",
        projectSlug: "episode-one",
      })
      .mockResolvedValueOnce({
        allowed: false,
        role: null,
        source: "none",
        projectId: "project-1",
        projectSlug: "episode-one",
      });
    jest.mocked(readGoogleCalendarReconciliation).mockResolvedValue({
      status: "SYNCED",
      mode: "FULL",
      events: [],
      nextSyncToken: "next-token",
      pageCount: 1,
    });

    const response = await POST(request());

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      code: "calendar-reconciliation-access-revoked",
      externalSideEffects: false,
    });
    expect(resolveStudioProjectAccess).toHaveBeenCalledTimes(2);
    expect(resolveStudioProjectAccess).toHaveBeenLastCalledWith(
      expect.objectContaining({
        projectSlug: "episode-one",
        email: "editor@example.com",
        action: "write",
        prisma: transaction,
      }),
    );
    expect(readGoogleCalendarReconciliation).toHaveBeenCalledTimes(1);
    expect(transaction.calendarCollection.findFirst).toHaveBeenCalledTimes(1);
    expect(transaction.calendarSyncCursor.upsert).not.toHaveBeenCalled();
    expect(transaction.calendarSyncReceipt.create).not.toHaveBeenCalled();
  });
});
