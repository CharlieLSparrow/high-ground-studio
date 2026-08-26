import { randomUUID } from "node:crypto";

import { coachingClientEntryPaths } from "@/lib/coaching-client-entry";
import { ensureCoachingEngagement } from "@/lib/server/coaching-engagement";
import {
  buildCoachingBookingSeriesStarts,
  coachingBookingSeriesLabel,
  type CoachingBookingSeriesIntent,
} from "@/lib/server/coaching-booking-series";
import { assertCoachingScheduleAvailable } from "@/lib/server/coaching-schedule-availability";
import { acquirePrismaAdvisoryTransactionLock } from "@/lib/server/prisma-advisory-lock";
import { ensureInvitedStudioUserByEmail } from "@/lib/server/studio-user-identity";

type SeriesActor = {
  id: string;
  name?: string | null;
  primaryEmail: string;
  isStaff: boolean;
};

type SeriesProject = { id: string; slug: string };

type CreateSeriesInput = {
  requestId: string;
  actor: SeriesActor;
  project: SeriesProject;
  clientEmail: string;
  clientName: string | null;
  title: string;
  offeringId: string | null;
  timezone: string;
  firstScheduledStart: Date;
  durationMinutes: number;
  paymentPolicy: string;
  amountCents: number | null;
  currency: string;
  notes: string | null;
  requestedEngagementId: string | null;
  requestedCoachUserId: string | null;
  intent: CoachingBookingSeriesIntent;
};

function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60_000);
}

function consentText() {
  return "I confirm that everyone in this Quipsly session knows this session is being recorded and transcribed, and that I consent to recording my participation.";
}

function replayResult(series: any) {
  const occurrences = (series.bookings || [])
    .filter((booking: any) => booking.callRoom)
    .sort((left: any, right: any) => (left.seriesSequence || 0) - (right.seriesSequence || 0))
    .map((booking: any) => ({
      sequence: booking.seriesSequence,
      bookingId: booking.id,
      callRoomId: booking.callRoom.id,
      scheduledStart: booking.scheduledStart,
      scheduledEnd: booking.scheduledEnd,
      ...coachingClientEntryPaths({
        roomId: booking.callRoom.id,
        engagementId: series.engagementId,
      }),
    }));
  return {
    seriesId: series.id,
    engagementId: series.engagementId,
    occurrenceCount: series.occurrenceCount,
    recurrenceLabel: coachingBookingSeriesLabel({
      frequency: series.frequency,
      intervalCount: series.intervalCount,
      occurrenceCount: series.occurrenceCount,
    }),
    occurrences,
    firstOccurrence: occurrences[0] || null,
    idempotentReplay: true,
    nextAction: "This Session series was already prepared. Open the first Session or the client space.",
  };
}

export async function createCoachingBookingSeriesInTransaction(
  tx: any,
  input: CreateSeriesInput,
) {
  await acquirePrismaAdvisoryTransactionLock(
    tx,
    `quipsly:coaching-booking-series:${input.requestId}`,
  );
  const existing = await tx.coachingBookingSeries.findUnique({
    where: { requestId: input.requestId },
    include: {
      bookings: {
        orderBy: { seriesSequence: "asc" },
        include: { callRoom: { select: { id: true } } },
      },
    },
  });
  if (existing) {
    if (!input.actor.isStaff && existing.createdByUserId !== input.actor.id) {
      throw new Error("That Session-series request belongs to another account.");
    }
    return replayResult(existing);
  }

  const offering = input.offeringId
    ? await tx.serviceOffering.findUnique({
        where: { id: input.offeringId },
        include: { coachProfile: true },
      })
    : null;
  if (input.offeringId && !offering) {
    throw new Error("Selected service offering was not found.");
  }

  const coachUserId = input.actor.isStaff
    ? input.requestedCoachUserId || offering?.coachProfile?.userId || input.actor.id
    : input.actor.id;
  const client = await ensureInvitedStudioUserByEmail({
    email: input.clientEmail,
    name: input.clientName,
    prisma: tx,
  });
  const engagement = await ensureCoachingEngagement({
    prisma: tx,
    projectId: input.project.id,
    actorUserId: input.actor.id,
    clientUserId: client.id,
    coachUserId,
    clientLabel: client.name || client.primaryEmail,
    requestedEngagementId: input.requestedEngagementId,
  });
  const starts = buildCoachingBookingSeriesStarts({
    firstScheduledStart: input.firstScheduledStart,
    timezone: input.timezone,
    intent: input.intent,
  });
  for (const scheduledStart of starts) {
    await assertCoachingScheduleAvailable({
      tx,
      coachUserId,
      scheduledStart,
      scheduledEnd: addMinutes(scheduledStart, input.durationMinutes),
    });
  }

  const series = await tx.coachingBookingSeries.create({
    data: {
      requestId: input.requestId,
      clientUserId: client.id,
      coachUserId,
      engagementId: engagement.id,
      offeringId: offering?.id || null,
      createdByUserId: input.actor.id,
      title: input.title,
      timezone: input.timezone,
      frequency: input.intent.frequency,
      intervalCount: input.intent.intervalCount,
      occurrenceCount: input.intent.occurrenceCount,
      durationMinutes: input.durationMinutes,
      firstScheduledStart: starts[0],
      lastScheduledStart: starts.at(-1),
      metadataJson: {
        source: "quipsly-coaching-runway",
        creationMode: "finite-series",
        recurrenceLabel: coachingBookingSeriesLabel(input.intent),
        externalCalendarCreated: false,
        externalInviteSent: false,
      },
    },
  });

  const occurrences = [];
  for (const [index, scheduledStart] of starts.entries()) {
    const scheduledEnd = addMinutes(scheduledStart, input.durationMinutes);
    const appointment = await tx.appointment.create({
      data: {
        clientUserId: client.id,
        coachUserId,
        createdByUserId: input.actor.id,
        updatedByUserId: input.actor.id,
        scheduledStart,
        scheduledEnd,
        timezone: input.timezone,
        status: "SCHEDULED",
        locationType: "VIDEO",
        locationDetails: "Quipsly capture room prepared as part of a finite Session series.",
        notes: input.notes,
      },
    });
    const paymentRecord = input.paymentPolicy === "PAID_ONE_TO_ONE" && input.amountCents
      ? await tx.paymentRecord.create({
          data: {
            userId: client.id,
            provider: "stripe",
            status: "PENDING",
            amountCents: input.amountCents,
            currency: input.currency,
            description: `${input.title} · Session ${index + 1}`,
            metadataJson: {
              source: "quipsly-coaching-runway",
              seriesId: series.id,
              seriesSequence: index + 1,
              externalCheckoutCreated: false,
            },
          },
        })
      : null;
    const booking = await tx.coachingBooking.create({
      data: {
        appointmentId: appointment.id,
        offeringId: offering?.id || null,
        clientUserId: client.id,
        coachUserId,
        engagementId: engagement.id,
        seriesId: series.id,
        seriesSequence: index + 1,
        status: paymentRecord ? "HOLDING_PAYMENT" : "CONFIRMED",
        scheduledStart,
        scheduledEnd,
        timezone: input.timezone,
        paymentPolicy: input.paymentPolicy,
        paymentRecordId: paymentRecord?.id || null,
        notes: input.notes,
        metadataJson: {
          source: "quipsly-coaching-runway",
          creationMode: "finite-series",
          seriesId: series.id,
          seriesSequence: index + 1,
          createdByUserId: input.actor.id,
          externalCalendarCreated: false,
          externalInviteSent: false,
          stripeCheckoutCreated: false,
        },
      },
    });
    const room = await tx.callRoom.create({
      data: {
        bookingId: booking.id,
        createdByUserId: input.actor.id,
        projectId: input.project.id,
        coachingEngagementId: engagement.id,
        purpose: "COACHING",
        status: "PLANNED",
        provider: "livekit",
        providerRoomId: `quipsly-${randomUUID()}`,
        title: input.title,
        scheduledStart,
        scheduledEnd,
        nestSlug: input.project.slug,
        projectSlug: input.project.slug,
        recordingPolicyJson: {
          source: "quipsly-coaching-runway",
          requiresExplicitConsent: true,
          visibleRecordingIndicatorRequired: true,
        },
        transcriptPolicyJson: {
          source: "quipsly-coaching-runway",
          queueAfterVerifiedUpload: true,
        },
        metadataJson: {
          source: "quipsly-coaching-runway",
          creationMode: "finite-series",
          seriesId: series.id,
          seriesSequence: index + 1,
          createdByUserId: input.actor.id,
          externalProviderRoomCreated: false,
        },
      },
    });
    const coachParticipant = await tx.callParticipant.create({
      data: {
        roomId: room.id,
        userId: coachUserId,
        role: "COACH",
        displayName: coachUserId === input.actor.id
          ? input.actor.name || input.actor.primaryEmail
          : "Coach",
        email: coachUserId === input.actor.id ? input.actor.primaryEmail : null,
        deviceLabel: "Quipsly capture room",
      },
    });
    const clientParticipant = await tx.callParticipant.create({
      data: {
        roomId: room.id,
        userId: client.id,
        role: "CLIENT",
        displayName: client.name || client.primaryEmail,
        email: client.primaryEmail,
        deviceLabel: "Quipsly capture room",
      },
    });
    await tx.recordingConsent.createMany({
      data: [
        {
          roomId: room.id,
          participantId: coachParticipant.id,
          userId: coachUserId,
          status: "REQUESTED",
          consentText: consentText(),
          metadataJson: { source: "quipsly-coaching-runway", seriesId: series.id },
        },
        {
          roomId: room.id,
          participantId: clientParticipant.id,
          userId: client.id,
          status: "REQUESTED",
          consentText: consentText(),
          metadataJson: { source: "quipsly-coaching-runway", seriesId: series.id },
        },
      ],
    });
    await tx.calendarEventLink.create({
      data: {
        bookingId: booking.id,
        roomId: room.id,
        provider: "google",
        status: "planned",
        title: input.title,
        scheduledStart,
        scheduledEnd,
        timezone: input.timezone,
        rawJson: {
          source: "quipsly-coaching-runway",
          seriesId: series.id,
          seriesSequence: index + 1,
          externalCalendarCreated: false,
        },
      },
    });
    occurrences.push({
      sequence: index + 1,
      bookingId: booking.id,
      callRoomId: room.id,
      scheduledStart,
      scheduledEnd,
      ...coachingClientEntryPaths({ roomId: room.id, engagementId: engagement.id }),
    });
  }

  return {
    seriesId: series.id,
    engagementId: engagement.id,
    occurrenceCount: occurrences.length,
    recurrenceLabel: coachingBookingSeriesLabel(input.intent),
    occurrences,
    firstOccurrence: occurrences[0],
    idempotentReplay: false,
    nextAction: `${occurrences.length} Sessions are ready. Send the first invitation now; future Sessions stay in the same private client space.`,
  };
}
