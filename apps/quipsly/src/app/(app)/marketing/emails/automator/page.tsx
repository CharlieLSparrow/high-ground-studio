import React from 'react';
import { AutomatorClient } from './AutomatorClient';
import { getPrismaClient } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export default async function EmailAutomatorPage() {
  const prisma = getPrismaClient();
  const personas = await prisma.marketingPersona.findMany({
    orderBy: { createdAt: 'desc' },
  });

  return (
    <>
      <div className="flex flex-col h-[calc(100vh-64px)] w-full">
        <header className="p-8 pb-0 shrink-0">
          <h1 className="text-3xl font-bold text-zinc-900 dark:text-white mb-2">Welcome Sequence Automator</h1>
          <p className="text-zinc-500 max-w-2xl">
            Map out your automated email sequence. In Sprint 6, Quipsly AI will be able to write this entire sequence for you based on the target avatar's psychological profile.
          </p>
        </header>
        <div className="flex-1 p-8 overflow-y-auto">
          <AutomatorClient personas={personas} />
        </div>
      </div>
    </>
  );
}
