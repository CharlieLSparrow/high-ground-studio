import React from "react";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import ScrollExperienceEngine from "@/components/scroll-experience/ScrollExperienceEngine";
import { transformDocumentToCourseExperience } from "@/components/scroll-experience/utils/transformDocumentToCourseExperience";

export const dynamic = "force-dynamic";

export default async function DocumentCourseReviewPage({
  params,
}: {
  params: Promise<{ documentId: string }>;
}) {
  const { documentId } = await params;
  const session = await auth();
  if (!session?.user) {
    return <div className="p-8 text-white">Access Denied. Beta authentication required.</div>;
  }

  // Fetch the StudioDocument with its blocks
  const document = await prisma.studioDocument.findUnique({
    where: { id: documentId },
    include: {
      blocks: {
        where: { archivedAt: null },
        orderBy: { order: 'asc' }
      }
    }
  });

  if (!document) {
    notFound();
  }

  // Fetch existing interactions for this experience
  const rawInteractions = await prisma.scrollInteraction.findMany({
    where: { experienceId: document.id },
  });

  // Transform to ScrollExperience format
  const experience = transformDocumentToCourseExperience(document, rawInteractions);

  return (
    <main className="w-full h-[100dvh] bg-black">
      <ScrollExperienceEngine experience={experience} mode="review" />
    </main>
  );
}
