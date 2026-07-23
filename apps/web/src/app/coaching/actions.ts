"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { notifyTeamOfNewCoachingRequest } from "@/lib/server/coaching-notifications";

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

function buildDashboardRedirect(params: Record<string, string>) {
  const search = new URLSearchParams(params);
  return `/dashboard?${search.toString()}`;
}

function parsePreferredContactMethod(value: string) {
  return value === "EMAIL" || value === "PHONE_CALL" || value === "TEXT"
    ? value
    : null;
}

function parseSessionIntent(value: string) {
  return ["COACHING", "PODCAST_CAPTURE", "RESEARCH_INTERVIEW"].includes(value)
    ? value
    : "COACHING";
}

function parseRecordingInterest(value: string) {
  return ["YES", "NO", "NOT_SURE"].includes(value) ? value : "NOT_SURE";
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
  const source = String(formData.get("source") ?? "").trim();

  if (trap) {
    redirect(source === "dashboard" ? "/dashboard?coaching=requested" : "/coaching/requested");
  }

  const session = (await auth()) as CoachingRequestSession;
  const userId = session?.user?.id;

  if (!userId) {
    redirect("/api/auth/signin?callbackUrl=%2Fdashboard%3Fintent%3Dcoaching");
  }

  const email = getSessionEmail(session);
  const displayName = session?.user?.name?.trim() || email || "Coaching Friend";

  const phone = String(formData.get("phone") ?? "").trim();
  const preferredContactMethod = parsePreferredContactMethod(
    String(formData.get("preferredContactMethod") ?? "").trim(),
  );
  const availabilityNotes = String(formData.get("availabilityNotes") ?? "").trim();
  const sessionIntent = parseSessionIntent(String(formData.get("sessionIntent") ?? "").trim());
  const recordingInterest = parseRecordingInterest(String(formData.get("recordingInterest") ?? "").trim());
  const note = String(formData.get("note") ?? "").trim();

  if (!email) {
    redirect(
      (source === "dashboard" ? buildDashboardRedirect : buildCoachingRedirect)({
        error:
          "We could not find an email address on your signed-in account. Please sign in with an account that has an email address.",
        ...(source === "dashboard" ? { intent: "coaching" } : {}),
      }),
    );
  }

  if (!preferredContactMethod) {
    redirect(
      (source === "dashboard" ? buildDashboardRedirect : buildCoachingRedirect)({
        error: "Please choose how you would prefer us to contact you.",
        ...(source === "dashboard" ? { intent: "coaching" } : {}),
      }),
    );
  }

  if (phone.length > 80) {
    redirect(
      (source === "dashboard" ? buildDashboardRedirect : buildCoachingRedirect)({
        error:
          "That phone number looks longer than expected. Please shorten it and try again.",
        ...(source === "dashboard" ? { intent: "coaching" } : {}),
      }),
    );
  }

  if (note.length > 1600) {
    redirect(
      (source === "dashboard" ? buildDashboardRedirect : buildCoachingRedirect)({
        error:
          "That note is a little long for the request form. Please trim it down and try again.",
        ...(source === "dashboard" ? { intent: "coaching" } : {}),
      }),
    );
  }

  if (availabilityNotes.length > 1000) {
    redirect(
      (source === "dashboard" ? buildDashboardRedirect : buildCoachingRedirect)({
        error:
          "Those availability notes are a little long for the request form. Please trim them down and try again.",
        ...(source === "dashboard" ? { intent: "coaching" } : {}),
      }),
    );
  }

  let createdRequestDetails: {
    id: string;
    coachingGoals: string;
    createdAt: Date;
  } | null = null;

  try {
    const result = await prisma.$transaction(async (tx) => {
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

      const requestData = {
          clientUserId: userId,
          preferredContactMethod,
          email,
          phone: phone || null,
          availabilityNotes: availabilityNotes || null,
          coachingGoals:
            note ||
            "Requested a coaching conversation from the simplified coaching call-to-action page.",
          contactConsent: true,
          metadataJson: {
            source: source || "coaching-page",
            sessionIntent,
            recordingInterest,
            captureEligible: recordingInterest !== "NO",
            nextSystemStep: "team-review-to-booking-hold-call-room",
            appOwnedTruth: [
              "coaching-request",
              "booking",
              "call-room",
              "recording-consent",
              "recording-asset",
              "transcript-job",
              "coaching-packet",
            ],
          },
        } as any;

      return tx.coachingRequest.create({
        data: requestData,
        select: {
          id: true,
          coachingGoals: true,
          createdAt: true,
        },
      });
    });

    createdRequestDetails = result;
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "We could not save your request right now. Please try again.";

    redirect(
      (source === "dashboard" ? buildDashboardRedirect : buildCoachingRedirect)({
        error: message,
        ...(source === "dashboard" ? { intent: "coaching" } : {}),
      }),
    );
  }

  if (createdRequestDetails) {
    const notificationResult = await notifyTeamOfNewCoachingRequest({
      requestId: createdRequestDetails.id,
      clientDisplayName: displayName,
      clientEmail: email,
      preferredContactMethod,
      phone: phone || null,
      note:
        note ||
        (createdRequestDetails.coachingGoals ===
        "Requested a coaching conversation from the simplified coaching call-to-action page."
          ? null
          : createdRequestDetails.coachingGoals),
      createdAt: createdRequestDetails.createdAt,
    });

    if (!notificationResult.ok) {
      console.error("Failed to send coaching request email notification:", {
        requestId: createdRequestDetails.id,
        error: notificationResult.error,
      });
    }
  }

  revalidatePath("/team/coaching-requests");
  revalidatePath("/team/clients");
  revalidatePath("/dashboard");

  redirect(source === "dashboard" ? "/dashboard?coaching=requested" : "/coaching/requested");
}
