"use server";

import { getPrismaClient } from "@/lib/prisma";
import { requireProjectAccess } from "../../lib/studio-authz";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";

/**
 * Transforms a chat message into a tracked Kanban Goal.
 * This powers the Bi-Directional HybridStream sync.
 */
export async function createGoalFromMessage(
  projectId: string,
  threadId: string,
  messageId: string,
  title: string,
  stageId?: string
) {
  // Ensure the user has write access to this project
  await requireProjectAccess(projectId, "write");

  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("UNAUTHORIZED: Sign in before creating goals.");
  }

  const prisma = getPrismaClient();

  // 1. Create the Goal
  const goal = await prisma.goal.create({
    data: {
      projectId,
      ownerUserId: session.user.id,
      title,
      stageId: stageId || null,
      sourceJson: {
        origin: "HybridStream",
        threadId,
        messageId,
      },
    },
  });

  // 2. Link the original Chat Message to this Goal
  await prisma.studioNestChatMessage.update({
    where: { id: messageId },
    data: { linkedGoalId: goal.id },
  });

  // 3. Trigger UI cache invalidation so Next.js optimistic UI fetches the new data
  revalidatePath(`/nests/${projectId}`);
  revalidatePath(`/nests/${projectId}/chat`);
  
  return goal;
}

/**
 * Moves a Goal to a different Kanban stage.
 * Used primarily by the drag-and-drop virtualized board.
 */
export async function updateGoalStage(
  projectId: string,
  goalId: string,
  newStageId: string | null
) {
  // Ensure the user has write access to this project
  await requireProjectAccess(projectId, "write");

  const prisma = getPrismaClient();

  // Update the Goal's stage
  const updatedGoal = await prisma.goal.update({
    where: { id: goalId, projectId }, // projectId ensures security scoping
    data: { stageId: newStageId },
    include: {
      stage: true // include the new stage data (hexColor) for the frontend
    }
  });

  // Trigger UI cache invalidation so Next.js optimistic UI fetches the new data.
  // This causes any Tiptap React nodes listening to this data to re-render with the new stage color!
  revalidatePath(`/nests/${projectId}`);
  revalidatePath(`/nests/${projectId}/chat`);

  return updatedGoal;
}

/**
 * Fetches the live data for a Goal to hydrate the TaskNode component.
 */
export async function getGoalData(projectId: string, goalId: string) {
  await requireProjectAccess(projectId, "read");
  const prisma = getPrismaClient();
  return prisma.goal.findUnique({
    where: { id: goalId },
    include: { stage: true }
  });
}

/**
 * Deletes a Kanban stage. Because of onDelete: SetNull in Prisma (if configured)
 * or via an explicit update here, all Goals in this stage fall back to Uncategorized.
 */
export async function deleteGoalStage(projectId: string, stageId: string) {
  await requireProjectAccess(projectId, "write");
  const prisma = getPrismaClient();

  // First gracefully fallback any Goals that were in this stage
  await prisma.goal.updateMany({
    where: { projectId, stageId },
    data: { stageId: null },
  });

  // Then delete the stage itself
  await prisma.studioWorkflowStage.delete({
    where: { id: stageId, projectId },
  });

  revalidatePath(`/nests/${projectId}`);
  return true;
}
