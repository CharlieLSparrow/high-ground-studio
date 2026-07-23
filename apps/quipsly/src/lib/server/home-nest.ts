import "server-only";

import type { PrismaClient, StudioProjectAccessRole } from "@prisma/client";

import { auth } from "@/auth";
import { getPrismaClient } from "@/lib/prisma";
import {
  ensureStudioProjectOwnerGrant,
  normalizeAccessEmail,
} from "@/lib/server/studio-project-access";
import {
  ensureStudioWorkspace,
  sourceLabelForNestKind,
} from "@/lib/studio/project-registry";

export const HOME_NEST_BIN_NAME = "Inbox";
export const HOME_NEST_DESCRIPTION = "Your private landing place for uploads before they are attached to a working Nest.";

type HomeNestProject = {
  id: string;
  slug: string;
  name: string;
  sourceLabel: string | null;
};

export async function getCurrentHomeNestActorEmail() {
  const session = await auth();
  const sessionEmail = normalizeAccessEmail(
    session?.user?.primaryEmail || session?.user?.email,
  );

  return sessionEmail;
}

export function homeNestSlugForEmail(email: string) {
  const suffix = normalizeAccessEmail(email)
    .toLowerCase()
    .trim()
    .replace(/@/g, "-at-")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72);

  return suffix ? `home-${suffix}` : "";
}

function displayNameForEmail(email: string) {
  const local = email.split("@")[0] || "My";
  return local
    .replace(/[._-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

async function ensureUserForEmail(prisma: PrismaClient, email: string) {
  const normalizedEmail = normalizeAccessEmail(email);
  const existing = await prisma.user.findFirst({
    where: {
      OR: [
        { primaryEmail: normalizedEmail },
        { aliases: { some: { email: normalizedEmail } } },
      ],
    },
    select: { id: true, primaryEmail: true, name: true },
  });

  if (existing) return existing;

  return prisma.user.create({
    data: {
      primaryEmail: normalizedEmail,
      name: displayNameForEmail(normalizedEmail),
    },
    select: { id: true, primaryEmail: true, name: true },
  });
}

export async function ensureHomeNestForEmail(
  email: string,
  prisma: PrismaClient = getPrismaClient(),
): Promise<HomeNestProject> {
  const normalizedEmail = normalizeAccessEmail(email);
  if (!normalizedEmail) {
    throw new Error("Cannot create a Home Nest without an email address.");
  }

  const user = await ensureUserForEmail(prisma, normalizedEmail);
  const workspace = await ensureStudioWorkspace(prisma as any);
  const slug = homeNestSlugForEmail(normalizedEmail);

  let project = await prisma.studioProject.findUnique({
    where: { workspaceId_slug: { workspaceId: workspace.id, slug } },
    select: { id: true, slug: true, name: true, sourceLabel: true },
  });

  if (!project) {
    project = await prisma.studioProject.create({
      data: {
        workspaceId: workspace.id,
        slug,
        name: `${user.name || displayNameForEmail(normalizedEmail)} Home Nest`,
        description: HOME_NEST_DESCRIPTION,
        sourceLabel: sourceLabelForNestKind("home"),
        documents: {
          create: {
            stableId: `doc-${slug}`,
            title: "Home Vault",
            sourceLabel: "home-nest",
          },
        },
      },
      select: { id: true, slug: true, name: true, sourceLabel: true },
    });
  } else if (project.sourceLabel !== sourceLabelForNestKind("home")) {
    project = await prisma.studioProject.update({
      where: { id: project.id },
      data: {
        sourceLabel: sourceLabelForNestKind("home"),
        description: HOME_NEST_DESCRIPTION,
      },
      select: { id: true, slug: true, name: true, sourceLabel: true },
    });
  }

  await ensureStudioProjectOwnerGrant({
    projectId: project.id,
    ownerEmail: normalizedEmail,
    createdByEmail: normalizedEmail,
    prisma,
  });

  const existingInbox = await prisma.mediaBin.findFirst({
    where: { projectId: project.id, name: HOME_NEST_BIN_NAME },
    select: { id: true },
  });

  if (!existingInbox) {
    await prisma.mediaBin.create({
      data: {
        projectId: project.id,
        name: HOME_NEST_BIN_NAME,
        description: "Unsorted uploads and captured media.",
      },
    });
  }

  return project;
}

export async function ensureCurrentActorHomeNest(prisma: PrismaClient = getPrismaClient()) {
  const actorEmail = await getCurrentHomeNestActorEmail();
  if (!actorEmail) return null;
  return ensureHomeNestForEmail(actorEmail, prisma);
}

export async function listProjectsVisibleToEmail(
  email: string,
  prisma: PrismaClient = getPrismaClient(),
) {
  const normalizedEmail = normalizeAccessEmail(email);
  if (!normalizedEmail) return [];

  const rows = await prisma.studioProjectAccessGrant.findMany({
    where: {
      email: normalizedEmail,
      status: "ACTIVE",
    },
    include: {
      project: {
        select: {
          id: true,
          slug: true,
          name: true,
          sourceLabel: true,
          updatedAt: true,
          accessGrants: {
            where: { status: "ACTIVE" },
            select: { email: true, role: true },
          },
        },
      },
    },
    orderBy: { updatedAt: "desc" },
  });

  const byId = new Map<string, {
    id: string;
    slug: string;
    name: string;
    sourceLabel: string | null;
    updatedAt: Date;
    role: StudioProjectAccessRole;
    collaborators?: { email: string; role: StudioProjectAccessRole }[];
  }>();

  for (const row of rows) {
    byId.set(row.project.id, {
      ...row.project,
      role: row.role,
      collaborators: row.project.accessGrants,
    });
  }

  return [...byId.values()].sort((a, b) => {
    const aHome = a.sourceLabel === sourceLabelForNestKind("home") ? 0 : 1;
    const bHome = b.sourceLabel === sourceLabelForNestKind("home") ? 0 : 1;
    if (aHome !== bHome) return aHome - bHome;
    return b.updatedAt.getTime() - a.updatedAt.getTime();
  });
}
