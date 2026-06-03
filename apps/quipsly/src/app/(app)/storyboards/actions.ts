"use server";

import { getPrismaClient } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { GoogleGenAI } from "@google/genai";
import { Storage } from "@google-cloud/storage";

const storage = new Storage();
const bucketName = "high-ground-odyssey-media";

export async function createProject(formData: FormData) {
  const title = formData.get("title") as string;
  if (!title) return { error: "Title is required" };
  const prisma = getPrismaClient();
  const WORKSPACE_SLUG = "tonight-pack";
  
  function slugify(input: string) {
    return input
      .toLowerCase()
      .trim()
      .replace(/['"]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 64) || "untitled";
  }

  const baseSlug = slugify(title);

  const workspace = await prisma.studioWorkspace.upsert({
    where: { slug: WORKSPACE_SLUG },
    update: {},
    create: { slug: WORKSPACE_SLUG, name: "Tonight Pack Workspace" },
  });

  let slug = baseSlug;
  let suffix = 2;
  while (await prisma.studioProject.findUnique({ where: { workspaceId_slug: { workspaceId: workspace.id, slug } } })) {
    slug = `${baseSlug}-${suffix}`;
    suffix += 1;
  }

  try {
    const project = await prisma.studioProject.create({
      data: {
        workspaceId: workspace.id,
        slug,
        name: title,
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

export async function generateShotImage(shotId: string) {
  const prisma = getPrismaClient();
  const shot = await prisma.storyboardShot.findUnique({
    where: { id: shotId },
    include: { scene: true }
  });

  if (!shot) return { error: "Shot not found" };

  const prompt = `A cinematic storyboard panel. 
Location: ${shot.scene.location || 'Unknown location'} - Time of Day: ${shot.scene.timeOfDay || 'Unknown time'}.
Camera Angle/Shot Type: ${shot.cameraInfo || 'Standard Wide'}.
Action: ${shot.action || 'Characters in a scene'}.
Dialogue context: ${shot.dialogue || 'None'}.
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
    const fileName = `storyboards/shots/shot-${shotId}-${Date.now()}.jpg`;
    const file = bucket.file(fileName);
    
    const buffer = Buffer.from(base64Image, 'base64');
    await file.save(buffer, {
      contentType: 'image/jpeg',
      metadata: {
        cacheControl: 'public, max-age=31536000',
      }
    });
    
    // Make public
    await file.makePublic();
    
    const imageUrl = `https://storage.googleapis.com/${bucketName}/${fileName}`;
    
    const updatedShot = await prisma.storyboardShot.update({
      where: { id: shotId },
      data: { imageUrl }
    });
    
    revalidatePath("/storyboards/builder");
    return { success: true, shot: updatedShot };
  } catch (error: any) {
    console.error("Error generating shot:", error);
    return { error: error.message };
  }
}
