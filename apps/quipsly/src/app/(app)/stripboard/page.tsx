import { getPrismaClient } from '@/lib/prisma';
import { StripboardClient } from './stripboard-client';

export const dynamic = 'force-dynamic';

export default async function StripboardPage({ searchParams }: { searchParams: { projectId?: string } }) {
  const prisma = getPrismaClient();

  // Get current user
  const user = await prisma.user.findFirst();
  if (!user) {
    return (
      <>
        <div className="p-8">System not configured. No users found.</div>
      </>
    );
  }

  // Get all projects for selection
  const workspace = await prisma.studioWorkspace.findFirst();
  const projects = workspace
    ? await prisma.studioProject.findMany({
        where: { workspaceId: workspace.id },
        orderBy: { updatedAt: 'desc' }
      })
    : [];

  const selectedProjectId = searchParams.projectId || projects[0]?.id;

  let scenes: any[] = [];
  let shootDays: any[] = [];

  if (selectedProjectId) {
    scenes = await prisma.scene.findMany({
      where: { projectId: selectedProjectId },
      orderBy: { stripOrder: 'asc' }
    });

    shootDays = await prisma.shootDay.findMany({
      where: { projectId: selectedProjectId },
      orderBy: { sortOrder: 'asc' }
    });
  }

  return (
    <>
      <div className="p-8 max-w-6xl mx-auto">
        <header className="mb-8 flex flex-col md:flex-row md:justify-between md:items-end gap-4">
          <div>
            <h1 className="text-3xl font-bold text-zinc-900 dark:text-white">Stripboard Engine</h1>
            <p className="text-zinc-500 mt-2">Drag and drop scenes to organize your shooting schedule.</p>
          </div>

          {projects.length > 0 && (
            <div className="relative">
              <form action="">
                <select
                  name="projectId"
                  className="px-4 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg shadow-sm font-medium w-full md:w-64 appearance-none focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  defaultValue={selectedProjectId || ''}
                  onChange={(e) => {
                    e.target.form?.submit();
                  }}
                >
                  {projects.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </form>
            </div>
          )}
        </header>

        {selectedProjectId ? (
          <StripboardClient
            projectId={selectedProjectId}
            initialScenes={scenes}
            initialShootDays={shootDays}
          />
        ) : (
          <div className="p-12 text-center border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-2xl">
            <h3 className="text-xl font-medium text-zinc-500">No Projects Found</h3>
            <p className="text-zinc-400 mt-2">Create a project and add scenes to start scheduling.</p>
          </div>
        )}
      </div>
    </>
  );
}
