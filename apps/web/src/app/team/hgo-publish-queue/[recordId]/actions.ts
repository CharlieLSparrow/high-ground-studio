"use server";

import { revalidatePath } from "next/cache";

import { resolveTeamAccess } from "@/lib/content-access";
import { saveHgoEpisodePublishCandidateForOwner } from "@/lib/server/hgo-episode-publish-candidates";

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

export async function saveHgoEpisodePublishCandidateAction(formData: FormData) {
  const ownerEmail = await requireTeamOperator();
  const recordId = String(formData.get("recordId") ?? "").trim();

  if (!recordId) {
    throw new Error("recordId is required.");
  }

  const result = await saveHgoEpisodePublishCandidateForOwner({
    createdByEmail: ownerEmail,
    ownerEmail,
    recordId,
  });

  if (!result.ok) {
    throw new Error(result.errors.join(" "));
  }

  revalidatePath("/team/hgo-publish-queue");
  revalidatePath(`/team/hgo-publish-queue/${encodeURIComponent(recordId)}`);
}
