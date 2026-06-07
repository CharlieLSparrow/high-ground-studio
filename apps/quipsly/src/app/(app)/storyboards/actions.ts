"use server";

import { getPrismaClient } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { GoogleGenAI } from "@google/genai";
import { Storage } from "@google-cloud/storage";
import { createStudioProject } from "@/lib/studio/project-registry";
import type { PublicPublishPacket } from "@high-ground/quipsly-domain/publishing";

const storage = new Storage();
const bucketName = process.env.STORYBOARD_GCS_BUCKET || process.env.GCS_BUCKET || "quipsly-storyboard-dev-assets";
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
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      throw new Error("Missing GEMINI_API_KEY or GOOGLE_API_KEY");
    }

    const ai = new GoogleGenAI({ apiKey });
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
    console.warn("Error generating frame image, falling back to SVG storyboard sketch:", error.message);
    try {
      const fallbackSvg = `data:image/svg+xml;utf8,${encodeURIComponent(`
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900" width="100%" height="100%">
          <rect width="100%" height="100%" fill="#1f1f23"/>
          <line x1="50" y1="50" x2="1550" y2="50" stroke="#3f3f46" stroke-width="4" stroke-dasharray="10 10"/>
          <line x1="50" y1="850" x2="1550" y2="850" stroke="#3f3f46" stroke-width="4" stroke-dasharray="10 10"/>
          <line x1="50" y1="50" x2="50" y2="850" stroke="#3f3f46" stroke-width="4" stroke-dasharray="10 10"/>
          <line x1="1550" y1="50" x2="1550" y2="850" stroke="#3f3f46" stroke-width="4" stroke-dasharray="10 10"/>
          <circle cx="800" cy="450" r="150" fill="none" stroke="#6366f1" stroke-width="6" opacity="0.4"/>
          <path d="M 650 450 L 950 450 M 800 300 L 800 600" stroke="#6366f1" stroke-width="4" opacity="0.3"/>
          <text x="800" y="470" font-family="monospace" font-size="28" font-weight="bold" fill="#a1a1aa" text-anchor="middle">
            [ STORYBOARD SKETCH ]
          </text>
          <text x="800" y="520" font-family="sans-serif" font-size="20" fill="#71717a" text-anchor="middle">
            ${(frame.action || "No action described").replace(/[<>&"]/g, "").slice(0, 80)}
          </text>
          <text x="800" y="555" font-family="sans-serif" font-style="italic" font-size="18" fill="#a1a1aa" text-anchor="middle">
            ${(frame.shotSize || "Medium Shot").replace(/[<>&"]/g, "")} - ${(frame.cameraInfo || "Wide Angle").replace(/[<>&"]/g, "")}
          </text>
        </svg>
      `.trim())}`;

      const updatedFrame = await (prisma as any).studioStoryboardFrame.update({
        where: { id: frameId },
        data: { imageUrl: fallbackSvg }
      });

      revalidatePath("/storyboards/builder");
      return { success: true, frame: updatedFrame, fallbackUsed: true };
    } catch (dbError: any) {
      console.error("DB error during fallback save:", dbError);
      return { error: error.message };
    }
  }
}

export async function approveLedgerSuggestions(storyboardId: string, frames: any[]) {
  const prisma = getPrismaClient();
  try {
    // Get current frames count to set sortOrder and frameNumber
    const existingFrames = await (prisma as any).studioStoryboardFrame.findMany({
      where: { storyboardId },
      orderBy: { sortOrder: 'asc' }
    });

    let nextSortOrder = existingFrames.length;

    const createdFrames = [];
    for (const suggestedFrame of frames) {
      const frameNumber = `1.${nextSortOrder + 1}`;
      const frame = await (prisma as any).studioStoryboardFrame.create({
        data: {
          storyboardId,
          sortOrder: nextSortOrder,
          frameNumber,
          action: suggestedFrame.action || "Describe the action happening in this shot...",
          dialogue: suggestedFrame.dialogue || null,
          shotSize: suggestedFrame.shotSize || "Medium Shot",
          lens: suggestedFrame.lens || null,
          cameraMovement: suggestedFrame.cameraMovement || "Static",
          estimatedDuration: suggestedFrame.estimatedDuration || null,
        }
      });
      createdFrames.push(frame);
      nextSortOrder++;
    }

    revalidatePath("/storyboards/builder");
    return { success: true, frames: createdFrames };
  } catch (error: any) {
    console.error("Error approving ledger suggestions:", error);
    return { error: error.message };
  }
}

export async function compileStoryboardPublishPacket(storyboardId: string) {
  const prisma = getPrismaClient();
  try {
    const storyboard = await (prisma as any).studioStoryboard.findUnique({
      where: { id: storyboardId },
      include: {
        project: true,
        frames: {
          orderBy: { sortOrder: 'asc' }
        }
      }
    });
    if (!storyboard) {
      return { error: "Storyboard not found" };
    }

    // Tenancy scope validation
    const { ensureStudioWorkspace } = await import("@/lib/studio/project-registry");
    const workspace = await ensureStudioWorkspace(prisma);
    if (storyboard.project.workspaceId !== workspace.id) {
      return { error: "Access denied: workspace mismatch" };
    }

    const slugify = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
    const storyboardSlug = slugify(storyboard.title || "storyboard");

    // Map frames to media references
    const media: any[] = [];
    storyboard.frames.forEach((frame: any) => {
      if (frame.imageUrl) {
        media.push({
          id: frame.id,
          kind: "image",
          label: `Frame ${frame.frameNumber}`,
          url: frame.imageUrl,
          provider: frame.imageUrl.startsWith("https://storage.googleapis.com") ? "gcs" : "external",
          role: "embed"
        });
      }
    });

    // Generate markdown body of frames (excluding any raw manuscript database fields)
    let bodyMarkdown = `# ${storyboard.title}\n\n`;
    if (storyboard.description) {
      bodyMarkdown += `${storyboard.description}\n\n`;
    }
    bodyMarkdown += `## Storyboard Frames\n\n`;

    storyboard.frames.forEach((frame: any) => {
      bodyMarkdown += `### Frame ${frame.frameNumber} (${frame.shotSize || 'Medium Shot'})\n`;
      if (frame.cameraInfo) bodyMarkdown += `* **Camera/Lens**: ${frame.cameraInfo}${frame.lens ? ` / ${frame.lens}` : ''}${frame.cameraMovement ? ` (${frame.cameraMovement})` : ''}\n`;
      if (frame.estimatedDuration) bodyMarkdown += `* **Pacing/Duration**: ${frame.estimatedDuration} seconds\n`;
      bodyMarkdown += `\n**Visual Action**:\n${frame.action || 'No action described.'}\n\n`;
      if (frame.dialogue) {
        bodyMarkdown += `**Dialogue/Notes**:\n> ${frame.dialogue}\n\n`;
      }
      bodyMarkdown += `---\n\n`;
    });

    // Construct the public-safe packet
    const packet: PublicPublishPacket = {
      packetVersion: 1,
      id: `compiled-${storyboard.id}`,
      kind: "story-scroll",
      source: {
        projectSlug: storyboard.project.slug,
        documentId: storyboard.id,
      },
      title: storyboard.title,
      slug: `storyboard-${storyboardSlug}`,
      summary: storyboard.description || `Visual storyboard sequence containing ${storyboard.frames.length} frames.`,
      bodyMarkdown: bodyMarkdown.trim(),
      media,
      destinations: [
        { destination: "high-ground-odyssey", status: "draft" },
        { destination: "gallery", status: "draft" }
      ],
      generatedFrom: "quipsly-editor",
      createdAt: new Date().toISOString(),
      savedAt: new Date().toISOString()
    };

    return { success: true, packet };
  } catch (error: any) {
    console.error("Failed to compile publish packet:", error);
    return { error: error.message };
  }
}
