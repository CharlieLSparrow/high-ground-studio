'use server';

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export async function addScrollInteractionAction(
  experienceId: string,
  panelId: string | null,
  interactionType: string,
  payloadJson: any
) {
  const session = await auth();
  const userId = session?.user?.id || session?.user?.email || "guest";

  const interaction = await prisma.scrollInteraction.create({
    data: {
      experienceId,
      panelId,
      userId,
      interactionType,
      payloadJson,
    },
  });

  revalidatePath(`/review/${experienceId}`);
  return { success: true, interaction };
}

export async function toggleFavoriteAction(
  experienceId: string,
  panelId: string
) {
  const session = await auth();
  const userId = session?.user?.id || session?.user?.email || "guest";

  const existing = await prisma.scrollInteraction.findFirst({
    where: { experienceId, panelId, userId, interactionType: "FAVORITE" },
  });

  if (existing) {
    await prisma.scrollInteraction.delete({ where: { id: existing.id } });
    revalidatePath(`/review/${experienceId}`);
    return { success: true, favorited: false };
  } else {
    await prisma.scrollInteraction.create({
      data: {
        experienceId,
        panelId,
        userId,
        interactionType: "FAVORITE",
        payloadJson: { active: true },
      },
    });
    revalidatePath(`/review/${experienceId}`);
    return { success: true, favorited: true };
  }
}

export async function toggleSelectionAction(
  experienceId: string,
  panelId: string
) {
  const session = await auth();
  const userId = session?.user?.id || session?.user?.email || "guest";

  const existing = await prisma.scrollInteraction.findFirst({
    where: { experienceId, panelId, userId, interactionType: "SELECTION" },
  });

  if (existing) {
    await prisma.scrollInteraction.delete({ where: { id: existing.id } });
    revalidatePath(`/review/${experienceId}`);
    return { success: true, selected: false };
  } else {
    await prisma.scrollInteraction.create({
      data: {
        experienceId,
        panelId,
        userId,
        interactionType: "SELECTION",
        payloadJson: { active: true },
      },
    });
    revalidatePath(`/review/${experienceId}`);
    return { success: true, selected: true };
  }
}

export async function setRatingAction(
  experienceId: string,
  panelId: string,
  rating: number
) {
  const session = await auth();
  const userId = session?.user?.id || session?.user?.email || "guest";

  const existing = await prisma.scrollInteraction.findFirst({
    where: { experienceId, panelId, userId, interactionType: "RATING" },
  });

  if (existing) {
    const updated = await prisma.scrollInteraction.update({
      where: { id: existing.id },
      data: { payloadJson: { rating } },
    });
    revalidatePath(`/review/${experienceId}`);
    return { success: true, interaction: updated };
  } else {
    const created = await prisma.scrollInteraction.create({
      data: {
        experienceId,
        panelId,
        userId,
        interactionType: "RATING",
        payloadJson: { rating },
      },
    });
    revalidatePath(`/review/${experienceId}`);
    return { success: true, interaction: created };
  }
}

export async function persistScrollExperienceAction(
  experiencePayload: any // The JSON ScrollExperience object
) {
  const session = await auth();
  if (!session?.user) {
    throw new Error("Unauthorized");
  }

  // Idempotently create or update the experience
  // We'll try to find it by slug (we'll generate a slug from the title if missing)
  const slug = experiencePayload.slug || `exp-${experiencePayload.id}`;

  return await prisma.$transaction(async (tx) => {
    // 1. Upsert Experience
    let experience = await tx.studioScrollExperience.findFirst({
      where: { projectId: experiencePayload.projectId, slug }
    });

    if (experience) {
      experience = await tx.studioScrollExperience.update({
        where: { id: experience.id },
        data: {
          title: experiencePayload.title,
          layout: experiencePayload.type, // e.g. STORYBOARD, COURSE, LORELIST
        }
      });
    } else {
      experience = await tx.studioScrollExperience.create({
        data: {
          projectId: experiencePayload.projectId,
          storyboardId: experiencePayload.id.startsWith('group') ? null : experiencePayload.id, // Fallback heuristic
          slug,
          title: experiencePayload.title,
          layout: experiencePayload.type,
        }
      });
    }

    // 2. Clear existing sections/refs to cleanly rebuild
    await tx.studioScrollSection.deleteMany({
      where: { experienceId: experience.id }
    });

    // 3. Rebuild Sections and PanelRefs
    const groups = experiencePayload.groups || [];
    for (let i = 0; i < groups.length; i++) {
      const group = groups[i];
      const section = await tx.studioScrollSection.create({
        data: {
          experienceId: experience.id,
          sortOrder: i,
          label: group.title || `Section ${i + 1}`,
        }
      });

      const panels = group.panels || [];
      for (let j = 0; j < panels.length; j++) {
        const panel = panels[j];
        await tx.studioScrollPanelRef.create({
          data: {
            sectionId: section.id,
            frameId: null, // Depending on type, could link to StudioStoryboardFrame if we mapped it perfectly
            externalId: panel.id,
            sortOrder: j,
          }
        });
      }
    }

    return { success: true, experienceId: experience.id };
  });
}
