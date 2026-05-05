"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { canManageAppointments } from "@/lib/authz";
import { prisma } from "@/lib/prisma";

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
  return value === "NEW" ||
    value === "CONTACTED" ||
    value === "SCHEDULED" ||
    value === "CLOSED" ||
    value === "DECLINED"
    ? value
    : null;
}

export async function updateCoachingRequestAction(formData: FormData) {
  await requireTeamCoachingRequestAccess();

  const requestId = String(formData.get("requestId") ?? "").trim();
  const status = parseRequestStatus(String(formData.get("status") ?? "").trim());
  const assignedCoachUserId = String(formData.get("assignedCoachUserId") ?? "").trim();
  const internalNotes = String(formData.get("internalNotes") ?? "").trim();

  if (!requestId) {
    redirect(buildRedirect({ error: "Missing coaching request id." }));
  }

  if (!status) {
    redirect(buildRedirect({ error: "Please choose a valid request status." }));
  }

  try {
    await prisma.coachingRequest.update({
      where: {
        id: requestId,
      },
      data: {
        status,
        assignedCoachUserId: assignedCoachUserId || null,
        internalNotes: internalNotes || null,
      },
    });

    revalidatePath("/team/coaching-requests");

    redirect(buildRedirect({ success: "Coaching request updated." }));
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to update coaching request.";

    redirect(buildRedirect({ error: message }));
  }
}
