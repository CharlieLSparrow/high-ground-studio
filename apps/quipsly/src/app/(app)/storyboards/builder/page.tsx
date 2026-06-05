import React, { Suspense } from 'react';
import { SidebarLayout } from '@/components/SidebarLayout';
import { getPrismaClient } from '@/lib/prisma';
import { StoryboardClient } from './StoryboardClient';

export const dynamic = 'force-dynamic';

export default async function StoryboardBuilderPage() {
  const prisma = getPrismaClient();



  // Fetch all projects for this workspace, including nested scenes and shots
  const projects = await prisma.studioProject.findMany({
    // @ts-ignore
    include: {
      storyboards: {
        orderBy: { createdAt: 'asc' },
        include: {
          frames: {
            orderBy: { sortOrder: 'asc' }
          }
        }
      }
    },
    orderBy: { createdAt: 'desc' }
  });

  return (
    <SidebarLayout>
      <Suspense fallback={<div className="p-8 text-zinc-500">Loading storyboards...</div>}>
        <StoryboardClient initialProjects={projects} />
      </Suspense>
    </SidebarLayout>
  );
}
