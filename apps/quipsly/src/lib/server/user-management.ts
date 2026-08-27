import "server-only";

import type {
  AppRole,
  Prisma,
  PrismaClient,
  StudioProjectAccessRole,
} from "@prisma/client";

import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { getPrismaClient } from "@/lib/prisma";
import { QUIPSLY_FREE_PLAN_SLUG } from "@/lib/server/quipsly-onboarding";
import { normalizeAccessEmail } from "@/lib/server/studio-project-access";
import {
  ALL_STAFF_CAPABILITIES,
  staffCapabilitiesForRoles,
  type QuipslyStaffCapability,
} from "@/lib/staff-capabilities";
import { sourceLabelForNestKind } from "@/lib/studio/project-registry";

const DEFAULT_USER_MANAGEMENT_EMAILS = ["charlie@highgroundodyssey.com"];

type UserRolePayload = Prisma.UserRoleGetPayload<{
  select: { role: true };
}>;

type UserEmailPayload = Prisma.UserEmailGetPayload<{
  select: { email: true };
}>;

type UserWithIdentity = Prisma.UserGetPayload<{
  include: {
    roles: { select: { role: true } };
    aliases: { select: { email: true } };
    memberships: { select: { id: true } };
  };
}>;

type ProjectWithWorkspace = Prisma.StudioProjectGetPayload<{
  include: {
    workspace: { select: { name: true; slug: true } };
  };
}>;

type ProjectGrantWithProject = Prisma.StudioProjectAccessGrantGetPayload<{
  include: {
    project: {
      select: {
        id: true;
        slug: true;
        name: true;
        workspace: { select: { name: true } };
      };
    };
  };
}>;

type NestInviteWithProject = Prisma.StudioNestInviteGetPayload<{
  include: {
    project: {
      select: {
        id: true;
        slug: true;
        name: true;
        workspace: { select: { name: true } };
      };
    };
  };
}>;

export type QuipslyAdminActor = {
  email: string;
  userId: string | null;
  roles: AppRole[];
  capabilities: QuipslyStaffCapability[];
};

export type ManagedUserRecord = {
  id: string;
  primaryEmail: string;
  name: string | null;
  image: string | null;
  firebaseUid: string | null;
  createdAt: Date;
  roles: AppRole[];
  aliases: string[];
  hasFreeMembership: boolean;
  homeNestSlug: string | null;
};

export type ManagedProjectRecord = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  isPrivate: boolean;
  workspaceName: string;
  workspaceSlug: string;
};

export type ActiveProjectInviteRecord = {
  id: string;
  projectId: string;
  projectSlug: string;
  projectName: string;
  workspaceName: string;
  email: string;
  role: StudioProjectAccessRole;
  status?: string;
  userName: string | null;
  userImage: string | null;
  createdAt: Date;
};

function parseAdminEmails(value?: string) {
  return (value ?? "")
    .split(",")
    .map((entry) => normalizeAccessEmail(entry))
    .filter(Boolean);
}

export function listConfiguredUserManagementEmails(): string[] {
  const envEmails = parseAdminEmails(process.env.QUIPSLY_ADMIN_EMAILS);
  const fallbackEmails = parseAdminEmails(DEFAULT_USER_MANAGEMENT_EMAILS.join(","));
  return [...new Set([...envEmails, ...fallbackEmails])];
}

export function isUserManagementAdminEmail(email?: string | null): boolean {
  return listConfiguredUserManagementEmails().includes(normalizeAccessEmail(email));
}

async function listUserManagementRoles({
  email,
  userId,
  prisma = getPrismaClient(),
}: {
  email?: string | null;
  userId?: string | null;
  prisma?: PrismaClient;
}): Promise<AppRole[]> {
  const actorEmail = normalizeAccessEmail(email);
  if (!userId && !actorEmail) return [];

  const user = await prisma.user.findFirst({
    where: {
      OR: [
        ...(userId ? [{ id: userId }] : []),
        ...(actorEmail
          ? [
            { primaryEmail: actorEmail },
            { aliases: { some: { email: actorEmail } } },
          ]
        : []),
      ],
    },
    select: { roles: { select: { role: true } } },
  });

  return user?.roles.map((entry) => entry.role) ?? [];
}

export async function getQuipslyStaffActor(
  requiredCapability: QuipslyStaffCapability,
): Promise<QuipslyAdminActor | null> {
  const session = await auth();
  const actorEmail = normalizeAccessEmail(
    session?.user?.primaryEmail || session?.user?.email,
  );

  if (!session?.user?.id) return null;

  const roles = await listUserManagementRoles({
    email: actorEmail,
    userId: session.user.id,
  });
  const capabilities = isUserManagementAdminEmail(actorEmail)
    ? [...ALL_STAFF_CAPABILITIES]
    : staffCapabilitiesForRoles(roles);
  if (!capabilities.includes(requiredCapability)) return null;

  return {
    email: actorEmail,
    userId: session.user.id,
    roles,
    capabilities,
  };
}

export async function getQuipslyAdminActor(): Promise<QuipslyAdminActor | null> {
  return getQuipslyStaffActor("USER_ADMIN");
}

export async function requireQuipslyAdminActor(): Promise<QuipslyAdminActor> {
  const actor = await getQuipslyAdminActor();
  if (!actor) {
    redirect("/projects?adminAccessDenied=1");
  }
  return actor;
}

export async function requireQuipslySupportActor(): Promise<QuipslyAdminActor> {
  const actor = await getQuipslyStaffActor("SUPPORT_OPERATIONS");
  if (!actor) redirect("/projects?adminAccessDenied=1");
  return actor;
}

export async function requireQuipslyProductAnalyst(): Promise<QuipslyAdminActor> {
  const actor = await getQuipslyStaffActor("PRODUCT_ANALYTICS");
  if (!actor) redirect("/projects?adminAccessDenied=1");
  return actor;
}

export function parseAppRole(roleInput: string): AppRole | null {
  const normalized = normalizeAccessEmail(roleInput || "").toUpperCase();
  if (normalized === "OWNER") return "OWNER";
  if (normalized === "SUPPORT_AGENT") return "SUPPORT_AGENT";
  if (normalized === "PRODUCT_ANALYST") return "PRODUCT_ANALYST";
  if (normalized === "TEAM_SCHEDULER") return "TEAM_SCHEDULER";
  if (normalized === "COACH") return "COACH";
  if (normalized === "CLIENT") return "CLIENT";
  if (normalized === "NETWORK_PASS") return "NETWORK_PASS";
  return null;
}

export function parseProjectAccessRole(roleInput: string): StudioProjectAccessRole | null {
  const normalized = normalizeAccessEmail(roleInput || "").toUpperCase();
  if (normalized === "OWNER") return "OWNER";
  if (normalized === "EDITOR") return "EDITOR";
  if (normalized === "VIEWER") return "VIEWER";
  return null;
}

export async function listManagedUsers(
  prisma: PrismaClient = getPrismaClient(),
): Promise<ManagedUserRecord[]> {
  const now = new Date();
  const users = await prisma.user.findMany({
    include: {
      roles: { select: { role: true } },
      aliases: { select: { email: true } },
      memberships: {
        where: {
          status: "ACTIVE",
          OR: [{ endsAt: null }, { endsAt: { gt: now } }],
          plan: { slug: QUIPSLY_FREE_PLAN_SLUG },
        },
        select: {
          id: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const userEmails = users.map((user) => normalizeAccessEmail(user.primaryEmail)).filter(Boolean);
  const homeGrants = userEmails.length > 0
    ? await prisma.studioProjectAccessGrant.findMany({
        where: {
          email: { in: userEmails },
          status: "ACTIVE",
          project: { sourceLabel: sourceLabelForNestKind("home") },
        },
        select: {
          email: true,
          project: { select: { slug: true } },
        },
      })
    : [];
  const homeSlugByEmail = new Map(
    homeGrants.map((grant) => [
      normalizeAccessEmail(grant.email),
      grant.project.slug,
    ]),
  );

  return users.map((user: UserWithIdentity) => ({
    id: user.id,
    primaryEmail: user.primaryEmail,
    name: user.name,
    image: user.image,
    firebaseUid: user.firebaseUid,
    createdAt: user.createdAt,
    roles: user.roles.map((entry: UserRolePayload) => entry.role),
    aliases: user.aliases.map((entry: UserEmailPayload) => entry.email),
    hasFreeMembership: user.memberships.length > 0,
    homeNestSlug: homeSlugByEmail.get(normalizeAccessEmail(user.primaryEmail)) ?? null,
  }));
}

export async function listManagedProjects(
  prisma: PrismaClient = getPrismaClient(),
): Promise<ManagedProjectRecord[]> {
  const projects = await prisma.studioProject.findMany({
    include: {
      workspace: { select: { name: true, slug: true } },
    },
    orderBy: [{ slug: "asc" }],
  });

  return projects.map((project: ProjectWithWorkspace) => ({
    id: project.id,
    slug: project.slug,
    name: project.name,
    description: project.description ?? null,
    isPrivate: project.isPrivate,
    workspaceName: project.workspace?.name ?? "Default",
    workspaceSlug: project.workspace?.slug ?? "",
  }));
}

export async function listActiveProjectInvites(
  prisma: PrismaClient = getPrismaClient(),
): Promise<ActiveProjectInviteRecord[]> {
  const [ledgerInvites, grants] = await Promise.all([
    prisma.studioNestInvite.findMany({
      where: { status: { not: "revoked" } },
      include: {
        project: {
          select: {
            id: true,
            slug: true,
            name: true,
            workspace: { select: { name: true } },
          },
        },
      },
      orderBy: [{ updatedAt: "desc" }],
    }),
    prisma.studioProjectAccessGrant.findMany({
      where: { status: "ACTIVE" },
      include: {
        project: {
          select: {
            id: true,
            slug: true,
            name: true,
            workspace: { select: { name: true } },
          },
        },
      },
      orderBy: [{ updatedAt: "desc" }],
    }),
  ]);

  const invites = ledgerInvites.map((invite: NestInviteWithProject) => ({
    id: invite.id,
    projectId: invite.project.id,
    projectSlug: invite.project.slug,
    projectName: invite.project.name,
    workspaceName: invite.project.workspace?.name ?? "Default",
    email: invite.email,
    role: invite.role,
    status: invite.status,
    userName: null,
    userImage: null,
    createdAt: invite.createdAt,
  }));

  const seenInviteKeys = new Set(invites.map((invite) => `${invite.projectId}:${invite.email}`));
  for (const grant of grants as ProjectGrantWithProject[]) {
    const key = `${grant.project.id}:${grant.email}`;
    if (seenInviteKeys.has(key)) continue;

    invites.push({
    id: grant.id,
    projectId: grant.project.id,
    projectSlug: grant.project.slug,
    projectName: grant.project.name,
    workspaceName: grant.project.workspace?.name ?? "Default",
    email: grant.email,
    role: grant.role,
      status: "active-grant",
    userName: null,
    userImage: null,
    createdAt: grant.createdAt,
    });
  }

  const inviteEmails = [...new Set(invites.map((invite) => invite.email))];
  const users = inviteEmails.length > 0
    ? await prisma.user.findMany({
        where: {
          OR: [
            { primaryEmail: { in: inviteEmails } },
            { aliases: { some: { email: { in: inviteEmails } } } },
          ],
        },
        select: {
          primaryEmail: true,
          name: true,
          image: true,
          aliases: { select: { email: true } },
        },
      })
    : [];

  const usersByEmail = new Map<string, { name: string | null; image: string | null }>();
  for (const user of users) {
    usersByEmail.set(normalizeAccessEmail(user.primaryEmail), {
      name: user.name,
      image: user.image,
    });
    for (const alias of user.aliases) {
      usersByEmail.set(normalizeAccessEmail(alias.email), {
        name: user.name,
        image: user.image,
      });
    }
  }

  return invites.map((invite) => {
    const user = usersByEmail.get(invite.email);
    return {
      ...invite,
      userName: user?.name ?? null,
      userImage: user?.image ?? null,
    };
  });
}
