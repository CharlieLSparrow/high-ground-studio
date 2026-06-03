"use server";

import { getPrismaClient } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

/**
 * Ensures there is at least one User, Project, and Scene to work with
 * for our Storyboard prototype.
 */
async function ensureDefaultContext() {
  const prisma = await getPrismaClient();

  // Get or create a dummy user
  let user = await prisma.user.findFirst();
  if (!user) {
    user = await prisma.user.create({
      data: {
        primaryEmail: "storyboard-prototype@quipsly.com",
        name: "Storyboard Prototype User",
      },
    });
  }

  // Get or create a project
  let project = await prisma.project.findFirst({
    where: { userId: user.id },
  });

  if (!project) {
    project = await prisma.project.create({
      data: {
        title: "Untitled Storyboard",
        userId: user.id,
      },
    });
  }

  // Get or create a scene
  let scene = await prisma.scene.findFirst({
    where: { projectId: project.id },
  });

  if (!scene) {
    scene = await prisma.scene.create({
      data: {
        projectId: project.id,
        sceneNumber: "1",
        title: "Opening Sequence",
      },
    });
  }

  return { user, project, scene };
}

export async function getStoryboardShots() {
  const prisma = await getPrismaClient();
  const { scene } = await ensureDefaultContext();

  const shots = await prisma.storyboardShot.findMany({
    where: { sceneId: scene.id },
    orderBy: { sortOrder: 'asc' },
  });

  // Map to the client shape
  return shots.map((s) => ({
    id: s.id,
    sceneNumber: scene.sceneNumber,
    shotNumber: s.shotNumber,
    image: s.imageUrl ?? undefined,
    action: s.action,
    dialogue: s.dialogue ?? undefined,
    cameraInfo: s.cameraInfo,
    vfxNotes: s.vfxNotes ?? undefined,
  }));
}

export async function addStoryboardShot(data: { action: string; cameraInfo?: string; dialogue?: string; image?: string }) {
  const prisma = await getPrismaClient();
  const { scene } = await ensureDefaultContext();

  const count = await prisma.storyboardShot.count({
    where: { sceneId: scene.id },
  });

  const shot = await prisma.storyboardShot.create({
    data: {
      sceneId: scene.id,
      sortOrder: count, // Append to the end
      shotNumber: `${count + 1}`,
      action: data.action,
      cameraInfo: data.cameraInfo || "SUGGESTED CAMERA",
      dialogue: data.dialogue,
      imageUrl: data.image,
    },
  });

  revalidatePath('/storyboard');
  
  return {
    id: shot.id,
    sceneNumber: scene.sceneNumber,
    shotNumber: shot.shotNumber,
    image: shot.imageUrl ?? undefined,
    action: shot.action,
    dialogue: shot.dialogue ?? undefined,
    cameraInfo: shot.cameraInfo,
    vfxNotes: shot.vfxNotes ?? undefined,
  };
}

export async function updateStoryboardShot(id: string, data: { image?: string }) {
  const prisma = await getPrismaClient();
  
  await prisma.storyboardShot.update({
    where: { id },
    data: {
      imageUrl: data.image,
    },
  });

  revalidatePath('/storyboard');
}

export async function reorderStoryboardShots(shotIds: string[]) {
  const prisma = await getPrismaClient();
  
  // This is a naive approach: doing N updates. 
  // In a high traffic app you might use a transaction or bulk update.
  const updates = shotIds.map((id, index) => 
    prisma.storyboardShot.update({
      where: { id },
      data: { sortOrder: index },
    })
  );

  await prisma.$transaction(updates);
  revalidatePath('/storyboard');
}
