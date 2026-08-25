import "server-only";

import {
  QUIPSLY_PUBLIC_COACHING_OFFERING_KINDS,
  type QuipslyPublicCoachingOffering,
  type QuipslyPublicCoachingOfferings,
} from "@high-ground/quipsly-domain/coaching-public";

import { deriveCoachingBookableSlots } from "@/lib/coaching-bookable-slots";
import { getPrismaClient } from "@/lib/prisma";

const BLOCKING_BOOKING_STATUSES = [
  "REQUESTED",
  "HOLDING_PAYMENT",
  "CONFIRMED",
] as const;

function moneyLabel(
  cents: number | null | undefined,
  currency: string | null | undefined,
) {
  if (typeof cents !== "number" || cents <= 0) return null;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency || "USD",
    maximumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);
}

function publicOffering(
  offering: any,
  now: Date,
): QuipslyPublicCoachingOffering {
  const windows = (offering.coachProfile?.availabilityWindows || []).map(
    (window: any) => ({
      timezone: window.timezone,
      dayOfWeek: window.dayOfWeek,
      startMinute: window.startMinute,
      endMinute: window.endMinute,
      kind:
        window.dayOfWeek !== null &&
        window.startMinute !== null &&
        window.endMinute !== null
          ? "recurring"
          : "specific",
    }),
  );
  const bookings = (
    offering.coachProfile?.user?.coachingBookingsAsCoach || []
  ).map((booking: any) => ({
    scheduledStart: booking.scheduledStart.toISOString(),
    scheduledEnd: booking.scheduledEnd.toISOString(),
    status: booking.status,
  }));
  const holds = (offering.coachProfile?.bookingHolds || []).map(
    (hold: any) => ({
      scheduledStart: hold.scheduledStart.toISOString(),
      scheduledEnd: hold.scheduledEnd.toISOString(),
      status: hold.status,
    }),
  );
  const bookableSlots = deriveCoachingBookableSlots({
    windows,
    bookings: [...bookings, ...holds],
    durationMinutes: offering.durationMinutes,
    now,
    horizonDays: 21,
    maxSlots: 12,
    minimumLeadMinutes: 60,
  }).map(({ instant, timezone, label }) => ({ instant, timezone, label }));

  return {
    id: offering.id,
    slug: offering.slug,
    title: offering.title,
    description: offering.description,
    kind: offering.kind,
    paymentPolicy: offering.paymentPolicy,
    durationMinutes: offering.durationMinutes,
    priceLabel:
      moneyLabel(offering.priceCents, offering.currency) ||
      (offering.paymentPolicy === "PAID_ONE_TO_ONE" ? "Custom quote" : null),
    coachName:
      offering.coachProfile?.displayName ||
      offering.coachProfile?.user?.name ||
      "Quipsly coach",
    nextAction: bookableSlots.length
      ? "Choose a time and sign in to request it."
      : "Ask the coach to share new available times.",
    bookingPath: `/coaching/book/${encodeURIComponent(offering.slug)}`,
    bookableSlots,
  };
}

export async function loadPublicCoachingOfferings(input?: {
  slug?: string | null;
  now?: Date;
}): Promise<QuipslyPublicCoachingOfferings> {
  try {
    const prisma = getPrismaClient() as any;
    const now = input?.now || new Date();
    const offerings = await prisma.serviceOffering.findMany({
      where: {
        isActive: true,
        ...(input?.slug ? { slug: input.slug } : {}),
        kind: { in: [...QUIPSLY_PUBLIC_COACHING_OFFERING_KINDS] },
        coachProfile: { isActive: true },
        publicBookingEnabled: true,
      },
      orderBy: [{ kind: "asc" }, { updatedAt: "desc" }],
      take: input?.slug ? 1 : 12,
      include: {
        coachProfile: {
          include: {
            availabilityWindows: {
              where: { isActive: true },
              select: {
                timezone: true,
                dayOfWeek: true,
                startMinute: true,
                endMinute: true,
              },
            },
            bookingHolds: {
              where: { status: "ACTIVE", expiresAt: { gt: now } },
              select: {
                scheduledStart: true,
                scheduledEnd: true,
                status: true,
              },
            },
            user: {
              select: {
                name: true,
                coachingBookingsAsCoach: {
                  where: { status: { in: [...BLOCKING_BOOKING_STATUSES] } },
                  select: {
                    scheduledStart: true,
                    scheduledEnd: true,
                    status: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    return {
      source: "quipsly-database",
      unavailable: false,
      items: offerings.map((offering: any) => publicOffering(offering, now)),
    };
  } catch (error) {
    return {
      source: "unavailable",
      unavailable: true,
      error:
        error instanceof Error
          ? error.message
          : "Offerings are unavailable right now.",
      items: [],
    };
  }
}
