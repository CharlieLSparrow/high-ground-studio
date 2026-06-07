import { getPrismaClient } from '@/lib/prisma';
import Link from 'next/link';
import { FileText, Download, Printer } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function HandoffDashboard({ searchParams }: { searchParams: { projectId?: string } }) {
  const prisma = getPrismaClient();

  const studioProjects = await prisma.studioProject.findMany({
    include: { workspace: true }
  });

  // Pick first by default if not specified
  const selectedProjectId = searchParams.projectId || studioProjects[0]?.id;

  return (
    <>
      <div className="p-8 max-w-4xl mx-auto">
        <header className="mb-8">
          <h1 className="text-3xl font-bold text-zinc-900 dark:text-white">Studio Handoff</h1>
          <p className="text-zinc-500 mt-2">Package and export your Script Breakdowns and Storyboards for production.</p>
        </header>

        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-sm mb-8">
          <h2 className="text-xl font-bold text-zinc-900 dark:text-white mb-4">Select Source Materials</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {studioProjects.length === 0 && <p className="text-sm text-zinc-500 italic">No Projects found.</p>}
            {studioProjects.map(sp => (
              <Link
                key={sp.id}
                href={`/handoff?projectId=${sp.id}`}
                className={`block p-3 rounded-xl border ${selectedProjectId === sp.id ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-500/10' : 'border-zinc-200 dark:border-zinc-800 hover:border-indigo-300'}`}
              >
                <div className="font-semibold text-zinc-900 dark:text-white">{sp.name}</div>
                <div className="text-xs text-zinc-500">{sp.workspace.name}</div>
              </Link>
            ))}
          </div>
        </div>

        <div className="flex gap-4">
          <Link
            href={`/handoff/print?projectId=${selectedProjectId}`}
            target="_blank"
            className={`flex items-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-medium transition-colors ${!selectedProjectId && 'opacity-50 pointer-events-none'}`}
          >
            <Printer size={18} />
            Generate PDF
          </Link>
          <Link
            href={`/api/handoff/export?projectId=${selectedProjectId}`}
            target="_blank"
            className={`flex items-center gap-2 px-6 py-3 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-900 dark:text-white rounded-xl font-medium transition-colors ${!selectedProjectId && 'opacity-50 pointer-events-none'}`}
          >
            <Download size={18} />
            Export JSON
          </Link>
        </div>
      </div>
    </>
  );
}
