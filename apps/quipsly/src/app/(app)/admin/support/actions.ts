"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { adminAuth } from "@/lib/firebase/firebase-admin";
import { getPrismaClient } from "@/lib/prisma";
import { requireQuipslyAdminActor } from "@/lib/server/user-management";

function supportRedirect(userId: string, result: string): never {
  const params = new URLSearchParams({ user: userId, result });
  redirect(`/admin/support?${params.toString()}`);
}

function exactUserId(formData: FormData) {
  const value = String(formData.get("userId") || "").trim();
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(value)) throw new Error("A valid Quipsly user is required.");
  return value;
}

async function appendSupportEvent({
  userId,
  actorEmail,
  actorUserId,
  eventName,
}: {
  userId: string;
  actorEmail: string;
  actorUserId: string | null;
  eventName: string;
}) {
  const prisma = getPrismaClient();
  const membership = await prisma.organizationMember.findFirst({
    where: { userId },
    orderBy: { createdAt: "asc" },
    select: { organizationId: true },
  });
  await prisma.userEvent.create({
    data: {
      userId,
      organizationId: membership?.organizationId ?? null,
      eventName,
      payloadJson: {
        schema: "quipsly-support-action-v1",
        actorUserId,
        actorEmail,
        source: "admin-support",
      },
    },
  });
}

export async function setSupportUserActiveAction(formData: FormData) {
  const actor = await requireQuipslyAdminActor();
  const userId = exactUserId(formData);
  const makeActive = String(formData.get("active")) === "true";
  if (actor.userId === userId && !makeActive) {
    supportRedirect(userId, "self-suspend-blocked");
  }

  const prisma = getPrismaClient();
  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { firebaseUid: true, isActive: true },
  });
  if (!target) supportRedirect(userId, "not-found");
  if (target.isActive === makeActive) supportRedirect(userId, makeActive ? "already-active" : "already-suspended");

  if (target.firebaseUid) {
    await adminAuth.updateUser(target.firebaseUid, { disabled: !makeActive });
    if (!makeActive) await adminAuth.revokeRefreshTokens(target.firebaseUid);
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: userId }, data: { isActive: makeActive } });
      const membership = await tx.organizationMember.findFirst({
        where: { userId },
        orderBy: { createdAt: "asc" },
        select: { organizationId: true },
      });
      await tx.userEvent.create({
        data: {
          userId,
          organizationId: membership?.organizationId ?? null,
          eventName: makeActive ? "Support: account resumed" : "Support: account suspended",
          payloadJson: {
            schema: "quipsly-support-action-v1",
            actorUserId: actor.userId,
            actorEmail: actor.email,
            source: "admin-support",
          },
        },
      });
    });
  } catch (error) {
    if (target.firebaseUid) {
      await adminAuth.updateUser(target.firebaseUid, { disabled: !target.isActive }).catch(() => undefined);
    }
    throw error;
  }

  revalidatePath("/admin/support");
  supportRedirect(userId, makeActive ? "resumed" : "suspended");
}

export async function revokeSupportUserSessionsAction(formData: FormData) {
  const actor = await requireQuipslyAdminActor();
  const userId = exactUserId(formData);
  const prisma = getPrismaClient();
  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { firebaseUid: true },
  });
  if (!target) supportRedirect(userId, "not-found");
  if (!target.firebaseUid) supportRedirect(userId, "no-firebase-identity");

  await adminAuth.revokeRefreshTokens(target.firebaseUid);
  await appendSupportEvent({
    userId,
    actorEmail: actor.email,
    actorUserId: actor.userId,
    eventName: "Support: login sessions revoked",
  });

  revalidatePath("/admin/support");
  supportRedirect(userId, "sessions-revoked");
}
