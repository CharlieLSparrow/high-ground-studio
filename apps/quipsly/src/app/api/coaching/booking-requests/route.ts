import { NextResponse } from "next/server";

import { getPrismaClient } from "@/lib/prisma";
import {
  assertCoachingScheduleAvailable,
  CoachingOutsideAvailabilityError,
  CoachingScheduleConflictError,
  CoachingScheduleIntervalError,
} from "@/lib/server/coaching-schedule-availability";
import { parseCoachingScheduleDate } from "@/lib/server/coaching-schedule-time";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";
import { acquirePrismaAdvisoryTransactionLock } from "@/lib/server/prisma-advisory-lock";

export const runtime = "nodejs";

const REQUEST_HOLD_HOURS = 24;
const MAX_ACTIVE_CLIENT_REQUESTS = 2;
const MINIMUM_LEAD_MINUTES = 60;

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function addMinutes(value: Date, minutes: number) {
  return new Date(value.getTime() + minutes * 60_000);
}

async function readJson(request: Request): Promise<Record<string, unknown>> {
  try {
    const value = await request.json();
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function bookingRequestError(error: unknown) {
  if (
    error instanceof CoachingScheduleConflictError ||
    error instanceof CoachingScheduleIntervalError ||
    error instanceof CoachingOutsideAvailabilityError
  ) {
    return NextResponse.json(
      { ok: false, error: error.message, code: error.code },
      { status: error.status },
    );
  }
  if (error instanceof BookingRequestError) {
    return NextResponse.json(
      { ok: false, error: error.message, code: error.code },
      { status: error.status },
    );
  }
  console.error("Client booking request failed.", error);
  return NextResponse.json(
    {
      ok: false,
      error:
        "That time could not be requested. Refresh the available times and try again.",
      code: "COACHING_REQUEST_FAILED",
    },
    { status: 500 },
  );
}

class BookingRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
    this.name = "BookingRequestError";
  }
}

export async function POST(request: Request) {
  const session = await getQuipslySessionFromRequest(request);
  if (!session?.user?.id) {
    return NextResponse.json(
      {
        ok: false,
        error: "Sign in or create a free Quipsly account to request this time.",
        code: "SIGN_IN_REQUIRED",
      },
      { status: 401 },
    );
  }

  const body = await readJson(request);
  const offeringId = text(body.offeringId);
  const requestedStart = text(body.scheduledStart);
  if (!offeringId || !requestedStart) {
    return NextResponse.json(
      {
        ok: false,
        error: "Choose one of the available times before continuing.",
        code: "COACHING_TIME_REQUIRED",
      },
      { status: 400 },
    );
  }

  const prisma = getPrismaClient() as any;
  const now = new Date();

  try {
    const result = await prisma.$transaction(async (tx: any) => {
      const offering = await tx.serviceOffering.findFirst({
        where: {
          id: offeringId,
          isActive: true,
          coachProfile: { isActive: true },
        },
        include: { coachProfile: true },
      });
      if (!offering?.coachProfile?.userId) {
        throw new BookingRequestError(
          "This coaching option is not accepting requests right now.",
          404,
          "COACHING_OFFERING_UNAVAILABLE",
        );
      }

      const timezone = offering.coachProfile.timezone;
      const scheduledStart = parseCoachingScheduleDate(
        requestedStart,
        timezone,
      );
      if (!scheduledStart) {
        throw new BookingRequestError(
          "That time is no longer valid. Refresh the available times and choose another.",
          400,
          "COACHING_TIME_INVALID",
        );
      }
      if (
        scheduledStart.getTime() <
        now.getTime() + MINIMUM_LEAD_MINUTES * 60_000
      ) {
        throw new BookingRequestError(
          "Choose a time at least one hour from now.",
          409,
          "COACHING_TIME_TOO_SOON",
        );
      }

      const durationMinutes = Math.max(15, offering.durationMinutes || 60);
      const scheduledEnd = addMinutes(scheduledStart, durationMinutes);
      await acquirePrismaAdvisoryTransactionLock(
        tx,
        `quipsly:coaching-client-request:${session.user.id}`,
      );
      await acquirePrismaAdvisoryTransactionLock(
        tx,
        `quipsly:coaching-schedule:${offering.coachProfile.userId}`,
      );

      await tx.userRole.upsert({
        where: {
          userId_role: { userId: session.user.id, role: "CLIENT" },
        },
        update: {},
        create: { userId: session.user.id, role: "CLIENT" },
      });

      const existing = await tx.bookingHold.findFirst({
        where: {
          offeringId: offering.id,
          clientUserId: session.user.id,
          scheduledStart,
          scheduledEnd,
          status: "ACTIVE",
          expiresAt: { gt: now },
        },
        orderBy: { createdAt: "desc" },
      });
      if (existing) {
        return { hold: existing, repeated: true };
      }

      const activeRequestCount = await tx.bookingHold.count({
        where: {
          clientUserId: session.user.id,
          status: "ACTIVE",
          expiresAt: { gt: now },
        },
      });
      if (activeRequestCount >= MAX_ACTIVE_CLIENT_REQUESTS) {
        throw new BookingRequestError(
          "You already have two open time requests. Release one or wait for the coach to respond before requesting another.",
          409,
          "COACHING_REQUEST_LIMIT",
        );
      }

      await assertCoachingScheduleAvailable({
        tx,
        coachUserId: offering.coachProfile.userId,
        scheduledStart,
        scheduledEnd,
        now,
      });

      const hold = await tx.bookingHold.create({
        data: {
          offeringId: offering.id,
          coachProfileId: offering.coachProfile.id,
          clientUserId: session.user.id,
          contactEmail: session.user.primaryEmail,
          scheduledStart,
          scheduledEnd,
          timezone,
          status: "ACTIVE",
          expiresAt: addMinutes(now, REQUEST_HOLD_HOURS * 60),
          metadataJson: {
            source: "quipsly-client-self-scheduling",
            requestedByUserId: session.user.id,
            requestKind: "client-booking-hold",
            externalCalendarCreated: false,
            externalInviteSent: false,
            paymentCreated: false,
          },
        },
      });
      return { hold, repeated: false };
    });

    return NextResponse.json(
      {
        ok: true,
        request: {
          holdId: result.hold.id,
          status: result.hold.status,
          scheduledStart: result.hold.scheduledStart,
          scheduledEnd: result.hold.scheduledEnd,
          timezone: result.hold.timezone,
          expiresAt: result.hold.expiresAt,
          repeated: result.repeated,
        },
        nextAction:
          "Time requested. The coach can now confirm it from Quipsly; no calendar invitation, payment, call, or recording was created yet.",
      },
      { status: result.repeated ? 200 : 201 },
    );
  } catch (error) {
    return bookingRequestError(error);
  }
}

export async function DELETE(request: Request) {
  const session = await getQuipslySessionFromRequest(request);
  if (!session?.user?.id) {
    return NextResponse.json(
      {
        ok: false,
        error: "Sign in before canceling a coaching request.",
        code: "SIGN_IN_REQUIRED",
      },
      { status: 401 },
    );
  }
  const holdId = text(new URL(request.url).searchParams.get("holdId"));
  if (!holdId) {
    return NextResponse.json(
      {
        ok: false,
        error: "Choose a coaching request to cancel.",
        code: "COACHING_REQUEST_REQUIRED",
      },
      { status: 400 },
    );
  }

  const prisma = getPrismaClient() as any;
  try {
    const result = await prisma.$transaction(async (tx: any) => {
      await acquirePrismaAdvisoryTransactionLock(
        tx,
        `quipsly:coaching-client-request:${session.user.id}`,
      );
      const hold = await tx.bookingHold.findFirst({
        where: { id: holdId, clientUserId: session.user.id },
        select: { id: true, status: true, metadataJson: true },
      });
      if (!hold) {
        throw new BookingRequestError(
          "That coaching request was not found.",
          404,
          "COACHING_REQUEST_NOT_FOUND",
        );
      }
      if (hold.status === "CANCELED") {
        return { holdId: hold.id, repeated: true };
      }
      if (hold.status !== "ACTIVE") {
        throw new BookingRequestError(
          "That request can no longer be canceled because its status has changed.",
          409,
          "COACHING_REQUEST_NOT_ACTIVE",
        );
      }
      await tx.bookingHold.update({
        where: { id: hold.id },
        data: {
          status: "CANCELED",
          metadataJson: {
            ...record(hold.metadataJson),
            source: "quipsly-client-self-scheduling",
            requestKind: "client-booking-hold",
            canceledByUserId: session.user.id,
            canceledAt: new Date().toISOString(),
            externalCalendarMutated: false,
            externalInviteSent: false,
            paymentMutated: false,
          },
        },
      });
      return { holdId: hold.id, repeated: false };
    });
    return NextResponse.json({
      ok: true,
      request: { holdId: result.holdId, status: "CANCELED", repeated: result.repeated },
      nextAction: "Time request canceled. No calendar event, payment, call, or recording was changed.",
    });
  } catch (error) {
    return bookingRequestError(error);
  }
}
