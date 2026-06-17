import React from "react";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import ScrollExperienceEngine from "@/components/scroll-experience/ScrollExperienceEngine";
import { transformQuipLoreToScrollExperience } from "@/components/scroll-experience/utils/transformQuipLoreToScrollExperience";

// Ensures Next.js treats this dynamically
export const dynamic = "force-dynamic";

export default async function QuipLoreCollectionReviewPage({
  params,
}: {
  params: { collectionId: string };
}) {
  const session = await auth();
  if (!session?.user) {
    return <div className="p-8 text-white">Access Denied. Beta authentication required.</div>;
  }

  // Fetch the QuipLoreCollection with heavily populated relations
  const collection = await prisma.quipLoreCollection.findUnique({
    where: { id: params.collectionId },
    include: {
      quotes: {
        include: {
          author: true,
          source: true,
          work: true,
          tags: true,
        }
      }
    }
  });

  if (!collection) {
    notFound();
  }

  // Transform to ScrollExperience format
  const experience = transformQuipLoreToScrollExperience(collection);

  // Fetch existing interactions for this experience
  const rawInteractions = await prisma.scrollInteraction.findMany({
    where: { experienceId: collection.id },
  });

  // Hydrate the transformed payload with database interactions
  experience.groups.forEach(group => {
    group.panels.forEach(panel => {
      panel.interactions = rawInteractions.filter(i => i.panelId === panel.id).map(i => ({
        id: i.id,
        experienceId: i.experienceId,
        panelId: i.panelId || undefined,
        userId: i.userId || 'unknown',
        interactionType: i.interactionType as any,
        payload: i.payloadJson,
        createdAt: i.createdAt.toISOString()
      }));
    });
  });

  return (
    <main className="w-full h-[100dvh] bg-black">
      <ScrollExperienceEngine experience={experience} mode="review" />
    </main>
  );
}
