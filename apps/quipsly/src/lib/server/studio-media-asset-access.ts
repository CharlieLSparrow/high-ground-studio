import "server-only";

import type { PrismaClient } from "@prisma/client";

import {
  normalizeAccessEmail,
  resolveStudioProjectAccess,
  type StudioProjectAccessAction,
} from "@/lib/server/studio-project-access";

type MediaAssetScope = {
  id: string;
  slug: string;
  name: string;
};

type MediaAssetAccessMetadata = {
  id: string;
  isGlobal: boolean;
  projects: MediaAssetScope[];
  mediaBin: { project: MediaAssetScope } | null;
  assetAttachments: Array<{ project: MediaAssetScope }>;
};

export type StudioMediaAssetAccess =
  | {
      allowed: true;
      assetId: string;
      isGlobal: boolean;
      scopes: MediaAssetScope[];
      readableProjectIds: string[];
      writableProjectIds: string[];
      canWrite: boolean;
      source: "global" | "project";
    }
  | {
      allowed: false;
      status: 401 | 404;
      error: string;
    };

export class StudioMediaAssetAccessError extends Error {
  readonly status: 401 | 404;

  constructor(status: 401 | 404, message: string) {
    super(message);
    this.name = "StudioMediaAssetAccessError";
    this.status = status;
  }
}

function uniqueScopes(asset: MediaAssetAccessMetadata) {
  const byId = new Map<string, MediaAssetScope>();
  for (const project of asset.projects) byId.set(project.id, project);
  if (asset.mediaBin?.project) byId.set(asset.mediaBin.project.id, asset.mediaBin.project);
  for (const attachment of asset.assetAttachments) {
    byId.set(attachment.project.id, attachment.project);
  }
  return [...byId.values()];
}

async function projectIdsAllowedForAction(input: {
  prisma: PrismaClient;
  actorEmail: string;
  scopes: MediaAssetScope[];
  action: StudioProjectAccessAction;
}) {
  const decisions = await Promise.all(input.scopes.map(async (project) => ({
    project,
    access: await resolveStudioProjectAccess({
      projectSlug: project.slug,
      email: input.actorEmail,
      action: input.action,
      prisma: input.prisma,
    }),
  })));
  return decisions
    .filter(({ access }) => access.allowed)
    .map(({ project }) => project.id);
}

/**
 * Canonical metadata boundary for StudioMediaAsset and child MediaClip records.
 *
 * A global asset is readable by an authenticated Nest user, but global status
 * never grants mutation authority. Writes require Owner/Editor authority in at
 * least one project that owns, bins, or explicitly attaches the asset.
 */
export async function authorizeStudioMediaAsset(input: {
  prisma: PrismaClient;
  actorEmail?: string | null;
  assetId: string;
  action?: "read" | "write";
}): Promise<StudioMediaAssetAccess> {
  const actorEmail = normalizeAccessEmail(input.actorEmail);
  if (!actorEmail) {
    return {
      allowed: false,
      status: 401,
      error: "Sign in to open this media record.",
    };
  }

  const asset = await input.prisma.studioMediaAsset.findUnique({
    where: { id: input.assetId },
    select: {
      id: true,
      isGlobal: true,
      projects: { select: { id: true, slug: true, name: true } },
      mediaBin: {
        select: {
          project: { select: { id: true, slug: true, name: true } },
        },
      },
      assetAttachments: {
        select: {
          project: { select: { id: true, slug: true, name: true } },
        },
      },
    },
  }) as MediaAssetAccessMetadata | null;

  if (!asset) {
    return {
      allowed: false,
      status: 404,
      error: "This media record is unavailable.",
    };
  }

  const scopes = uniqueScopes(asset);
  const [readableProjectIds, writableProjectIds] = await Promise.all([
    projectIdsAllowedForAction({
      prisma: input.prisma,
      actorEmail,
      scopes,
      action: "read",
    }),
    projectIdsAllowedForAction({
      prisma: input.prisma,
      actorEmail,
      scopes,
      action: "write",
    }),
  ]);
  const canRead = asset.isGlobal || readableProjectIds.length > 0;
  const canWrite = writableProjectIds.length > 0;
  const allowed = input.action === "write" ? canWrite : canRead;

  if (!allowed) {
    return {
      allowed: false,
      status: 404,
      error: "This media record is unavailable.",
    };
  }

  return {
    allowed: true,
    assetId: asset.id,
    isGlobal: asset.isGlobal,
    scopes,
    readableProjectIds,
    writableProjectIds,
    canWrite,
    source: readableProjectIds.length > 0 ? "project" : "global",
  };
}

export async function requireStudioMediaAssetAccess(
  input: Parameters<typeof authorizeStudioMediaAsset>[0],
) {
  const access = await authorizeStudioMediaAsset(input);
  if (!access.allowed) {
    throw new StudioMediaAssetAccessError(access.status, access.error);
  }
  return access;
}

export async function requireStudioMediaClipWriteAccess(input: {
  prisma: PrismaClient;
  actorEmail?: string | null;
  clipId: string;
}) {
  const clip = await input.prisma.mediaClip.findUnique({
    where: { id: input.clipId },
    select: {
      id: true,
      mediaAssetId: true,
      inTimecode: true,
      outTimecode: true,
    },
  });
  if (!clip) {
    throw new StudioMediaAssetAccessError(404, "This media record is unavailable.");
  }
  const access = await requireStudioMediaAssetAccess({
    prisma: input.prisma,
    actorEmail: input.actorEmail,
    assetId: clip.mediaAssetId,
    action: "write",
  });
  return { clip, access };
}

export async function requireStudioMediaProjectAccess(input: {
  prisma: PrismaClient;
  actorEmail?: string | null;
  projectId: string;
  action: "read" | "write";
}) {
  const actorEmail = normalizeAccessEmail(input.actorEmail);
  if (!actorEmail) {
    throw new StudioMediaAssetAccessError(401, "Sign in to open this media record.");
  }
  const project = await input.prisma.studioProject.findUnique({
    where: { id: input.projectId },
    select: { id: true, slug: true, name: true },
  });
  if (!project) {
    throw new StudioMediaAssetAccessError(404, "This media record is unavailable.");
  }
  const access = await resolveStudioProjectAccess({
    projectSlug: project.slug,
    email: actorEmail,
    action: input.action,
    prisma: input.prisma,
  });
  if (!access.allowed) {
    throw new StudioMediaAssetAccessError(404, "This media record is unavailable.");
  }
  return { project, access };
}
