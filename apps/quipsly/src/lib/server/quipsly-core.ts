import "server-only";

import type {
  Prisma,
  PrismaClient,
  StudioDocument,
  StudioMediaAsset,
  StudioProject,
  StudioProjectAccessRole,
} from "@prisma/client";
import type {
  QuipslyAccessAction,
  QuipslyAssetRef,
  QuipslyDocumentRef,
  QuipslyJobStatus,
  QuipslyJobType,
  QuipslyNestKind,
  QuipslyNestRef,
  QuipslyProductionRoomKind,
  QuipslyProductionRoomRef,
  QuipslyWorkflowJob,
} from "@high-ground/quipsly-domain/core";

import { getPrismaClient } from "@/lib/prisma";
import { ensureHomeNestForEmail, listProjectsVisibleToEmail } from "@/lib/server/home-nest";
import {
  ensureStudioProjectOwnerGrant,
  resolveStudioProjectAccess,
} from "@/lib/server/studio-project-access";
import { ensureInvitedStudioUserByEmail } from "@/lib/server/studio-user-identity";
import {
  defaultDocumentTitleForNest,
  ensureStudioWorkspace,
  nestKindFromSourceLabel,
  normalizeNestKind,
  normalizeProjectSlug,
  projectConfig,
  slugifyProjectName,
  STUDIO_WORKSPACE_SLUG,
} from "@/lib/studio/project-registry";
import { LIVE_WORK_NESTS } from "@/lib/studio/live-work-nests";

export type QuipslyCorePrisma = PrismaClient;

export type NestAccessDecision = Awaited<ReturnType<typeof resolveStudioProjectAccess>>;

type ProjectLike = Pick<StudioProject, "id" | "slug" | "name" | "sourceLabel"> & {
  isPrivate?: boolean;
};

type ProjectWithOptionalDocument = ProjectLike & {
  documents?: StudioDocument[];
};

type MediaAssetWithOptionalProject = StudioMediaAsset & {
  projects?: StudioProject[];
};

function db(prisma?: PrismaClient) {
  return prisma ?? getPrismaClient();
}

function json(value: Record<string, unknown> | undefined): Prisma.InputJsonValue {
  return (value ?? {}) as Prisma.InputJsonValue;
}

function toNestKind(sourceLabel?: string | null): QuipslyNestKind {
  return normalizeNestKind(nestKindFromSourceLabel(sourceLabel)) as QuipslyNestKind;
}

function toNestRef(project: ProjectLike): QuipslyNestRef {
  return {
    id: project.id,
    slug: project.slug,
    name: project.name,
    kind: toNestKind(project.sourceLabel),
  };
}

function toDocumentRef(project: ProjectLike, document: StudioDocument): QuipslyDocumentRef {
  return {
    id: document.id,
    stableId: document.stableId,
    nestSlug: project.slug,
    title: document.title,
    kind: "original-content",
  };
}

function toAssetRef(asset: MediaAssetWithOptionalProject): QuipslyAssetRef {
  return {
    id: asset.id,
    filename: asset.filename,
    url: asset.url ?? undefined,
    mimeType: asset.mimeType ?? undefined,
    kind: asset.mimeType?.startsWith("video/")
      ? "video"
      : asset.mimeType?.startsWith("audio/")
        ? "audio"
        : asset.mimeType?.startsWith("image/")
          ? "image"
          : "other",
    attachedNestSlugs: asset.projects?.map((project) => project.slug) ?? [],
  };
}

export function normalizeNestSlug(input: string) {
  return normalizeProjectSlug(input);
}

export async function getNestBySlug(input: {
  nestSlug: string;
  prisma?: PrismaClient;
}): Promise<(ProjectWithOptionalDocument & { nest: QuipslyNestRef }) | null> {
  const prisma = db(input.prisma);
  const slug = normalizeNestSlug(input.nestSlug);
  const workspace = await prisma.studioWorkspace.findUnique({
    where: { slug: STUDIO_WORKSPACE_SLUG },
    select: { id: true },
  });

  if (!workspace) return null;

  const project = await prisma.studioProject.findUnique({
    where: {
      workspaceId_slug: {
        workspaceId: workspace.id,
        slug,
      },
    },
    include: {
      documents: {
        orderBy: { updatedAt: "desc" },
        take: 1,
      },
    },
  });

  if (!project) return null;
  return Object.assign(project, { nest: toNestRef(project) });
}

export async function resolveNestAccess(input: {
  nestSlug: string;
  email?: string | null;
  action: QuipslyAccessAction;
  prisma?: PrismaClient;
}) {
  return resolveStudioProjectAccess({
    prisma: db(input.prisma),
    projectSlug: normalizeNestSlug(input.nestSlug),
    email: input.email,
    action: input.action,
  });
}

export async function requireNestAccess(input: {
  nestSlug: string;
  email?: string | null;
  action: QuipslyAccessAction;
  prisma?: PrismaClient;
}) {
  const decision = await resolveNestAccess(input);
  if (!decision.allowed) {
    throw new Error(`Access denied for ${input.action} on ${input.nestSlug}`);
  }
  return decision;
}

export async function ensureKnownLiveNestsForAdmin(input: {
  actorEmail?: string | null;
  isAdminActor: boolean;
  nestSlug?: string | null;
  prisma?: PrismaClient;
}) {
  if (!input.actorEmail || !input.isAdminActor || !input.nestSlug) return null;

  const normalizedSlug = normalizeNestSlug(input.nestSlug);
  const knownNest = LIVE_WORK_NESTS.find((nest: { slug: string }) => nest.slug === normalizedSlug);
  if (!knownNest) return null;

  const { ensureLiveWorkNests } = await import("@/lib/studio/live-work-nests");
  return ensureLiveWorkNests({ prisma: db(input.prisma), ownerEmail: input.actorEmail });
}

export async function ensureActorHomeNest(input: {
  email: string;
  prisma?: PrismaClient;
}) {
  return ensureHomeNestForEmail(input.email, db(input.prisma));
}

export async function listVisibleNestsForEmail(input: {
  email?: string | null;
  prisma?: PrismaClient;
}) {
  if (!input.email) return [];
  const projects = await listProjectsVisibleToEmail(input.email, db(input.prisma));
  return projects.map((project) => ({
    ...project,
    nest: toNestRef(project),
  }));
}

export async function createNestWithOwner(input: {
  name: string;
  nestKind?: QuipslyNestKind | string | null;
  documentTitle?: string | null;
  ownerEmail: string;
  description?: string | null;
  prisma?: PrismaClient;
}) {
  const prisma = db(input.prisma);
  const workspace = await ensureStudioWorkspace(prisma);
  const kind = normalizeNestKind(input.nestKind);
  const slugBase = slugifyProjectName(input.name);
  const slug = normalizeNestSlug(slugBase);
  const title =
    input.documentTitle?.trim() ||
    defaultDocumentTitleForNest(input.name, kind as Parameters<typeof defaultDocumentTitleForNest>[1]);
  const config = projectConfig(slug);

  const project = await prisma.studioProject.upsert({
    where: {
      workspaceId_slug: {
        workspaceId: workspace.id,
        slug,
      },
    },
    create: {
      workspaceId: workspace.id,
      slug,
      name: input.name.trim(),
      description: input.description ?? null,
      sourceLabel: `nest-kind:${kind}`,
      isPrivate: true,
    },
    update: {
      name: input.name.trim(),
      description: input.description ?? undefined,
      sourceLabel: `nest-kind:${kind}`,
      isPrivate: true,
    },
  });

  const document = await prisma.studioDocument.upsert({
    where: { stableId: config.documentStableId },
    create: {
      projectId: project.id,
      stableId: config.documentStableId,
      title,
      sourceLabel: `nest-kind:${kind}`,
      isPrivate: true,
    },
    update: {
      projectId: project.id,
      title,
      sourceLabel: `nest-kind:${kind}`,
      isPrivate: true,
    },
  });

  await ensureStudioProjectOwnerGrant({
    prisma,
    projectId: project.id,
    ownerEmail: input.ownerEmail,
    createdByEmail: input.ownerEmail,
  });

  return {
    nest: toNestRef(project),
    document: toDocumentRef(project, document),
  };
}

export async function getLivingDocumentForNest(input: {
  nestSlug: string;
  prisma?: PrismaClient;
}) {
  const project = await getNestBySlug(input);
  const document = project?.documents?.[0] ?? null;
  if (!project || !document) return null;

  return {
    nest: project.nest,
    document: toDocumentRef(project, document),
  };
}

export async function attachAssetToNest(input: {
  nestSlug: string;
  assetId: string;
  role?: string | null;
  source?: string | null;
  actorEmail?: string | null;
  metadataJson?: Record<string, unknown>;
  prisma?: PrismaClient;
}) {
  const prisma = db(input.prisma);
  const project = await getNestBySlug({ nestSlug: input.nestSlug, prisma });
  if (!project) throw new Error(`Nest not found: ${input.nestSlug}`);

  const attachment = await prisma.studioAssetAttachment.upsert({
    where: {
      projectId_assetId: {
        projectId: project.id,
        assetId: input.assetId,
      },
    },
    create: {
      projectId: project.id,
      assetId: input.assetId,
      role: input.role ?? null,
      source: input.source ?? "manual",
      createdByEmail: input.actorEmail ?? null,
      metadataJson: json(input.metadataJson),
    },
    update: {
      role: input.role ?? undefined,
      source: input.source ?? undefined,
      metadataJson: input.metadataJson ? json(input.metadataJson) : undefined,
    },
  });

  const asset = await prisma.studioMediaAsset.update({
    where: { id: input.assetId },
    data: {
      isGlobal: false,
      projects: {
        connect: { id: project.id },
      },
    },
    include: { projects: true },
  });

  return {
    attachment,
    asset: toAssetRef(asset),
    nest: project.nest,
  };
}

export async function ensureProductionRoomForNest(input: {
  nestSlug: string;
  slug: string;
  title: string;
  kind?: string | null;
  documentId?: string | null;
  spineAssetId?: string | null;
  actorEmail?: string | null;
  metadataJson?: Record<string, unknown>;
  prisma?: PrismaClient;
}): Promise<QuipslyProductionRoomRef> {
  const prisma = db(input.prisma);
  const project = await getNestBySlug({ nestSlug: input.nestSlug, prisma });
  if (!project) throw new Error(`Nest not found: ${input.nestSlug}`);

  const room = await prisma.studioProductionRoom.upsert({
    where: {
      projectId_slug: {
        projectId: project.id,
        slug: normalizeNestSlug(input.slug),
      },
    },
    create: {
      projectId: project.id,
      documentId: input.documentId ?? project.documents?.[0]?.id ?? null,
      slug: normalizeNestSlug(input.slug),
      title: input.title,
      kind: input.kind ?? "episode",
      spineAssetId: input.spineAssetId ?? null,
      createdByEmail: input.actorEmail ?? null,
      metadataJson: json(input.metadataJson),
    },
    update: {
      title: input.title,
      kind: input.kind ?? undefined,
      documentId: input.documentId ?? undefined,
      spineAssetId: input.spineAssetId ?? undefined,
      metadataJson: input.metadataJson ? json(input.metadataJson) : undefined,
    },
  });

  return {
    id: room.id,
    nestSlug: project.slug,
    slug: room.slug,
    title: room.title,
    kind: room.kind as QuipslyProductionRoomKind,
    status: room.status as QuipslyProductionRoomRef["status"],
  };
}

export async function createWorkflowJob(input: {
  type: QuipslyJobType;
  source?: string | null;
  priority?: number | null;
  projectId?: string | null;
  assetId?: string | null;
  productionRoomId?: string | null;
  outputPacketId?: string | null;
  requestedByEmail?: string | null;
  inputJson?: Record<string, unknown>;
  prisma?: PrismaClient;
}): Promise<QuipslyWorkflowJob> {
  const job = await db(input.prisma).studioWorkflowJob.create({
    data: {
      type: input.type,
      source: input.source ?? "app",
      priority: input.priority ?? 100,
      projectId: input.projectId ?? null,
      assetId: input.assetId ?? null,
      productionRoomId: input.productionRoomId ?? null,
      outputPacketId: input.outputPacketId ?? null,
      requestedByEmail: input.requestedByEmail ?? null,
      inputJson: json(input.inputJson),
    },
  });

  return {
    id: job.id,
    type: job.type as QuipslyJobType,
    status: job.status as QuipslyJobStatus,
    assetId: job.assetId ?? undefined,
    nestSlug: undefined,
    startedAt: job.startedAt?.toISOString(),
    completedAt: job.completedAt?.toISOString(),
    error: job.error ?? undefined,
    result: job.resultJson as Record<string, unknown> | undefined,
  };
}

export async function grantNestAccess(input: {
  nestSlug: string;
  email: string;
  role?: StudioProjectAccessRole;
  invitedByEmail?: string | null;
  note?: string | null;
  prisma?: PrismaClient;
}) {
  const prisma = db(input.prisma);
  const project = await getNestBySlug({ nestSlug: input.nestSlug, prisma });
  if (!project) throw new Error(`Nest not found: ${input.nestSlug}`);
  const email = input.email.toLowerCase().trim();

  await ensureInvitedStudioUserByEmail({
    email,
    prisma,
  });

  const grant = await prisma.studioProjectAccessGrant.upsert({
    where: {
      projectId_email: {
        projectId: project.id,
        email,
      },
    },
    create: {
      projectId: project.id,
      email,
      role: input.role ?? "VIEWER",
      createdByEmail: input.invitedByEmail ?? null,
      note: input.note ?? null,
    },
    update: {
      role: input.role ?? undefined,
      status: "ACTIVE",
      createdByEmail: input.invitedByEmail ?? undefined,
      note: input.note ?? undefined,
    },
  });

  await prisma.studioNestInvite.upsert({
    where: {
      projectId_email: {
        projectId: project.id,
        email,
      },
    },
    create: {
      projectId: project.id,
      email,
      role: input.role ?? "VIEWER",
      status: "accepted",
      invitedByEmail: input.invitedByEmail ?? null,
      acceptedAt: new Date(),
      note: input.note ?? null,
    },
    update: {
      role: input.role ?? undefined,
      status: "accepted",
      acceptedAt: new Date(),
      revokedAt: null,
      note: input.note ?? undefined,
    },
  });

  return {
    grant,
    nest: project.nest,
  };
}
