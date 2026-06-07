import React, { Suspense } from 'react';
import { getPrismaClient } from '@/lib/prisma';
import { ensureStudioWorkspace } from '@/lib/studio/project-registry';
import { StoryboardClient } from './StoryboardClient';
import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import {
  canAccessPrivateFictionNest,
  PRIVATE_FICTION_PROJECT_SLUG,
} from '@/lib/fiction/private-fiction-access';

export const dynamic = 'force-dynamic';

export default async function StoryboardBuilderPage() {
  const session = await auth();
  const isDev = process.env.NODE_ENV === "development";
  const isOwner = Array.isArray(session?.user?.roles) && session.user.roles.includes("OWNER");
  const actorEmail = session?.user?.primaryEmail || session?.user?.email;
  const canUsePrivateFictionTools = await canAccessPrivateFictionNest(actorEmail);

  if (!isDev && !isOwner && !canUsePrivateFictionTools) {
    redirect("/content-studio");
  }

  const prisma = getPrismaClient();
  const workspace = await ensureStudioWorkspace(prisma);

  // Fetch all projects for this workspace, including nested scenes and shots
  const projects = await prisma.studioProject.findMany({
    where: canUsePrivateFictionTools
      ? { OR: [{ workspaceId: workspace.id }, { slug: PRIVATE_FICTION_PROJECT_SLUG }] }
      : { workspaceId: workspace.id },
    // @ts-ignore
    include: {
      storyboards: {
        orderBy: { createdAt: 'asc' },
        include: {
          frames: {
            orderBy: { sortOrder: 'asc' }
          }
        }
      },
      mediaAssets: {
        orderBy: { createdAt: 'desc' }
      }
    },
    orderBy: { createdAt: 'desc' }
  });

  // Extract all storyboard IDs to fetch interactions
  const storyboardIds = projects.flatMap(p => (p as any).storyboards?.map((s: any) => s.id) || []);

  // Fetch interactions for these storyboards
  const interactions = await prisma.scrollInteraction.findMany({
    where: { experienceId: { in: storyboardIds } },
    select: { experienceId: true, interactionType: true }
  });

  // Group interactions by storyboardId
  const interactionsMap: Record<string, { comments: number, favorites: number }> = {};
  for (const interaction of interactions) {
    if (!interactionsMap[interaction.experienceId]) {
      interactionsMap[interaction.experienceId] = { comments: 0, favorites: 0 };
    }
    if (interaction.interactionType === 'COMMENT') interactionsMap[interaction.experienceId].comments++;
    if (interaction.interactionType === 'FAVORITE') interactionsMap[interaction.experienceId].favorites++;
  }

  // Attach feedback stats to storyboards
  const enrichedProjects = projects.map(p => ({
    ...p,
    storyboards: (p as any).storyboards?.map((s: any) => ({
      ...s,
      feedbackStats: interactionsMap[s.id] || { comments: 0, favorites: 0 }
    }))
  }));

  // Determine AI Image Generator config status for Beta labeling/warning
  const hasApiKey = !!(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY);
  const hasBucket = !!(process.env.STORYBOARD_GCS_BUCKET || process.env.GCS_BUCKET);
  let aiConfigStatus: "ready" | "missing_keys" | "missing_bucket" | "missing_both" = "ready";
  if (!hasApiKey && !hasBucket) {
    aiConfigStatus = "missing_both";
  } else if (!hasApiKey) {
    aiConfigStatus = "missing_keys";
  } else if (!hasBucket) {
    aiConfigStatus = "missing_bucket";
  }

  return (
    <Suspense fallback={<div className="p-8 text-zinc-500">Loading storyboards...</div>}>
      <StoryboardClient initialProjects={enrichedProjects} aiConfigStatus={aiConfigStatus} />
    </Suspense>
  );
}
