"use server";

import type { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { getPrismaClient } from "@/lib/prisma";
import { requireProjectAccessById } from "@/lib/server/access";
import { personalOrSharedCoachingGoalAccessWhere } from "@/lib/server/coaching-work-access";

async function requireStage(tx: Prisma.TransactionClient, projectId: string, stageId?: string | null) {
  if (!stageId) return;
  const stage = await tx.studioWorkflowStage.findFirst({ where: { id: stageId, projectId }, select: { id: true } });
  if (!stage) throw new Error("NOT_FOUND: Stage is not in this project");
}

function refresh(projectSlug: string) {
  revalidatePath(`/nests/${projectSlug}`);
  revalidatePath(`/nests/${projectSlug}/workspace`);
}

export async function createGoalFromMessage(projectId: string, threadId: string, messageId: string, title: string, stageId?: string) {
  const access = await requireProjectAccessById(projectId, "write");
  const normalizedTitle = title.trim();
  if (!normalizedTitle || normalizedTitle.length > 240) throw new Error("INVALID_INPUT: Give the goal a title of up to 240 characters");
  const prisma = getPrismaClient();
  const goal = await prisma.$transaction(async (tx) => {
    // This action serves the Nest's shared board, not private client/session
    // threads, which have their own narrower membership boundary.
    const message = await tx.studioNestChatMessage.findFirst({
      where: { id: messageId, projectId, threadId, thread: { projectId, key: "default" } },
      select: { id: true, linkedGoalId: true },
    });
    if (!message) throw new Error("NOT_FOUND: Message is not in this Nest conversation");
    await requireStage(tx, projectId, stageId);
    if (message.linkedGoalId) {
      const existing = await tx.goal.findFirst({ where: { id: message.linkedGoalId, projectId, ownerUserId: access.user.id } });
      if (existing && existing.title === normalizedTitle && existing.stageId === (stageId || null)) return existing;
      throw new Error("CONFLICT: This message already has a linked goal");
    }
    const created = await tx.goal.create({ data: {
      projectId, ownerUserId: access.user.id, title: normalizedTitle, stageId: stageId || null,
      sourceJson: { origin: "HybridStream", threadId, messageId },
    } });
    const linked = await tx.studioNestChatMessage.updateMany({
      where: { id: messageId, projectId, threadId, linkedGoalId: null },
      data: { linkedGoalId: created.id },
    });
    if (linked.count !== 1) throw new Error("CONFLICT: This message already has a linked goal");
    return created;
  });
  refresh(access.project.slug);
  return goal;
}

export async function updateGoalStage(projectId: string, goalId: string, newStageId: string | null) {
  const access = await requireProjectAccessById(projectId, "write");
  const prisma = getPrismaClient();
  const goal = await prisma.$transaction(async (tx) => {
    await requireStage(tx, projectId, newStageId);
    return tx.goal.update({
      where: { id: goalId, projectId, OR: personalOrSharedCoachingGoalAccessWhere(access.user.id, "write") },
      data: { stageId: newStageId }, include: { stage: true },
    });
  });
  refresh(access.project.slug);
  return goal;
}

export async function getGoalData(projectId: string, goalId: string) {
  const access = await requireProjectAccessById(projectId, "read");
  return getPrismaClient().goal.findFirst({
    where: { id: goalId, projectId, OR: personalOrSharedCoachingGoalAccessWhere(access.user.id) },
    include: { stage: true },
  });
}

export async function deleteGoalStage(projectId: string, stageId: string) {
  const access = await requireProjectAccessById(projectId, "write");
  const prisma = getPrismaClient();
  await prisma.$transaction(async (tx) => {
    await requireStage(tx, projectId, stageId);
    await tx.goal.updateMany({ where: { projectId, stageId }, data: { stageId: null } });
    await tx.studioWorkflowStage.delete({ where: { id: stageId, projectId } });
  });
  refresh(access.project.slug);
  return true;
}
