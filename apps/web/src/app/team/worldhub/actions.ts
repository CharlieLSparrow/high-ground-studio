"use server";

import { revalidatePath } from "next/cache";

import { resolveTeamAccess } from "@/lib/content-access";
import { upsertWorldHubProviderConnections } from "@/lib/server/worldhub-integrations";

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

export async function initializeWorldHubIntegrationsAction() {
  await requireTeamOperator();
  await upsertWorldHubProviderConnections();
  revalidatePath("/team/worldhub");
}
