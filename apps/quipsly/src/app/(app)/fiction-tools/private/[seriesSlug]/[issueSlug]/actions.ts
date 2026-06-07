"use server";

import { auth } from "@/auth";
import {
  PRIVATE_FICTION_ISSUE_SLUG,
  PRIVATE_FICTION_PROJECT_SLUG,
  PRIVATE_FICTION_SERIES_SLUG,
} from "@/lib/fiction/private-fiction-access";
import { importPrivateFictionSeedToQuipsly } from "@/lib/fiction/import-private-fiction-seed";
import {
  grantStudioProjectAccessByEmail,
  normalizeAccessEmail,
} from "@/lib/server/studio-project-access";
import { redirect } from "next/navigation";

export async function importPrivateFictionSeedAction(formData: FormData) {
  const seriesSlug = String(formData.get("seriesSlug") || "");
  const issueSlug = String(formData.get("issueSlug") || "");
  const session = await auth();
  const actorEmail = session?.user?.primaryEmail || session?.user?.email;

  const result = await importPrivateFictionSeedToQuipsly({
    actorEmail,
    seriesSlug,
    issueSlug,
  });

  const params = new URLSearchParams({
    imported: "1",
    createdFrames: String(result.createdFrames),
    updatedFrames: String(result.updatedFrames),
    createdEntities: String(result.createdEntities),
    updatedEntities: String(result.updatedEntities),
    project: result.projectSlug,
    storyboard: result.storyboardId,
  });

  redirect(`/fiction-tools/private/${seriesSlug}/${issueSlug}?${params}`);
}

export async function grantPrivateFictionNestAccessAction(formData: FormData) {
  const session = await auth();
  const actorEmail = session?.user?.primaryEmail || session?.user?.email;
  const targetEmail = normalizeAccessEmail(String(formData.get("targetEmail") || ""));
  const role = String(formData.get("role") || "VIEWER").toUpperCase();

  await grantStudioProjectAccessByEmail({
    projectSlug: PRIVATE_FICTION_PROJECT_SLUG,
    targetEmail,
    role: role === "OWNER" || role === "EDITOR" ? role : "VIEWER",
    actorEmail,
    note: "Private fiction Nest invite",
  });

  const params = new URLSearchParams({
    accessGranted: targetEmail,
  });

  redirect(`/fiction-tools/private/${PRIVATE_FICTION_SERIES_SLUG}/${PRIVATE_FICTION_ISSUE_SLUG}?${params}`);
}
