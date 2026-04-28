"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { buildSignInHref } from "@/lib/content-access";
import { prisma } from "@/lib/prisma";

function buildSettingsRedirect(params: Record<string, string>) {
  const search = new URLSearchParams(params);
  return `/dashboard/settings?${search.toString()}`;
}

export async function updateMarketingPreferencesAction(formData: FormData) {
  const session = await auth();

  if (!session?.user) {
    redirect(buildSignInHref("/dashboard/settings"));
  }

  const newsletterOptIn = formData.get("newsletterOptIn") === "on";
  const announcementsOptIn = formData.get("announcementsOptIn") === "on";

  try {
    await prisma.user.update({
      where: {
        id: session.user.id,
      },
      data: {
        newsletterOptIn,
        announcementsOptIn,
      },
    });

    revalidatePath("/dashboard");
    revalidatePath("/dashboard/settings");

    redirect(
      buildSettingsRedirect({
        success: "Email preferences updated.",
      }),
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to update email preferences.";

    redirect(
      buildSettingsRedirect({
        error: message,
      }),
    );
  }
}
