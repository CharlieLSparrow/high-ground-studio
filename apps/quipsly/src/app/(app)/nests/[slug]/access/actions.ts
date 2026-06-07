"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import {
  grantStudioProjectAccessByEmail,
  normalizeAccessEmail,
  revokeStudioProjectAccessByEmail,
} from "@/lib/server/studio-project-access";

function normalizeRole(value: string) {
  const role = value.trim().toUpperCase();
  if (role === "OWNER" || role === "EDITOR") return role;
  return "VIEWER";
}

function redirectToAccess(projectSlug: string, params: URLSearchParams) {
  redirect(`/nests/${encodeURIComponent(projectSlug)}/access?${params.toString()}`);
}

export async function grantNestAccessAction(formData: FormData) {
  const projectSlug = String(formData.get("projectSlug") || "").trim();
  const targetEmail = normalizeAccessEmail(String(formData.get("targetEmail") || ""));
  const role = normalizeRole(String(formData.get("role") || "VIEWER"));
  const session = await auth();
  const actorEmail = session?.user?.primaryEmail || session?.user?.email;
  const params = new URLSearchParams();

  if (!projectSlug) {
    redirect("/projects?collaborationError=missing-project");
  }

  try {
    await grantStudioProjectAccessByEmail({
      projectSlug,
      targetEmail,
      role,
      actorEmail,
      note: "Invited from Nest access panel",
    });

    params.set("granted", targetEmail);
    revalidatePath("/projects");
    revalidatePath(`/nests/${projectSlug}/access`);
  } catch (error) {
    params.set("accessError", error instanceof Error ? error.message : "Could not grant Nest access.");
  }

  redirectToAccess(projectSlug, params);
}

export async function revokeNestAccessAction(formData: FormData) {
  const projectSlug = String(formData.get("projectSlug") || "").trim();
  const targetEmail = normalizeAccessEmail(String(formData.get("targetEmail") || ""));
  const session = await auth();
  const actorEmail = session?.user?.primaryEmail || session?.user?.email;
  const params = new URLSearchParams();

  if (!projectSlug) {
    redirect("/projects?collaborationError=missing-project");
  }

  try {
    await revokeStudioProjectAccessByEmail({
      projectSlug,
      targetEmail,
      actorEmail,
    });

    params.set("revoked", targetEmail);
    revalidatePath("/projects");
    revalidatePath(`/nests/${projectSlug}/access`);
  } catch (error) {
    params.set("accessError", error instanceof Error ? error.message : "Could not revoke Nest access.");
  }

  redirectToAccess(projectSlug, params);
}
