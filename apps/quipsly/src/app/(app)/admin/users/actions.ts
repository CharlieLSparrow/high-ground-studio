"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { adminAuth } from "@/lib/firebase/firebase-admin";
import { getPrismaClient } from "@/lib/prisma";
import { grantNestAccess } from "@/lib/server/quipsly-core";
import { ensureManagedUserRecord } from "@/lib/server/managed-user-provisioning";
import { ensureQuipslyStarterStateForUser } from "@/lib/server/quipsly-onboarding";
import { normalizeAccessEmail } from "@/lib/server/studio-project-access";
import {
  parseAppRole,
  parseProjectAccessRole,
  requireQuipslyAdminActor,
} from "@/lib/server/user-management";
import { parseCoachCohortRows } from "@/lib/user-management-cohort";

function redirectBack(params: URLSearchParams): never {
  redirect(`/admin/users?${params.toString()}`);
}

function setError(params: URLSearchParams, message: string) {
  params.set("error", message.slice(0, 240));
}

function safeCallbackPath(value: FormDataEntryValue | null) {
  const raw = String(value || "").trim();
  if (!raw.startsWith("/") || raw.startsWith("//")) return "";
  if (raw.includes("\n") || raw.includes("\r")) return "";
  return raw.slice(0, 500);
}

async function upsertFirebasePasswordUser(input: {
  email: string;
  password: string;
  name?: string | null;
}) {
  const password = input.password.trim();
  if (password.length < 8) {
    throw new Error("Firebase login password must be at least 8 characters.");
  }

  try {
    const existing = await adminAuth.getUserByEmail(input.email);
    return {
      user: await adminAuth.updateUser(existing.uid, {
        password,
        displayName: input.name || existing.displayName || undefined,
        emailVerified: true,
        disabled: false,
      }),
      created: false,
    };
  } catch (error: any) {
    if (error?.code !== "auth/user-not-found") {
      throw error;
    }

    return {
      user: await adminAuth.createUser({
        email: input.email,
        password,
        displayName: input.name || undefined,
        emailVerified: true,
        disabled: false,
      }),
      created: true,
    };
  }
}

export async function upsertManagedUserAction(formData: FormData) {
  const actor = await requireQuipslyAdminActor();

  const targetEmail = normalizeAccessEmail(String(formData.get("primaryEmail") || ""));
  const name = String(formData.get("name") || "").trim();
  const role = parseAppRole(String(formData.get("role") || ""));
  const params = new URLSearchParams();

  if (!targetEmail) {
    setError(params, "primaryEmail is required.");
    redirectBack(params);
  }

  const prisma = getPrismaClient();

  try {
    const savedUser = await ensureManagedUserRecord({
      email: targetEmail,
      name,
      role,
      actor: { userId: actor.userId, email: actor.email, source: "admin-users" },
      prisma,
    });

    if (savedUser.created) {
      params.set("created", targetEmail);
    } else {
      params.set("updated", targetEmail);
    }
    params.set("starter", "ready");
    params.set("actor", actor.email);
  } catch (error) {
    setError(params, error instanceof Error ? error.message : "Unable to save managed user.");
  }

  revalidatePath("/admin/users");
  redirectBack(params);
}

export async function upsertCaptureReviewerAction(formData: FormData) {
  const actor = await requireQuipslyAdminActor();
  const targetEmail = normalizeAccessEmail(String(formData.get("primaryEmail") || ""));
  const name = String(formData.get("name") || "").trim();
  const role = parseAppRole(String(formData.get("role") || ""));
  const firebasePassword = String(formData.get("firebasePassword") || "");
  const params = new URLSearchParams();

  if (!targetEmail.endsWith("@dev.test")) {
    setError(params, "Reviewer password accounts are restricted to Quipsly's @dev.test acceptance namespace.");
    redirectBack(params);
  }

  const prisma = getPrismaClient();
  try {
    const firebaseLogin = await upsertFirebasePasswordUser({
      email: targetEmail,
      password: firebasePassword,
      name,
    });
    const savedUser = await ensureManagedUserRecord({
      email: targetEmail,
      name,
      role,
      firebaseUid: firebaseLogin.user.uid,
      actor: { userId: actor.userId, email: actor.email, source: "admin-reviewer" },
      prisma,
    });
    params.set(savedUser.created ? "created" : "updated", targetEmail);
    params.set("starter", "ready");
    params.set("firebaseLogin", firebaseLogin.created ? "created" : "updated");
    params.set("actor", actor.email);
  } catch (error) {
    setError(params, error instanceof Error ? error.message : "Unable to save capture reviewer.");
  }

  revalidatePath("/admin/users");
  redirectBack(params);
}

export async function provisionCoachCohortAction(formData: FormData) {
  const actor = await requireQuipslyAdminActor();
  const raw = String(formData.get("coaches") || "");
  const params = new URLSearchParams();
  const parsed = parseCoachCohortRows(raw);
  if (!parsed.ok) {
    setError(params, parsed.error);
    redirectBack(params);
  }
  const rows = parsed.rows;

  const prisma = getPrismaClient();
  let created = 0;
  let updated = 0;
  try {
    for (const row of rows) {
      const saved = await ensureManagedUserRecord({
        email: row.email,
        name: row.name,
        role: "COACH",
        actor: { userId: actor.userId, email: actor.email, source: "admin-coach-cohort" },
        prisma,
      });
      if (saved.created) created += 1;
      else updated += 1;
    }
    params.set("cohortReady", String(rows.length));
    params.set("cohortCreated", String(created));
    params.set("cohortUpdated", String(updated));
    params.set("actor", actor.email);
  } catch (error) {
    setError(params, error instanceof Error
      ? `Cohort stopped after ${created + updated} of ${rows.length}: ${error.message}`
      : `Cohort stopped after ${created + updated} of ${rows.length}.`);
  }

  revalidatePath("/admin/users");
  redirectBack(params);
}

export async function repairManagedUserStarterStateAction(formData: FormData) {
  const actor = await requireQuipslyAdminActor();
  const targetEmail = normalizeAccessEmail(String(formData.get("primaryEmail") || ""));
  const params = new URLSearchParams();

  if (!targetEmail) {
    setError(params, "primaryEmail is required.");
    redirectBack(params);
  }

  const prisma = getPrismaClient();

  try {
    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { primaryEmail: targetEmail },
          { aliases: { some: { email: targetEmail } } },
        ],
      },
      select: { id: true, primaryEmail: true },
    });

    if (!user) {
      throw new Error(`No app-owned user record exists for ${targetEmail}. Save the user first.`);
    }

    const starter = await ensureQuipslyStarterStateForUser({
      userId: user.id,
      email: user.primaryEmail,
      prisma,
    });

    params.set("repaired", user.primaryEmail);
    params.set("homeNest", starter.homeNest.slug);
    params.set("starter", "ready");
    params.set("actor", actor.email);
  } catch (error) {
    setError(params, error instanceof Error ? error.message : "Unable to repair starter state.");
  }

  revalidatePath("/admin/users");
  revalidatePath("/projects");
  redirectBack(params);
}

export async function grantProjectAccessFromAdminAction(formData: FormData) {
  const targetEmail = normalizeAccessEmail(String(formData.get("targetEmail") || ""));
  const projectSlug = normalizeAccessEmail(String(formData.get("projectSlug") || ""));
  const episodeSlug = normalizeAccessEmail(String(formData.get("episodeSlug") || ""));
  const role = parseProjectAccessRole(String(formData.get("role") || "VIEWER") || "VIEWER") || "VIEWER";
  const note = String(formData.get("note") || "").trim() || "Granted from admin panel";
  const handoffKind = String(formData.get("handoffKind") || "").trim();
  const requestedCallbackPath = safeCallbackPath(formData.get("callbackPath"));
  const callbackPath = requestedCallbackPath
    || (handoffKind === "episode-editor" && projectSlug && episodeSlug
      ? `/editor?project=${encodeURIComponent(projectSlug)}&episode=${encodeURIComponent(episodeSlug)}`
      : "");
  const params = new URLSearchParams();
  const actor = await requireQuipslyAdminActor();

  if (!targetEmail || !projectSlug) {
    setError(params, "targetEmail and projectSlug are required.");
    redirectBack(params);
  }

  const prisma = getPrismaClient();

  try {
    const access = await grantNestAccess({
      prisma,
      nestSlug: projectSlug,
      email: targetEmail,
      role,
      invitedByEmail: actor.email,
      note,
    });

    params.set("invited", `${targetEmail}::${projectSlug}`);
    params.set("role", role);
    if (access.inviteLoginToken) params.set("inviteToken", access.inviteLoginToken);
    if (callbackPath) params.set("callbackPath", callbackPath);
  } catch (error) {
    setError(params, error instanceof Error ? error.message : "Unable to grant project access.");
  }

  revalidatePath("/admin/users");
  revalidatePath("/projects");
  if (projectSlug) {
    revalidatePath(`/nests/${projectSlug}/access`);
  }

  redirectBack(params);
}

export async function revokeProjectAccessFromAdminAction(formData: FormData) {
  await requireQuipslyAdminActor();

  const targetEmail = normalizeAccessEmail(String(formData.get("targetEmail") || ""));
  const projectSlug = normalizeAccessEmail(String(formData.get("projectSlug") || ""));
  const params = new URLSearchParams();

  if (!targetEmail || !projectSlug) {
    setError(params, "targetEmail and projectSlug are required.");
    redirectBack(params);
  }

  const prisma = getPrismaClient();

  try {
    const project = await prisma.studioProject.findFirst({
      where: { slug: projectSlug },
      select: { id: true },
    });

    if (!project) {
      setError(params, `Could not find project \"${projectSlug}\".`);
      redirectBack(params);
    }

    await prisma.studioProjectAccessGrant.update({
      where: {
        projectId_email: {
          projectId: project!.id,
          email: targetEmail,
        },
      },
      data: {
        status: "REVOKED",
        note: "Revoked from admin panel",
      },
    });

    params.set("revoked", `${targetEmail}::${projectSlug}`);
  } catch (error) {
    setError(params, error instanceof Error ? error.message : "Unable to revoke project access.");
  }

  revalidatePath("/admin/users");
  revalidatePath("/projects");
  if (projectSlug) {
    revalidatePath(`/nests/${projectSlug}/access`);
  }

  redirectBack(params);
}
