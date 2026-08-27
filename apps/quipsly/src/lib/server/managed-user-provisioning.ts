import "server-only";

import type { AppRole, PrismaClient } from "@prisma/client";

import { ensureQuipslyStarterStateForUser } from "@/lib/server/quipsly-onboarding";

export async function ensureManagedUserRecord(input: {
  email: string;
  name?: string;
  role: AppRole | null;
  firebaseUid?: string;
  actor: { userId: string | null; email: string; source: string };
  prisma: PrismaClient;
}) {
  const existing = await input.prisma.user.findFirst({
    where: {
      OR: [
        { primaryEmail: input.email },
        { aliases: { some: { email: input.email } } },
      ],
    },
    select: {
      id: true,
      primaryEmail: true,
      name: true,
      firebaseUid: true,
      roles: { select: { role: true } },
    },
  });

  if (input.firebaseUid && existing?.firebaseUid && existing.firebaseUid !== input.firebaseUid) {
    throw new Error("This Quipsly user is already linked to a different Firebase identity.");
  }

  const roleAdded = Boolean(
    input.role && !existing?.roles.some((entry) => entry.role === input.role),
  );
  const identityLinked = Boolean(input.firebaseUid && !existing?.firebaseUid);
  const nameChanged = Boolean(input.name && input.name !== existing?.name);
  const savedUser = await input.prisma.$transaction(async (tx) => {
    const saved = !existing
      ? await tx.user.create({
          data: {
            primaryEmail: input.email,
            name: input.name || null,
            // Staff preparation is not identity proof. Only a Firebase user
            // explicitly created and verified for the synthetic reviewer path
            // can establish this field before the person's first sign-in.
            emailVerified: input.firebaseUid ? new Date() : undefined,
            firebaseUid: input.firebaseUid || undefined,
            ...(input.role ? { roles: { create: [{ role: input.role }] } } : {}),
          },
          select: { id: true, primaryEmail: true },
        })
      : await (async () => {
          await tx.user.update({
            where: { id: existing.id },
            data: {
              name: input.name || undefined,
              firebaseUid: identityLinked ? input.firebaseUid : undefined,
              emailVerified: identityLinked ? new Date() : undefined,
            },
          });
          if (roleAdded && input.role) {
            await tx.userRole.createMany({
              data: [{ userId: existing.id, role: input.role }],
              skipDuplicates: true,
            });
          }
          return tx.user.findUniqueOrThrow({
            where: { id: existing.id },
            select: { id: true, primaryEmail: true },
          });
        })();

    const changes = [
      ...(!existing ? ["account-prepared"] : []),
      ...(roleAdded && input.role ? [`role:${input.role}`] : []),
      ...(identityLinked ? ["firebase-linked"] : []),
      ...(nameChanged ? ["name-updated"] : []),
    ];
    if (changes.length) {
      await tx.userEvent.create({
        data: {
          userId: saved.id,
          organizationId: null,
          eventName: "Admin: user provisioning updated",
          payloadJson: {
            schema: "quipsly-user-provisioning-v1",
            actorUserId: input.actor.userId,
            actorEmail: input.actor.email,
            source: input.actor.source,
            changes,
            identityVerified: Boolean(input.firebaseUid),
          },
        },
      });
    }
    return saved;
  });

  await ensureQuipslyStarterStateForUser({
    userId: savedUser.id,
    email: savedUser.primaryEmail,
    prisma: input.prisma,
  });

  return { ...savedUser, created: !existing };
}
