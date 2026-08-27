/** @jest-environment node */

import { getPrismaClient } from "@/lib/prisma";
import { assertCoachingScheduleAvailable } from "@/lib/server/coaching-schedule-availability";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";
import { acquirePrismaAdvisoryTransactionLock } from "@/lib/server/prisma-advisory-lock";

import { DELETE, POST } from "./route";

jest.mock("@/lib/prisma", () => ({ getPrismaClient: jest.fn() }));
jest.mock("@/lib/server/quipsly-session", () => ({
  getQuipslySessionFromRequest: jest.fn(),
}));
jest.mock("@/lib/server/prisma-advisory-lock", () => ({
  acquirePrismaAdvisoryTransactionLock: jest.fn(),
}));
jest.mock("@/lib/server/coaching-schedule-availability", () => {
  const actual = jest.requireActual(
    "@/lib/server/coaching-schedule-availability",
  );
  return { ...actual, assertCoachingScheduleAvailable: jest.fn() };
});

const actor = {
  id: "client-1",
  primaryEmail: "client@example.test",
  email: "client@example.test",
};
const start = "2099-08-26T16:00:00Z";
const offering = {
  id: "offering-1",
  durationMinutes: 60,
  isActive: true,
  publicBookingEnabled: true,
  coachProfile: {
    id: "coach-profile-1",
    userId: "coach-1",
    timezone: "America/Denver",
    isActive: true,
  },
};

function request(body: Record<string, unknown>) {
  return new Request("https://nest.quipsly.com/api/coaching/booking-requests", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function deleteRequest(holdId = "hold-1") {
  return new Request(
    `https://nest.quipsly.com/api/coaching/booking-requests?holdId=${encodeURIComponent(holdId)}`,
    { method: "DELETE" },
  );
}

function prismaFor(input?: { existing?: any; activeCount?: number; offering?: any }) {
  const hold = {
    id: "hold-1",
    status: "ACTIVE",
    scheduledStart: new Date(start),
    scheduledEnd: new Date("2099-08-26T17:00:00Z"),
    timezone: "America/Denver",
    expiresAt: new Date("2099-08-27T16:00:00Z"),
  };
  const tx = {
    serviceOffering: {
      findFirst: jest
        .fn()
        .mockResolvedValue(
          input?.offering === undefined ? offering : input.offering,
        ),
    },
    userRole: { upsert: jest.fn().mockResolvedValue({}) },
    bookingHold: {
      findFirst: jest.fn().mockResolvedValue(input?.existing || null),
      count: jest.fn().mockResolvedValue(input?.activeCount || 0),
      create: jest.fn().mockResolvedValue(hold),
      update: jest.fn().mockResolvedValue({}),
    },
    userEvent: { create: jest.fn().mockResolvedValue({ id: "event-1" }) },
  };
  const prisma = {
    ...tx,
    $transaction: jest.fn((callback: (transaction: typeof tx) => unknown) =>
      callback(tx),
    ),
  };
  jest.mocked(getPrismaClient).mockReturnValue(prisma as any);
  return { prisma, tx, hold };
}

describe("client coaching booking requests", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest
      .mocked(getQuipslySessionFromRequest)
      .mockResolvedValue({ user: actor } as any);
  });

  it("requires a verified Quipsly session before database access", async () => {
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue(null);
    const response = await POST(
      request({ offeringId: offering.id, scheduledStart: start }),
    );
    expect(response.status).toBe(401);
    expect(getPrismaClient).not.toHaveBeenCalled();
  });

  it("creates a client-owned hold without provisioning a coach or external side effect", async () => {
    const { tx } = prismaFor();
    const response = await POST(
      request({ offeringId: offering.id, scheduledStart: start }),
    );
    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(payload).toMatchObject({
      ok: true,
      request: { holdId: "hold-1", status: "ACTIVE", repeated: false },
    });
    expect(tx.userRole.upsert).toHaveBeenCalledWith({
      where: { userId_role: { userId: actor.id, role: "CLIENT" } },
      update: {},
      create: { userId: actor.id, role: "CLIENT" },
    });
    expect(tx.bookingHold.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        offeringId: offering.id,
        coachProfileId: offering.coachProfile.id,
        clientUserId: actor.id,
        contactEmail: actor.primaryEmail,
        metadataJson: expect.objectContaining({
          source: "quipsly-client-self-scheduling",
          externalCalendarCreated: false,
          externalInviteSent: false,
          paymentCreated: false,
        }),
      }),
    });
    expect(tx.userEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: actor.id,
          eventName: "Product: booking_requested",
          payloadJson: expect.objectContaining({
            source: "server-outcome",
            parameters: expect.objectContaining({ workflow: "coaching" }),
          }),
        }),
      }),
    );
    expect(assertCoachingScheduleAvailable).toHaveBeenCalledWith(
      expect.objectContaining({
        coachUserId: offering.coachProfile.userId,
        scheduledStart: new Date(start),
      }),
    );
    expect(acquirePrismaAdvisoryTransactionLock).toHaveBeenCalledTimes(2);
    expect((tx as any).coachProfile).toBeUndefined();
  });

  it("does not accept a guessed private offering ID", async () => {
    const { tx } = prismaFor({ offering: null });
    const response = await POST(
      request({ offeringId: "private-offering", scheduledStart: start }),
    );
    const payload = await response.json();

    expect(response.status).toBe(404);
    expect(payload.code).toBe("COACHING_OFFERING_UNAVAILABLE");
    expect(tx.serviceOffering.findFirst).toHaveBeenCalledWith({
      where: {
        id: "private-offering",
        isActive: true,
        publicBookingEnabled: true,
        coachProfile: { isActive: true },
      },
      include: { coachProfile: true },
    });
    expect(tx.userRole.upsert).not.toHaveBeenCalled();
    expect(tx.bookingHold.create).not.toHaveBeenCalled();
  });

  it("returns the existing hold for a repeated submit", async () => {
    const existing = {
      id: "existing-hold",
      status: "ACTIVE",
      scheduledStart: new Date(start),
      scheduledEnd: new Date("2099-08-26T17:00:00Z"),
      timezone: "America/Denver",
      expiresAt: new Date("2099-08-27T16:00:00Z"),
    };
    const { tx } = prismaFor({ existing });
    const response = await POST(
      request({ offeringId: offering.id, scheduledStart: start }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.request).toMatchObject({
      holdId: "existing-hold",
      repeated: true,
    });
    expect(assertCoachingScheduleAvailable).not.toHaveBeenCalled();
    expect(tx.bookingHold.create).not.toHaveBeenCalled();
  });

  it("limits one client from blocking the calendar with open requests", async () => {
    const { tx } = prismaFor({ activeCount: 2 });
    const response = await POST(
      request({ offeringId: offering.id, scheduledStart: start }),
    );
    const payload = await response.json();

    expect(response.status).toBe(409);
    expect(payload.code).toBe("COACHING_REQUEST_LIMIT");
    expect(tx.bookingHold.create).not.toHaveBeenCalled();
    expect(assertCoachingScheduleAvailable).not.toHaveBeenCalled();
  });

  it("lets only the owning client cancel an active request without external mutations", async () => {
    const { tx } = prismaFor();
    tx.bookingHold.findFirst.mockResolvedValue({
      id: "hold-1",
      status: "ACTIVE",
      metadataJson: { retained: true },
    });
    const response = await DELETE(deleteRequest());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.request).toMatchObject({ holdId: "hold-1", status: "CANCELED" });
    expect(tx.bookingHold.findFirst).toHaveBeenCalledWith({
      where: { id: "hold-1", clientUserId: actor.id },
      select: { id: true, status: true, metadataJson: true },
    });
    expect(tx.bookingHold.update).toHaveBeenCalledWith({
      where: { id: "hold-1" },
      data: expect.objectContaining({
        status: "CANCELED",
        metadataJson: expect.objectContaining({
          retained: true,
          canceledByUserId: actor.id,
          externalCalendarMutated: false,
          externalInviteSent: false,
          paymentMutated: false,
        }),
      }),
    });
  });
});
