"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { canManageAppointments } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { syncAppointmentToGoogleCalendar } from "@/lib/server/google-calendar-sync";

function buildRedirect(params: Record<string, string>) {
  const search = new URLSearchParams(params);
  return `/team/coaching-requests?${search.toString()}`;
}

async function requireTeamCoachingRequestAccess() {
  const session = await auth();

  if (!session?.user) {
    redirect("/api/auth/signin?callbackUrl=%2Fteam%2Fcoaching-requests");
  }

  const roles = Array.isArray(session.user.roles) ? session.user.roles : [];

  if (!canManageAppointments(roles)) {
    redirect("/");
  }

  return session;
}

function parseRequestStatus(value: string) {
  return value === "CONTACTED" || value === "CLOSED" || value === "DECLINED"
    ? value
    : null;
}

function parseLocationType(value: string) {
  return value === "VIDEO" ||
    value === "PHONE" ||
    value === "IN_PERSON" ||
    value === "OTHER"
    ? value
    : "VIDEO";
}

function parseDateValue(value: string) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function isValidTimeZone(value: string) {
  try {
    Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

function appendInternalNotes(
  existingNotes: string | null,
  nextNote: string,
) {
  if (!nextNote) {
    return existingNotes;
  }

  return existingNotes?.trim()
    ? `${existingNotes.trim()}\n\n${nextNote}`
    : nextNote;
}

async function loadCoachUserIdOrThrow(coachUserId: string) {
  const coach = await prisma.user.findFirst({
    where: {
      id: coachUserId,
      roles: {
        some: {
          role: "COACH",
        },
      },
    },
    select: {
      id: true,
    },
  });

  if (!coach) {
    throw new Error("Please choose a valid coach.");
  }

  return coach.id;
}

export async function setCoachingRequestStatusAction(formData: FormData) {
  await requireTeamCoachingRequestAccess();

  const requestId = String(formData.get("requestId") ?? "").trim();
  const status = parseRequestStatus(String(formData.get("status") ?? "").trim());

  if (!requestId) {
    redirect(buildRedirect({ error: "Missing coaching request id." }));
  }

  if (!status) {
    redirect(buildRedirect({ error: "Please choose a valid request status." }));
  }

  try {
    const request = await prisma.coachingRequest.findUnique({
      where: {
        id: requestId,
      },
      select: {
        id: true,
        convertedAppointmentId: true,
      },
    });

    if (!request) {
      throw new Error("Coaching request not found.");
    }

    if (status === "DECLINED" && request.convertedAppointmentId) {
      throw new Error("Scheduled requests cannot be marked declined.");
    }

    await prisma.coachingRequest.update({
      where: {
        id: requestId,
      },
      data: {
        status,
      },
    });

    revalidatePath("/team/coaching-requests");
    revalidatePath("/dashboard");

    redirect(buildRedirect({ success: `Coaching request marked ${status.toLowerCase()}.` }));
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to update coaching request status.";

    redirect(buildRedirect({ error: message }));
  }
}

export async function updateCoachingRequestAction(formData: FormData) {
  await requireTeamCoachingRequestAccess();

  const requestId = String(formData.get("requestId") ?? "").trim();
  const hasAssignedCoachField = formData.has("assignedCoachUserId");
  const assignedCoachUserId = String(formData.get("assignedCoachUserId") ?? "").trim();
  const internalNotes = String(formData.get("internalNotes") ?? "").trim();

  if (!requestId) {
    redirect(buildRedirect({ error: "Missing coaching request id." }));
  }

  try {
    const request = await prisma.coachingRequest.findUnique({
      where: {
        id: requestId,
      },
      select: {
        id: true,
        assignedCoachUserId: true,
      },
    });

    if (!request) {
      throw new Error("Coaching request not found.");
    }

    const nextAssignedCoachUserId = hasAssignedCoachField
      ? assignedCoachUserId
        ? await loadCoachUserIdOrThrow(assignedCoachUserId)
        : null
      : request.assignedCoachUserId;

    await prisma.coachingRequest.update({
      where: {
        id: requestId,
      },
      data: {
        assignedCoachUserId: nextAssignedCoachUserId,
        internalNotes: internalNotes || null,
      },
    });

    revalidatePath("/team/coaching-requests");
    revalidatePath("/dashboard");

    redirect(buildRedirect({ success: "Coaching request updated." }));
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to update coaching request.";

    redirect(buildRedirect({ error: message }));
  }
}

export async function convertCoachingRequestToAppointmentAction(formData: FormData) {
  const session = await requireTeamCoachingRequestAccess();

  const coachingRequestId = String(formData.get("coachingRequestId") ?? "").trim();
  const scheduledStartRaw = String(formData.get("scheduledStart") ?? "").trim();
  const scheduledEndRaw = String(formData.get("scheduledEnd") ?? "").trim();
  const timezone = String(formData.get("timezone") ?? "").trim() || "America/Denver";
  const coachUserId = String(formData.get("coachUserId") ?? "").trim();
  const locationType = parseLocationType(
    String(formData.get("locationType") ?? "").trim(),
  );
  const locationDetails = String(formData.get("locationDetails") ?? "").trim();
  const internalNotes = String(formData.get("internalNotes") ?? "").trim();

  if (!coachingRequestId) {
    redirect(buildRedirect({ error: "Missing coaching request id." }));
  }

  if (!coachUserId) {
    redirect(buildRedirect({ error: "Please choose a coach." }));
  }

  if (!scheduledStartRaw || !scheduledEndRaw) {
    redirect(buildRedirect({ error: "Please provide both start and end times." }));
  }

  if (!isValidTimeZone(timezone)) {
    redirect(buildRedirect({ error: "Please provide a valid time zone." }));
  }

  const scheduledStart = parseDateValue(scheduledStartRaw);
  const scheduledEnd = parseDateValue(scheduledEndRaw);

  if (!scheduledStart || !scheduledEnd) {
    redirect(buildRedirect({ error: "The appointment dates are invalid." }));
  }

  if (scheduledEnd <= scheduledStart) {
    redirect(buildRedirect({ error: "The end time must be after the start time." }));
  }

  try {
    const nextCoachUserId = await loadCoachUserIdOrThrow(coachUserId);

    const newlyCreatedAppointmentId = await prisma.$transaction(async (tx) => {
      const request = await tx.coachingRequest.findUnique({
        where: {
          id: coachingRequestId,
        },
        select: {
          id: true,
          clientUserId: true,
          status: true,
          convertedAppointmentId: true,
          internalNotes: true,
        },
      });

      if (!request) {
        throw new Error("Coaching request not found.");
      }

      if (request.convertedAppointmentId) {
        throw new Error("This coaching request is already linked to an appointment.");
      }

      if (request.status === "CLOSED" || request.status === "DECLINED") {
        throw new Error("Closed or declined requests cannot be scheduled.");
      }

      const appointment = await tx.appointment.create({
        data: {
          clientUserId: request.clientUserId,
          coachUserId: nextCoachUserId,
          createdByUserId: session.user.id,
          updatedByUserId: session.user.id,
          scheduledStart,
          scheduledEnd,
          timezone,
          locationType,
          locationDetails: locationDetails || null,
          notes: internalNotes || null,
        },
        select: {
          id: true,
        },
      });

      await tx.coachingRequest.update({
        where: {
          id: request.id,
        },
        data: {
          status: "SCHEDULED",
          assignedCoachUserId: nextCoachUserId,
          convertedAppointmentId: appointment.id,
          internalNotes: appendInternalNotes(request.internalNotes, internalNotes),
        },
      });
      
      return appointment.id;
    });

    try {
      await syncAppointmentToGoogleCalendar({
        appointmentId: newlyCreatedAppointmentId,
        requestedByEmail: session.user.primaryEmail,
      });
    } catch (e) {
      // Ignore background sync errors, the job is queued and can be retried manually or by cron
    }

    revalidatePath("/team/coaching-requests");
    revalidatePath("/team/appointments");
    revalidatePath("/dashboard");

    redirect(buildRedirect({ success: "Appointment scheduled from coaching request." }));
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to schedule appointment from coaching request.";

    redirect(buildRedirect({ error: message }));
  }
}
