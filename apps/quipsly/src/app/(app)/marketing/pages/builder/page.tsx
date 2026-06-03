import React from 'react';
import { SidebarLayout } from '@/components/SidebarLayout';
import { BuilderClient } from './BuilderClient';
import { getPrismaClient } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export default async function LeadCaptureBuilderPage() {
  const prisma = getPrismaClient();
  const personas = await prisma.marketingPersona.findMany({
    orderBy: { createdAt: 'desc' },
  });

  return (
    <SidebarLayout>
      <div className="flex h-[calc(100vh-64px)] w-full">
        <BuilderClient personas={personas} />
      </div>
    </SidebarLayout>
  );
}
