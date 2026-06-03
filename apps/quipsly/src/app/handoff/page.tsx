import { getPrismaClient } from '@/lib/prisma';
import { SidebarLayout } from '@/components/SidebarLayout';
import Link from 'next/link';
import { FileText, Download, Printer } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function HandoffDashboard({ searchParams }: { searchParams: { studioProjectId?: string, projectId?: string } }) {
  const prisma = getPrismaClient();

  const studioProjects = await prisma.studioProject.findMany({
    include: { workspace: true }
  });

  const storyboardProjects = await prisma.project.findMany({
    include: { scenes: true }
  });

  // Pick first by default if not specified
  const selectedStudioProjectId = searchParams.studioProjectId || studioProjects[0]?.id;
  const selectedProjectId = searchParams.projectId || storyboardProjects[0]?.id;

  return (
    <SidebarLayout>
      <div className="p-8 max-w-4xl mx-auto">
        <header className="mb-8">
          <h1 className="text-3xl font-bold text-zinc-900 dark:text-white">Studio Handoff</h1>
          <p className="text-zinc-500 mt-2">Package and export your Script Breakdowns and Storyboards for production.</p>
        </header>

        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-sm mb-8">
          <h2 className="text-xl font-bold text-zinc-900 dark:text-white mb-4">Select Source Materials</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">Script Breakdown Source</label>
              <div className="space-y-2">
                {studioProjects.length === 0 && <p className="text-sm text-zinc-500 italic">No Studio Projects found.</p>}
                {studioProjects.map(sp => (
                  <Link 
                    key={sp.id} 
                    href={`/handoff?studioProjectId=${sp.id}&projectId=${selectedProjectId}`}
                    className={`block p-3 rounded-xl border ${selectedStudioProjectId === sp.id ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-500/10' : 'border-zinc-200 dark:border-zinc-800 hover:border-indigo-300'}`}
                  >
                    <div className="font-semibold text-zinc-900 dark:text-white">{sp.name}</div>
                    <div className="text-xs text-zinc-500">{sp.workspace.name}</div>
                  </Link>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">Storyboard Source</label>
              <div className="space-y-2">
                {storyboardProjects.length === 0 && <p className="text-sm text-zinc-500 italic">No Storyboard Projects found.</p>}
                {storyboardProjects.map(p => (
                  <Link 
                    key={p.id} 
                    href={`/handoff?studioProjectId=${selectedStudioProjectId}&projectId=${p.id}`}
                    className={`block p-3 rounded-xl border ${selectedProjectId === p.id ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-500/10' : 'border-zinc-200 dark:border-zinc-800 hover:border-indigo-300'}`}
                  >
                    <div className="font-semibold text-zinc-900 dark:text-white">{p.title}</div>
                    <div className="text-xs text-zinc-500">{p.scenes?.length || 0} Scenes</div>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="flex gap-4">
          <Link
            href={`/handoff/print?studioProjectId=${selectedStudioProjectId}&projectId=${selectedProjectId}`}
            target="_blank"
            className={`flex items-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-medium transition-colors ${(!selectedStudioProjectId || !selectedProjectId) && 'opacity-50 pointer-events-none'}`}
          >
            <Printer size={18} />
            Generate PDF
          </Link>
          <Link
            href={`/api/handoff/export?studioProjectId=${selectedStudioProjectId}&projectId=${selectedProjectId}`}
            target="_blank"
            className={`flex items-center gap-2 px-6 py-3 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-900 dark:text-white rounded-xl font-medium transition-colors ${(!selectedStudioProjectId || !selectedProjectId) && 'opacity-50 pointer-events-none'}`}
          >
            <Download size={18} />
            Export JSON
          </Link>
        </div>
      </div>
    </SidebarLayout>
  );
}
