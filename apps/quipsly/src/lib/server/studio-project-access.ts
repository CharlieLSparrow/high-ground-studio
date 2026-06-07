import "server-only";

import type { PrismaClient, StudioProjectAccessRole, StudioProjectAccessStatus } from "@prisma/client";

import { getPrismaClient } from "@/lib/prisma";
import { ensureInvitedStudioUserByEmail } from "@/lib/server/studio-user-identity";

export type StudioProjectAccessAction = "read" | "write" | "manage";

export type StudioProjectAccessResolution = {
  allowed: boolean;
  role: StudioProjectAccessRole | null;
  source: "none" | "workspace-owner-label" | "grant" | "staff";
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
};

type ProjectWithAccess = Awaited<ReturnType<typeof findStudioProjectForAccess>>;

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

export async function hasAnyActiveStudioProjectAccessGrantForEmail(
  email?: string | null,
  prisma: PrismaClient = getPrismaClient(),
) {
  const normalizedEmail = normalizeAccessEmail(email);
  if (!normalizedEmail) return false;

  const grant = await prisma.studioProjectAccessGrant.findFirst({
    where: { email: normalizedEmail, status: "ACTIVE" },
    select: { id: true },
  });

  return Boolean(grant);
}

export async function findStudioProjectForAccess(projectSlug: string, prisma: PrismaClient = getPrismaClient()) {
  return prisma.studioProject.findFirst({
    where: { slug: projectSlug },
    include: {
      workspace: true,
      accessGrants: {
        where: { status: "ACTIVE" },
        orderBy: { createdAt: "asc" },
      },
    },
    orderBy: { updatedAt: "desc" },
  });
}

async function findUserRolesForEmail(email: string, prisma: PrismaClient) {
  const user = await prisma.user.findFirst({
    where: {
      OR: [{ primaryEmail: email }, { aliases: { some: { email } } }],
    },
    select: { roles: { select: { role: true } } },
  });

  return user?.roles.map((entry) => String(entry.role)) ?? [];
}

function workspaceOwnerLabelAllows(project: NonNullable<ProjectWithAccess>, email: string) {
  return normalizeAccessEmail(project.workspace.ownerLabel) === email;
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
  const project = await findStudioProjectForAccess(projectSlug, prisma);

  if (!project || !normalizedEmail) {
    return { allowed: false, role: null, source: "none", projectId: project?.id ?? null, projectSlug };
  }

  if (process.env.QUIPSLY_OWNER_OVERRIDE === "true") {
    return { allowed: true, role: "OWNER", source: "staff", projectId: project.id, projectSlug };
  }

  if (workspaceOwnerLabelAllows(project, normalizedEmail)) {
    return { allowed: true, role: "OWNER", source: "workspace-owner-label", projectId: project.id, projectSlug };
  }

  const explicitGrant = project.accessGrants.find(
    (grant) => normalizeAccessEmail(grant.email) === normalizedEmail && isActive(grant.status),
  );

  if (explicitGrant && roleAllowsAction(explicitGrant.role, action)) {
    return { allowed: true, role: explicitGrant.role, source: "grant", projectId: project.id, projectSlug };
  }

  const roles = await findUserRolesForEmail(normalizedEmail, prisma);
  if (roles.some(isStaffRole)) {
    return { allowed: true, role: "OWNER", source: "staff", projectId: project.id, projectSlug };
  }

  return { allowed: false, role: explicitGrant?.role ?? null, source: explicitGrant ? "grant" : "none", projectId: project.id, projectSlug };
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

  const grants = await prisma.studioProjectAccessGrant.findMany({
    where: {
      email: normalizedEmail,
      status: "ACTIVE",
    },
    include: {
      project: {
        include: {
          workspace: true,
        },
      },
    },
    orderBy: { updatedAt: "desc" },
  });

  return grants.map((grant) => ({
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
  }));
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

  await ensureInvitedStudioUserByEmail({
    email: normalizedTargetEmail,
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
