"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { canManageClients } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { upsertPreprovisionedUser } from "@/lib/server/user-identity";

function parseAliasEmails(rawValue: string): string[] {
  return rawValue
    .split(/[\n,]/g)
    .map((value) => value.trim())
    .filter(Boolean);
}

function buildClientsRedirect(params: Record<string, string>) {
  const search = new URLSearchParams(params);
  return `/team/clients?${search.toString()}`;
}

async function requireTeamClientAccess() {
  const session = await auth();

  if (!session?.user) {
    redirect("/api/auth/signin?callbackUrl=%2Fteam%2Fclients");
  }

  const roles = Array.isArray(session.user.roles) ? session.user.roles : [];

  if (!canManageClients(roles)) {
    redirect("/");
  }

  return session;
}

export async function createClientAction(formData: FormData) {
  await requireTeamClientAccess();

  const primaryEmail = String(formData.get("primaryEmail") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const aliasEmails = parseAliasEmails(
    String(formData.get("aliasEmails") ?? ""),
  );
  const newsletterOptIn = formData.get("newsletterOptIn") === "on";
  const announcementsOptIn = formData.get("announcementsOptIn") === "on";

  if (!primaryEmail) {
    redirect(
      buildClientsRedirect({
        error: "Primary email is required.",
      }),
    );
  }

  try {
    const identity = await upsertPreprovisionedUser({
      primaryEmail,
      name: name || null,
      aliasEmails,
      roles: ["CLIENT"],
      newsletterOptIn,
      announcementsOptIn,
      createClientProfile: true,
    });

    revalidatePath("/team/clients");

    redirect(
      buildClientsRedirect({
        success: `Client ready: ${identity.primaryEmail}`,
      }),
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to save client.";

    redirect(
      buildClientsRedirect({
        error: message,
      }),
    );
  }
}

export async function promoteUserToClientAction(formData: FormData) {
  await requireTeamClientAccess();

  const userId = String(formData.get("userId") ?? "").trim();

  if (!userId) {
    redirect(
      buildClientsRedirect({
        error: "Missing user id.",
      }),
    );
  }

  try {
    const existingUser = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        roles: true,
        clientProfile: true,
      },
    });

    if (!existingUser) {
      redirect(
        buildClientsRedirect({
          error: "User not found.",
        }),
      );
    }

    const hasClientRole = existingUser.roles.some((role) => role.role === "CLIENT");

    await prisma.$transaction(async (tx) => {
      if (!hasClientRole) {
        await tx.userRole.create({
          data: {
            userId: existingUser.id,
            role: "CLIENT",
          },
        });
      }

      if (!existingUser.clientProfile) {
        await tx.clientProfile.create({
          data: {
            userId: existingUser.id,
            displayName: existingUser.name || existingUser.primaryEmail,
          },
        });
      }
    });

    revalidatePath("/team/clients");

    redirect(
      buildClientsRedirect({
        success: `Promoted ${existingUser.primaryEmail} to client.`,
      }),
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to promote user.";

    redirect(
      buildClientsRedirect({
        error: message,
      }),
    );
  }
}