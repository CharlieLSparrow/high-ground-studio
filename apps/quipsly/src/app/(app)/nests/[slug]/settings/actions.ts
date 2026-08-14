"use server";

import { getPrismaClient } from "@/lib/prisma";
import { requireProjectAccess } from "@/lib/studio-authz";
import { revalidatePath } from "next/cache";
import { StudioTagCategory, StudioTagUICategory } from "@prisma/client";

function sluggify(text: string) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export async function createWorkflowStageAction(
  projectId: string,
  name: string,
  hexColor: string,
  order: number
) {
  await requireProjectAccess(projectId, "write");
  const prisma = getPrismaClient();

  const stage = await prisma.studioWorkflowStage.create({
    data: {
      projectId,
      name,
      hexColor,
      order,
    },
  });

  revalidatePath(`/app/nests/[slug]/settings`, "page");
  revalidatePath(`/app/nests/[slug]/kanban`, "page");
  return { ok: true, stage };
}

export async function updateWorkflowStageAction(
  projectId: string,
  stageId: string,
  name: string,
  hexColor: string,
  order: number
) {
  await requireProjectAccess(projectId, "write");
  const prisma = getPrismaClient();

  const stage = await prisma.studioWorkflowStage.update({
    where: { id: stageId, projectId },
    data: { name, hexColor, order },
  });

  revalidatePath(`/app/nests/[slug]/settings`, "page");
  revalidatePath(`/app/nests/[slug]/kanban`, "page");
  return { ok: true, stage };
}

export async function deleteWorkflowStageAction(
  projectId: string,
  stageId: string,
  fallbackStageId: string | null = null
) {
  await requireProjectAccess(projectId, "write");
  const prisma = getPrismaClient();

  // If a fallback stage is provided, migrate existing goals to it
  if (fallbackStageId) {
    await prisma.goal.updateMany({
      where: { stageId, projectId },
      data: { stageId: fallbackStageId },
    });
  }

  await prisma.studioWorkflowStage.delete({
    where: { id: stageId, projectId },
  });

  revalidatePath(`/app/nests/[slug]/settings`, "page");
  revalidatePath(`/app/nests/[slug]/kanban`, "page");
  return { ok: true };
}

export async function createTagAction(
  projectId: string,
  label: string,
  hexColor: string,
  category: StudioTagCategory,
  uiCategory?: StudioTagUICategory
) {
  await requireProjectAccess(projectId, "write");
  const prisma = getPrismaClient();

  const tag = await prisma.studioTag.create({
    data: {
      projectId,
      slug: sluggify(label),
      label,
      hexColor,
      category,
      uiCategory,
    },
  });

  revalidatePath(`/app/nests/[slug]/settings`, "page");
  return { ok: true, tag };
}

export async function deleteTagAction(
  projectId: string,
  tagId: string
) {
  await requireProjectAccess(projectId, "write");
  const prisma = getPrismaClient();

  await prisma.studioTag.update({
    where: { id: tagId, projectId },
    data: {
      isActive: false,
      archivedAt: new Date(),
    }
  });

  revalidatePath(`/app/nests/[slug]/settings`, "page");
  return { ok: true };
}
