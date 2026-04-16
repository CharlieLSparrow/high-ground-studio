"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { canManageAppointments } from "@/lib/authz";
import { prisma } from "@/lib/prisma";

function buildRedirect(params: Record<string, string>) {
  const search = new URLSearchParams(params);
  return `/team/appointments?${search.toString()}`;
}

export async function createAppointmentAction(formData: FormData) {
  const session = await auth();

  if (!session?.user) {
    redirect("/api/auth/signin?callbackUrl=%2Fteam%2Fappointments");
  }

  const roles = Array.isArray(session.user.roles) ? session.user.roles : [];

  if (!canManageAppointments(roles)) {
    redirect("/");
  }

  const clientUserId = String(formData.get("clientUserId") ?? "").trim();
  const coachUserIdRaw = String(formData.get("coachUserId") ?? "").trim();
  const scheduledStartRaw = String(formData.get("scheduledStart") ?? "").trim();
  const scheduledEndRaw = String(formData.get("scheduledEnd") ?? "").trim();
  const timezone = String(formData.get("timezone") ?? "").trim() || "America/Denver";
  const locationType = String(formData.get("locationType") ?? "").trim() || "VIDEO";
  const locationDetails = String(formData.get("locationDetails") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();

  if (!clientUserId) {
    redirect(buildRedirect({ error: "Please choose a client." }));
  }

  if (!scheduledStartRaw || !scheduledEndRaw) {
    redirect(buildRedirect({ error: "Please provide both start and end times." }));
  }

  const scheduledStart = new Date(scheduledStartRaw);
  const scheduledEnd = new Date(scheduledEndRaw);

  if (Number.isNaN(scheduledStart.getTime()) || Number.isNaN(scheduledEnd.getTime())) {
    redirect(buildRedirect({ error: "The appointment dates are invalid." }));
  }

  if (scheduledEnd <= scheduledStart) {
    redirect(buildRedirect({ error: "The end time must be after the start time." }));
  }

  try {
    await prisma.appointment.create({
      data: {
        clientUserId,
        coachUserId: coachUserIdRaw || null,
        createdByUserId: session.user.id,
        updatedByUserId: session.user.id,
        scheduledStart,
        scheduledEnd,
        timezone,
        locationType:
          locationType === "VIDEO" ||
          locationType === "PHONE" ||
          locationType === "IN_PERSON" ||
          locationType === "OTHER"
            ? locationType
            : "VIDEO",
        locationDetails: locationDetails || null,
        notes: notes || null,
      },
    });

    revalidatePath("/team/appointments");

    redirect(buildRedirect({ success: "Appointment created." }));
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to create appointment.";

    redirect(buildRedirect({ error: message }));
  }
}