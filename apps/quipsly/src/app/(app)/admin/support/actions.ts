"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getPrismaClient } from "@/lib/prisma";
import {
  revokeSupportUserSessions,
  setSupportUserActiveState,
} from "@/lib/server/support-user-lifecycle";
import {
  parseAppRole,
  requireQuipslyAdminActor,
  requireQuipslySupportActor,
} from "@/lib/server/user-management";

function supportRedirect(userId: string, result: string): never {
  const params = new URLSearchParams({ user: userId, result });
  redirect(`/admin/support?${params.toString()}`);
}

function exactUserId(formData: FormData) {
  const value = String(formData.get("userId") || "").trim();
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(value)) throw new Error("A valid Quipsly user is required.");
  return value;
}

export async function setSupportUserActiveAction(formData: FormData) {
  const actor = await requireQuipslySupportActor();
  const userId = exactUserId(formData);
  const makeActive = String(formData.get("active")) === "true";
  if (actor.userId === userId && !makeActive) {
    supportRedirect(userId, "self-suspend-blocked");
  }

  const result = await setSupportUserActiveState({
    userId,
    active: makeActive,
    actor: { userId: actor.userId, email: actor.email },
  });
  if (result.status === "not-found") supportRedirect(userId, "not-found");
  if (result.status === "unchanged") supportRedirect(userId, makeActive ? "already-active" : "already-suspended");

  revalidatePath("/admin/support");
  supportRedirect(userId, makeActive ? "resumed" : "suspended");
}

export async function revokeSupportUserSessionsAction(formData: FormData) {
  const actor = await requireQuipslySupportActor();
  const userId = exactUserId(formData);
  const result = await revokeSupportUserSessions({
    userId,
    actor: { userId: actor.userId, email: actor.email },
  });
  if (result.status === "not-found") supportRedirect(userId, "not-found");
  if (result.status === "not-linked") supportRedirect(userId, "no-firebase-identity");

  revalidatePath("/admin/support");
  supportRedirect(userId, "sessions-revoked");
}

export async function setSupportUserRoleAction(formData: FormData) {
  const actor = await requireQuipslyAdminActor();
  const userId = exactUserId(formData);
  const role = parseAppRole(String(formData.get("role") || ""));
  const enabled = String(formData.get("enabled")) === "true";
  if (!role) supportRedirect(userId, "invalid-role");
  if (!enabled && role === "OWNER" && actor.userId === userId) {
    supportRedirect(userId, "self-owner-removal-blocked");
  }

  const prisma = getPrismaClient();
  await prisma.$transaction(async (tx) => {
    const target = await tx.user.findUnique({
      where: { id: userId },
      select: { id: true, organizationMemberships: { orderBy: { createdAt: "asc" }, take: 1, select: { organizationId: true } } },
    });
    if (!target) supportRedirect(userId, "not-found");

    if (!enabled && role === "OWNER") {
      const ownerCount = await tx.userRole.count({ where: { role: "OWNER" } });
      if (ownerCount <= 1) supportRedirect(userId, "last-owner-removal-blocked");
    }

    if (enabled) {
      await tx.userRole.createMany({ data: [{ userId, role }], skipDuplicates: true });
    } else {
      await tx.userRole.deleteMany({ where: { userId, role } });
    }

    await tx.userEvent.create({
      data: {
        userId,
        organizationId: target.organizationMemberships[0]?.organizationId ?? null,
        eventName: enabled ? "Support: role added" : "Support: role removed",
        payloadJson: {
          schema: "quipsly-support-role-action-v1",
          actorUserId: actor.userId,
          actorEmail: actor.email,
          source: "admin-support",
          role,
        },
      },
    });
  });

  revalidatePath("/admin/support");
  revalidatePath("/admin/users");
  supportRedirect(userId, enabled ? "role-added" : "role-removed");
}
