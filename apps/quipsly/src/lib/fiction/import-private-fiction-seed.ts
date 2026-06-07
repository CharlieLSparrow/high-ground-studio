import "server-only";

import { StoryEntityType, type PrismaClient } from "@prisma/client";
import { getPrismaClient } from "../prisma";
import {
  canManagePrivateFictionNest,
  normalizePrivateFictionEmail,
  PRIVATE_FICTION_PROJECT_SLUG,
} from "./private-fiction-access";
import { readPrivateFictionJson } from "./private-fiction-seeds";

type PrivateFictionImportInput = {
  actorEmail?: string | null;
  seriesSlug: string;
  issueSlug: string;
  prisma?: PrismaClient;
};

type StoryboardSeedFrame = {
  sortOrder: number;
  frameNumber: string;
  action: string;
  dialogue?: string | null;
  cameraInfo?: string | null;
  shotSize?: string | null;
  lens?: string | null;
  cameraMovement?: string | null;
  estimatedDuration?: number | null;
  vfxNotes?: string | null;
  imageUrl?: string | null;
};

const STORY_ENTITY_TYPES = new Set(Object.values(StoryEntityType));

function ownerWorkspaceSlug(ownerEmail: string) {
  return `${ownerEmail.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-workspace`;
}

function isStoryEntityType(value: string): value is StoryEntityType {
  return STORY_ENTITY_TYPES.has(value as StoryEntityType);
}

export async function importPrivateFictionSeedToQuipsly({
  actorEmail,
  seriesSlug,
  issueSlug,
  prisma = getPrismaClient(),
}: PrivateFictionImportInput) {
  if (!(await canManagePrivateFictionNest(actorEmail))) {
    throw new Error("PRIVATE_FICTION_SEED_NOT_FOUND");
  }

  const [storyboardSeed, storyBibleSeed] = await Promise.all([
    readPrivateFictionJson<any>(seriesSlug, issueSlug, "storyboard"),
    readPrivateFictionJson<any>(seriesSlug, issueSlug, "storyBible"),
  ]);

  const ownerEmail = storyboardSeed.access?.ownerEmail || actorEmail;
  if (!ownerEmail) {
    throw new Error("PRIVATE_FICTION_OWNER_EMAIL_REQUIRED");
  }

  const normalizedOwnerEmail = normalizePrivateFictionEmail(ownerEmail);
  const workspaceSlug = ownerWorkspaceSlug(ownerEmail);
  const projectSlug = PRIVATE_FICTION_PROJECT_SLUG;

  const workspace = await prisma.studioWorkspace.upsert({
    where: { slug: workspaceSlug },
    update: {
      name: "Charlie L. Sparrow - Fiction Nest",
      ownerLabel: ownerEmail,
      isPrivate: true,
    },
    create: {
      slug: workspaceSlug,
      name: "Charlie L. Sparrow - Fiction Nest",
      ownerLabel: ownerEmail,
      isPrivate: true,
    },
  });

  const project = await prisma.studioProject.upsert({
    where: {
      workspaceId_slug: {
        workspaceId: workspace.id,
        slug: projectSlug,
      },
    },
    update: {
      name: "My Heart Is a Junkyard Starship",
      description: "Private comic and fiction development nest.",
      sourceLabel: "nest-kind:fiction",
      isPrivate: true,
    },
    create: {
      workspaceId: workspace.id,
      slug: projectSlug,
      name: "My Heart Is a Junkyard Starship",
      description: "Private comic and fiction development nest.",
      sourceLabel: "nest-kind:fiction",
      isPrivate: true,
    },
  });

  await prisma.studioProjectAccessGrant.upsert({
    where: {
      projectId_email: {
        projectId: project.id,
        email: normalizedOwnerEmail,
      },
    },
    update: {
      role: "OWNER",
      status: "ACTIVE",
      note: "Private fiction Nest owner",
    },
    create: {
      projectId: project.id,
      email: normalizedOwnerEmail,
      role: "OWNER",
      status: "ACTIVE",
      createdByEmail: normalizedOwnerEmail,
      note: "Private fiction Nest owner",
    },
  });

  let storyboard = await prisma.studioStoryboard.findFirst({
    where: {
      projectId: project.id,
      title: storyboardSeed.storyboard.title,
    },
  });

  if (!storyboard) {
    storyboard = await prisma.studioStoryboard.create({
      data: {
        projectId: project.id,
        title: storyboardSeed.storyboard.title,
        description: storyboardSeed.storyboard.description,
        aspectRatio: storyboardSeed.storyboard.aspectRatio || "9:16",
      },
    });
  } else {
    storyboard = await prisma.studioStoryboard.update({
      where: { id: storyboard.id },
      data: {
        description: storyboardSeed.storyboard.description,
        aspectRatio: storyboardSeed.storyboard.aspectRatio || storyboard.aspectRatio,
      },
    });
  }

  const existingFrames = await prisma.studioStoryboardFrame.findMany({
    where: { storyboardId: storyboard.id },
  });
  const existingByFrameNumber = new Map(
    existingFrames.map((frame) => [frame.frameNumber, frame]),
  );

  let createdFrames = 0;
  let updatedFrames = 0;
  let preservedImages = 0;

  for (const seedFrame of storyboardSeed.frames as StoryboardSeedFrame[]) {
    const existingFrame = existingByFrameNumber.get(seedFrame.frameNumber);
    const imageUrl = existingFrame?.imageUrl || seedFrame.imageUrl || null;

    if (existingFrame?.imageUrl) {
      preservedImages++;
    }

    const frameData = {
      sortOrder: seedFrame.sortOrder,
      action: seedFrame.action,
      dialogue: seedFrame.dialogue || null,
      cameraInfo: seedFrame.cameraInfo || "Static",
      shotSize: seedFrame.shotSize || "Medium Shot",
      lens: seedFrame.lens || null,
      cameraMovement: seedFrame.cameraMovement || "Static",
      estimatedDuration: seedFrame.estimatedDuration || null,
      vfxNotes: seedFrame.vfxNotes || null,
      imageUrl,
    };

    if (existingFrame) {
      await prisma.studioStoryboardFrame.update({
        where: { id: existingFrame.id },
        data: frameData,
      });
      updatedFrames++;
    } else {
      await prisma.studioStoryboardFrame.create({
        data: {
          storyboardId: storyboard.id,
          frameNumber: seedFrame.frameNumber,
          ...frameData,
        },
      });
      createdFrames++;
    }
  }

  let createdEntities = 0;
  let updatedEntities = 0;
  let skippedEntities = 0;

  for (const entity of storyBibleSeed.entities || []) {
    if (!isStoryEntityType(entity.type)) {
      skippedEntities++;
      continue;
    }

    const existingEntity = await prisma.storyEntity.findFirst({
      where: {
        projectId: project.id,
        type: entity.type,
        name: entity.name,
      },
    });

    const entityData = {
      aliases: Array.isArray(entity.aliases) ? entity.aliases : [],
      attributes: entity.attributes || {},
    };

    if (existingEntity) {
      await prisma.storyEntity.update({
        where: { id: existingEntity.id },
        data: entityData,
      });
      updatedEntities++;
    } else {
      await prisma.storyEntity.create({
        data: {
          projectId: project.id,
          type: entity.type,
          name: entity.name,
          ...entityData,
        },
      });
      createdEntities++;
    }
  }

  return {
    workspaceId: workspace.id,
    workspaceSlug: workspace.slug,
    projectId: project.id,
    projectSlug: project.slug,
    storyboardId: storyboard.id,
    storyboardTitle: storyboard.title,
    createdFrames,
    updatedFrames,
    preservedImages,
    createdEntities,
    updatedEntities,
    skippedEntities,
    totalFrames: storyboardSeed.frames?.length || 0,
    totalEntities: storyBibleSeed.entities?.length || 0,
  };
}
