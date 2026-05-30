import "server-only";

import type { AppRole, Prisma } from "@prisma/client";

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

export async function ensureStudioUserFromGoogle(input: {
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
