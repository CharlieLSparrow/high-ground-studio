"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

type CoachingRequestSession = {
  user?: {
    id?: string | null;
    name?: string | null;
    primaryEmail?: string | null;
    email?: string | null;
  } | null;
} | null;

function buildCoachingRedirect(params: Record<string, string>) {
  const search = new URLSearchParams(params);
  return `/coaching?${search.toString()}`;
}

function parsePreferredContactMethod(value: string) {
  return value === "EMAIL" || value === "PHONE_CALL" || value === "TEXT"
    ? value
    : null;
}

function getSessionEmail(session: CoachingRequestSession) {
  return (
    session?.user?.primaryEmail?.trim().toLowerCase() ||
    session?.user?.email?.trim().toLowerCase() ||
    ""
  );
}

export async function submitCoachingRequestAction(formData: FormData) {
  const trap = String(formData.get("company") ?? "").trim();

  if (trap) {
    redirect("/coaching/requested");
  }

  const session = (await auth()) as CoachingRequestSession;
  const userId = session?.user?.id;

  if (!userId) {
    redirect("/api/auth/signin?callbackUrl=%2Fcoaching");
  }

  const email = getSessionEmail(session);
  const displayName =
    session?.user?.name?.trim() ||
    email ||
    "Coaching Friend";

  const phone = String(formData.get("phone") ?? "").trim();
  const preferredContactMethod = parsePreferredContactMethod(
    String(formData.get("preferredContactMethod") ?? "").trim(),
  );
  const note = String(formData.get("note") ?? "").trim();

  if (!email) {
    redirect(
      buildCoachingRedirect({
        error:
          "We could not find an email address on your signed-in account. Please sign in with an account that has an email address.",
      }),
    );
  }

  if (!preferredContactMethod) {
    redirect(
      buildCoachingRedirect({
        error: "Please choose how you would prefer us to contact you.",
      }),
    );
  }

  if (phone.length > 80) {
    redirect(
      buildCoachingRedirect({
        error: "That phone number looks longer than expected. Please shorten it and try again.",
      }),
    );
  }

  if (note.length > 1600) {
    redirect(
      buildCoachingRedirect({
        error: "That note is a little long for the request form. Please trim it down and try again.",
      }),
    );
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.userRole.createMany({
        data: [
          {
            userId,
            role: "CLIENT",
          },
        ],
        skipDuplicates: true,
      });

      await tx.clientProfile.upsert({
        where: {
          userId,
        },
        create: {
          userId,
          displayName,
        },
        update: {
          displayName,
        },
      });

      await tx.coachingRequest.create({
        data: {
          clientUserId: userId,
          preferredContactMethod,
          email,
          phone: phone || null,
          availabilityNotes: null,
          coachingGoals:
            note ||
            "Requested a coaching conversation from the simplified coaching call-to-action page.",
          contactConsent: true,
        },
      });
    });

    revalidatePath("/team/coaching-requests");
    revalidatePath("/team/clients");
    revalidatePath("/dashboard");

    redirect("/coaching/requested");
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "We could not save your request right now. Please try again.";

    redirect(buildCoachingRedirect({ error: message }));
  }
}
