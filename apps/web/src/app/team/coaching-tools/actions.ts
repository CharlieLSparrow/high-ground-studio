"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { canManageClients } from "@/lib/authz";
import { prisma } from "@/lib/prisma";

function buildCoachingToolsRedirect(params: Record<string, string>) {
  const search = new URLSearchParams(params);
  return `/team/coaching-tools?${search.toString()}`;
}

async function requireTeamCoachingToolAccess() {
  const session = await auth();

  if (!session?.user) {
    redirect("/api/auth/signin?callbackUrl=%2Fteam%2Fcoaching-tools");
  }

  const roles = Array.isArray(session.user.roles) ? session.user.roles : [];

  if (!canManageClients(roles)) {
    redirect("/");
  }

  return session;
}

export async function reviewWeeklyCommitmentAction(formData: FormData) {
  const session = await requireTeamCoachingToolAccess();

  const entryId = String(formData.get("entryId") ?? "").trim();
  const status = String(formData.get("status") ?? "REVIEWED").trim();
  const coachNotes = String(formData.get("coachNotes") ?? "").trim();

  if (!entryId) {
    redirect(
      buildCoachingToolsRedirect({
        error: "Missing weekly commitment entry.",
      }),
    );
  }

  if (status !== "ACTIVE" && status !== "REVIEWED" && status !== "ARCHIVED") {
    redirect(
      buildCoachingToolsRedirect({
        error: "Invalid weekly commitment status.",
      }),
    );
  }

  let redirectParams: Record<string, string>;

  try {
    await prisma.weeklyCommitment.update({
      where: {
        id: entryId,
      },
      data: {
        status,
        coachNotes: coachNotes || null,
        reviewedByUserId: status === "REVIEWED" ? session.user.id : null,
        reviewedAt: status === "REVIEWED" ? new Date() : null,
      },
    });

    revalidatePath("/team/coaching-tools");
    revalidatePath("/dashboard");

    redirectParams = {
      success: "Weekly commitment review saved.",
    };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to review weekly commitment.";

    redirectParams = {
      error: message,
    };
  }

  redirect(buildCoachingToolsRedirect(redirectParams));
}
