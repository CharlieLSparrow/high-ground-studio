import "server-only";

import type { AppRole, Prisma, PrismaClient } from "@prisma/client";

import { getPrismaClient } from "@/lib/prisma";
import { canAccessStudio } from "@/lib/studio-authz";

const userIdentityInclude = {
  aliases: true,
  roles: true,
} satisfies Prisma.UserInclude;

type StudioUserIdentityRecord = Prisma.UserGetPayload<{
  include: typeof userIdentityInclude;
}>;

export type StudioUserIdentity = {
  id: string;
  primaryEmail: string;
  name: string | null;
  image: string | null;
  roles: AppRole[];
  isStaff: boolean;
};

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function parseEmailList(value?: string): string[] {
  return (value ?? "")
    .split(",")
    .map((entry) => normalizeEmail(entry))
    .filter(Boolean);
}

function getBootstrapRolesForEmail(email: string): AppRole[] {
  const normalizedEmail = normalizeEmail(email);
  const roles = new Set<AppRole>();

  if (parseEmailList(process.env.HGO_OWNER_EMAILS).includes(normalizedEmail)) {
    roles.add("OWNER");
  }

  if (
    parseEmailList(process.env.HGO_TEAM_SCHEDULER_EMAILS).includes(
      normalizedEmail,
    )
  ) {
    roles.add("TEAM_SCHEDULER");
  }

  if (parseEmailList(process.env.HGO_COACH_EMAILS).includes(normalizedEmail)) {
    roles.add("COACH");
  }

  return [...roles];
}

function mapStudioUserIdentity(
  user: StudioUserIdentityRecord,
): StudioUserIdentity {
  const roles = user.roles.map((entry) => entry.role);

  return {
    id: user.id,
    primaryEmail: user.primaryEmail,
    name: user.name,
    image: user.image,
    roles,
    isStaff: canAccessStudio(roles),
  };
}

async function findUserRecordByEmail(
  email: string,
): Promise<StudioUserIdentityRecord | null> {
  const prisma = getPrismaClient();
  const normalizedEmail = normalizeEmail(email);

  return prisma.user.findFirst({
    where: {
      OR: [
        { primaryEmail: normalizedEmail },
        {
          aliases: {
            some: {
              email: normalizedEmail,
            },
          },
        },
      ],
    },
    include: userIdentityInclude,
  });
}

export async function getStudioUserIdentityByEmail(
  email: string,
): Promise<StudioUserIdentity | null> {
  const user = await findUserRecordByEmail(email);
  return user ? mapStudioUserIdentity(user) : null;
}

export async function ensureInvitedStudioUserByEmail(input: {
  email: string;
  name?: string | null;
  image?: string | null;
  prisma?: PrismaClient | Prisma.TransactionClient;
}): Promise<StudioUserIdentity> {
  const prisma = input.prisma ?? getPrismaClient();
  const normalizedEmail = normalizeEmail(input.email);

  if (!normalizedEmail) {
    throw new Error("Invitee email is required.");
  }

  const existing = await prisma.user.findFirst({
    where: {
      OR: [
        { primaryEmail: normalizedEmail },
        {
          aliases: {
            some: {
              email: normalizedEmail,
            },
          },
        },
      ],
    },
    include: userIdentityInclude,
  });

  if (existing) {
    const data: Prisma.UserUpdateInput = {
      isActive: true,
      emailVerified: existing.emailVerified ?? new Date(),
    };
    const name = input.name?.trim();
    if (name) data.name = name;
    if (input.image) data.image = input.image;

    const updated = await prisma.user.update({
      where: { id: existing.id },
      data,
      include: userIdentityInclude,
    });

    return mapStudioUserIdentity(updated);
  }

  const created = await prisma.user.create({
    data: {
      primaryEmail: normalizedEmail,
      name: input.name?.trim() || null,
      image: input.image || null,
      isActive: true,
      emailVerified: new Date(),
    },
    include: userIdentityInclude,
  });

  return mapStudioUserIdentity(created);
}

export async function ensureStudioUserFromGoogle(input: {
  email: string;
  name?: string | null;
  image?: string | null;
}): Promise<StudioUserIdentity> {
  return ensureStudioUserFromAuthIdentity(input);
}

export async function ensureStudioUserFromFirebaseIdentity(input: {
  firebaseUid: string;
  email: string;
  emailVerified?: boolean;
  name?: string | null;
  image?: string | null;
}): Promise<StudioUserIdentity> {
  const prisma = getPrismaClient();
  const normalizedEmail = normalizeEmail(input.email);
  const bootstrapRoles = getBootstrapRolesForEmail(normalizedEmail);

  if (!input.firebaseUid || !normalizedEmail) {
    throw new Error("Firebase identity requires both uid and email.");
  }
  if (input.emailVerified !== true) {
    throw new Error("Firebase identity requires a verified email.");
  }

  const user = await prisma.$transaction(async (tx) => {
    const byUid = await tx.user.findUnique({
      where: { firebaseUid: input.firebaseUid },
      include: userIdentityInclude,
    });

    const byEmail = await tx.user.findFirst({
      where: {
        OR: [
          { primaryEmail: normalizedEmail },
          { aliases: { some: { email: normalizedEmail } } },
        ],
      },
      include: userIdentityInclude,
    });

    if (byUid && byEmail && byUid.id !== byEmail.id) {
      throw new Error(
        "Firebase identity collision: uid and email resolve to different Quipsly users.",
      );
    }

    const existing = byUid ?? byEmail;

    if (existing) {
      const existingAlias = await tx.userEmail.findUnique({
        where: { email: normalizedEmail },
      });

      if (existingAlias && existingAlias.userId !== existing.id) {
        throw new Error(
          "Firebase identity collision: email alias belongs to a different Quipsly user.",
        );
      }

      if (existing.primaryEmail !== normalizedEmail && !existingAlias) {
        await tx.userEmail.create({
          data: {
            userId: existing.id,
            email: normalizedEmail,
            label: "firebase",
          },
        });
      }

      const missingRoles = bootstrapRoles.filter(
        (role) => !existing.roles.some((entry) => entry.role === role),
      );

      if (missingRoles.length > 0) {
        await tx.userRole.createMany({
          data: missingRoles.map((role) => ({
            userId: existing.id,
            role,
          })),
          skipDuplicates: true,
        });
      }

      return tx.user.update({
        where: { id: existing.id },
        data: {
          // Firebase UIDs are provider identifiers, not Quipsly's durable
          // person identifier. Account recovery, an auth-project migration,
          // or a deliberately recreated Firebase account can issue a new UID
          // for the same verified mailbox. The collision checks above prove
          // that both credentials resolve to this one Quipsly user before the
          // binding is rotated, preserving rooms, grants, goals, and notes.
          firebaseUid: input.firebaseUid,
          name: input.name?.trim() || existing.name,
          image: input.image || existing.image,
          emailVerified:
            existing.emailVerified || input.emailVerified ? new Date() : null,
          isActive: true,
        },
        include: userIdentityInclude,
      });
    }

    return tx.user.create({
      data: {
        firebaseUid: input.firebaseUid,
        primaryEmail: normalizedEmail,
        name: input.name?.trim() || null,
        image: input.image || null,
        emailVerified: input.emailVerified ? new Date() : null,
        isActive: true,
        roles:
          bootstrapRoles.length > 0
            ? {
                create: bootstrapRoles.map((role) => ({ role })),
              }
            : undefined,
      },
      include: userIdentityInclude,
    });
  });

  return mapStudioUserIdentity(user);
}

export async function ensureStudioUserFromAuthIdentity(input: {
  email: string;
  name?: string | null;
  image?: string | null;
}): Promise<StudioUserIdentity> {
  const prisma = getPrismaClient();
  const normalizedEmail = normalizeEmail(input.email);
  const bootstrapRoles = getBootstrapRolesForEmail(normalizedEmail);

  const user = await prisma.$transaction(async (tx) => {
    const existing = await tx.user.findFirst({
      where: {
        OR: [
          { primaryEmail: normalizedEmail },
          {
            aliases: {
              some: {
                email: normalizedEmail,
              },
            },
          },
        ],
      },
      include: userIdentityInclude,
    });

    if (existing) {
      const missingRoles = bootstrapRoles.filter(
        (role) => !existing.roles.some((entry) => entry.role === role),
      );

      if (missingRoles.length > 0) {
        await tx.userRole.createMany({
          data: missingRoles.map((role) => ({
            userId: existing.id,
            role,
          })),
          skipDuplicates: true,
        });
      }

      return tx.user.update({
        where: { id: existing.id },
        data: {
          name: input.name?.trim() || existing.name,
          image: input.image || existing.image,
        },
        include: userIdentityInclude,
      });
    }

    return tx.user.create({
      data: {
        primaryEmail: normalizedEmail,
        name: input.name?.trim() || null,
        image: input.image || null,
        roles:
          bootstrapRoles.length > 0
            ? {
                create: bootstrapRoles.map((role) => ({ role })),
              }
            : undefined,
      },
      include: userIdentityInclude,
    });
  });

  return mapStudioUserIdentity(user);
}
