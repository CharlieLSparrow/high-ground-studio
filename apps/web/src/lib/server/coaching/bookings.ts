import { prisma } from "@/lib/prisma";

const WRITE_GATE = "COACHING_BOOKING_WRITE_ENABLED";

type CreateCoachingBookingDraftInput = {
  clientUserId: string;
  contactEmail?: string;
  offeringId?: string;
  offeringSlug?: string;
  requestId?: string;
  appointmentId?: string;
  coachUserId?: string;
  scheduledStart: string;
  scheduledEnd: string;
  timezone?: string;
  paymentPolicy?: "FREE" | "DONATION_SUPPORTED" | "PAID_ONE_TO_ONE" | "MANUAL";
  notes?: string;
  metadataJson?: Record<string, unknown>;
};

function requireWriteGate() {
  if (process.env[WRITE_GATE] !== "true") {
    throw new Error(
      `Coaching booking writes are disabled. Set ${WRITE_GATE}=true only for controlled test-mode/internal flows.`,
    );
  }
}

function parseRequiredDate(value: string, label: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`${label} must be a valid ISO date/time.`);
  }
  return parsed;
}

function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60_000);
}

export async function createCoachingBookingDraft(input: CreateCoachingBookingDraftInput) {
  requireWriteGate();

  if (!input.clientUserId) {
    throw new Error("clientUserId is required.");
  }

  const scheduledStart = parseRequiredDate(input.scheduledStart, "scheduledStart");
  const scheduledEnd = parseRequiredDate(input.scheduledEnd, "scheduledEnd");

  if (scheduledEnd <= scheduledStart) {
    throw new Error("scheduledEnd must be after scheduledStart.");
  }

  const offering = input.offeringId
    ? await prisma.serviceOffering.findUnique({
        where: { id: input.offeringId },
        include: { coachProfile: true },
      })
    : input.offeringSlug
      ? await prisma.serviceOffering.findUnique({
          where: { slug: input.offeringSlug },
          include: { coachProfile: true },
        })
      : null;

  const paymentPolicy = input.paymentPolicy || offering?.paymentPolicy || "DONATION_SUPPORTED";
  const coachUserId = input.coachUserId || offering?.coachProfile?.userId || null;
  const timezone = input.timezone || offering?.coachProfile?.timezone || "America/Denver";
  const needsPayment = paymentPolicy === "PAID_ONE_TO_ONE";

  const client = await prisma.user.findUnique({
    where: { id: input.clientUserId },
    select: { id: true, primaryEmail: true },
  });

  if (!client) {
    throw new Error("Client user was not found.");
  }

  const contactEmail = input.contactEmail || client.primaryEmail;

  if (!contactEmail) {
    throw new Error("Client user needs a primary email before booking a coaching session.");
  }

  return prisma.$transaction(async (tx) => {
    const booking = await tx.coachingBooking.create({
      data: {
        requestId: input.requestId || null,
        appointmentId: input.appointmentId || null,
        offeringId: offering?.id || null,
        clientUserId: client.id,
        coachUserId,
        status: needsPayment ? "HOLDING_PAYMENT" : "REQUESTED",
        scheduledStart,
        scheduledEnd,
        timezone,
        paymentPolicy,
        notes: input.notes || null,
        metadataJson: {
          ...(input.metadataJson || {}),
          source: "coaching-booking-draft-api",
          offeringSlug: offering?.slug || input.offeringSlug || null,
        },
      },
    });

    const hold = await tx.bookingHold.create({
      data: {
        offeringId: offering?.id || null,
        coachProfileId: offering?.coachProfileId || null,
        clientUserId: client.id,
        contactEmail,
        scheduledStart,
        scheduledEnd,
        timezone,
        status: needsPayment ? "ACTIVE" : "CONVERTED",
        expiresAt: addMinutes(new Date(), needsPayment ? 30 : 5),
        convertedBookingId: booking.id,
        metadataJson: {
          source: "coaching-booking-draft-api",
          paymentPolicy,
        },
      },
    });

    const calendarLink = await tx.calendarEventLink.create({
      data: {
        bookingId: booking.id,
        provider: "google",
        status: "planned",
        title: offering?.title || "Quipsly coaching session",
        scheduledStart,
        scheduledEnd,
        timezone,
        rawJson: {
          source: "coaching-booking-draft-api",
          bookingId: booking.id,
          holdId: hold.id,
        },
      },
    });

    const room = await tx.callRoom.create({
      data: {
        bookingId: booking.id,
        purpose:
          offering?.kind === "PODCAST_CAPTURE"
            ? "PODCAST"
            : offering?.kind === "RESEARCH_INTERVIEW"
              ? "RESEARCH_INTERVIEW"
              : "COACHING",
        status: "PLANNED",
        provider: "planned",
        title: offering?.title || "Quipsly coaching session",
        scheduledStart,
        scheduledEnd,
        nestSlug: "high-ground-odyssey",
        projectSlug: "high-ground-odyssey",
        recordingPolicyJson: {
          requiresExplicitConsent: true,
          defaultConsentMode: "all-party",
        },
        transcriptPolicyJson: {
          queueAfterVerifiedUpload: true,
        },
        metadataJson: {
          source: "coaching-booking-draft-api",
          bookingId: booking.id,
          holdId: hold.id,
        },
      },
    });

    return {
      bookingId: booking.id,
      holdId: hold.id,
      calendarLinkId: calendarLink.id,
      callRoomId: room.id,
      status: booking.status,
      paymentPolicy,
      nextAction: needsPayment ? "create-stripe-checkout" : "confirm-or-review-booking",
    };
  });
}
