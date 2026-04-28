import "server-only";

import type { AppRole, Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { canAccessInternalContent } from "@/lib/authz";

const userIdentityInclude = {
  roles: true,
  aliases: true,
} satisfies Prisma.UserInclude;

type UserIdentityRecord = Prisma.UserGetPayload<{
  include: typeof userIdentityInclude;
}>;

export type AppUserIdentity = {
  id: string;
  primaryEmail: string;
  name: string | null;
  image: string | null;
  roles: AppRole[];
  isStaff: boolean;
  newsletterOptIn: boolean;
  announcementsOptIn: boolean;
  welcomeCompletedAt: Date | null;
};

export type PreprovisionedUserInput = {
  primaryEmail: string;
  name?: string | null;
  roles?: AppRole[];
  aliasEmails?: string[];
  newsletterOptIn?: boolean;
  announcementsOptIn?: boolean;
  createClientProfile?: boolean;
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

function uniqueRoles(roles: AppRole[]): AppRole[] {
  return [...new Set(roles)];
}

function normalizeAliasEmails(aliasEmails: string[] | undefined): string[] {
  return [...new Set((aliasEmails ?? []).map(normalizeEmail).filter(Boolean))];
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

function mapIdentity(user: UserIdentityRecord): AppUserIdentity {
  const roles = user.roles.map((entry) => entry.role);

  return {
    id: user.id,
    primaryEmail: user.primaryEmail,
    name: user.name,
    image: user.image,
    roles,
    isStaff: canAccessInternalContent(roles),
    newsletterOptIn: user.newsletterOptIn,
    announcementsOptIn: user.announcementsOptIn,
    welcomeCompletedAt: user.welcomeCompletedAt,
  };
}

async function findUserRecordByEmail(
  email: string,
): Promise<UserIdentityRecord | null> {
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

export async function getAppUserIdentityByEmail(
  email: string,
): Promise<AppUserIdentity | null> {
  const user = await findUserRecordByEmail(email);
  return user ? mapIdentity(user) : null;
}

export async function ensureAppUserFromGoogle(input: {
  email: string;
  name?: string | null;
  image?: string | null;
}): Promise<AppUserIdentity> {
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

  return mapIdentity(user);
}

export async function upsertPreprovisionedUser(
  input: PreprovisionedUserInput,
): Promise<AppUserIdentity> {
  const primaryEmail = normalizeEmail(input.primaryEmail);
  const aliasEmails = normalizeAliasEmails(input.aliasEmails).filter(
    (email) => email !== primaryEmail,
  );
  const roles = uniqueRoles([
    ...(input.roles ?? []),
    ...getBootstrapRolesForEmail(primaryEmail),
  ]);

  const user = await prisma.$transaction(async (tx) => {
    const existing = await tx.user.findFirst({
      where: {
        OR: [
          { primaryEmail },
          {
            aliases: {
              some: {
                email: primaryEmail,
              },
            },
          },
        ],
      },
      include: userIdentityInclude,
    });

    if (existing) {
      if (existing.primaryEmail !== primaryEmail) {
        throw new Error(
          `The email "${primaryEmail}" is already linked to another user as an alias.`,
        );
      }

      if (roles.length > 0) {
        await tx.userRole.createMany({
          data: roles.map((role) => ({
            userId: existing.id,
            role,
          })),
          skipDuplicates: true,
        });
      }

      if (aliasEmails.length > 0) {
        await tx.userEmail.createMany({
          data: aliasEmails.map((email) => ({
            userId: existing.id,
            email,
          })),
          skipDuplicates: true,
        });
      }

      return tx.user.update({
        where: { id: existing.id },
        data: {
          name: input.name?.trim() || existing.name,
          newsletterOptIn:
            input.newsletterOptIn ?? existing.newsletterOptIn,
          announcementsOptIn:
            input.announcementsOptIn ?? existing.announcementsOptIn,
          clientProfile: input.createClientProfile
            ? {
                upsert: {
                  create: {
                    displayName: input.name?.trim() || existing.name || null,
                  },
                  update: {},
                },
              }
            : undefined,
        },
        include: userIdentityInclude,
      });
    }

    return tx.user.create({
      data: {
        primaryEmail,
        name: input.name?.trim() || null,
        newsletterOptIn: input.newsletterOptIn ?? false,
        announcementsOptIn: input.announcementsOptIn ?? false,
        roles:
          roles.length > 0
            ? {
                create: roles.map((role) => ({ role })),
              }
            : undefined,
        aliases:
          aliasEmails.length > 0
            ? {
                create: aliasEmails.map((email) => ({ email })),
              }
            : undefined,
        clientProfile: input.createClientProfile
          ? {
              create: {
                displayName: input.name?.trim() || null,
              },
            }
          : undefined,
      },
      include: userIdentityInclude,
    });
  });

  return mapIdentity(user);
}
