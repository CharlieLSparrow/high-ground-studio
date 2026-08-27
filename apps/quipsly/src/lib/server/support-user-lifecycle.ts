import "server-only";

import type { PrismaClient } from "@prisma/client";

import { adminAuth } from "@/lib/firebase/firebase-admin";
import { getPrismaClient } from "@/lib/prisma";
import { QUIPSLY_FIREBASE_IDENTITY_AUTHORITY } from "@/lib/server/studio-user-identity";

type FirebaseLifecycleAdmin = {
  updateUser(uid: string, properties: { disabled: boolean }): Promise<unknown>;
  revokeRefreshTokens(uid: string): Promise<void>;
};

type SupportActorReference = {
  userId: string | null;
  email: string;
};

type SupportUserIdentityRecord = {
  id: string;
  isActive: boolean;
  firebaseUid: string | null;
  authIdentities: Array<{ subject: string }>;
  organizationMemberships: Array<{ organizationId: string }>;
};

function isMissingFirebaseUser(error: unknown) {
  return Boolean(
    error
      && typeof error === "object"
      && "code" in error
      && String((error as { code?: unknown }).code) === "auth/user-not-found",
  );
}

export function linkedFirebaseSubjects(record: Pick<SupportUserIdentityRecord, "firebaseUid" | "authIdentities">) {
  return [...new Set([
    record.firebaseUid,
    ...record.authIdentities.map((identity) => identity.subject),
  ].map((value) => value?.trim() || "").filter(Boolean))];
}

async function readSupportUser(userId: string, prisma: PrismaClient): Promise<SupportUserIdentityRecord | null> {
  return prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      isActive: true,
      firebaseUid: true,
      authIdentities: {
        where: { authority: QUIPSLY_FIREBASE_IDENTITY_AUTHORITY },
        select: { subject: true },
      },
      organizationMemberships: {
        orderBy: { createdAt: "asc" },
        take: 1,
        select: { organizationId: true },
      },
    },
  });
}

export async function setSupportUserActiveState(input: {
  userId: string;
  active: boolean;
  actor: SupportActorReference;
  prisma?: PrismaClient;
  firebaseAuth?: FirebaseLifecycleAdmin;
}) {
  const prisma = input.prisma ?? getPrismaClient();
  const firebaseAuth = input.firebaseAuth ?? adminAuth;
  const target = await readSupportUser(input.userId, prisma);
  if (!target) return { status: "not-found" as const };
  if (target.isActive === input.active) {
    return { status: "unchanged" as const, active: input.active };
  }

  const subjects = linkedFirebaseSubjects(target);
  const updatedSubjects: string[] = [];
  let missingIdentityCount = 0;

  try {
    for (const subject of subjects) {
      try {
        await firebaseAuth.updateUser(subject, { disabled: !input.active });
        updatedSubjects.push(subject);
        if (!input.active) await firebaseAuth.revokeRefreshTokens(subject);
      } catch (error) {
        if (isMissingFirebaseUser(error)) {
          missingIdentityCount += 1;
          continue;
        }
        throw error;
      }
    }

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: target.id },
        data: { isActive: input.active },
      });
      await tx.userEvent.create({
        data: {
          userId: target.id,
          organizationId: target.organizationMemberships[0]?.organizationId ?? null,
          eventName: input.active ? "Support: account resumed" : "Support: account suspended",
          payloadJson: {
            schema: "quipsly-support-account-state-v2",
            actorUserId: input.actor.userId,
            actorEmail: input.actor.email,
            source: "admin-support",
            active: input.active,
            linkedIdentityCount: subjects.length,
            updatedIdentityCount: updatedSubjects.length,
            missingIdentityCount,
          },
        },
      });
    });
  } catch (error) {
    // Keep the external identity system aligned when our durable app update
    // fails. Refresh-token revocation cannot be undone, which is acceptable:
    // the person can sign in again after the original active state is restored.
    await Promise.allSettled(updatedSubjects.map((subject) => (
      firebaseAuth.updateUser(subject, { disabled: !target.isActive })
    )));
    throw error;
  }

  return {
    status: "changed" as const,
    active: input.active,
    linkedIdentityCount: subjects.length,
    updatedIdentityCount: updatedSubjects.length,
    missingIdentityCount,
  };
}

export async function revokeSupportUserSessions(input: {
  userId: string;
  actor: SupportActorReference;
  prisma?: PrismaClient;
  firebaseAuth?: FirebaseLifecycleAdmin;
}) {
  const prisma = input.prisma ?? getPrismaClient();
  const firebaseAuth = input.firebaseAuth ?? adminAuth;
  const target = await readSupportUser(input.userId, prisma);
  if (!target) return { status: "not-found" as const };

  const subjects = linkedFirebaseSubjects(target);
  if (!subjects.length) return { status: "not-linked" as const };

  let revokedIdentityCount = 0;
  let missingIdentityCount = 0;
  for (const subject of subjects) {
    try {
      await firebaseAuth.revokeRefreshTokens(subject);
      revokedIdentityCount += 1;
    } catch (error) {
      if (isMissingFirebaseUser(error)) {
        missingIdentityCount += 1;
        continue;
      }
      throw error;
    }
  }

  await prisma.userEvent.create({
    data: {
      userId: target.id,
      organizationId: target.organizationMemberships[0]?.organizationId ?? null,
      eventName: "Support: login sessions revoked",
      payloadJson: {
        schema: "quipsly-support-session-revocation-v2",
        actorUserId: input.actor.userId,
        actorEmail: input.actor.email,
        source: "admin-support",
        linkedIdentityCount: subjects.length,
        revokedIdentityCount,
        missingIdentityCount,
      },
    },
  });

  return {
    status: "revoked" as const,
    linkedIdentityCount: subjects.length,
    revokedIdentityCount,
    missingIdentityCount,
  };
}
