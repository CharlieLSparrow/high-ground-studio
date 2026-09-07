"use server";

import { getPrismaClient } from "@/lib/prisma";
import { requireProjectAccessById } from "@/lib/server/access";
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
  await requireProjectAccessById(projectId, "write");
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
  await requireProjectAccessById(projectId, "write");
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
  await requireProjectAccessById(projectId, "write");
  const prisma = getPrismaClient();

  await prisma.$transaction(async (tx) => {
    if (!await tx.studioWorkflowStage.findFirst({ where: { id: stageId, projectId }, select: { id: true } })) {
      throw new Error("NOT_FOUND: Stage is not in this project");
    }
    if (fallbackStageId === stageId) throw new Error("INVALID_INPUT: Choose a different fallback stage");
    if (fallbackStageId && !await tx.studioWorkflowStage.findFirst({ where: { id: fallbackStageId, projectId }, select: { id: true } })) {
      throw new Error("NOT_FOUND: Fallback stage is not in this project");
    }
    await tx.goal.updateMany({ where: { stageId, projectId }, data: { stageId: fallbackStageId } });
    await tx.studioWorkflowStage.delete({ where: { id: stageId, projectId } });
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
  await requireProjectAccessById(projectId, "write");
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
  await requireProjectAccessById(projectId, "write");
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
