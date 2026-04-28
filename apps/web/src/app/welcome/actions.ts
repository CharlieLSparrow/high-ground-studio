"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { buildSignInHref } from "@/lib/content-access";
import { prisma } from "@/lib/prisma";
import { sanitizeWelcomeRedirectPath } from "@/lib/server/welcome";

export async function completeWelcomeAction(formData: FormData) {
  const session = await auth();

  if (!session?.user) {
    redirect(buildSignInHref("/welcome"));
  }

  const newsletterOptIn = formData.get("newsletterOptIn") === "on";
  const announcementsOptIn = formData.get("announcementsOptIn") === "on";
  const nextPath = sanitizeWelcomeRedirectPath(
    String(formData.get("next") ?? ""),
  );

  await prisma.user.update({
    where: {
      id: session.user.id,
    },
    data: {
      newsletterOptIn,
      announcementsOptIn,
      welcomeCompletedAt: new Date(),
    },
  });

  revalidatePath("/");
  revalidatePath("/library");
  revalidatePath("/coaching");
  revalidatePath("/dashboard");
  revalidatePath("/team/clients");
  revalidatePath("/team/appointments");
  revalidatePath("/welcome");

  redirect(nextPath);
}
