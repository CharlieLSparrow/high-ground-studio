import React from 'react';
import { SidebarLayout } from '@/components/SidebarLayout';
import { PersonaCard, PersonaData } from '@/components/marketing/PersonaCard';
import { AvatarDashboardClient } from './AvatarDashboardClient';
import { getPrismaClient } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export default async function AvatarDashboard() {
  const prisma = getPrismaClient();
  // Fetch from the DB
  const personas = await prisma.marketingPersona.findMany({
    orderBy: { createdAt: 'desc' },
  });

  // Ensure JSON compatibility with PersonaCard component (which expects strings in array)
  const mappedPersonas: PersonaData[] = personas.map((p: any) => ({
    id: p.id,
    name: p.name,
    avatarImageUrl: p.avatarImageUrl,
    ageRange: p.ageRange || '',
    occupation: p.occupation || '',
    incomeLevel: p.incomeLevel || '',
    painPointsJson: (p.painPointsJson as string[]) || [],
    desiresJson: (p.desiresJson as string[]) || [],
    objectionsJson: (p.objectionsJson as string[]) || [],
  }));

  return (
    <SidebarLayout>
      <div className="p-8 max-w-7xl mx-auto w-full">
        <header className="flex justify-between items-end mb-10 border-b border-zinc-200 dark:border-zinc-800 pb-6">
          <div>
            <h1 className="text-3xl font-bold text-zinc-900 dark:text-white">Living Avatar Matrix</h1>
            <p className="text-zinc-500 mt-2 max-w-2xl">
              The AI Brain behind your marketing. Define your ideal customers here, and Quipsly AI will use these psychological profiles to write higher-converting emails, scripts, and sales pages.
            </p>
          </div>
          {/* Top right "New Avatar" button rendered by client component via fixed/absolute positioning inside relative header or just relying on its own layout */}
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 relative">
          {mappedPersonas.map(persona => (
            <PersonaCard key={persona.id} persona={persona} />
          ))}

          {/* Client component for the Generate tile and Modal */}
          <AvatarDashboardClient />
        </div>
      </div>
    </SidebarLayout>
  );
}
