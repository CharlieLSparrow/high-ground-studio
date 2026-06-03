import React from 'react';
import { SidebarLayout } from '@/components/SidebarLayout';
import { getPrismaClient } from '@/lib/prisma';
import { StoryboardClient } from './StoryboardClient';

export const dynamic = 'force-dynamic';

export default async function StoryboardBuilderPage() {
  const prisma = getPrismaClient();



  // Fetch all projects for this workspace, including nested scenes and shots
  const projects = await prisma.studioProject.findMany({
    include: {
      scenes: {
        orderBy: { sceneNumber: 'asc' },
        include: {
          shots: {
            orderBy: { sortOrder: 'asc' }
          }
        }
      }
    },
    orderBy: { createdAt: 'desc' }
  });

  return (
    <SidebarLayout>
      <StoryboardClient initialProjects={projects} />
    </SidebarLayout>
  );
}
