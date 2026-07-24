"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { canAccessInternalContent } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { createCoachingBookingDraft } from "@/lib/server/coaching/bookings";
import { buildCoachingPacketFromTranscriptJob } from "@/lib/server/coaching/coaching-packets";
import { runCoachingCaptureTranscriptJob } from "@/lib/server/coaching/capture-transcripts";
import {
  reconcileLiveKitEgressRecording,
  startLiveKitRoomCompositeEgress,
  stopLiveKitRoomCompositeEgress,
} from "@/lib/server/coaching/livekit-egress";
import { createCoachingCheckoutSession, createCoachingCustomerPortalSession } from "@/lib/server/coaching/stripe";

const SETUP_GATE = "COACHING_CAPTURE_SETUP_ENABLED";
const DELETION_STATUSES = new Set([
  "REQUESTED",
  "REVIEWING",
  "EXPORT_PREPARING",
  "READY_FOR_DELETION",
  "COMPLETED",
  "CANCELED",
  "REJECTED",
]);
const BOOKING_STATUSES = new Set([
  "REQUESTED",
  "HOLDING_PAYMENT",
  "CONFIRMED",
  "COMPLETED",
  "CANCELED",
  "NO_SHOW",
]);

async function requireTeamUser() {
  const session = await auth();
  const roles = Array.isArray(session?.user?.roles) ? session.user.roles : [];

  if (!session?.user || !canAccessInternalContent(roles)) {
    throw new Error("Team access is required.");
  }

  const email = (session.user as { primaryEmail?: string | null }).primaryEmail || session.user.email;

  if (!email) {
    throw new Error("The signed-in team user needs an email before setup can continue.");
  }

  const user = await prisma.user.findUnique({
    where: { primaryEmail: email },
    select: { id: true, primaryEmail: true, name: true },
  });

  if (!user) {
    throw new Error("The signed-in team user was not found in Quipsly user records.");
  }

  return user;
}

function requireSetupGate() {
  if (process.env[SETUP_GATE] !== "true") {
    throw new Error(
      `Coaching capture setup is disabled. Set ${SETUP_GATE}=true only for controlled internal setup.`,
    );
  }
}

function parseMinuteOfDay(value: string, label: string) {
  const [hoursRaw, minutesRaw] = value.split(":");
  const hours = Number(hoursRaw);
  const minutes = Number(minutesRaw);

  if (!Number.isInteger(hours) || !Number.isInteger(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    throw new Error(`${label} must be a valid time.`);
  }

  return hours * 60 + minutes;
}

export async function seedCoachingCaptureFoundationAction() {
  let target = "/team/coaching-capture?setup=seeded";

  try {
    requireSetupGate();
    const user = await requireTeamUser();
    const db = prisma as any;

    const coachProfile = await db.coachProfile.upsert({
      where: { userId: user.id },
      update: {
        displayName: user.name || user.primaryEmail,
        isActive: true,
        metadataJson: {
          source: "team-coaching-capture-seed",
          updatedBy: user.primaryEmail,
        },
      },
      create: {
        userId: user.id,
        slug: "high-ground-coaching",
        displayName: user.name || user.primaryEmail,
        bio: "High Ground Odyssey coaching and creator-support sessions.",
        timezone: "America/Los_Angeles",
        isActive: true,
        metadataJson: {
          source: "team-coaching-capture-seed",
          createdBy: user.primaryEmail,
        },
      },
    });

    await db.serviceOffering.upsert({
      where: { slug: "hgo-one-to-one-coaching-60" },
      update: {
        coachProfileId: coachProfile.id,
        title: "High Ground one-to-one coaching",
        description: "A real-time one-to-one coaching session for creators, leaders, and people trying to turn anxious creative energy into useful work.",
        kind: "ONE_TO_ONE_COACHING",
        paymentPolicy: "PAID_ONE_TO_ONE",
        durationMinutes: 60,
        priceCents: 15000,
        currency: "USD",
        isActive: true,
        metadataJson: {
          source: "team-coaching-capture-seed",
          appStoreClass: "one-to-one-real-time-service",
        },
      },
      create: {
        coachProfileId: coachProfile.id,
        slug: "hgo-one-to-one-coaching-60",
        title: "High Ground one-to-one coaching",
        description: "A real-time one-to-one coaching session for creators, leaders, and people trying to turn anxious creative energy into useful work.",
        kind: "ONE_TO_ONE_COACHING",
        paymentPolicy: "PAID_ONE_TO_ONE",
        durationMinutes: 60,
        priceCents: 15000,
        currency: "USD",
        isActive: true,
        metadataJson: {
          source: "team-coaching-capture-seed",
          appStoreClass: "one-to-one-real-time-service",
        },
      },
    });

    await db.serviceOffering.upsert({
      where: { slug: "hgo-podcast-capture-90" },
      update: {
        coachProfileId: coachProfile.id,
        title: "Podcast capture and coaching conversation",
        description: "A recorded podcast, coaching, or research conversation that becomes transcript, notes, clips, and follow-up assets inside Quipsly.",
        kind: "PODCAST_CAPTURE",
        paymentPolicy: "MANUAL",
        durationMinutes: 90,
        priceCents: null,
        currency: "USD",
        isActive: true,
        metadataJson: {
          source: "team-coaching-capture-seed",
          appStoreClass: "manual-or-internal-production-service",
        },
      },
      create: {
        coachProfileId: coachProfile.id,
        slug: "hgo-podcast-capture-90",
        title: "Podcast capture and coaching conversation",
        description: "A recorded podcast, coaching, or research conversation that becomes transcript, notes, clips, and follow-up assets inside Quipsly.",
        kind: "PODCAST_CAPTURE",
        paymentPolicy: "MANUAL",
        durationMinutes: 90,
        currency: "USD",
        isActive: true,
        metadataJson: {
          source: "team-coaching-capture-seed",
          appStoreClass: "manual-or-internal-production-service",
        },
      },
    });

    const existingAvailability = await db.availabilityWindow.findFirst({
      where: {
        coachProfileId: coachProfile.id,
        label: "Weekday afternoon coaching block",
      },
    });

    if (!existingAvailability) {
      await db.availabilityWindow.create({
        data: {
          coachProfileId: coachProfile.id,
          label: "Weekday afternoon coaching block",
          timezone: "America/Los_Angeles",
          dayOfWeek: 2,
          startMinute: 13 * 60,
          endMinute: 17 * 60,
          isActive: true,
          metadataJson: {
            source: "team-coaching-capture-seed",
          },
        },
      });
    }

    revalidatePath("/team/coaching-capture");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to seed coaching capture foundation.";
    target = `/team/coaching-capture?setupError=${encodeURIComponent(message)}`;
  }

  redirect(target);
}

export async function createAvailabilityWindowAction(formData: FormData) {
  let target = "/team/coaching-capture?availability=created";

  try {
    await requireTeamUser();
    const coachProfileId = String(formData.get("coachProfileId") || "");
    const label = String(formData.get("label") || "").trim();
    const dayOfWeek = Number(String(formData.get("dayOfWeek") || ""));
    const startTime = String(formData.get("startTime") || "");
    const endTime = String(formData.get("endTime") || "");
    const timezone = String(formData.get("timezone") || "").trim() || "America/Los_Angeles";

    if (!coachProfileId) {
      throw new Error("Choose a coach profile before adding availability.");
    }

    if (!Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) {
      throw new Error("Choose a valid weekday.");
    }

    const startMinute = parseMinuteOfDay(startTime, "Start time");
    const endMinute = parseMinuteOfDay(endTime, "End time");

    if (endMinute <= startMinute) {
      throw new Error("Availability end time must be after start time.");
    }

    const db = prisma as any;
    const coachProfile = await db.coachProfile.findUnique({
      where: { id: coachProfileId },
      select: { id: true },
    });

    if (!coachProfile) {
      throw new Error("Coach profile was not found.");
    }

    await db.availabilityWindow.create({
      data: {
        coachProfileId,
        label: label || "Coaching availability",
        timezone,
        dayOfWeek,
        startMinute,
        endMinute,
        isActive: true,
        metadataJson: {
          source: "team-coaching-capture-runway",
        },
      },
    });

    revalidatePath("/team/coaching-capture");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to add availability.";
    target = `/team/coaching-capture?availabilityError=${encodeURIComponent(message)}`;
  }

  redirect(target);
}

export async function createBookingDraftAction(formData: FormData) {
  let target = "/team/coaching-capture?booking=created";

  try {
    await requireTeamUser();

    const clientUserId = String(formData.get("clientUserId") || "");
    const offeringId = String(formData.get("offeringId") || "");
    const scheduledStart = String(formData.get("scheduledStart") || "");
    const scheduledEnd = String(formData.get("scheduledEnd") || "");
    const notes = String(formData.get("notes") || "");

    await createCoachingBookingDraft({
      clientUserId,
      offeringId,
      scheduledStart,
      scheduledEnd,
      notes,
      metadataJson: {
        source: "team-coaching-capture-page",
      },
    });

    revalidatePath("/team/coaching-capture");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create booking draft.";
    target = `/team/coaching-capture?bookingError=${encodeURIComponent(message)}`;
  }

  redirect(target);
}

export async function createCoachingCheckoutAction(formData: FormData) {
  let target = "/team/coaching-capture?checkout=created";

  try {
    await requireTeamUser();
    const bookingId = String(formData.get("bookingId") || "");

    if (!bookingId) {
      throw new Error("Choose a coaching booking before creating checkout.");
    }

    const checkout = await createCoachingCheckoutSession({
      bookingId,
      successUrl: "/team/coaching-capture?checkout=success",
      cancelUrl: "/team/coaching-capture?checkout=cancel",
    });

    if (!checkout.url) {
      throw new Error("Stripe did not return a checkout URL.");
    }

    target = checkout.url;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create coaching checkout.";
    target = `/team/coaching-capture?checkoutError=${encodeURIComponent(message)}`;
  }

  redirect(target);
}

export async function createCoachingCustomerPortalAction(formData: FormData) {
  let target = "/team/coaching-capture?portal=created";

  try {
    await requireTeamUser();
    const userId = String(formData.get("userId") || "");
    const stripeCustomerId = String(formData.get("stripeCustomerId") || "");

    if (!userId && !stripeCustomerId) {
      throw new Error("Choose a client with Stripe payment evidence before opening Customer Portal.");
    }

    const portal = await createCoachingCustomerPortalSession({
      userId: userId || undefined,
      stripeCustomerId: stripeCustomerId || undefined,
      returnUrl: "/team/coaching-capture?portal=returned",
    });

    if (!portal.url) {
      throw new Error("Stripe did not return a Customer Portal URL.");
    }

    target = portal.url;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create Stripe Customer Portal session.";
    target = `/team/coaching-capture?portalError=${encodeURIComponent(message)}`;
  }

  redirect(target);
}

export async function updateCoachingBookingRunwayAction(formData: FormData) {
  let target = "/team/coaching-capture?booking=updated";

  try {
    const operator = await requireTeamUser();
    const bookingId = String(formData.get("bookingId") || "");
    const status = String(formData.get("status") || "");
    const scheduledStartRaw = String(formData.get("scheduledStart") || "");
    const scheduledEndRaw = String(formData.get("scheduledEnd") || "");
    const timezone = String(formData.get("timezone") || "").trim() || "America/Los_Angeles";
    const note = String(formData.get("note") || "").trim();

    if (!bookingId) {
      throw new Error("Choose a booking before updating the runway.");
    }

    if (status && !BOOKING_STATUSES.has(status)) {
      throw new Error("Choose a valid booking status.");
    }

    const db = prisma as any;
    const existing = await db.coachingBooking.findUnique({
      where: { id: bookingId },
      include: {
        hold: true,
        callRoom: true,
        calendarLinks: { orderBy: { createdAt: "desc" }, take: 1 },
      },
    });

    if (!existing) {
      throw new Error("Coaching booking was not found.");
    }

    const scheduledStart = scheduledStartRaw ? new Date(scheduledStartRaw) : existing.scheduledStart;
    const scheduledEnd = scheduledEndRaw ? new Date(scheduledEndRaw) : existing.scheduledEnd;

    if (Number.isNaN(scheduledStart.getTime()) || Number.isNaN(scheduledEnd.getTime())) {
      throw new Error("Schedule dates must be valid.");
    }

    if (scheduledEnd <= scheduledStart) {
      throw new Error("The scheduled end must be after the scheduled start.");
    }

    const nextStatus = status || existing.status;
    const now = new Date();
    const existingMetadata =
      existing.metadataJson && typeof existing.metadataJson === "object" && !Array.isArray(existing.metadataJson)
        ? existing.metadataJson
        : {};
    const history = Array.isArray(existingMetadata.operatorHistory)
      ? existingMetadata.operatorHistory
      : [];

    await db.$transaction(async (tx: any) => {
      await tx.coachingBooking.update({
        where: { id: bookingId },
        data: {
          status: nextStatus,
          scheduledStart,
          scheduledEnd,
          timezone,
          notes: note || existing.notes,
          metadataJson: {
            ...existingMetadata,
            operatorHistory: [
              ...history,
              {
                at: now.toISOString(),
                operatorUserId: operator.id,
                operatorEmail: operator.primaryEmail,
                status: nextStatus,
                scheduledStart: scheduledStart.toISOString(),
                scheduledEnd: scheduledEnd.toISOString(),
                timezone,
                note: note || null,
                source: "team-coaching-capture-runway",
              },
            ],
          },
        },
      });

      if (existing.hold) {
        const nextHoldStatus =
          nextStatus === "CANCELED"
            ? "CANCELED"
            : nextStatus === "HOLDING_PAYMENT"
              ? "ACTIVE"
              : ["REQUESTED", "CONFIRMED", "COMPLETED"].includes(nextStatus)
                ? "CONVERTED"
                : existing.hold.status;

        await tx.bookingHold.update({
          where: { id: existing.hold.id },
          data: {
            scheduledStart,
            scheduledEnd,
            timezone,
            status: nextHoldStatus,
          },
        });
      }

      if (existing.callRoom) {
        const nextRoomStatus =
          nextStatus === "CANCELED"
            ? "CANCELED"
            : nextStatus === "COMPLETED"
              ? "ENDED"
              : ["CANCELED", "ENDED", "FAILED"].includes(existing.callRoom.status)
                ? "PLANNED"
                : existing.callRoom.status;

        await tx.callRoom.update({
          where: { id: existing.callRoom.id },
          data: {
            scheduledStart,
            scheduledEnd,
            status: nextRoomStatus,
            metadataJson: {
              ...(existing.callRoom.metadataJson || {}),
              lastScheduleSyncAt: now.toISOString(),
              lastScheduleSyncSource: "team-coaching-capture-runway",
            },
          },
        });
      }

      if (existing.calendarLinks?.[0]) {
        await tx.calendarEventLink.update({
          where: { id: existing.calendarLinks[0].id },
          data: {
            scheduledStart,
            scheduledEnd,
            timezone,
            status: nextStatus === "CANCELED" ? "canceled" : "planned",
            rawJson: {
              ...(existing.calendarLinks[0].rawJson || {}),
              lastScheduleSyncAt: now.toISOString(),
              lastScheduleSyncSource: "team-coaching-capture-runway",
            },
          },
        });
      }
    });

    revalidatePath("/team/coaching-capture");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update coaching booking.";
    target = `/team/coaching-capture?bookingError=${encodeURIComponent(message)}`;
  }

  redirect(target);
}

export async function updateAccountDeletionRequestAction(formData: FormData) {
  let target = "/team/coaching-capture?deletion=updated";

  try {
    const operator = await requireTeamUser();
    const requestId = String(formData.get("requestId") || "");
    const status = String(formData.get("status") || "");
    const note = String(formData.get("note") || "").trim();

    if (!requestId) {
      throw new Error("Choose a deletion request before updating it.");
    }

    if (!DELETION_STATUSES.has(status)) {
      throw new Error("Choose a valid deletion request status.");
    }

    const db = prisma as any;
    const existing = await db.userAccountDeletionRequest.findUnique({
      where: { id: requestId },
    });

    if (!existing) {
      throw new Error("Deletion request was not found.");
    }

    const now = new Date();
    const existingMetadata =
      existing.metadataJson && typeof existing.metadataJson === "object" && !Array.isArray(existing.metadataJson)
        ? existing.metadataJson
        : {};
    const history = Array.isArray(existingMetadata.operatorHistory)
      ? existingMetadata.operatorHistory
      : [];

    await db.userAccountDeletionRequest.update({
      where: { id: requestId },
      data: {
        status,
        reviewedAt:
          existing.reviewedAt ||
          (["REVIEWING", "EXPORT_PREPARING", "READY_FOR_DELETION", "COMPLETED", "CANCELED", "REJECTED"].includes(status)
            ? now
            : null),
        completedAt: status === "COMPLETED" ? now : existing.completedAt,
        canceledAt: ["CANCELED", "REJECTED"].includes(status) ? now : existing.canceledAt,
        metadataJson: {
          ...existingMetadata,
          operatorHistory: [
            ...history,
            {
              at: now.toISOString(),
              operatorUserId: operator.id,
              operatorEmail: operator.primaryEmail,
              status,
              note: note || null,
              source: "team-coaching-capture-runway",
            },
          ],
        },
      },
    });

    revalidatePath("/team/coaching-capture");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update account deletion request.";
    target = `/team/coaching-capture?deletionError=${encodeURIComponent(message)}`;
  }

  redirect(target);
}

export async function prepareLiveKitCallRoomAction(formData: FormData) {
  let target = "/team/coaching-capture?room=livekit-prepared";

  try {
    const operator = await requireTeamUser();
    const callRoomId = String(formData.get("callRoomId") || "");

    if (!callRoomId) {
      throw new Error("Choose a call room before preparing LiveKit.");
    }

    const db = prisma as any;
    const room = await db.callRoom.findUnique({
      where: { id: callRoomId },
      select: {
        id: true,
        status: true,
        provider: true,
        providerRoomId: true,
        metadataJson: true,
      },
    });

    if (!room) {
      throw new Error("Call room was not found.");
    }

    if (["CANCELED", "ENDED", "FAILED"].includes(room.status)) {
      throw new Error("Closed rooms should be reopened deliberately before preparing a live provider room.");
    }

    const now = new Date();
    const providerRoomId = room.providerRoomId || `quipsly-${room.id}`;

    await db.callRoom.update({
      where: { id: room.id },
      data: {
        provider: "livekit",
        providerRoomId,
        metadataJson: {
          ...(room.metadataJson || {}),
          livekitPreparedAt: now.toISOString(),
          livekitPreparedByUserId: operator.id,
          livekitPreparedByEmail: operator.primaryEmail,
          providerRoomId,
          providerSource: "team-coaching-capture-runway",
        },
      },
    });

    revalidatePath("/team/coaching-capture");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to prepare LiveKit room.";
    target = `/team/coaching-capture?roomError=${encodeURIComponent(message)}`;
  }

  redirect(target);
}

export async function updateProviderRecordingEgressAction(formData: FormData) {
  let target = "/team/coaching-capture?egress=updated";

  try {
    const operator = await requireTeamUser();
    const callRoomId = String(formData.get("callRoomId") || "");
    const action = String(formData.get("action") || "").toUpperCase();

    if (!callRoomId) {
      throw new Error("Choose a call room before updating provider recording.");
    }

    const result =
      action === "START"
        ? await startLiveKitRoomCompositeEgress({ callRoomId, operatorUserId: operator.id })
        : action === "STOP"
          ? await stopLiveKitRoomCompositeEgress({ callRoomId, operatorUserId: operator.id })
          : null;

    if (!result) {
      throw new Error("Choose START or STOP for provider recording.");
    }

    revalidatePath("/team/coaching-capture");
    target = `/team/coaching-capture?egress=${encodeURIComponent(result.status)}&egressMessage=${encodeURIComponent(result.message)}`;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update provider recording.";
    target = `/team/coaching-capture?egressError=${encodeURIComponent(message)}`;
  }

  redirect(target);
}

export async function reconcileProviderRecordingAssetAction(formData: FormData) {
  let target = "/team/coaching-capture?verification=updated";

  try {
    const operator = await requireTeamUser();
    const recordingAssetId = String(formData.get("recordingAssetId") || "");

    if (!recordingAssetId) {
      throw new Error("Choose a provider recording asset before reconciling storage evidence.");
    }

    const result = await reconcileLiveKitEgressRecording({
      recordingAssetId,
      operatorUserId: operator.id,
    });

    revalidatePath("/team/coaching-capture");
    target = `/team/coaching-capture?verification=${encodeURIComponent(result.status)}&verificationMessage=${encodeURIComponent(result.message)}`;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to reconcile provider recording evidence.";
    target = `/team/coaching-capture?verificationError=${encodeURIComponent(message)}`;
  }

  redirect(target);
}

export async function runTranscriptJobAction(formData: FormData) {
  let target = "/team/coaching-capture?transcript=updated";

  try {
    const operator = await requireTeamUser();
    const transcriptJobId = String(formData.get("transcriptJobId") || "");

    if (!transcriptJobId) {
      throw new Error("Choose a transcript job before running transcription.");
    }

    const result = await runCoachingCaptureTranscriptJob({
      prisma: prisma as any,
      transcriptJobId,
      requestedByUserId: operator.id,
    });

    if (!result.ok) {
      throw new Error(result.error || "Transcript job could not run.");
    }

    revalidatePath("/team/coaching-capture");
    target = `/team/coaching-capture?transcript=${encodeURIComponent(String(result.status || "completed"))}`;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to run transcript job.";
    target = `/team/coaching-capture?transcriptError=${encodeURIComponent(message)}`;
  }

  redirect(target);
}

export async function buildCoachingPacketAction(formData: FormData) {
  let target = "/team/coaching-capture?packet=built";

  try {
    const operator = await requireTeamUser();
    const transcriptJobId = String(formData.get("transcriptJobId") || "");
    const force = String(formData.get("force") || "") === "true";

    if (!transcriptJobId) {
      throw new Error("Choose a transcript job before building a coaching packet.");
    }

    const result = await buildCoachingPacketFromTranscriptJob({
      prisma: prisma as any,
      transcriptJobId,
      authorUserId: operator.id,
      force,
    });

    if (!result.ok) {
      throw new Error(result.error || "Coaching packet could not be built.");
    }

    revalidatePath("/team/coaching-capture");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to build coaching packet.";
    target = `/team/coaching-capture?packetError=${encodeURIComponent(message)}`;
  }

  redirect(target);
}
