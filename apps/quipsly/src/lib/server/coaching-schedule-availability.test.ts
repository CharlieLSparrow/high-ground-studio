import {
  assertCoachingScheduleAvailable,
  CoachingScheduleConflictError,
  CoachingScheduleIntervalError,
} from "./coaching-schedule-availability";

function transaction(input: { bookings?: unknown[]; holds?: unknown[] } = {}) {
  return {
    $queryRaw: jest.fn().mockResolvedValue([{ lock: null }]),
    coachingBooking: {
      findMany: jest.fn().mockResolvedValue(input.bookings || []),
    },
    bookingHold: { findMany: jest.fn().mockResolvedValue(input.holds || []) },
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
});
