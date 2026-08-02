/** @jest-environment node */

import { acquirePrismaAdvisoryTransactionLock } from "@/lib/server/prisma-advisory-lock";
import { resolveStudioProjectAccess } from "@/lib/server/studio-project-access";

import {
  canPrepareQuipslyCalendarUpdate,
  googleCalendarConflictVersion,
  resolveGoogleCalendarProjectionConflict,
} from "./google-calendar-conflict-review";

jest.mock("@/lib/server/prisma-advisory-lock", () => ({
  acquirePrismaAdvisoryTransactionLock: jest.fn(),
}));
jest.mock("@/lib/server/studio-project-access", () => ({
  resolveStudioProjectAccess: jest.fn(),
}));

const actor = {
  id: "editor-1",
  email: "editor@example.com",
  primaryEmail: "editor@example.com",
  isStaff: false,
};

function projection(overrides: Record<string, unknown> = {}) {
  return {
    id: "projection-1",
    collectionId: "collection-1",
    sourceType: "CallRoom",
    sourceId: "room-1",
    sourceRevision: "revision-1",
    providerEventId: "event-1",
    providerEtag: '"etag-2"',
    status: "CONFLICT",
    conflictState: "EXTERNAL_CHANGED",
    metadataJson: {
      immutableMarker: "keep-me",
      reconciliation: { reason: "provider-version-changed" },
    },
    updatedAt: new Date("2026-08-01T05:00:00.000Z"),
    ...overrides,
  };
}

function version(value = projection(), reason = "provider-version-changed") {
  return googleCalendarConflictVersion({ ...value, reason });
}

function database(input: {
  current?: ReturnType<typeof projection>;
  priorReceipt?: unknown;
  latestProviderStatus?: string;
  room?: unknown;
} = {}) {
  const current = input.current ?? projection();
  const transaction = {
    calendarProjection: {
      findFirst: jest.fn().mockResolvedValue(current),
      update: jest.fn().mockResolvedValue({}),
    },
    calendarSyncReceipt: {
      findFirst: jest.fn()
        .mockResolvedValueOnce(input.priorReceipt ?? null)
        .mockResolvedValueOnce({ providerStatus: input.latestProviderStatus ?? "provider-version-changed" }),
      create: jest.fn().mockResolvedValue({ id: "receipt-1" }),
    },
    calendarCollection: {
      findUnique: jest.fn().mockResolvedValue({ connectionId: "connection-1", nestId: "project-1" }),
    },
    callRoom: {
      findFirst: jest.fn().mockResolvedValue(
        input.room === undefined
          ? {
              id: "room-1",
              projectId: "project-1",
              status: "PLANNED",
              scheduledStart: new Date("2026-08-12T18:00:00.000Z"),
            }
          : input.room,
      ),
    },
  };
  return {
    transaction,
    prisma: { $transaction: jest.fn(async (operation) => operation(transaction)) },
  };
}

describe("Google Calendar conflict review", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(resolveStudioProjectAccess).mockResolvedValue({
      allowed: true,
      role: "EDITOR",
      source: "grant",
      projectId: "project-1",
      projectSlug: "high-ground-odyssey",
    });
  });

  it("binds the review version to provider and Quipsly conflict truth", () => {
    const first = version();
    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(version(projection({ providerEtag: '"etag-3"' }))).not.toBe(first);
    expect(version(projection(), "provider-event-missing")).not.toBe(first);
  });

  it("prepares only an active, versioned provider edit for a later Quipsly preview", () => {
    expect(canPrepareQuipslyCalendarUpdate({
      reason: "provider-version-changed",
      providerEventId: "event-1",
      providerEtag: '"etag-2"',
      roomStatus: "PLANNED",
      roomScheduledStart: "2026-08-12T18:00:00.000Z",
    })).toBe(true);
    expect(canPrepareQuipslyCalendarUpdate({
      reason: "provider-identity-mismatch",
      providerEventId: "event-1",
      providerEtag: '"etag-2"',
      roomStatus: "PLANNED",
      roomScheduledStart: "2026-08-12T18:00:00.000Z",
    })).toBe(false);
    expect(canPrepareQuipslyCalendarUpdate({
      reason: "provider-version-changed",
      providerEventId: "event-1",
      providerEtag: '"etag-2"',
      roomStatus: "CANCELED",
      roomScheduledStart: "2026-08-12T18:00:00.000Z",
    })).toBe(false);
    expect(canPrepareQuipslyCalendarUpdate({
      reason: "provider-version-changed",
      providerEventId: "event-1",
      providerEtag: '"etag-2"',
      roomStatus: "PLANNED",
      roomScheduledStart: null,
    })).toBe(false);
  });

  it("records a version-bound Quipsly-update preparation without touching Google", async () => {
    const fixture = database();
    const result = await resolveGoogleCalendarProjectionConflict({
      prisma: fixture.prisma,
      actor,
      projectionId: "projection-1",
      expectedConflictVersion: version(),
      intent: "PREPARE_QUIPSLY_UPDATE",
      occurredAt: new Date("2026-08-01T06:00:00.000Z"),
    });
    expect(result).toEqual({
      projectionId: "projection-1",
      receiptId: "receipt-1",
      intent: "PREPARE_QUIPSLY_UPDATE",
      status: "PLANNED",
      idempotentReplay: false,
      externalMutated: false,
    });
    expect(acquirePrismaAdvisoryTransactionLock).toHaveBeenCalledWith(
      fixture.transaction,
      "google-calendar-conflict:projection-1",
    );
    expect(fixture.transaction.calendarProjection.update).toHaveBeenCalledWith({
      where: { id: "projection-1" },
      data: expect.objectContaining({
        status: "PLANNED",
        conflictState: "NONE",
        metadataJson: expect.objectContaining({ immutableMarker: "keep-me" }),
      }),
    });
    expect(fixture.transaction.calendarSyncReceipt.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        operation: "VERIFY",
        outcome: "SUCCEEDED",
        providerStatus: "conflict-prepared-quipsly-update",
        externalMutated: false,
      }),
    });
  });

  it("reuses the exact prior decision receipt", async () => {
    const fixture = database({
      current: projection({ status: "PLANNED", conflictState: "NONE" }),
      priorReceipt: {
        id: "receipt-prior",
        metadataJson: { resultStatus: "PLANNED" },
      },
    });
    const result = await resolveGoogleCalendarProjectionConflict({
      prisma: fixture.prisma,
      actor,
      projectionId: "projection-1",
      expectedConflictVersion: version(),
      intent: "PREPARE_QUIPSLY_UPDATE",
    });
    expect(result).toMatchObject({ receiptId: "receipt-prior", idempotentReplay: true });
    expect(fixture.transaction.callRoom.findFirst).not.toHaveBeenCalled();
    expect(fixture.transaction.calendarProjection.update).not.toHaveBeenCalled();
    expect(fixture.transaction.calendarSyncReceipt.create).not.toHaveBeenCalled();
  });

  it("does not reuse an old decision receipt after a new conflict appears", async () => {
    const current = projection({ providerEtag: '"etag-3"', updatedAt: new Date("2026-08-01T07:00:00.000Z") });
    const fixture = database({
      current,
      priorReceipt: {
        id: "receipt-prior",
        metadataJson: { resultStatus: "PLANNED" },
      },
    });
    await expect(resolveGoogleCalendarProjectionConflict({
      prisma: fixture.prisma,
      actor,
      projectionId: "projection-1",
      expectedConflictVersion: version(),
      intent: "PREPARE_QUIPSLY_UPDATE",
    })).rejects.toMatchObject({ code: "calendar-conflict-version-changed", status: 409 });
    expect(fixture.transaction.calendarProjection.update).not.toHaveBeenCalled();
    expect(fixture.transaction.calendarSyncReceipt.create).not.toHaveBeenCalled();
  });

  it("can stop an unsafe identity link locally while retaining provider audit fields", async () => {
    const current = projection({
      metadataJson: { reconciliation: { reason: "provider-identity-mismatch" } },
    });
    const fixture = database({ current, latestProviderStatus: "provider-identity-mismatch" });
    const result = await resolveGoogleCalendarProjectionConflict({
      prisma: fixture.prisma,
      actor,
      projectionId: "projection-1",
      expectedConflictVersion: version(current, "provider-identity-mismatch"),
      intent: "STOP_PROJECTING",
    });
    expect(result).toMatchObject({ status: "REVOKED", externalMutated: false });
    expect(fixture.transaction.calendarProjection.update).toHaveBeenCalledWith({
      where: { id: "projection-1" },
      data: expect.not.objectContaining({ providerEventId: expect.anything() }),
    });
  });

  it("denies resolution when Session mutation authority is absent", async () => {
    const fixture = database({ room: null });
    await expect(resolveGoogleCalendarProjectionConflict({
      prisma: fixture.prisma,
      actor,
      projectionId: "projection-1",
      expectedConflictVersion: version(),
      intent: "STOP_PROJECTING",
    })).rejects.toMatchObject({ code: "calendar-conflict-write-forbidden", status: 403 });
    expect(fixture.transaction.calendarProjection.update).not.toHaveBeenCalled();
    expect(fixture.transaction.calendarSyncReceipt.create).not.toHaveBeenCalled();
  });

  it("resolves a milestone conflict only with current episode project edit authority", async () => {
    const current = projection({
      sourceType: "StudioEpisodeMilestone",
      sourceId: "milestone-1",
    });
    const fixture = database({ current });
    Object.assign(fixture.transaction, {
      studioEpisodeMilestone: {
        findUnique: jest.fn().mockResolvedValue({
          id: "milestone-1",
          status: "PLANNED",
          startsAt: new Date("2026-08-12T18:00:00.000Z"),
          episodeProduction: {
            project: { id: "project-1", slug: "high-ground-odyssey" },
          },
        }),
      },
    });

    const result = await resolveGoogleCalendarProjectionConflict({
      prisma: fixture.prisma,
      actor,
      projectionId: "projection-1",
      expectedConflictVersion: version(current),
      intent: "STOP_PROJECTING",
    });

    expect(result).toMatchObject({ status: "REVOKED", externalMutated: false });
    expect(resolveStudioProjectAccess).toHaveBeenCalledWith(expect.objectContaining({
      projectSlug: "high-ground-odyssey",
      email: "editor@example.com",
      action: "write",
    }));
    expect(fixture.transaction.callRoom.findFirst).not.toHaveBeenCalled();
  });
});
