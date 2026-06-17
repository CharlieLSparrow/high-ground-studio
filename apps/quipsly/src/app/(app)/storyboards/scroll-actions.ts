"use server";

import { getPrismaClient } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export async function updateScrollSectionTitle(sectionId: string, label: string) {
  const prisma = getPrismaClient();
  try {
    const updated = await prisma.studioScrollSection.update({
      where: { id: sectionId },
      data: { label }
    });
    revalidatePath("/storyboards/builder");
    return { success: true, section: updated };
  } catch (error: any) {
    console.error("updateScrollSectionTitle error:", error);
    return { success: false, error: error.message };
  }
}

export async function addScrollSection(experienceId: string, label: string, sortOrder: number) {
  const prisma = getPrismaClient();
  try {
    const section = await prisma.studioScrollSection.create({
      data: {
        experienceId,
        label,
        sortOrder
      }
    });
    revalidatePath("/storyboards/builder");
    return { success: true, section };
  } catch (error: any) {
    console.error("addScrollSection error:", error);
    return { success: false, error: error.message };
  }
}

export async function exportRoughCutBlueprintAction(experienceId: string) {
  const prisma = getPrismaClient();
  try {
    const experience = await prisma.studioScrollExperience.findUnique({
      where: { id: experienceId },
      include: {
        sections: {
          orderBy: { sortOrder: 'asc' },
          include: {
            panelRefs: {
              orderBy: { sortOrder: 'asc' },
              include: { frame: true }
            }
          }
        }
      }
    });

    if (!experience) return { success: false, error: "Storyboard not found." };

    const blueprint = {
      version: "1.0.0",
      type: "quipsly-rough-cut-blueprint",
      id: experience.id,
      title: "Rough Cut Blueprint",
      createdAt: new Date().toISOString(),
      timeline: experience.sections.map(section => ({
        id: section.id,
        label: section.label,
        sortOrder: section.sortOrder,
        clips: section.panelRefs.map(ref => ({
          id: ref.id,
          type: ref.frameId ? "frame" : "placeholder",
          description: ref.frame?.action || "Missing Frame",
          sortOrder: ref.sortOrder,
          mediaUrl: ref.frame?.imageUrl || null
        }))
      }))
    };

    return { success: true, blueprint };
  } catch (error: any) {
    console.error("exportRoughCutBlueprintAction error:", error);
    return { success: false, error: error.message };
  }
}
