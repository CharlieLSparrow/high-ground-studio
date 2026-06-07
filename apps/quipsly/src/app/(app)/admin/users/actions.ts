"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getPrismaClient } from "@/lib/prisma";
import { grantNestAccess } from "@/lib/server/quipsly-core";
import { normalizeAccessEmail } from "@/lib/server/studio-project-access";
import {
  parseAppRole,
  parseProjectAccessRole,
  requireQuipslyAdminActor,
} from "@/lib/server/user-management";

function redirectBack(params: URLSearchParams) {
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

export async function upsertManagedUserAction(formData: FormData) {
  await requireQuipslyAdminActor();

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
    const existingUser = await prisma.user.findUnique({
      where: { primaryEmail: targetEmail },
      select: { id: true },
    });

    if (!existingUser) {
      await prisma.user.create({
        data: {
          primaryEmail: targetEmail,
          name: name || null,
          ...(role
            ? {
                roles: {
                  create: [{ role }],
                },
              }
            : {}),
        },
      });
      params.set("created", targetEmail);
    } else {
      await prisma.$transaction(async (tx) => {
        await tx.user.update({
          where: { id: existingUser.id },
          data: {
            name: name || undefined,
          },
        });

        if (role) {
          await tx.userRole.createMany({
            data: [{ userId: existingUser.id, role }],
            skipDuplicates: true,
          });
        }
      });

      params.set("updated", targetEmail);
    }
  } catch (error) {
    setError(params, error instanceof Error ? error.message : "Unable to save managed user.");
  }

  revalidatePath("/admin/users");
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
    await grantNestAccess({
      prisma,
      nestSlug: projectSlug,
      email: targetEmail,
      role,
      invitedByEmail: actor.email,
      note,
    });

    params.set("invited", `${targetEmail}::${projectSlug}`);
    params.set("role", role);
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
