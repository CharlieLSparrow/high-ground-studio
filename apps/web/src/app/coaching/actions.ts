"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { upsertPreprovisionedUser } from "@/lib/server/user-identity";
import { prisma } from "@/lib/prisma";

function buildCoachingRedirect(params: Record<string, string>) {
  const search = new URLSearchParams(params);
  return `/coaching?${search.toString()}`;
}

function parsePreferredContactMethod(value: string) {
  return value === "EMAIL" || value === "PHONE_CALL" || value === "TEXT"
    ? value
    : null;
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export async function submitCoachingRequestAction(formData: FormData) {
  const trap = String(formData.get("company") ?? "").trim();

  if (trap) {
    redirect("/coaching/requested");
  }

  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const phone = String(formData.get("phone") ?? "").trim();
  const preferredContactMethod = parsePreferredContactMethod(
    String(formData.get("preferredContactMethod") ?? "").trim(),
  );
  const availabilityNotes = String(formData.get("availabilityNotes") ?? "").trim();
  const coachingGoals = String(formData.get("coachingGoals") ?? "").trim();
  const contactConsent = formData.get("contactConsent") === "on";

  if (!name) {
    redirect(buildCoachingRedirect({ error: "Please share your name." }));
  }

  if (!isValidEmail(email)) {
    redirect(buildCoachingRedirect({ error: "Please provide a valid email address." }));
  }

  if (!preferredContactMethod) {
    redirect(
      buildCoachingRedirect({
        error: "Please choose how you would prefer us to contact you.",
      }),
    );
  }

  if ((preferredContactMethod === "PHONE_CALL" || preferredContactMethod === "TEXT") && !phone) {
    redirect(
      buildCoachingRedirect({
        error: "Please include a phone number for calls or texts.",
      }),
    );
  }

  if (coachingGoals.length < 12) {
    redirect(
      buildCoachingRedirect({
        error: "Please share a little more about what you would like help with.",
      }),
    );
  }

  if (!contactConsent) {
    redirect(
      buildCoachingRedirect({
        error: "Please confirm that we may contact you about this request.",
      }),
    );
  }

  try {
    const user = await upsertPreprovisionedUser({
      primaryEmail: email,
      name,
      roles: ["CLIENT"],
      createClientProfile: true,
    });

    await prisma.coachingRequest.create({
      data: {
        clientUserId: user.id,
        preferredContactMethod,
        email,
        phone: phone || null,
        availabilityNotes: availabilityNotes || null,
        coachingGoals,
        contactConsent,
      },
    });

    revalidatePath("/team/coaching-requests");
    revalidatePath("/team/clients");

    redirect("/coaching/requested");
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "We could not save your request right now. Please try again.";

    redirect(buildCoachingRedirect({ error: message }));
  }
}
