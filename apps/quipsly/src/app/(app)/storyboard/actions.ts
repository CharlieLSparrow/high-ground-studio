"use server";

import { getPrismaClient } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export type ActionResponse<T = any> = {
  success: boolean;
  data?: T;
  error?: string;
};

/**
 * Retrieves the storyboard for a given project, creating a default one if it doesn't exist.
 * This guarantees that the UI always has a valid sequence to render.
 * 
 * @param projectId - The unique identifier of the project.
 * @returns The storyboard including its ordered frames.
 */
export async function fetchStoryboardByProjectId(projectId: string) {
  const prisma = getPrismaClient();
  let storyboard = await prisma.studioStoryboard.findFirst({
    where: { projectId },
    include: {
      frames: {
        orderBy: { sortOrder: "asc" },
      },
    },
  });

  if (!storyboard) {
    // Auto-create a default storyboard if one doesn't exist for this project
    storyboard = await (prisma as any).studioStoryboard.create({
      data: {
        projectId,
        title: "Main Sequence",
        aspectRatio: "16:9",
      },
      include: {
        frames: true,
      },
    });
  }

  return storyboard;
}

/**
 * Appends a new storyboard frame to the sequence. 
 * Handles string truncation automatically to prevent database overflow errors.
 * 
 * @param storyboardId - The ID of the storyboard sequence.
 * @param data - The frame contents (action, dialogue, camera info, shot size).
 * @returns An ActionResponse indicating success and the newly created frame data.
 */
export async function addStoryboardFrame(
  storyboardId: string, 
  data: { action: string; dialogue?: string; cameraInfo: string; shotSize?: string; frameNumber: string }
): Promise<ActionResponse> {
  try {
    if (!storyboardId || typeof storyboardId !== 'string') {
      return { success: false, error: "Invalid storyboard ID" };
    }
    
    // Basic validation
    const actionText = data.action ? data.action.substring(0, 1000) : "";
    
    const prisma = getPrismaClient();
    const currentFrames = await prisma.studioStoryboardFrame.count({
      where: { storyboardId },
    });

    const frame = await (prisma as any).studioStoryboardFrame.create({
      data: {
        storyboardId,
        sortOrder: currentFrames,
        frameNumber: data.frameNumber || `F${currentFrames + 1}`,
        action: actionText,
        dialogue: data.dialogue ? data.dialogue.substring(0, 500) : null,
        cameraInfo: data.cameraInfo ? data.cameraInfo.substring(0, 255) : "Static",
        shotSize: data.shotSize || "Medium Shot",
      },
    });

    revalidatePath("/storyboard");
    return { success: true, data: frame };
  } catch (error: any) {
    console.error("[addStoryboardFrame Error]", error);
    return { success: false, error: "Failed to add frame. Please try again." };
  }
}

/**
 * Updates an existing storyboard frame. 
 * Supports partial updates (only provided fields are modified).
 * 
 * @param frameId - The unique identifier of the frame to update.
 * @param data - The partial fields to update (action, dialogue, lens, VFX notes, etc.).
 * @returns An ActionResponse indicating success and the updated frame data.
 */
export async function updateStoryboardFrame(
  frameId: string, 
  data: { action?: string; dialogue?: string; cameraInfo?: string; shotSize?: string; lens?: string; estimatedDuration?: number; vfxNotes?: string }
): Promise<ActionResponse> {
  try {
    if (!frameId) return { success: false, error: "Invalid frame ID" };

    const prisma = getPrismaClient();
    const frame = await (prisma as any).studioStoryboardFrame.update({
      where: { id: frameId },
      data: {
        action: data.action !== undefined ? data.action.substring(0, 1000) : undefined,
        dialogue: data.dialogue !== undefined ? (data.dialogue ? data.dialogue.substring(0, 500) : null) : undefined,
        cameraInfo: data.cameraInfo !== undefined ? data.cameraInfo.substring(0, 255) : undefined,
        shotSize: data.shotSize,
        lens: data.lens !== undefined ? data.lens.substring(0, 100) : undefined,
        estimatedDuration: data.estimatedDuration,
        vfxNotes: data.vfxNotes !== undefined ? (data.vfxNotes ? data.vfxNotes.substring(0, 1000) : null) : undefined,
      },
    });

    revalidatePath("/storyboard");
    return { success: true, data: frame };
  } catch (error: any) {
    console.error("[updateStoryboardFrame Error]", error);
    return { success: false, error: "Failed to update frame." };
  }
}

/**
 * Deletes a frame from the sequence.
 * 
 * @param frameId - The unique identifier of the frame to delete.
 * @returns An ActionResponse indicating success or failure.
 */
export async function deleteStoryboardFrame(frameId: string): Promise<ActionResponse> {
  try {
    if (!frameId) return { success: false, error: "Invalid frame ID" };

    const prisma = getPrismaClient();
    await prisma.studioStoryboardFrame.delete({
      where: { id: frameId },
    });

    revalidatePath("/storyboard");
    return { success: true };
  } catch (error: any) {
    console.error("[deleteStoryboardFrame Error]", error);
    return { success: false, error: "Failed to delete frame." };
  }
}

/**
 * Reorders the frames within a storyboard sequence to match a new array of IDs.
 * Applies sequential updates to prevent database deadlocks.
 * 
 * @param storyboardId - The ID of the storyboard sequence.
 * @param frameIds - An array of frame IDs in their new sequential order.
 * @returns An ActionResponse indicating success or failure.
 */
export async function reorderFrames(storyboardId: string, frameIds: string[]): Promise<ActionResponse> {
  try {
    if (!storyboardId || !frameIds || !Array.isArray(frameIds)) {
      return { success: false, error: "Invalid reorder parameters" };
    }

    const prisma = getPrismaClient();
    
    // Sequential updates are safest to prevent deadlocks in this context
    for (let i = 0; i < frameIds.length; i++) {
      await (prisma as any).studioStoryboardFrame.update({
        where: { id: frameIds[i] },
        data: { sortOrder: i },
      });
    }

    revalidatePath("/storyboard");
    return { success: true };
  } catch (error: any) {
    console.error("[reorderFrames Error]", error);
    return { success: false, error: "Failed to reorder frames." };
  }
}

/**
 * Quipsly Co-Pilot Action: Simulates the Artist Agent by taking prose manuscript text
 * and generating a structured, cinematic shot list.
 * 
 * @param manuscriptText - The prose text to convert into storyboard frames.
 * @returns An ActionResponse containing an array of generated shots.
 */
export async function simulateArtistAgent(manuscriptText: string): Promise<ActionResponse<Array<{ action: string; cameraInfo: string; shotSize: string; dialogue: string }>>> {
  try {
    if (!manuscriptText || typeof manuscriptText !== 'string' || manuscriptText.trim() === "") {
      return { success: false, error: "Please provide a valid prompt." };
    }

    await new Promise(resolve => setTimeout(resolve, 1500)); // Simulate AI latency

    let result = [];
    if (manuscriptText.toLowerCase().includes("explosion") || manuscriptText.toLowerCase().includes("fight")) {
      result = [
        { shotSize: "Wide Shot", cameraInfo: "Handheld, shaky", action: "The building detonates, debris flying towards the camera.", dialogue: "" },
        { shotSize: "Close Up", cameraInfo: "Fast whip pan", action: "Hero reacts in shock, shielding their eyes.", dialogue: "Get down!" },
        { shotSize: "Medium Shot", cameraInfo: "Low angle, tracking", action: "Hero runs through the smoke cloud.", dialogue: "" },
      ];
    } else {
      result = [
        { shotSize: "Establishing Shot", cameraInfo: "Drone, slow push in", action: "A quiet morning in the valley. Mist hangs over the trees.", dialogue: "" },
        { shotSize: "Medium Shot", cameraInfo: "Static, on sticks", action: "Protagonist is sitting at a wooden desk, writing intently.", dialogue: "(V.O) It started on a Tuesday." },
        { shotSize: "Extreme Close Up", cameraInfo: "Macro, shallow focus", action: "The pen scratches across the parchment.", dialogue: "" },
        { shotSize: "Over the Shoulder", cameraInfo: "Slow dolly right", action: "We see the protagonist's face as they look up, startled by a sound.", dialogue: "Who's there?" },
      ];
    }

    return { success: true, data: result };
  } catch (error: any) {
    return { success: false, error: "AI simulation failed. Please try again." };
  }
}
