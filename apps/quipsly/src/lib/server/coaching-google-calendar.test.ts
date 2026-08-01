/** @jest-environment node */

import { getPrismaClient } from "@/lib/prisma";
import { recordManagedCoachingCalendarProjection } from "@/lib/server/calendar-projections";

import {
  canManageCoachingCalendarEvidence,
  cancelCoachingBookingGoogleCalendar,
  checkCoachingCalendarAccess,
  deleteGoogleCalendarEvent,
  deterministicGoogleCalendarEventId,
  syncCoachingBookingToGoogleCalendar,
  writeGoogleCalendarEvent,
} from "./coaching-google-calendar";

jest.mock("@/lib/prisma", () => ({ getPrismaClient: jest.fn() }));
jest.mock("@/lib/server/calendar-projections", () => ({
  recordManagedCoachingCalendarProjection: jest.fn().mockResolvedValue({
    connectionId: "connection-1",
    collectionId: "collection-1",
    projectionId: "projection-1",
    receiptId: "receipt-1",
  }),
}));

describe("Google Calendar receipt identity", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.GOOGLE_CALENDAR_ID = "calendar-a@example.test";
    process.env.GOOGLE_CALENDAR_SEND_UPDATES = "none";
    delete process.env.GOOGLE_CALENDAR_INCLUDE_ATTENDEES;
    delete process.env.GOOGLE_CALENDAR_SERVICE_ACCOUNT_JSON;
    delete process.env.GOOGLE_CALENDAR_REFRESH_TOKEN;
    delete process.env.GOOGLE_CALENDAR_SYNC_CLIENT_ID;
    delete process.env.GOOGLE_CALENDAR_SYNC_CLIENT_SECRET;
    delete process.env.GOOGLE_CALENDAR_ALLOW_APPLICATION_DEFAULT;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("derives a stable Google-safe ID from both calendar and booking identity", () => {
    const first = deterministicGoogleCalendarEventId("calendar-a", "booking-1");
    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(deterministicGoogleCalendarEventId("calendar-a", "booking-1")).toBe(first);
    expect(deterministicGoogleCalendarEventId("calendar-b", "booking-1")).not.toBe(first);
    expect(deterministicGoogleCalendarEventId("calendar-a", "booking-2")).not.toBe(first);
  });

  it("allows only staff, the assigned coach, or the room creator to manage provider evidence", () => {
    expect(canManageCoachingCalendarEvidence({ operatorUserId: "staff", operatorIsStaff: true })).toBe(true);
    expect(canManageCoachingCalendarEvidence({ operatorUserId: "coach", assignedCoachUserId: "coach" })).toBe(true);
    expect(canManageCoachingCalendarEvidence({ operatorUserId: "creator", roomCreatedByUserId: "creator" })).toBe(true);
    expect(canManageCoachingCalendarEvidence({ operatorUserId: "other", assignedCoachUserId: "coach", roomCreatedByUserId: "creator" })).toBe(false);
  });

  it("verifies the exact event collection used by the narrow calendar.events scope without mutation", async () => {
    process.env.GOOGLE_CALENDAR_REFRESH_TOKEN = "refresh-token";
    process.env.GOOGLE_CALENDAR_SYNC_CLIENT_ID = "client-id";
    process.env.GOOGLE_CALENDAR_SYNC_CLIENT_SECRET = "client-secret";
    const fetchMock = jest
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ access_token: "access-token" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ kind: "calendar#events" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );

    const result = await checkCoachingCalendarAccess();
    expect(result).toMatchObject({
      accessOk: true,
      accessStatus: "readable",
      externalMutated: false,
      calendar: {
        id: "calendar-a@example.test",
        eventCollectionReadable: true,
      },
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][0]).toBe(
      "https://www.googleapis.com/calendar/v3/calendars/calendar-a%40example.test/events?fields=kind&maxResults=1&singleEvents=true",
    );
    expect(fetchMock.mock.calls[1][1]).toMatchObject({ method: "GET" });
    expect(JSON.stringify(result)).not.toContain("calendar#events");
    fetchMock.mockRestore();
  });

  it("redacts provider details when the event-collection readiness probe fails", async () => {
    process.env.GOOGLE_CALENDAR_REFRESH_TOKEN = "refresh-token";
    process.env.GOOGLE_CALENDAR_SYNC_CLIENT_ID = "client-id";
    process.env.GOOGLE_CALENDAR_SYNC_CLIENT_SECRET = "client-secret";
    const fetchMock = jest
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ access_token: "access-token" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response("private provider detail", { status: 403 }),
      );

    const result = await checkCoachingCalendarAccess();
    expect(result).toMatchObject({
      accessOk: false,
      accessStatus: "google-403",
      externalMutated: false,
      message: "Google Calendar event-collection check failed with HTTP 403.",
    });
    expect(JSON.stringify(result)).not.toContain("private provider detail");
    fetchMock.mockRestore();
  });

  it("recovers an already-created deterministic event with one update instead of another insert", async () => {
    const eventId = deterministicGoogleCalendarEventId("calendar-a@example.test", "booking-1");
    const fetchMock = jest.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("", { status: 409 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: eventId, status: "confirmed" }), { status: 200, headers: { "content-type": "application/json" } }));

    const result = await writeGoogleCalendarEvent({ accessToken: "token", createEventId: eventId, payload: { summary: "Coaching" } });

    expect(result.id).toBe(eventId);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toContain("/events?sendUpdates=none");
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: "POST" });
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({ summary: "Coaching", id: eventId });
    expect(fetchMock.mock.calls[1][0]).toContain(`/events/${eventId}?sendUpdates=none`);
    expect(fetchMock.mock.calls[1][1]).toMatchObject({ method: "PUT" });
    fetchMock.mockRestore();
  });

  it("treats an already-absent provider event as idempotent cancellation evidence", async () => {
    const fetchMock = jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response("", { status: 410 }));
    await expect(deleteGoogleCalendarEvent({ accessToken: "token", eventId: "event-gone" })).resolves.toEqual({ providerEventId: "event-gone", alreadyAbsent: true, httpStatus: 410 });
    expect(fetchMock.mock.calls[0][0]).toContain("/events/event-gone?sendUpdates=none");
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: "DELETE" });
    fetchMock.mockRestore();
  });

  it("does not surface raw Google response bodies through provider failures", async () => {
    const fetchMock = jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("private attendee and provider detail", { status: 403 }),
    );

    const failure = await writeGoogleCalendarEvent({
      accessToken: "token",
      createEventId: "event-1",
      payload: { summary: "Coaching" },
    }).catch((error) => error as Error);
    expect(failure).toBeInstanceOf(Error);
    if (!(failure instanceof Error)) throw new Error("Expected a redacted provider error.");
    expect(failure.message).toBe("Google Calendar event write failed with HTTP 403.");
    expect(failure.message).not.toContain("private attendee");
    fetchMock.mockRestore();
  });

  it("does not reuse an event ID from a different calendar and commits local receipts together", async () => {
    process.env.GOOGLE_CALENDAR_REFRESH_TOKEN = "refresh-token";
    process.env.GOOGLE_CALENDAR_SYNC_CLIENT_ID = "client-id";
    process.env.GOOGLE_CALENDAR_SYNC_CLIENT_SECRET = "client-secret";
    const expectedEventId = deterministicGoogleCalendarEventId("calendar-a@example.test", "booking-1");
    const booking = {
      id: "booking-1",
      status: "CONFIRMED",
      scheduledStart: new Date("2026-07-20T16:00:00.000Z"),
      scheduledEnd: new Date("2026-07-20T17:00:00.000Z"),
      timezone: "America/Denver",
      metadataJson: {},
      calendarEventId: "old-calendar-event",
      appointment: { id: "appointment-1" },
      offering: { title: "Coaching session" },
      clientUser: { name: "Client", primaryEmail: "client@example.test" },
      coachUser: { name: "Coach", primaryEmail: "coach@example.test" },
      callRoom: { id: "room-1", title: "Coaching follow-through" },
      calendarLinks: [{ id: "link-old", providerCalendarId: "calendar-b@example.test", providerEventId: "old-calendar-event" }],
    };
    const tx = {
      calendarEventLink: { create: jest.fn().mockResolvedValue({ id: "link-new" }) },
      coachingBooking: { update: jest.fn().mockResolvedValue({}) },
      appointment: { update: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      coachingBooking: { findUnique: jest.fn().mockResolvedValue(booking) },
      $transaction: jest.fn(async (callback) => callback(tx)),
    };
    jest.mocked(getPrismaClient).mockReturnValue(prisma as any);
    const fetchMock = jest.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "access-token" }), { status: 200, headers: { "content-type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: expectedEventId, htmlLink: "https://calendar.example/event" }), { status: 200, headers: { "content-type": "application/json" } }));

    const result = await syncCoachingBookingToGoogleCalendar({ bookingId: "booking-1", operatorUserId: "operator-1", operatorIsStaff: true });

    expect(result.providerEventId).toBe(expectedEventId);
    expect(fetchMock.mock.calls[1][0]).toContain("/events?sendUpdates=none");
    expect(fetchMock.mock.calls[1][1]).toMatchObject({ method: "POST" });
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body)).id).toBe(expectedEventId);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.calendarEventLink.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ providerCalendarId: "calendar-a@example.test", providerEventId: expectedEventId }) }));
    expect(tx.coachingBooking.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ calendarEventId: expectedEventId }) }));
    expect(tx.appointment.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ googleEventId: expectedEventId }) }));
    expect(recordManagedCoachingCalendarProjection).toHaveBeenCalledWith(expect.objectContaining({
      tx,
      bookingId: "booking-1",
      operation: "CREATE_EVENT",
      externalMutated: true,
      legacyCalendarLinkId: "link-new",
    }));
    fetchMock.mockRestore();
  });

  it("refuses provider work before token minting when the coach does not own the booking", async () => {
    process.env.GOOGLE_CALENDAR_REFRESH_TOKEN = "refresh-token";
    process.env.GOOGLE_CALENDAR_SYNC_CLIENT_ID = "client-id";
    process.env.GOOGLE_CALENDAR_SYNC_CLIENT_SECRET = "client-secret";
    jest.mocked(getPrismaClient).mockReturnValue({
      coachingBooking: { findUnique: jest.fn().mockResolvedValue({ id: "booking-private", status: "CONFIRMED", coachUser: { id: "coach-owner" }, calendarLinks: [] }) },
    } as any);
    const fetchMock = jest.spyOn(globalThis, "fetch");

    await expect(syncCoachingBookingToGoogleCalendar({ bookingId: "booking-private", operatorUserId: "different-coach" }))
      .rejects.toThrow("Only the assigned coach or Quipsly staff");
    expect(fetchMock).not.toHaveBeenCalled();
    fetchMock.mockRestore();
  });

  it("cancels only after Quipsly cancellation and preserves a provider receipt hidden by cancel-planned", async () => {
    process.env.GOOGLE_CALENDAR_REFRESH_TOKEN = "refresh-token";
    process.env.GOOGLE_CALENDAR_SYNC_CLIENT_ID = "client-id";
    process.env.GOOGLE_CALENDAR_SYNC_CLIENT_SECRET = "client-secret";
    const tx = {
      calendarEventLink: { create: jest.fn().mockResolvedValue({ id: "cancel-link", status: "canceled" }) },
      coachingBooking: { update: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      coachingBooking: { findUnique: jest.fn().mockResolvedValue({
        id: "booking-canceled",
        status: "CANCELED",
        scheduledStart: new Date("2026-07-20T16:00:00.000Z"),
        scheduledEnd: new Date("2026-07-20T17:00:00.000Z"),
        timezone: "America/Denver",
        metadataJson: {},
        calendarEventId: "provider-event-1",
        coachUser: { id: "coach-1" },
        callRoom: { id: "room-1", title: "Canceled coaching", createdByUserId: "coach-1" },
        calendarLinks: [
          { id: "cancel-planned", status: "cancel-planned", providerCalendarId: null, providerEventId: null },
          { id: "synced", status: "synced", providerCalendarId: "calendar-a@example.test", providerEventId: "provider-event-1" },
        ],
      }) },
      $transaction: jest.fn(async (callback) => callback(tx)),
    };
    jest.mocked(getPrismaClient).mockReturnValue(prisma as any);
    const fetchMock = jest.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "access-token" }), { status: 200, headers: { "content-type": "application/json" } }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));

    const result = await cancelCoachingBookingGoogleCalendar({ bookingId: "booking-canceled", operatorUserId: "coach-1" });

    expect(result).toMatchObject({ providerEventId: "provider-event-1", calendarStatus: "canceled", alreadyAbsent: false });
    expect(fetchMock.mock.calls[1][0]).toContain("/events/provider-event-1?sendUpdates=none");
    expect(fetchMock.mock.calls[1][1]).toMatchObject({ method: "DELETE" });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.calendarEventLink.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "canceled", providerEventId: "provider-event-1" }) }));
    expect(tx.coachingBooking.update).toHaveBeenCalled();
    expect(recordManagedCoachingCalendarProjection).toHaveBeenCalledWith(expect.objectContaining({
      tx,
      bookingId: "booking-canceled",
      operation: "CANCEL_EVENT",
      externalMutated: true,
      legacyCalendarLinkId: "cancel-link",
    }));
    fetchMock.mockRestore();
  });
});
