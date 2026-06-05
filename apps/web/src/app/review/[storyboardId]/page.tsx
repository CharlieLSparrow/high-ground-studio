import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { notFound, redirect } from "next/navigation";
import ScrollExperienceEngine from '@/components/scroll-experience/ScrollExperienceEngine';
import { ScrollExperience, ScrollGroup } from '@/components/scroll-experience/types';

export default async function StoryboardReviewPage(props: { params: Promise<{ storyboardId: string }> }) {
  // Ensure route is protected by standard Beta Auth
  const session = await auth();
  if (!session?.user?.email) {
    redirect("/api/auth/signin");
  }

  const { storyboardId } = await props.params;

  const storyboard = await prisma.studioStoryboard.findUnique({
    where: { id: storyboardId },
    include: {
      frames: {
        orderBy: { sortOrder: 'asc' }
      }
    }
  });

  if (!storyboard) {
    notFound();
  }

  // Fetch interactions
  const dbInteractions = await prisma.scrollInteraction.findMany({
    where: { experienceId: storyboard.id }
  });

  // Transform StudioStoryboard into ScrollExperience JSON payload
  const mainGroup: ScrollGroup = {
    id: `group-${storyboard.id}`,
    experienceId: storyboard.id,
    title: storyboard.title,
    order: 0,
    layoutType: 'HORIZONTAL_CAROUSEL',
    panels: storyboard.frames.map((frame, index) => ({
      id: frame.id,
      groupId: `group-${storyboard.id}`,
      type: 'MEDIA',
      sourceId: frame.id,
      order: index,
      content: {
        // Map the real proxy image from the storyboard frame
        imageUrl: frame.imageUrl || undefined,
        text: frame.dialogue || frame.action || undefined,
        caption: `Frame ${frame.frameNumber} • ${frame.shotSize} • ${frame.cameraInfo}`,
      },
      interactions: dbInteractions
        .filter(int => int.panelId === frame.id)
        .map(int => ({
          id: int.id,
          experienceId: int.experienceId,
          panelId: int.panelId || undefined,
          userId: int.userId || "guest",
          interactionType: int.interactionType as any,
          payload: int.payloadJson,
          createdAt: int.createdAt.toISOString()
        })),
    })),
  };

  const experience: ScrollExperience = {
    id: storyboard.id,
    projectId: storyboard.projectId,
    title: storyboard.title,
    description: storyboard.description || undefined,
    type: 'STORYBOARD',
    settings: {
      theme: 'dark',
      enableComments: true,
      enableSelections: true,
      requireCompletion: false,
    },
    groups: [mainGroup],
  };

  return (
    <div className="w-full h-[100dvh] bg-black overflow-hidden overscroll-none">
      <ScrollExperienceEngine experience={experience} mode="review" />
    </div>
  );
}
