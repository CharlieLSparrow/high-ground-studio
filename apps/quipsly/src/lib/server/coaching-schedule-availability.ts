import "server-only";

import { Temporal } from "@js-temporal/polyfill";
import { acquirePrismaAdvisoryTransactionLock } from "./prisma-advisory-lock";

const BLOCKING_BOOKING_STATUSES = [
  "REQUESTED",
  "HOLDING_PAYMENT",
  "CONFIRMED",
] as const;

export type CoachingScheduleConflict = {
  kind: "booking" | "hold";
  id: string;
  scheduledStart: Date;
  scheduledEnd: Date;
};

export class CoachingScheduleConflictError extends Error {
  readonly code = "COACHING_TIME_CONFLICT";
  readonly status = 409;
  readonly conflicts: CoachingScheduleConflict[];

  constructor(conflicts: CoachingScheduleConflict[]) {
    super(
      conflicts.some((conflict) => conflict.kind === "booking")
        ? "That time overlaps another Quipsly session. Choose another time or resolve the existing session first."
        : "That time overlaps an active Quipsly hold. Choose another time or release the existing hold first.",
    );
    this.name = "CoachingScheduleConflictError";
    this.conflicts = conflicts;
  }
}

export class CoachingScheduleIntervalError extends Error {
  readonly code = "COACHING_INVALID_INTERVAL";
  readonly status = 400;

  constructor() {
    super("A coaching session must end after it starts.");
    this.name = "CoachingScheduleIntervalError";
  }
}

export class CoachingOutsideAvailabilityError extends Error {
  readonly code = "COACHING_OUTSIDE_AVAILABILITY";
  readonly status = 409;

  constructor() {
    super(
      "That time is outside the coach's Quipsly availability. Choose a time inside the working hours shown.",
    );
    this.name = "CoachingOutsideAvailabilityError";
  }
}

function recurringWindowContains(
  window: any,
  scheduledStart: Date,
  scheduledEnd: Date,
) {
  if (
    !Number.isInteger(window.dayOfWeek) ||
    !Number.isInteger(window.startMinute) ||
    !Number.isInteger(window.endMinute)
  ) {
    return false;
  }
  try {
    const start = Temporal.Instant.from(
      scheduledStart.toISOString(),
    ).toZonedDateTimeISO(window.timezone);
    const end = Temporal.Instant.from(
      scheduledEnd.toISOString(),
    ).toZonedDateTimeISO(window.timezone);
    const schemaDayOfWeek = start.dayOfWeek === 7 ? 0 : start.dayOfWeek;
    return (
      schemaDayOfWeek === window.dayOfWeek &&
      start.toPlainDate().equals(end.toPlainDate()) &&
      start.hour * 60 + start.minute >= window.startMinute &&
      end.hour * 60 + end.minute <= window.endMinute
    );
  } catch {
    return false;
  }
}

function specificWindowContains(
  window: any,
  scheduledStart: Date,
  scheduledEnd: Date,
) {
  const startsAt = window.startsAt instanceof Date ? window.startsAt : null;
  const endsAt = window.endsAt instanceof Date ? window.endsAt : null;
  return Boolean(
    startsAt &&
    endsAt &&
    scheduledStart.getTime() >= startsAt.getTime() &&
    scheduledEnd.getTime() <= endsAt.getTime(),
  );
}

function assertValidInterval(scheduledStart: Date, scheduledEnd: Date) {
  if (
    !Number.isFinite(scheduledStart.getTime()) ||
    !Number.isFinite(scheduledEnd.getTime()) ||
    scheduledEnd.getTime() <= scheduledStart.getTime()
  ) {
    throw new CoachingScheduleIntervalError();
  }
}

/**
 * Serializes schedule mutations for one coach and checks Quipsly's canonical
 * bookings and unexpired holds. Provider calendars remain separate evidence:
 * this function never claims Google/iCloud availability it has not observed.
 */
export async function assertCoachingScheduleAvailable(input: {
  tx: any;
  coachUserId: string;
  scheduledStart: Date;
  scheduledEnd: Date;
  excludeBookingId?: string | null;
  excludeHoldId?: string | null;
  now?: Date;
}) {
  assertValidInterval(input.scheduledStart, input.scheduledEnd);
  await acquirePrismaAdvisoryTransactionLock(
    input.tx,
    `quipsly:coaching-schedule:${input.coachUserId}`,
  );

  const [bookings, holds, availabilityWindows] = await Promise.all([
    input.tx.coachingBooking.findMany({
      where: {
        coachUserId: input.coachUserId,
        status: { in: [...BLOCKING_BOOKING_STATUSES] },
        scheduledStart: { lt: input.scheduledEnd },
        scheduledEnd: { gt: input.scheduledStart },
        ...(input.excludeBookingId
          ? { id: { not: input.excludeBookingId } }
          : {}),
      },
      select: { id: true, scheduledStart: true, scheduledEnd: true },
      orderBy: { scheduledStart: "asc" },
      take: 4,
    }),
    input.tx.bookingHold.findMany({
      where: {
        coachProfile: { userId: input.coachUserId },
        status: "ACTIVE",
        expiresAt: { gt: input.now || new Date() },
        scheduledStart: { lt: input.scheduledEnd },
        scheduledEnd: { gt: input.scheduledStart },
        ...(input.excludeHoldId ? { id: { not: input.excludeHoldId } } : {}),
      },
      select: { id: true, scheduledStart: true, scheduledEnd: true },
      orderBy: { scheduledStart: "asc" },
      take: 4,
    }),
    input.tx.availabilityWindow.findMany({
      where: {
        coachProfile: { userId: input.coachUserId },
        isActive: true,
        OR: [
          {
            dayOfWeek: { not: null },
            startMinute: { not: null },
            endMinute: { not: null },
          },
          { startsAt: { not: null }, endsAt: { not: null } },
        ],
      },
      select: {
        id: true,
        timezone: true,
        dayOfWeek: true,
        startMinute: true,
        endMinute: true,
        startsAt: true,
        endsAt: true,
      },
      take: 40,
    }),
  ]);

  const conflicts: CoachingScheduleConflict[] = [
    ...bookings.map((booking: any) => ({
      kind: "booking" as const,
      ...booking,
    })),
    ...holds.map((hold: any) => ({ kind: "hold" as const, ...hold })),
  ];
  if (conflicts.length) throw new CoachingScheduleConflictError(conflicts);
  if (
    availabilityWindows.length &&
    !availabilityWindows.some(
      (window: any) =>
        recurringWindowContains(
          window,
          input.scheduledStart,
          input.scheduledEnd,
        ) ||
        specificWindowContains(
          window,
          input.scheduledStart,
          input.scheduledEnd,
        ),
    )
  ) {
    throw new CoachingOutsideAvailabilityError();
  }
}
