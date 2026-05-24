"use server";

import { revalidatePath } from "next/cache";

import { resolveTeamAccess } from "@/lib/content-access";
import {
  archiveHgoStagedArtifactForOwner,
  markHgoStagedArtifactReviewForOwner,
} from "@/lib/server/hgo-staged-artifacts";

function getOwnerEmail(access: Awaited<ReturnType<typeof resolveTeamAccess>>) {
  return (
    access.session?.user?.primaryEmail?.trim().toLowerCase() ||
    access.email?.trim().toLowerCase() ||
    ""
  );
}

async function requireTeamOperator() {
  const access = await resolveTeamAccess();

  if (!access.isSignedIn || !access.isTeam) {
    throw new Error("Team access is required.");
  }

  const ownerEmail = getOwnerEmail(access);

  if (!ownerEmail) {
    throw new Error("Session is missing a usable email.");
  }

  return ownerEmail;
}

export async function markHgoStagedArtifactReviewAction(formData: FormData) {
  const ownerEmail = await requireTeamOperator();
  const recordId = String(formData.get("recordId") ?? "").trim();
  const reviewStatus = String(formData.get("reviewStatus") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim() || undefined;

  if (!recordId || !reviewStatus) {
    throw new Error("recordId and reviewStatus are required.");
  }

  const result =
    reviewStatus === "archived"
      ? await archiveHgoStagedArtifactForOwner({
          ownerEmail,
          recordId,
          operatorEmail: ownerEmail,
          note,
        })
      : await markHgoStagedArtifactReviewForOwner({
          ownerEmail,
          recordId,
          reviewStatus,
          operatorEmail: ownerEmail,
          note,
        });

  if (!result.ok) {
    throw new Error(result.errors.join(" "));
  }

  revalidatePath("/team/hgo-staged-artifacts");
}
