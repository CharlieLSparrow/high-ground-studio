import "server-only";

import type { Prisma, PrismaClient, StudioProjectAccessRole, StudioProjectAccessStatus } from "@prisma/client";

import { getPrismaClient } from "@/lib/prisma";
import { ensureQuipslyStarterStateForUser } from "@/lib/server/quipsly-onboarding";
import { ensureInvitedStudioUserByEmail } from "@/lib/server/studio-user-identity";

export type StudioProjectAccessAction = "read" | "write" | "manage";

export type StudioProjectAccessResolution = {
  allowed: boolean;
  role: StudioProjectAccessRole | null;
  source: "none" | "workspace-owner-label" | "grant" | "staff" | "operator-override";
  projectId: string | null;
  projectSlug: string;
};

export type AccessibleStudioProjectSummary = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  sourceLabel: string | null;
  isPrivate: boolean;
  workspaceName: string;
  workspaceSlug: string;
  role: StudioProjectAccessRole;
  accessSource: "grant";
  updatedAt: Date;
  collaborators?: { email: string; role: StudioProjectAccessRole }[];
};

type ProjectWithAccess = Prisma.StudioProjectGetPayload<{
  include: { workspace: true; accessGrants: true };
}>;

export function normalizeAccessEmail(email?: string | null) {
  return (email || "").trim().toLowerCase();
}

function isActive(status: StudioProjectAccessStatus | string) {
  return status === "ACTIVE";
}

export function roleAllowsAction(role: StudioProjectAccessRole | string, action: StudioProjectAccessAction) {
  if (role === "OWNER") return true;
  if (role === "EDITOR") return action === "read" || action === "write";
  if (role === "VIEWER") return action === "read";
  return false;
}

function isStaffRole(role: string) {
  const normalized = role.trim().toUpperCase();
  return normalized === "OWNER" || normalized === "ADMIN" || normalized === "STAFF";
}

type StudioAccessIdentity = {
  emails: string[];
  roles: string[];
};

export async function resolveStudioAccessIdentity(
  email: string,
  prisma: PrismaClient,
): Promise<StudioAccessIdentity> {
  const normalizedEmail = normalizeAccessEmail(email);
  if (!normalizedEmail) return { emails: [], roles: [] };

  const user = await prisma.user.findFirst({
    where: {
      OR: [
        { primaryEmail: normalizedEmail },
        { aliases: { some: { email: normalizedEmail } } },
      ],
    },
    select: {
      primaryEmail: true,
      aliases: { select: { email: true } },
      roles: { select: { role: true } },
    },
  });

  if (!user) return { emails: [normalizedEmail], roles: [] };

  return {
    emails: [...new Set(
      [user.primaryEmail, ...user.aliases.map((alias) => alias.email)]
        .map(normalizeAccessEmail)
        .filter(Boolean),
    )],
    roles: user.roles.map((entry) => String(entry.role)),
  };
}

export function strongestAccessGrant<T extends { role: StudioProjectAccessRole | string }>(
  grants: T[],
): T | undefined {
  const rank: Record<string, number> = { VIEWER: 1, EDITOR: 2, OWNER: 3 };
  return grants.reduce<T | undefined>((strongest, grant) => {
    if (!strongest) return grant;
    return (rank[String(grant.role)] || 0) > (rank[String(strongest.role)] || 0)
      ? grant
      : strongest;
  }, undefined);
}

export async function hasAnyActiveStudioProjectAccessGrantForEmail(
  email?: string | null,
  prisma: PrismaClient = getPrismaClient(),
) {
  const normalizedEmail = normalizeAccessEmail(email);
  if (!normalizedEmail) return false;

  const identity = await resolveStudioAccessIdentity(normalizedEmail, prisma);
  const grant = await prisma.studioProjectAccessGrant.findFirst({
    where: { email: { in: identity.emails }, status: "ACTIVE" },
    select: { id: true },
  });

  return Boolean(grant);
}

export async function findStudioProjectForAccess(
  projectSlug: string,
  prisma: PrismaClient = getPrismaClient(),
): Promise<ProjectWithAccess | null> {
  const project = await prisma.studioProject.findFirst({
    where: { slug: projectSlug },
    orderBy: { updatedAt: "desc" },
  });
  if (!project) return null;

  // A few isolated unit callers supply the already-shaped result. Production
  // Prisma reads the relations sequentially so this resolver remains valid on
  // an interactive transaction's single pg connection.
  if ("workspace" in project && "accessGrants" in project) return project as ProjectWithAccess;
  const workspace = await prisma.studioWorkspace.findUnique({
    where: { id: project.workspaceId },
  });
  const accessGrants = await prisma.studioProjectAccessGrant.findMany({
    where: { projectId: project.id, status: "ACTIVE" },
    orderBy: { createdAt: "asc" },
  });
  if (!workspace) return null;
  return { ...project, workspace, accessGrants };
}

function workspaceOwnerLabelAllows(
  project: ProjectWithAccess,
  identityEmails: string[],
) {
  return identityEmails.includes(normalizeAccessEmail(project.workspace.ownerLabel));
}

export async function resolveStudioProjectAccess({
  projectSlug,
  email,
  action = "read",
  prisma = getPrismaClient(),
}: {
  projectSlug: string;
  email?: string | null;
  action?: StudioProjectAccessAction;
  prisma?: PrismaClient;
}): Promise<StudioProjectAccessResolution> {
  const normalizedEmail = normalizeAccessEmail(email);
  // Keep these reads sequential for interactive-transaction callers.
  const project = await findStudioProjectForAccess(projectSlug, prisma);
  const identity = await resolveStudioAccessIdentity(normalizedEmail, prisma);

  if (!project || !normalizedEmail) {
    return { allowed: false, role: null, source: "none", projectId: project?.id ?? null, projectSlug };
  }

  if (workspaceOwnerLabelAllows(project, identity.emails)) {
    return { allowed: true, role: "OWNER", source: "workspace-owner-label", projectId: project.id, projectSlug };
  }

  const explicitGrant = strongestAccessGrant(project.accessGrants.filter(
    (grant) => identity.emails.includes(normalizeAccessEmail(grant.email)) && isActive(grant.status),
  ));

  const permittedGrant = strongestAccessGrant(project.accessGrants.filter(
    (grant) =>
      identity.emails.includes(normalizeAccessEmail(grant.email))
      && isActive(grant.status)
      && roleAllowsAction(grant.role, action),
  ));

  if (permittedGrant) {
    return { allowed: true, role: permittedGrant.role, source: "grant", projectId: project.id, projectSlug };
  }

  if (identity.roles.some(isStaffRole)) {
    return { allowed: true, role: "OWNER", source: "staff", projectId: project.id, projectSlug };
  }

  return {
    allowed: false,
    role: explicitGrant?.role ?? null,
    source: explicitGrant ? "grant" : "none",
    projectId: project.id,
    projectSlug,
  };
}

function accessibleProjectSummaryFromGrant(
  grant: Awaited<ReturnType<PrismaClient["studioProjectAccessGrant"]["findMany"]>>[number] & {
    project: {
      id: string;
      slug: string;
      name: string;
      description: string | null;
      sourceLabel: string | null;
      isPrivate: boolean;
      updatedAt: Date;
      workspace: { name: string; slug: string };
      accessGrants: { email: string; role: StudioProjectAccessRole }[];
    };
  },
): AccessibleStudioProjectSummary {
  return {
    id: grant.project.id,
    slug: grant.project.slug,
    name: grant.project.name,
    description: grant.project.description,
    sourceLabel: grant.project.sourceLabel,
    isPrivate: grant.project.isPrivate,
    workspaceName: grant.project.workspace.name,
    workspaceSlug: grant.project.workspace.slug,
    role: grant.role,
    accessSource: "grant",
    updatedAt: grant.project.updatedAt,
    collaborators: grant.project.accessGrants,
  };
}

export async function canAccessStudioProjectBySlug({
  projectSlug,
  email,
  action = "read",
  prisma = getPrismaClient(),
}: {
  projectSlug: string;
  email?: string | null;
  action?: StudioProjectAccessAction;
  prisma?: PrismaClient;
}) {
  const resolution = await resolveStudioProjectAccess({ projectSlug, email, action, prisma });
  return resolution.allowed;
}

export async function listStudioProjectAccessGrants(projectSlug: string, prisma: PrismaClient = getPrismaClient()) {
  const project = await findStudioProjectForAccess(projectSlug, prisma);
  if (!project) return [];

  const grants = await prisma.studioProjectAccessGrant.findMany({
    where: { projectId: project.id },
    orderBy: [{ status: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      email: true,
      role: true,
      status: true,
      createdByEmail: true,
      note: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  const emails = [...new Set(grants.map((grant) => normalizeAccessEmail(grant.email)).filter(Boolean))];
  const users = emails.length > 0
    ? await prisma.user.findMany({
        where: {
          OR: [
            { primaryEmail: { in: emails } },
            { aliases: { some: { email: { in: emails } } } },
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
    const record = { name: user.name, image: user.image };
    usersByEmail.set(normalizeAccessEmail(user.primaryEmail), record);
    for (const alias of user.aliases) {
      usersByEmail.set(normalizeAccessEmail(alias.email), record);
    }
  }

  return grants.map((grant) => {
    const user = usersByEmail.get(normalizeAccessEmail(grant.email));
    return {
      ...grant,
      userName: user?.name ?? null,
      userImage: user?.image ?? null,
      hasUserRecord: Boolean(user),
    };
  });
}

export async function listAccessibleStudioProjectSummariesForEmail(
  email?: string | null,
  prisma: PrismaClient = getPrismaClient(),
): Promise<AccessibleStudioProjectSummary[]> {
  const normalizedEmail = normalizeAccessEmail(email);
  if (!normalizedEmail) return [];

  const identity = await resolveStudioAccessIdentity(normalizedEmail, prisma);
  const grants = await prisma.studioProjectAccessGrant.findMany({
    where: {
      email: { in: identity.emails },
      status: "ACTIVE",
    },
    include: {
      project: {
        include: {
          workspace: true,
          accessGrants: {
            where: { status: "ACTIVE" },
            select: { email: true, role: true },
          },
        },
      },
    },
    orderBy: { updatedAt: "desc" },
  });

  const strongestGrantByProject = new Map<string, (typeof grants)[number]>();
  for (const grant of grants) {
    const current = strongestGrantByProject.get(grant.projectId);
    strongestGrantByProject.set(
      grant.projectId,
      strongestAccessGrant(current ? [current, grant] : [grant]) ?? grant,
    );
  }

  return [...strongestGrantByProject.values()]
    .sort((a, b) => b.project.updatedAt.getTime() - a.project.updatedAt.getTime())
    .map(accessibleProjectSummaryFromGrant);
}

export async function grantStudioProjectAccessByEmail({
  projectSlug,
  targetEmail,
  role = "VIEWER",
  actorEmail,
  note,
  prisma = getPrismaClient(),
}: {
  projectSlug: string;
  targetEmail: string;
  role?: StudioProjectAccessRole;
  actorEmail?: string | null;
  note?: string | null;
  prisma?: PrismaClient;
}) {
  const normalizedTargetEmail = normalizeAccessEmail(targetEmail);
  const normalizedActorEmail = normalizeAccessEmail(actorEmail);

  if (!normalizedTargetEmail) {
    throw new Error("Invitee email is required.");
  }

  const actorAccess = await resolveStudioProjectAccess({
    projectSlug,
    email: normalizedActorEmail,
    action: "manage",
    prisma,
  });

  if (!actorAccess.allowed || !actorAccess.projectId) {
    throw new Error("You do not have permission to manage this Nest.");
  }

  const invitedUser = await ensureInvitedStudioUserByEmail({
    email: normalizedTargetEmail,
    prisma,
  });
  await ensureQuipslyStarterStateForUser({
    userId: invitedUser.id,
    email: invitedUser.primaryEmail,
    prisma,
  });

  return prisma.studioProjectAccessGrant.upsert({
    where: { projectId_email: { projectId: actorAccess.projectId, email: normalizedTargetEmail } },
    update: {
      role,
      status: "ACTIVE",
      createdByUserId: null,
      createdByEmail: normalizedActorEmail || null,
      note: note || null,
    },
    create: {
      projectId: actorAccess.projectId,
      email: normalizedTargetEmail,
      role,
      status: "ACTIVE",
      createdByUserId: null,
      createdByEmail: normalizedActorEmail || null,
      note: note || null,
    },
  });
}

export async function ensureStudioProjectOwnerGrant({
  projectId,
  ownerEmail,
  createdByEmail,
  prisma = getPrismaClient(),
}: {
  projectId: string;
  ownerEmail?: string | null;
  createdByEmail?: string | null;
  prisma?: PrismaClient;
}) {
  const normalizedOwnerEmail = normalizeAccessEmail(ownerEmail);
  const normalizedCreatedByEmail = normalizeAccessEmail(createdByEmail);

  if (!normalizedOwnerEmail) {
    return null;
  }

  return prisma.studioProjectAccessGrant.upsert({
    where: {
      projectId_email: {
        projectId,
        email: normalizedOwnerEmail,
      },
    },
    update: {
      role: "OWNER",
      status: "ACTIVE",
      createdByEmail: normalizedCreatedByEmail || normalizedOwnerEmail,
      note: "Nest owner",
    },
    create: {
      projectId,
      email: normalizedOwnerEmail,
      role: "OWNER",
      status: "ACTIVE",
      createdByEmail: normalizedCreatedByEmail || normalizedOwnerEmail,
      note: "Nest owner",
    },
  });
}

export async function revokeStudioProjectAccessByEmail({
  projectSlug,
  targetEmail,
  actorEmail,
  prisma = getPrismaClient(),
}: {
  projectSlug: string;
  targetEmail: string;
  actorEmail?: string | null;
  prisma?: PrismaClient;
}) {
  const normalizedTargetEmail = normalizeAccessEmail(targetEmail);
  const normalizedActorEmail = normalizeAccessEmail(actorEmail);

  if (!normalizedTargetEmail) {
    throw new Error("Invitee email is required.");
  }

  const actorAccess = await resolveStudioProjectAccess({
    projectSlug,
    email: normalizedActorEmail,
    action: "manage",
    prisma,
  });

  if (!actorAccess.allowed || !actorAccess.projectId) {
    throw new Error("You do not have permission to manage this Nest.");
  }

  if (normalizedTargetEmail === normalizedActorEmail) {
    throw new Error("You cannot revoke your own Nest access from this panel.");
  }

  return prisma.studioProjectAccessGrant.update({
    where: { projectId_email: { projectId: actorAccess.projectId, email: normalizedTargetEmail } },
    data: {
      status: "REVOKED",
      note: "Revoked from Nest access panel",
    },
  });
}
