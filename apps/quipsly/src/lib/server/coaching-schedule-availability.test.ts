import {
  assertCoachingScheduleAvailable,
  CoachingScheduleConflictError,
  CoachingScheduleIntervalError,
  CoachingOutsideAvailabilityError,
} from "./coaching-schedule-availability";

function transaction(
  input: {
    bookings?: unknown[];
    holds?: unknown[];
    availabilityWindows?: unknown[];
  } = {},
) {
  return {
    $queryRaw: jest.fn().mockResolvedValue([{ lock: null }]),
    coachingBooking: {
      findMany: jest.fn().mockResolvedValue(input.bookings || []),
    },
    bookingHold: { findMany: jest.fn().mockResolvedValue(input.holds || []) },
    availabilityWindow: {
      findMany: jest.fn().mockResolvedValue(input.availabilityWindows || []),
    },
  };
}

const scheduledStart = new Date("2026-08-26T16:00:00.000Z");
const scheduledEnd = new Date("2026-08-26T17:00:00.000Z");

describe("coaching schedule availability", () => {
  it("locks the coach schedule before accepting an open interval", async () => {
    const tx = transaction();
    await expect(
      assertCoachingScheduleAvailable({
        tx,
        coachUserId: "coach-1",
        scheduledStart,
        scheduledEnd,
      }),
    ).resolves.toBeUndefined();
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(tx.coachingBooking.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          coachUserId: "coach-1",
          scheduledStart: { lt: scheduledEnd },
          scheduledEnd: { gt: scheduledStart },
        }),
      }),
    );
  });

  it("rejects an overlapping active booking with a stable conflict contract", async () => {
    const tx = transaction({
      bookings: [{ id: "booking-2", scheduledStart, scheduledEnd }],
    });
    await expect(
      assertCoachingScheduleAvailable({
        tx,
        coachUserId: "coach-1",
        scheduledStart,
        scheduledEnd,
        excludeBookingId: "booking-1",
      }),
    ).rejects.toMatchObject<Partial<CoachingScheduleConflictError>>({
      code: "COACHING_TIME_CONFLICT",
      status: 409,
      conflicts: [
        expect.objectContaining({ kind: "booking", id: "booking-2" }),
      ],
    });
  });

  it("allows converting the hold that owns the interval while excluding it from conflicts", async () => {
    const tx = transaction();
    await assertCoachingScheduleAvailable({
      tx,
      coachUserId: "coach-1",
      scheduledStart,
      scheduledEnd,
      excludeHoldId: "hold-1",
    });
    expect(tx.bookingHold.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: { not: "hold-1" } }),
      }),
    );
  });

  it("rejects an interval that does not end after it starts before taking a lock", async () => {
    const tx = transaction();
    await expect(
      assertCoachingScheduleAvailable({
        tx,
        coachUserId: "coach-1",
        scheduledStart,
        scheduledEnd: scheduledStart,
      }),
    ).rejects.toMatchObject<Partial<CoachingScheduleIntervalError>>({
      code: "COACHING_INVALID_INTERVAL",
      status: 400,
    });
    expect(tx.$queryRaw).not.toHaveBeenCalled();
  });

  it("accepts a session fully inside recurring local working hours", async () => {
    const tx = transaction({
      availabilityWindows: [
        {
          id: "window-1",
          timezone: "America/Denver",
          dayOfWeek: 3,
          startMinute: 9 * 60,
          endMinute: 17 * 60,
          startsAt: null,
          endsAt: null,
        },
      ],
    });
    await expect(
      assertCoachingScheduleAvailable({
        tx,
        coachUserId: "coach-1",
        scheduledStart: new Date("2026-08-26T15:00:00.000Z"),
        scheduledEnd: new Date("2026-08-26T16:00:00.000Z"),
      }),
    ).resolves.toBeUndefined();
  });

  it("rejects a session outside recurring local working hours", async () => {
    const tx = transaction({
      availabilityWindows: [
        {
          id: "window-1",
          timezone: "America/Denver",
          dayOfWeek: 3,
          startMinute: 9 * 60,
          endMinute: 17 * 60,
          startsAt: null,
          endsAt: null,
        },
      ],
    });
    await expect(
      assertCoachingScheduleAvailable({
        tx,
        coachUserId: "coach-1",
        scheduledStart: new Date("2026-08-26T23:30:00.000Z"),
        scheduledEnd: new Date("2026-08-27T00:30:00.000Z"),
      }),
    ).rejects.toMatchObject<Partial<CoachingOutsideAvailabilityError>>({
      code: "COACHING_OUTSIDE_AVAILABILITY",
      status: 409,
    });
  });
});
