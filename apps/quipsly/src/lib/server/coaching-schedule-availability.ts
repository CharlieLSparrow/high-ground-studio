import "server-only";

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

  const [bookings, holds] = await Promise.all([
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
  ]);

  const conflicts: CoachingScheduleConflict[] = [
    ...bookings.map((booking: any) => ({
      kind: "booking" as const,
      ...booking,
    })),
    ...holds.map((hold: any) => ({ kind: "hold" as const, ...hold })),
  ];
  if (conflicts.length) throw new CoachingScheduleConflictError(conflicts);
}
