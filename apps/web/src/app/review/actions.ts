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
    where: {
      experienceId,
      panelId,
      userId,
      interactionType: "FAVORITE",
    },
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
