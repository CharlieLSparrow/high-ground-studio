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

async function requireTeamAppointmentAccess() {
  const session = await auth();

  if (!session?.user) {
    redirect("/api/auth/signin?callbackUrl=%2Fteam%2Fappointments");
  }

  const roles = Array.isArray(session.user.roles) ? session.user.roles : [];

  if (!canManageAppointments(roles)) {
    redirect("/");
  }

  return session;
}

function parseLocationType(value: string) {
  return value === "VIDEO" ||
    value === "PHONE" ||
    value === "IN_PERSON" ||
    value === "OTHER"
    ? value
    : "VIDEO";
}

export async function createAppointmentAction(formData: FormData) {
  const session = await requireTeamAppointmentAccess();

  const clientUserId = String(formData.get("clientUserId") ?? "").trim();
  const coachUserIdRaw = String(formData.get("coachUserId") ?? "").trim();
  const scheduledStartRaw = String(formData.get("scheduledStart") ?? "").trim();
  const scheduledEndRaw = String(formData.get("scheduledEnd") ?? "").trim();
  const timezone = String(formData.get("timezone") ?? "").trim() || "America/Denver";
  const locationType = parseLocationType(
    String(formData.get("locationType") ?? "").trim(),
  );
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
        locationType,
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

export async function updateAppointmentAction(formData: FormData) {
  const session = await requireTeamAppointmentAccess();

  const appointmentId = String(formData.get("appointmentId") ?? "").trim();
  const coachUserIdRaw = String(formData.get("coachUserId") ?? "").trim();
  const scheduledStartRaw = String(formData.get("scheduledStart") ?? "").trim();
  const scheduledEndRaw = String(formData.get("scheduledEnd") ?? "").trim();
  const timezone = String(formData.get("timezone") ?? "").trim() || "America/Denver";
  const locationType = parseLocationType(
    String(formData.get("locationType") ?? "").trim(),
  );
  const locationDetails = String(formData.get("locationDetails") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();

  if (!appointmentId) {
    redirect(buildRedirect({ error: "Missing appointment id." }));
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
    await prisma.appointment.update({
      where: {
        id: appointmentId,
      },
      data: {
        coachUserId: coachUserIdRaw || null,
        updatedByUserId: session.user.id,
        scheduledStart,
        scheduledEnd,
        timezone,
        locationType,
        locationDetails: locationDetails || null,
        notes: notes || null,
      },
    });

    revalidatePath("/team/appointments");

    redirect(buildRedirect({ success: "Appointment updated." }));
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to update appointment.";

    redirect(buildRedirect({ error: message }));
  }
}

export async function cancelAppointmentAction(formData: FormData) {
  const session = await requireTeamAppointmentAccess();

  const appointmentId = String(formData.get("appointmentId") ?? "").trim();

  if (!appointmentId) {
    redirect(buildRedirect({ error: "Missing appointment id." }));
  }

  try {
    await prisma.appointment.update({
      where: {
        id: appointmentId,
      },
      data: {
        status: "CANCELED",
        updatedByUserId: session.user.id,
      },
    });

    revalidatePath("/team/appointments");

    redirect(buildRedirect({ success: "Appointment canceled." }));
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to cancel appointment.";

    redirect(buildRedirect({ error: message }));
  }
}

export async function completeAppointmentAction(formData: FormData) {
  const session = await requireTeamAppointmentAccess();

  const appointmentId = String(formData.get("appointmentId") ?? "").trim();

  if (!appointmentId) {
    redirect(buildRedirect({ error: "Missing appointment id." }));
  }

  try {
    await prisma.appointment.update({
      where: {
        id: appointmentId,
      },
      data: {
        status: "COMPLETED",
        updatedByUserId: session.user.id,
      },
    });

    revalidatePath("/team/appointments");

    redirect(buildRedirect({ success: "Appointment marked completed." }));
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to complete appointment.";

    redirect(buildRedirect({ error: message }));
  }
}