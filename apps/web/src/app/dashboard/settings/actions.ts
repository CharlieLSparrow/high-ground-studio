"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { buildSignInHref } from "@/lib/content-access";
import { prisma } from "@/lib/prisma";

export async function updateMarketingPreferencesAction(formData: FormData) {
  const session = await auth();

  if (!session?.user) {
    redirect(buildSignInHref("/dashboard/settings"));
  }

  const newsletterOptIn = formData.get("newsletterOptIn") === "on";
  const announcementsOptIn = formData.get("announcementsOptIn") === "on";

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
}
