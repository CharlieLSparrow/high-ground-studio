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
    estimatedDuration?: number | null;
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

// Helpers for metadata parsing
function parseStoryboardMeta(description: string | null) {
  if (!description) return { docId: null, episodeId: null, cleanDesc: "" };
  const docMatch = description.match(/\[LinkedDocument:\s*([^\]]+)\]/);
  const epMatch = description.match(/\[LinkedEpisode:\s*([^\]]+)\]/);
  
  let cleanDesc = description;
  if (docMatch) cleanDesc = cleanDesc.replace(/\[LinkedDocument:\s*([^\]]+)\]\s*/, "");
  if (epMatch) cleanDesc = cleanDesc.replace(/\[LinkedEpisode:\s*([^\]]+)\]\s*/, "");
  
  return {
    docId: docMatch ? docMatch[1] : null,
    episodeId: epMatch ? epMatch[1] : null,
    cleanDesc: cleanDesc.trim()
  };
}

function parseLinkedBlock(vfxNotes: string | null) {
  if (!vfxNotes) return { blockId: null, cleanNotes: "" };
  const match = vfxNotes.match(/^\[Block:\s*([^\]]+)\]/);
  if (match) {
    return {
      blockId: match[1],
      cleanNotes: vfxNotes.replace(/^\[Block:\s*([^\]]+)\]\s*/, "")
    };
  }
  return { blockId: null, cleanNotes: vfxNotes };
}

export async function importFramesFromLinkedDocument(storyboardId: string) {
  const prisma = getPrismaClient();
  try {
    const storyboard = await (prisma as any).studioStoryboard.findUnique({
      where: { id: storyboardId },
      include: {
        frames: {
          orderBy: { sortOrder: 'asc' }
        }
      }
    });

    if (!storyboard) {
      return { success: false, error: "Storyboard not found" };
    }

    const { docId } = parseStoryboardMeta(storyboard.description);
    if (!docId) {
      return { success: false, error: "No document is linked to this storyboard. Please link a document first." };
    }

    const document = await prisma.studioDocument.findUnique({
      where: { id: docId },
      include: {
        blocks: {
          where: { archivedAt: null },
          orderBy: { order: "asc" }
        }
      }
    });

    if (!document) {
      return { success: false, error: "Linked document not found or has been deleted." };
    }

    // Extract all block IDs currently linked to existing frames
    const linkedBlockIds = new Set<string>();
    storyboard.frames.forEach((f: any) => {
      const { blockId } = parseLinkedBlock(f.vfxNotes);
      if (blockId) {
        linkedBlockIds.add(blockId);
      }
    });

    // Find blocks that are not yet linked to any frame
    const unlinkedBlocks = document.blocks.filter(b => !linkedBlockIds.has(b.id));

    if (unlinkedBlocks.length === 0) {
      return { success: true, importedCount: 0, message: "All script beats are already linked to storyboard frames." };
    }

    let nextSortOrder = storyboard.frames.length;
    const createdFrames = [];

    for (const block of unlinkedBlocks) {
      const frameNumber = `1.${nextSortOrder + 1}`;
      const frame = await (prisma as any).studioStoryboardFrame.create({
        data: {
          storyboardId,
          sortOrder: nextSortOrder,
          frameNumber,
          action: `Visual action for block: ${block.body.slice(0, 60)}${block.body.length > 60 ? '...' : ''}`,
          dialogue: block.body,
          cameraInfo: "Static",
          shotSize: "MCU",
          vfxNotes: `[Block: ${block.id}]`,
        }
      });
      createdFrames.push(frame);
      nextSortOrder++;
    }

    // Fetch and return the updated frames list
    const updatedFrames = await (prisma as any).studioStoryboardFrame.findMany({
      where: { storyboardId },
      orderBy: { sortOrder: 'asc' }
    });

    revalidatePath("/storyboards/builder");
    return { success: true, importedCount: createdFrames.length, frames: updatedFrames };
  } catch (error: any) {
    console.error("Error importing script beats to storyboard frames:", error);
    return { success: false, error: error.message };
  }
}

export async function reorderFramesToMatchLinkedDocument(storyboardId: string) {
  const prisma = getPrismaClient();
  try {
    const storyboard = await (prisma as any).studioStoryboard.findUnique({
      where: { id: storyboardId },
      include: {
        frames: {
          orderBy: { sortOrder: 'asc' }
        }
      }
    });

    if (!storyboard) {
      return { success: false, error: "Storyboard not found" };
    }

    const { docId } = parseStoryboardMeta(storyboard.description);
    if (!docId) {
      return { success: false, error: "No document is linked to this storyboard." };
    }

    const document = await prisma.studioDocument.findUnique({
      where: { id: docId },
      include: {
        blocks: {
          where: { archivedAt: null },
          orderBy: { order: "asc" }
        }
      }
    });

    if (!document) {
      return { success: false, error: "Linked document not found." };
    }

    const blockIndexMap = new Map<string, number>();
    document.blocks.forEach((block, index) => {
      blockIndexMap.set(block.id, index);
    });

    const sortedFrames = [...storyboard.frames].sort((a: any, b: any) => {
      const { blockId: aBlockId } = parseLinkedBlock(a.vfxNotes);
      const { blockId: bBlockId } = parseLinkedBlock(b.vfxNotes);

      const aIndex = aBlockId ? blockIndexMap.get(aBlockId) : undefined;
      const bIndex = bBlockId ? blockIndexMap.get(bBlockId) : undefined;

      if (aIndex !== undefined && bIndex !== undefined) {
        return aIndex - bIndex;
      }
      if (aIndex !== undefined) {
        return -1;
      }
      if (bIndex !== undefined) {
        return 1;
      }
      return a.sortOrder - b.sortOrder;
    });

    // Update database in a transaction
    await prisma.$transaction(
      sortedFrames.map((frame: any, index: number) =>
        (prisma as any).studioStoryboardFrame.update({
          where: { id: frame.id },
          data: { 
            sortOrder: index,
            frameNumber: `1.${index + 1}`
          }
        })
      )
    );

    const updatedFrames = await (prisma as any).studioStoryboardFrame.findMany({
      where: { storyboardId },
      orderBy: { sortOrder: 'asc' }
    });

    revalidatePath("/storyboards/builder");
    return { success: true, frames: updatedFrames };
  } catch (error: any) {
    console.error("Error reordering frames to match document blocks:", error);
    return { success: false, error: error.message };
  }
}

export async function createScrollExperienceFromStoryboard(storyboardId: string) {
  const prisma = getPrismaClient();
  try {
    const storyboard = await (prisma as any).studioStoryboard.findUnique({
      where: { id: storyboardId },
      include: {
        frames: {
          orderBy: { sortOrder: 'asc' }
        }
      }
    });

    if (!storyboard) {
      return { success: false, error: "Storyboard not found" };
    }

    const slugify = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
    const title = `${storyboard.title} Scroll Experience`;
    const slug = `${slugify(storyboard.title)}-scroll-${Date.now()}`;

    // Create the experience and an initial section
    const experience = await (prisma as any).studioScrollExperience.create({
      data: {
        projectId: storyboard.projectId,
        storyboardId: storyboard.id,
        title,
        slug,
        layout: "stacked",
        sections: {
          create: [
            {
              sortOrder: 0,
              label: "Main Sequence",
              panelRefs: {
                create: storyboard.frames.map((frame: any, index: number) => ({
                  frameId: frame.id,
                  sortOrder: index,
                }))
              }
            }
          ]
        }
      },
      include: {
        sections: {
          include: {
            panelRefs: true
          }
        }
      }
    });

    revalidatePath("/storyboards/builder");
    return { success: true, experience };
  } catch (error: any) {
    console.error("Error creating scroll experience:", error);
    return { success: false, error: error.message };
  }
}

export async function createFrameFromExcerpt(storyboardId: string, dialogue: string) {
  const prisma = getPrismaClient();
  try {
    const storyboard = await (prisma as any).studioStoryboard.findUnique({
      where: { id: storyboardId },
      select: { projectId: true }
    });

    if (!storyboard) {
      return { success: false, error: "Storyboard not found" };
    }

    // Try to find a matching script beat (block) in the project
    let vfxNotes = null;
    const matchedBlock = await prisma.studioDocumentBlock.findFirst({
      where: {
        body: { contains: dialogue },
        document: { projectId: storyboard.projectId }
      }
    });

    if (matchedBlock) {
      vfxNotes = `[Block: ${matchedBlock.id}]`;
    }

    const existingFrames = await (prisma as any).studioStoryboardFrame.findMany({
      where: { storyboardId },
      orderBy: { sortOrder: 'asc' }
    });

    const nextSortOrder = existingFrames.length;
    const frameNumber = `1.${nextSortOrder + 1}`;

    const frame = await (prisma as any).studioStoryboardFrame.create({
      data: {
        storyboardId,
        sortOrder: nextSortOrder,
        frameNumber,
        action: "Describe the action for this excerpt...",
        dialogue: dialogue,
        cameraInfo: "Medium Shot",
        vfxNotes,
      }
    });

    revalidatePath("/storyboards/builder");
    return { success: true, frame };
  } catch (error: any) {
    console.error("Failed to create frame from excerpt:", error);
    return { success: false, error: error.message };
  }
}


