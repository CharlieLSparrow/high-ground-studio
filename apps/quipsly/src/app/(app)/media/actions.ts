'use server'

import { getPrismaClient } from '@/lib/prisma';
import {
  ensureCurrentActorHomeNest,
  getCurrentHomeNestActorEmail,
} from '@/lib/server/home-nest';
import {
  requireStudioMediaAssetAccess,
  requireStudioMediaClipWriteAccess,
  requireStudioMediaProjectAccess,
  StudioMediaAssetAccessError,
} from '@/lib/server/studio-media-asset-access';
import { revalidatePath } from 'next/cache';

function slugify(value: string) {
  return value
    .toLowerCase()
    .replaceAll(" ", "-")
    .replace(/[^a-z0-9-_]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60) || "untitled";
}

function toFiniteNumber(value: unknown, fallback: number | null = null) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }

  return value;
}

function dedupeStrings(values: string[]) {
  const seen = new Set<string>();
  const out: string[] = [];

  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }

  return out;
}

async function resolveStudioTagRefs(
  prisma: ReturnType<typeof getPrismaClient>,
  projectIds: string[],
  studioTagIds: string[] = [],
  studioTagSlugs: string[] = [],
) {
  const cleanIds = dedupeStrings(studioTagIds);
  const cleanSlugs = dedupeStrings(studioTagSlugs.map((value) => value.trim().toLowerCase()).filter(Boolean));
  const allowedProjectIds = dedupeStrings(projectIds);
  if (!allowedProjectIds.length || (!cleanIds.length && !cleanSlugs.length)) return [];

  const matches = await prisma.studioTag.findMany({
    where: {
      AND: [
        { projectId: { in: allowedProjectIds } },
        { isActive: true },
        {
          OR: [
            ...(cleanIds.length ? [{ id: { in: cleanIds } }] : []),
            ...(cleanSlugs.length ? [{ slug: { in: cleanSlugs } }] : []),
          ],
        },
      ],
    },
    select: { id: true },
  });

  return dedupeStrings(matches.map((tag) => tag.id)).map((id) => ({ id }));
}

async function resolveMediaTagIds(prisma: ReturnType<typeof getPrismaClient>, mediaTagIds: string[] = [], mediaTagLabels: string[] = []) {
  const cleanIds = dedupeStrings(mediaTagIds);
  const cleanLabels = dedupeStrings(mediaTagLabels.map((l) => l.trim()).filter(Boolean));

  const byLabel = cleanLabels.map((label) => slugify(label));
  const tagBySlug = await prisma.studioMediaTag.findMany({
    where: {
      OR: [
        ...(cleanIds.length ? [{ id: { in: cleanIds } }] : []),
        ...(byLabel.length ? [{ slug: { in: byLabel } }] : []),
      ],
    },
    select: { id: true, label: true, slug: true },
  });

  const foundBySlug = new Map(tagBySlug.map((tag) => [tag.slug, tag.id]));
  const foundById = new Set(tagBySlug.map((tag) => tag.id));

  const resolved: { id: string }[] = tagBySlug.map((tag) => ({ id: tag.id }));

  for (const tagId of cleanIds) {
    if (!foundById.has(tagId)) {
      // Ignore unknown tag ids silently; callers can pass stale values and get auto-cleaned.
    }
  }

  for (const label of cleanLabels) {
    const slug = slugify(label);
    const existing = foundBySlug.get(slug);
    if (existing) {
      if (!resolved.some((entry) => entry.id === existing)) {
        resolved.push({ id: existing });
      }
      continue;
    }

    const created = await prisma.studioMediaTag.create({
      data: {
        slug,
        label,
        color: '#8c6b4a',
      },
      select: { id: true },
    });

    resolved.push({ id: created.id });
    foundBySlug.set(slug, created.id);
  }

  return dedupeStrings(resolved.map((tag) => tag.id)).map((id) => ({ id }));
}

async function reorderClipTimes(
  prisma: ReturnType<typeof getPrismaClient>,
  mediaAssetId: string,
  inTimecode: number,
  outTimecode: number,
) {
  const duration = outTimecode - inTimecode;
  if (duration <= 0) {
    throw new Error("outTimecode must be greater than inTimecode.");
  }

  const asset = await prisma.studioMediaAsset.findUnique({
    where: { id: mediaAssetId },
    select: { duration: true },
  });

  const assetDuration = toFiniteNumber(asset?.duration, null);
  const clampedIn = Math.max(0, inTimecode);
  const clampedOut = assetDuration == null ? outTimecode : Math.min(assetDuration, outTimecode);

  if (clampedOut <= clampedIn) {
    throw new Error("Invalid time range after clamping to asset duration.");
  }

  return {
    inTimecode: clampedIn,
    outTimecode: clampedOut,
  };
}

export async function createMediaBin(projectId: string, name: string, description?: string) {
  const prisma = getPrismaClient();
  const actorEmail = await getCurrentHomeNestActorEmail();
  await requireStudioMediaProjectAccess({
    prisma,
    actorEmail,
    projectId,
    action: "write",
  });

  await prisma.mediaBin.create({
    data: {
      projectId,
      name,
      description
    }
  });

  revalidatePath('/media');
}

export async function createMediaTag(label: string, description?: string) {
  const prisma = getPrismaClient();
  const actorEmail = await getCurrentHomeNestActorEmail();
  const homeNest = await ensureCurrentActorHomeNest(prisma);
  if (!homeNest) {
    throw new StudioMediaAssetAccessError(401, "Sign in to create a media tag.");
  }
  await requireStudioMediaProjectAccess({
    prisma,
    actorEmail,
    projectId: homeNest.id,
    action: "write",
  });
  const normalized = label.trim();
  if (!normalized) return null;
  const slug = slugify(normalized);

  return prisma.studioMediaTag.upsert({
    where: { slug },
    update: {
      label: normalized,
      description: description ?? null,
    },
    create: {
      slug,
      label: normalized,
      description,
      color: '#8c6b4a',
    },
  });
}

export async function listMediaTags() {
  const prisma = getPrismaClient();
  const actorEmail = await getCurrentHomeNestActorEmail();
  if (!actorEmail) {
    throw new StudioMediaAssetAccessError(401, "Sign in to list media tags.");
  }

  return prisma.studioMediaTag.findMany({
    orderBy: { label: 'asc' },
    select: {
      id: true,
      slug: true,
      label: true,
      color: true,
    },
  });
}

export async function createMediaClip(
  mediaAssetId: string,
  title: string,
  inTimecode: number,
  outTimecode: number,
  description?: string,
  options?: {
    mediaTagIds?: string[];
    mediaTagLabels?: string[];
    studioTagIds?: string[];
    studioTagSlugs?: string[];
  }
) {
  const prisma = getPrismaClient();
  const actorEmail = await getCurrentHomeNestActorEmail();
  const access = await requireStudioMediaAssetAccess({
    prisma,
    actorEmail,
    assetId: mediaAssetId,
    action: "write",
  });

  const normalizedTitle = title.trim();
  if (!normalizedTitle) {
    throw new Error('Clip title is required.');
  }

  const safeIn = toFiniteNumber(inTimecode);
  const safeOut = toFiniteNumber(outTimecode);

  if (safeIn == null || safeOut == null) {
    throw new Error('Clip in/out times must be valid numbers.');
  }

  const times = await reorderClipTimes(prisma, mediaAssetId, safeIn, safeOut);
  const mediaTags = await resolveMediaTagIds(
    prisma,
    options?.mediaTagIds ?? [],
    options?.mediaTagLabels ?? []
  );

  const studioTagPayload = dedupeStrings([
    ...(options?.studioTagIds ?? []),
    ...(options?.studioTagSlugs ?? []),
  ]).length > 0
    ? {
        connect: await resolveStudioTagRefs(
          prisma,
          access.writableProjectIds,
          options?.studioTagIds ?? [],
          options?.studioTagSlugs ?? [],
        ),
      }
    : undefined;

  await prisma.mediaClip.create({
    data: {
      mediaAsset: {
        connect: { id: mediaAssetId }
      },
      title: normalizedTitle,
      inTimecode: times.inTimecode,
      outTimecode: times.outTimecode,
      ...(typeof description === 'string' ? { description: description.trim() || null } : {}),
      ...(mediaTags.length
        ? {
            mediaTags: {
              connect: mediaTags,
            },
          }
        : {}),
      ...(studioTagPayload ? { tags: studioTagPayload } : {}),
    },
  });

  revalidatePath(`/media/${mediaAssetId}`);
}

export async function updateMediaClip(
  clipId: string,
  payload: {
    title?: string;
    description?: string | null;
    inTimecode?: number;
    outTimecode?: number;
    mediaTagIds?: string[];
    mediaTagLabels?: string[];
    studioTagIds?: string[];
    studioTagSlugs?: string[];
  }
) {
  const prisma = getPrismaClient();
  const actorEmail = await getCurrentHomeNestActorEmail();
  const { clip, access } = await requireStudioMediaClipWriteAccess({
    prisma,
    actorEmail,
    clipId,
  });

  const data: Record<string, unknown> = {};

  if (payload.title !== undefined) {
    const title = payload.title.trim();
    if (!title) {
      throw new Error('Clip title is required.');
    }
    data.title = title;
  }

  if (payload.description !== undefined) {
    data.description = payload.description === null || !payload.description.trim()
      ? null
      : payload.description.trim();
  }

  const hasMediaAsset = Boolean(clip.mediaAssetId);

  const normalizedIn = payload.inTimecode == null ? undefined : toFiniteNumber(payload.inTimecode);
  const normalizedOut = payload.outTimecode == null ? undefined : toFiniteNumber(payload.outTimecode);

  if (normalizedIn != null || normalizedOut != null) {
    const resolvedIn = normalizedIn ?? clip.inTimecode;
    const resolvedOut = normalizedOut ?? clip.outTimecode;
    const times = await reorderClipTimes(
      prisma,
      clip.mediaAssetId,
      resolvedIn,
      resolvedOut
    );

    data.inTimecode = times.inTimecode;
    data.outTimecode = times.outTimecode;
  }

  const mediaTags = await resolveMediaTagIds(
    prisma,
    payload.mediaTagIds ?? [],
    payload.mediaTagLabels ?? []
  );

  if (payload.mediaTagIds !== undefined || payload.mediaTagLabels !== undefined) {
    data.mediaTags = { set: mediaTags };
  }

  if (payload.studioTagIds !== undefined || payload.studioTagSlugs !== undefined) {
    data.tags = {
      set: await resolveStudioTagRefs(
        prisma,
        access.writableProjectIds,
        payload.studioTagIds ?? [],
        payload.studioTagSlugs ?? [],
      ),
    };
  }

  const updatedClip = await prisma.mediaClip.update({
    where: { id: clipId },
    data,
  });

  revalidatePath(`/media/${clip.mediaAssetId}`);
  revalidatePath('/media');

  return updatedClip;
}

export async function deleteMediaClip(clipId: string) {
  const prisma = getPrismaClient();
  const actorEmail = await getCurrentHomeNestActorEmail();
  const { clip } = await requireStudioMediaClipWriteAccess({
    prisma,
    actorEmail,
    clipId,
  });

  await prisma.mediaClip.delete({ where: { id: clipId } });
  revalidatePath(`/media/${clip.mediaAssetId}`);
  revalidatePath('/media');
}

export async function assignAssetToBin(assetId: string, mediaBinId: string | null) {
  const prisma = getPrismaClient();
  const actorEmail = await getCurrentHomeNestActorEmail();
  await requireStudioMediaAssetAccess({
    prisma,
    actorEmail,
    assetId,
    action: "write",
  });
  const bin = mediaBinId
    ? await prisma.mediaBin.findUnique({
        where: { id: mediaBinId },
        select: { projectId: true },
      })
    : null;
  if (bin) {
    await requireStudioMediaProjectAccess({
      prisma,
      actorEmail,
      projectId: bin.projectId,
      action: "write",
    });
  }

  await prisma.studioMediaAsset.update({
    where: { id: assetId },
    data: {
      mediaBinId,
      ...(bin?.projectId
        ? {
            isGlobal: false,
            projects: {
              connect: { id: bin.projectId },
            },
          }
        : {}),
    }
  });

  revalidatePath('/media');
}

export async function attachAssetToProject(assetId: string, projectId: string) {
  const prisma = getPrismaClient();
  const actorEmail = await getCurrentHomeNestActorEmail();
  await Promise.all([
    requireStudioMediaAssetAccess({
      prisma,
      actorEmail,
      assetId,
      action: "write",
    }),
    requireStudioMediaProjectAccess({
      prisma,
      actorEmail,
      projectId,
      action: "write",
    }),
  ]);

  await prisma.studioMediaAsset.update({
    where: { id: assetId },
    data: {
      isGlobal: false,
      projects: {
        connect: { id: projectId }
      }
    }
  });

  revalidatePath('/media');
}

export async function detachAssetFromProject(assetId: string, projectId: string) {
  const prisma = getPrismaClient();
  const actorEmail = await getCurrentHomeNestActorEmail();
  await Promise.all([
    requireStudioMediaAssetAccess({
      prisma,
      actorEmail,
      assetId,
      action: "write",
    }),
    requireStudioMediaProjectAccess({
      prisma,
      actorEmail,
      projectId,
      action: "write",
    }),
  ]);

  const after = await prisma.studioMediaAsset.update({
    where: { id: assetId },
    data: {
      projects: {
        disconnect: { id: projectId }
      }
    },
    include: {
      projects: {
        select: { id: true }
      },
      mediaBin: {
        select: { projectId: true },
      },
      assetAttachments: {
        select: { projectId: true },
      },
    },
  });

  const remainingScopeProjectIds = new Set([
    ...after.projects.map((project) => project.id),
    ...(after.mediaBin?.projectId ? [after.mediaBin.projectId] : []),
    ...after.assetAttachments.map((attachment) => attachment.projectId),
  ]);
  if (remainingScopeProjectIds.size === 0) {
    const homeNest = await ensureCurrentActorHomeNest(prisma);
    if (homeNest) {
      await requireStudioMediaProjectAccess({
        prisma,
        actorEmail,
        projectId: homeNest.id,
        action: "write",
      });
      await prisma.studioMediaAsset.update({
        where: { id: assetId },
        data: {
          isGlobal: false,
          projects: {
            connect: { id: homeNest.id },
          },
        }
      });
    } else throw new StudioMediaAssetAccessError(401, "Sign in to move this media record.");
  }

  revalidatePath('/media');
}

export async function seedDummyVideo(projectId?: string) {
  const prisma = getPrismaClient();
  const actorEmail = await getCurrentHomeNestActorEmail();
  const homeNest = projectId ? null : await ensureCurrentActorHomeNest(prisma);
  const attachmentProjectId = projectId || homeNest?.id || null;
  if (!attachmentProjectId) {
    throw new StudioMediaAssetAccessError(401, "Sign in to create a test media record.");
  }
  await requireStudioMediaProjectAccess({
    prisma,
    actorEmail,
    projectId: attachmentProjectId,
    action: "write",
  });

  const assetData = {
    filename: 'BigBuckBunny_Travel_Vlog.mp4',
    url: 'http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
    mimeType: 'video/mp4',
    duration: 596,
    resolution: '1920x1080',
    fps: 24,
    thumbnailUrl: 'https://storage.googleapis.com/gtv-videos-bucket/sample/images/BigBuckBunny.jpg',
    isGlobal: false,
    projects: { connect: { id: attachmentProjectId } },
  } as const;

  const asset = await prisma.studioMediaAsset.create({ data: assetData });

  const tags = [
    { slug: slugify('travel'), label: 'travel', description: 'Travel footage', kindHint: '#8c6b4a' },
    { slug: slugify('reference'), label: 'reference', description: 'Needs review', kindHint: '#a07c4f' },
  ];

  for (const tag of tags) {
    const mediaTag = await prisma.studioMediaTag.upsert({
      where: { slug: tag.slug },
      update: {},
      create: {
        slug: tag.slug,
        label: tag.label,
        description: tag.description,
        color: '#8c6b4a',
      },
    });

    await prisma.studioMediaAsset.update({
      where: { id: asset.id },
      data: { mediaTags: { connect: { id: mediaTag.id } } }
    });
  }

  revalidatePath('/media');
  return asset;
}

export async function syncAssetMediaTags(assetId: string, tagIds: string[], tagLabels: string[]) {
  const prisma = getPrismaClient();
  const actorEmail = await getCurrentHomeNestActorEmail();
  await requireStudioMediaAssetAccess({
    prisma,
    actorEmail,
    assetId,
    action: "write",
  });
  const mediaTags = await resolveMediaTagIds(prisma, tagIds, tagLabels);

  await prisma.studioMediaAsset.update({
    where: { id: assetId },
    data: {
      mediaTags: {
        set: mediaTags,
      },
    },
  });

  revalidatePath('/media');
}
