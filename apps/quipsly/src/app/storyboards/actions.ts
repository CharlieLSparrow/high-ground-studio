"use server";

import { getPrismaClient } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export async function createProject(formData: FormData) {
  const title = formData.get("title") as string;
  if (!title) return { error: "Title is required" };

  const prisma = getPrismaClient();
  const user = await prisma.user.findFirst();
  if (!user) return { error: "No user found" };

  try {
    const project = await prisma.project.create({
      data: {
        userId: user.id,
        title,
        description: formData.get("description") as string | null,
      }
    });
    revalidatePath("/storyboards/builder");
    return { success: true, project };
  } catch (error: any) {
    return { error: error.message };
  }
}

export async function createScene(projectId: string, sceneNumber: string) {
  const prisma = getPrismaClient();
  try {
    const scene = await prisma.scene.create({
      data: {
        projectId,
        sceneNumber,
        title: `Scene ${sceneNumber}`,
      }
    });
    revalidatePath("/storyboards/builder");
    return { success: true, scene };
  } catch (error: any) {
    return { error: error.message };
  }
}

export async function createShot(sceneId: string, shotNumber: string) {
  const prisma = getPrismaClient();
  try {
    const shot = await prisma.storyboardShot.create({
      data: {
        sceneId,
        shotNumber,
        action: "Describe the action happening in this shot...",
        cameraInfo: "Wide Angle",
      }
    });
    revalidatePath("/storyboards/builder");
    return { success: true, shot };
  } catch (error: any) {
    return { error: error.message };
  }
}

export async function updateShot(shotId: string, data: { action?: string; dialogue?: string; cameraInfo?: string }) {
  const prisma = getPrismaClient();
  try {
    const shot = await prisma.storyboardShot.update({
      where: { id: shotId },
      data
    });
    revalidatePath("/storyboards/builder");
    return { success: true, shot };
  } catch (error: any) {
    return { error: error.message };
  }
}
