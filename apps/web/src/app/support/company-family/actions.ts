"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { notifyTeamOfCompanySupportRequest } from "@/lib/server/company-support-notifications";

type CompanySupportSession = {
  user?: {
    id?: string | null;
  } | null;
} | null;

function buildRedirect(params: Record<string, string>) {
  const search = new URLSearchParams(params);
  return `/support/company-family?${search.toString()}`;
}

function buildRedirectWithAnchor(params: Record<string, string>) {
  return `${buildRedirect(params)}#request-help`;
}

function parsePreferredContactMethod(value: string) {
  return value === "EMAIL" || value === "PHONE_CALL" || value === "TEXT"
    ? value
    : null;
}

function parseSupportType(value: string) {
  return value === "NEED_LODGING" ||
    value === "OFFER_LODGING_HELP" ||
    value === "OTHER_SUPPORT"
    ? value
    : null;
}

export async function submitCompanySupportRequestAction(formData: FormData) {
  const trap = String(formData.get("company") ?? "").trim();

  if (trap) {
    redirect("/support/company-family?support=requested");
  }

  const session = (await auth()) as CompanySupportSession;

  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const phone = String(formData.get("phone") ?? "").trim();
  const preferredContactMethod = parsePreferredContactMethod(
    String(formData.get("preferredContactMethod") ?? "").trim(),
  );
  const supportType = parseSupportType(
    String(formData.get("supportType") ?? "").trim(),
  );
  const note = String(formData.get("note") ?? "").trim();

  if (!name) {
    redirect(buildRedirectWithAnchor({ error: "Please share your name." }));
  }

  if (name.length > 160) {
    redirect(
      buildRedirectWithAnchor({
        error: "Please shorten the name field and try again.",
      }),
    );
  }

  if (!email || !email.includes("@")) {
    redirect(
      buildRedirectWithAnchor({
        error: "Please enter a valid email address.",
      }),
    );
  }

  if (email.length > 240) {
    redirect(
      buildRedirectWithAnchor({
        error: "That email address looks longer than expected.",
      }),
    );
  }

  if (phone.length > 80) {
    redirect(
      buildRedirectWithAnchor({
        error: "That phone number looks longer than expected.",
      }),
    );
  }

  if (!preferredContactMethod) {
    redirect(
      buildRedirectWithAnchor({
        error: "Please choose how you would prefer to be contacted.",
      }),
    );
  }

  if (!supportType) {
    redirect(
      buildRedirectWithAnchor({
        error: "Please choose the kind of support note you are sending.",
      }),
    );
  }

  if (note.length > 1600) {
    redirect(
      buildRedirectWithAnchor({
        error: "Please shorten the note and try again.",
      }),
    );
  }

  let createdRequest:
    | {
        id: string;
        createdAt: Date;
      }
    | null = null;

  try {
    createdRequest = await prisma.companySupportRequest.create({
      data: {
        name,
        email,
        phone: phone || null,
        preferredContactMethod,
        supportType,
        note: note || null,
        userId: session?.user?.id || null,
      },
      select: {
        id: true,
        createdAt: true,
      },
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "We could not save your note right now. Please try again.";

    redirect(buildRedirectWithAnchor({ error: message }));
  }

  if (createdRequest) {
    const notificationResult = await notifyTeamOfCompanySupportRequest({
      requestId: createdRequest.id,
      name,
      email,
      phone: phone || null,
      preferredContactMethod,
      supportType,
      note: note || null,
      createdAt: createdRequest.createdAt,
    });

    if (!notificationResult.ok) {
      console.error("Failed to send company support request email notification:", {
        requestId: createdRequest.id,
        error: notificationResult.error,
      });
    }
  }

  revalidatePath("/support/company-family");

  redirect("/support/company-family?support=requested");
}
