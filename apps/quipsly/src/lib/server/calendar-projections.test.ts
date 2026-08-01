import {
  calendarProjectionUid,
  calendarSourceRevision,
  recordManagedCoachingCalendarProjection,
} from "./calendar-projections";

jest.mock("@/lib/studio/project-registry", () => ({
  ensureStudioWorkspace: jest.fn(),
}));

describe("normalized calendar projection writer", () => {
  it("creates deterministic revisions independent of object key order", () => {
    expect(calendarSourceRevision({ b: 2, a: 1 })).toBe(calendarSourceRevision({ a: 1, b: 2 }));
    expect(calendarProjectionUid("coaching-booking", "booking-1")).toMatch(
      /^coaching-booking-[a-f0-9]{40}@calendar\.quipsly\.com$/,
    );
  });

  it("records a verified workspace projection and redacted effect receipt", async () => {
    const tx = {
      calendarConnection: { upsert: jest.fn().mockResolvedValue({ id: "connection-1" }) },
      calendarCollection: { upsert: jest.fn().mockResolvedValue({ id: "collection-1" }) },
      calendarProjection: { upsert: jest.fn().mockResolvedValue({ id: "projection-1" }) },
      calendarSyncReceipt: { create: jest.fn().mockResolvedValue({ id: "receipt-1" }) },
    };
    const result = await recordManagedCoachingCalendarProjection({
      tx,
      workspaceId: "workspace-1",
      calendarId: "private-calendar@example.test",
      bookingId: "booking-1",
      roomId: "room-1",
      title: "Coaching session",
      scheduledStart: new Date("2026-08-05T15:00:00.000Z"),
      scheduledEnd: new Date("2026-08-05T16:00:00.000Z"),
      timezone: "America/Denver",
      bookingStatus: "CONFIRMED",
      providerEventId: "provider-event-1",
      providerEtag: "etag-1",
      providerUpdatedAt: new Date("2026-08-01T12:00:00.000Z"),
      operation: "CREATE_EVENT",
      providerStatus: "confirmed",
      externalMutated: true,
      actorUserId: "user-1",
      legacyCalendarLinkId: "legacy-link-1",
      occurredAt: new Date("2026-08-01T12:00:00.000Z"),
    });

    expect(result).toEqual({
      connectionId: "connection-1",
      collectionId: "collection-1",
      projectionId: "projection-1",
      receiptId: "receipt-1",
    });
    expect(tx.calendarConnection.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({
        workspaceId: "workspace-1",
        status: "VERIFIED",
        credentialRef: "runtime:managed-google-calendar",
      }),
    }));
    expect(tx.calendarProjection.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ status: "SYNCED", sourceType: "CoachingBooking" }),
    }));
    expect(tx.calendarSyncReceipt.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        operation: "CREATE_EVENT",
        outcome: "SUCCEEDED",
        externalMutated: true,
        requestDigest: expect.stringMatching(/^[a-f0-9]{64}$/),
        responseDigest: expect.stringMatching(/^[a-f0-9]{64}$/),
        metadataJson: expect.not.objectContaining({
          calendarId: expect.anything(),
          attendee: expect.anything(),
        }),
      }),
      select: { id: true },
    });
    expect(JSON.stringify(tx.calendarSyncReceipt.create.mock.calls[0])).not.toContain("private-calendar@example.test");
  });

  it("increments the same projection and records a cancellation without claiming a mutation when already absent", async () => {
    const tx = {
      calendarConnection: { upsert: jest.fn().mockResolvedValue({ id: "connection-1" }) },
      calendarCollection: { upsert: jest.fn().mockResolvedValue({ id: "collection-1" }) },
      calendarProjection: { upsert: jest.fn().mockResolvedValue({ id: "projection-1" }) },
      calendarSyncReceipt: { create: jest.fn().mockResolvedValue({ id: "receipt-1" }) },
    };
    await recordManagedCoachingCalendarProjection({
      tx,
      workspaceId: "workspace-1",
      calendarId: "private-calendar@example.test",
      bookingId: "booking-1",
      title: "Coaching session",
      scheduledStart: new Date("2026-08-05T15:00:00.000Z"),
      scheduledEnd: new Date("2026-08-05T16:00:00.000Z"),
      timezone: "America/Denver",
      bookingStatus: "CANCELED",
      providerEventId: "provider-event-1",
      operation: "CANCEL_EVENT",
      providerStatus: "canceled-already-absent",
      externalMutated: false,
      actorUserId: "user-1",
      legacyCalendarLinkId: "legacy-link-2",
      occurredAt: new Date("2026-08-01T12:00:00.000Z"),
    });

    expect(tx.calendarProjection.upsert).toHaveBeenCalledWith(expect.objectContaining({
      update: expect.objectContaining({ status: "CANCELED", sequence: { increment: 1 } }),
      create: expect.objectContaining({ status: "CANCELED" }),
    }));
    expect(tx.calendarSyncReceipt.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ operation: "CANCEL_EVENT", externalMutated: false }),
    }));
  });
});
