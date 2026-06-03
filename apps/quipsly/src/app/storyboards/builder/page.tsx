import React from 'react';
import { SidebarLayout } from '@/components/SidebarLayout';
import { getPrismaClient } from '@/lib/prisma';
import { StoryboardClient } from './StoryboardClient';

export const dynamic = 'force-dynamic';

export default async function StoryboardBuilderPage() {
  const prisma = getPrismaClient();

  const user = await prisma.user.findFirst();
  if (!user) {
    return (
      <SidebarLayout>
        <div className="p-8">System not configured. No users found.</div>
      </SidebarLayout>
    );
  }

  // Fetch all projects for this user, including nested scenes and shots
  const projects = await prisma.project.findMany({
    where: { userId: user.id },
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
