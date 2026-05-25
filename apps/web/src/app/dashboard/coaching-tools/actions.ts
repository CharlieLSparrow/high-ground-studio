"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { parseWeeklyCommitmentFormValues } from "@/lib/coaching/weekly-commitments";
import { prisma } from "@/lib/prisma";
import {
  buildWeeklyCommitmentWriteData,
  requireWeeklyCommitmentsGrant,
} from "@/lib/server/coaching-tools";

function buildDashboardRedirect(params: Record<string, string>) {
  const search = new URLSearchParams(params);
  return `/dashboard?${search.toString()}`;
}

export async function saveWeeklyCommitmentAction(formData: FormData) {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/api/auth/signin?callbackUrl=%2Fdashboard");
  }

  let redirectParams: Record<string, string>;

  try {
    await requireWeeklyCommitmentsGrant(session.user.id);

    const entryId = String(formData.get("entryId") ?? "").trim();
    const values = parseWeeklyCommitmentFormValues(formData);
    const writeData = buildWeeklyCommitmentWriteData(values);

    if (entryId) {
      const result = await prisma.weeklyCommitment.updateMany({
        where: {
          id: entryId,
          clientUserId: session.user.id,
        },
        data: writeData,
      });

      if (result.count === 0) {
        throw new Error("Weekly commitment entry not found.");
      }
    } else {
      await prisma.weeklyCommitment.upsert({
        where: {
          clientUserId_weekStartsAt: {
            clientUserId: session.user.id,
            weekStartsAt: values.weekStartsAt,
          },
        },
        create: {
          clientUserId: session.user.id,
          weekStartsAt: values.weekStartsAt,
          commitmentOne: values.commitmentOne,
          commitmentTwo: values.commitmentTwo,
          commitmentThree: values.commitmentThree,
          supportNeeded: values.supportNeeded,
          progressNotes: values.progressNotes,
        },
        update: writeData,
      });
    }

    revalidatePath("/dashboard");
    revalidatePath("/team/coaching-tools");

    redirectParams = {
      tool: "weekly_commitments",
      success: "Weekly commitments saved.",
    };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to save weekly commitments.";

    redirectParams = {
      tool: "weekly_commitments",
      error: message,
    };
  }

  redirect(buildDashboardRedirect(redirectParams));
}
