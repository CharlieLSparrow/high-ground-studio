/** @jest-environment node */

import { getPrismaClient } from "@/lib/prisma";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";

import { GET } from "./route";

jest.mock("@/lib/prisma", () => ({ getPrismaClient: jest.fn() }));
jest.mock("@/lib/server/quipsly-session", () => ({ getQuipslySessionFromRequest: jest.fn() }));

const mockedSession = jest.mocked(getQuipslySessionFromRequest);
const mockedPrisma = jest.mocked(getPrismaClient);
const request = () => new Request("https://nest.quipsly.com/api/coaching/bookings/booking-1/calendar");
const context = { params: Promise.resolve({ bookingId: "booking-1" }) };

describe("private coaching iCalendar route", () => {
  beforeEach(() => jest.clearAllMocks());

  it("fails before database access when the request is not authenticated", async () => {
    mockedSession.mockResolvedValue(null);
    const response = await GET(request(), context);
    expect(response.status).toBe(401);
    expect(mockedPrisma).not.toHaveBeenCalled();
  });

  it("scopes non-staff reads to the client, coach, or room creator", async () => {
    mockedSession.mockResolvedValue({ user: { id: "user-1", isStaff: false } } as any);
    const findFirst = jest.fn().mockResolvedValue(null);
    mockedPrisma.mockReturnValue({ coachingBooking: { findFirst } } as any);
    const response = await GET(request(), context);
    expect(response.status).toBe(404);
    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        id: "booking-1",
        OR: [
          { clientUserId: "user-1" },
          { coachUserId: "user-1" },
          { callRoom: { createdByUserId: "user-1" } },
        ],
      }),
    }));
  });

  it("exports scheduling facts but no transcript, recording, or private-note content", async () => {
    mockedSession.mockResolvedValue({ user: { id: "coach-1", isStaff: false } } as any);
    mockedPrisma.mockReturnValue({ coachingBooking: { findFirst: jest.fn().mockResolvedValue({
      id: "booking-1",
      status: "CONFIRMED",
      scheduledStart: new Date("2026-08-03T15:00:00.000Z"),
      scheduledEnd: new Date("2026-08-03T16:00:00.000Z"),
      updatedAt: new Date("2026-08-01T10:00:00.000Z"),
      offering: { title: "Coaching follow-through" },
      callRoom: { id: "room-1", title: "Coaching session" },
    }) } } as any);
    const response = await GET(request(), context);
    const body = await response.text();
    const unfolded = body.replaceAll("\r\n ", "");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/calendar");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(body).toContain("SUMMARY:Coaching session");
    expect(body).toContain("https://nest.quipsly.com/sessions/room-1");
    expect(unfolded).toContain("Private notes\\, transcript text\\, goals\\, and recordings are not included");
    expect(body).not.toContain("client@example");
    expect(body).not.toContain("recordingAsset");
  });
});
