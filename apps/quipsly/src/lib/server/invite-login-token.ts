import "server-only";

import { createHmac, randomBytes } from "node:crypto";

import type { StudioProjectAccessRole } from "@prisma/client";

import { getPrismaClient } from "@/lib/prisma";
import {
  ensureInvitedStudioUserByEmail,
  normalizeEmail,
  type StudioUserIdentity,
} from "@/lib/server/studio-user-identity";

type InviteTokenBundle = {
  token: string;
  tokenHash: string;
};

type ConsumedInviteLogin = {
  identity: StudioUserIdentity;
  projectSlug: string;
  role: StudioProjectAccessRole;
};

function authSecret() {
  const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
  if (!secret) {
    throw new Error("AUTH_SECRET or NEXTAUTH_SECRET is required for invite login tokens.");
  }
  return secret;
}

export function hashInviteLoginToken(token: string) {
  return createHmac("sha256", authSecret())
    .update("quipsly-invite-login:")
    .update(String(token || "").trim())
    .digest("hex");
}

export function createInviteLoginToken(): InviteTokenBundle {
  const token = `qinv_${randomBytes(32).toString("base64url")}`;
  return {
    token,
    tokenHash: hashInviteLoginToken(token),
  };
}

export async function consumeInviteLoginTokenForEmail(input: {
  token: string;
  verifiedEmail: string;
}): Promise<ConsumedInviteLogin | null> {
  const expectedEmail = normalizeEmail(input.verifiedEmail);
  if (!expectedEmail) return null;

  const rawToken = String(input.token || "").trim();
  if (!rawToken || !rawToken.startsWith("qinv_")) return null;

  const prisma = getPrismaClient();
  const tokenHash = hashInviteLoginToken(rawToken);
  const invite = await prisma.studioNestInvite.findUnique({
    where: { tokenHash },
    include: {
      project: {
        select: {
          id: true,
          slug: true,
        },
      },
    },
  });

  if (!invite || invite.status === "revoked" || invite.revokedAt) {
    return null;
  }

  const email = normalizeEmail(invite.email);
  if (!email) return null;
  if (email !== expectedEmail) return null;

  const identity = await prisma.$transaction(async (tx) => {
    const user = await ensureInvitedStudioUserByEmail({
      email,
      prisma: tx,
    });

    await tx.studioProjectAccessGrant.upsert({
      where: {
        projectId_email: {
          projectId: invite.projectId,
          email,
        },
      },
      create: {
        projectId: invite.projectId,
        email,
        role: invite.role,
        status: "ACTIVE",
        createdByEmail: invite.invitedByEmail || null,
        note: invite.note || "Accepted by invite login link",
      },
      update: {
        role: invite.role,
        status: "ACTIVE",
        createdByEmail: invite.invitedByEmail || undefined,
        note: invite.note || undefined,
      },
    });

    await tx.studioNestInvite.update({
      where: { id: invite.id },
      data: {
        status: "accepted",
        acceptedAt: new Date(),
        tokenHash: null,
      },
    });

    return user;
  });

  return {
    identity,
    projectSlug: invite.project.slug,
    role: invite.role,
  };
}
