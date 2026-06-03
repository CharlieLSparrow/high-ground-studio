import React from 'react';
import { SidebarLayout } from '@/components/SidebarLayout';
import { getPrismaClient } from '@/lib/prisma';
import { CampaignSandboxClient } from './CampaignSandboxClient';

export const dynamic = 'force-dynamic';

export default async function CampaignsPage() {
  const prisma = getPrismaClient();

  const user = await prisma.user.findFirst();
  if (!user) {
    return (
      <SidebarLayout>
        <div className="p-8">System not configured. No users found.</div>
      </SidebarLayout>
    );
  }

  // Fetch all assets
  const campaigns = await prisma.marketingCampaign.findMany({
    where: { userId: user.id },
    include: {
      landingPages: true,
      emailSequences: true,
    }
  });

  const avatars = await prisma.marketingPersona.findMany({
    where: { userId: user.id }
  });

  const landingPages = await prisma.landingPage.findMany({
    where: { userId: user.id }
  });

  const emailSequences = await prisma.emailSequence.findMany({
    where: { userId: user.id }
  });

  return (
    <SidebarLayout>
      <CampaignSandboxClient 
        initialCampaigns={campaigns}
        avatars={avatars}
        landingPages={landingPages}
        emailSequences={emailSequences}
      />
    </SidebarLayout>
  );
}
