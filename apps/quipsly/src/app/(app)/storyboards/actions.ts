"use server";

import { getPrismaClient } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { GoogleGenAI } from "@google/genai";
import { Storage } from "@google-cloud/storage";
import { createStudioProject } from "@/lib/studio/project-registry";

const storage = new Storage();
const bucketName = process.env.STORYBOARD_GCS_BUCKET || process.env.GCS_BUCKET || "high-ground-odyssey-media";
const shouldMakeStoryboardImagesPublic = process.env.STORYBOARD_MAKE_PUBLIC === "1";

export async function createProject(formData: FormData) {
  const title = formData.get("title") as string;
  if (!title) return { error: "Title is required" };
  const prisma = getPrismaClient();

  try {
    const { project } = await createStudioProject(prisma, {
      name: title,
      documentTitle: `${title} Storyboard Notes`,
    });
    const description = formData.get("description") as string | null;
    if (description) {
      await prisma.studioProject.update({
        where: { id: project.id },
        data: { description },
      });
    }
    revalidatePath("/storyboards/builder");
    return { success: true, project };
  } catch (error: any) {
    return { error: error.message };
  }
}

export async function createStoryboard(projectId: string, title: string) {
  const prisma = getPrismaClient();
  try {
    const storyboard = await (prisma as any).studioStoryboard.create({
      data: {
        projectId,
        title,
      }
    });
    revalidatePath("/storyboards/builder");
    return { success: true, storyboard };
  } catch (error: any) {
    return { error: error.message };
  }
}

export async function updateStoryboard(
  storyboardId: string,
  data: {
    title?: string;
    aspectRatio?: string;
  }
) {
  const prisma = await getPrismaClient();
  const storyboard = await (prisma as any).studioStoryboard.update({
    where: { id: storyboardId },
    data,
  });
  
  revalidatePath('/storyboards/builder');
  return { success: true, storyboard };
}

export async function createStoryboardFrame(storyboardId: string, frameNumber: string) {
  const prisma = getPrismaClient();
  try {
    const frame = await (prisma as any).studioStoryboardFrame.create({
      data: {
        storyboardId,
        frameNumber,
        action: "Describe the action happening in this shot...",
        cameraInfo: "Wide Angle",
      }
    });
    revalidatePath("/storyboards/builder");
    return { success: true, frame };
  } catch (error: any) {
    return { error: error.message };
  }
}

export async function updateStoryboardFrame(
  frameId: string,
  data: {
    action?: string;
    dialogue?: string;
    cameraInfo?: string;
    imageUrl?: string;
    shotSize?: string;
    lens?: string;
    cameraMovement?: string;
    estimatedDuration?: number;
    vfxNotes?: string;
    mediaClipId?: string | null;
  }
) {
  const prisma = await getPrismaClient();
  
  const frame = await (prisma as any).studioStoryboardFrame.update({
    where: { id: frameId },
    data,
  });

  revalidatePath('/storyboards/builder');
  return { success: true, frame };
}

export async function generateFrameImage(frameId: string) {
  const prisma = getPrismaClient();
  const frame = await (prisma as any).studioStoryboardFrame.findUnique({
    where: { id: frameId },
    include: { storyboard: true }
  });

  if (!frame) return { error: "Frame not found" };

  const prompt = `A cinematic storyboard panel. 
Sequence: ${frame.storyboard.title || 'Unknown'}.
Camera Angle/Shot Type: ${frame.cameraInfo || 'Standard Wide'}.
Action: ${frame.action || 'Characters in a scene'}.
Dialogue context: ${frame.dialogue || 'None'}.
Style: Cinematic black and white rough storyboard pencil sketch, high contrast, dynamic composition, dramatic lighting, movie pre-production art style.`;

  try {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY });
    const response = await ai.models.generateImages({
      model: 'imagen-3.0-generate-002',
      prompt: prompt,
      config: { 
        numberOfImages: 1, 
        outputMimeType: 'image/jpeg',
        aspectRatio: '16:9'
      }
    });

    if (!response.generatedImages || response.generatedImages.length === 0) {
      throw new Error("No images generated.");
    }
    
    const base64Image = response.generatedImages[0].image?.imageBytes;
    if (!base64Image) {
      throw new Error("No image bytes returned.");
    }
    
    // Upload to GCS
    const bucket = storage.bucket(bucketName);
    const fileName = `storyboards/frames/frame-${frameId}-${Date.now()}.jpg`;
    const file = bucket.file(fileName);
    
    const buffer = Buffer.from(base64Image, 'base64');
    await file.save(buffer, {
      contentType: 'image/jpeg',
      metadata: {
        cacheControl: 'public, max-age=31536000',
      }
    });
    
    if (shouldMakeStoryboardImagesPublic) {
      await file.makePublic();
    }
    
    const publicBaseUrl = process.env.STORYBOARD_PUBLIC_BASE_URL || `https://storage.googleapis.com/${bucketName}`;
    const imageUrl = `${publicBaseUrl.replace(/\/$/, "")}/${fileName}`;
    
    const updatedFrame = await (prisma as any).studioStoryboardFrame.update({
      where: { id: frameId },
      data: { imageUrl }
    });
    
    revalidatePath("/storyboards/builder");
    return { success: true, frame: updatedFrame };
  } catch (error: any) {
    console.error("Error generating frame:", error);
    return { error: error.message };
  }
}
