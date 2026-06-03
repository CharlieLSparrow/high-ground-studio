import { getPrismaClient } from '@/lib/prisma';
import { SidebarLayout } from '@/components/SidebarLayout';
import Link from 'next/link';
import { Film, Folder, Plus } from 'lucide-react';
import { seedDummyVideo } from './actions';

export const dynamic = 'force-dynamic';

export default async function MediaLibraryPage({ searchParams }: { searchParams: { projectId?: string } }) {
  const prisma = getPrismaClient();

  const user = await prisma.user.findFirst();
  if (!user) {
    return <SidebarLayout><div className="p-8">No user found.</div></SidebarLayout>;
  }

  const projects = await prisma.studioProject.findMany({
    orderBy: { updatedAt: 'desc' }
  });

  const selectedProjectId = searchParams.projectId || projects[0]?.id;

  let bins: any[] = [];
  let assets: any[] = [];

  if (selectedProjectId) {
    bins = await prisma.mediaBin.findMany({
      where: { projectId: selectedProjectId }
    });

    assets = await prisma.studioMediaAsset.findMany({
      where: { projects: { some: { id: selectedProjectId } } },
      include: { clips: true }
    });
  }

  return (
    <SidebarLayout>
      <div className="p-8 max-w-7xl mx-auto h-full flex flex-col">
        <header className="mb-8 flex flex-col md:flex-row md:justify-between md:items-end gap-4">
          <div>
            <h1 className="text-3xl font-bold text-zinc-900 dark:text-white flex items-center gap-3">
              <Film className="text-indigo-500" /> 
              Media Library
            </h1>
            <p className="text-zinc-500 mt-2">Organize raw footage, create bins, and log your travel clips.</p>
          </div>
          
          <div className="flex gap-4">
            {projects.length > 0 && (
              <form action="">
                <select 
                  name="projectId"
                  className="px-4 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg shadow-sm font-medium w-full md:w-64 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  defaultValue={selectedProjectId || ''}
                  onChange={(e) => e.target.form?.submit()}
                >
                  {projects.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </form>
            )}
            <form action={async () => {
              'use server';
              if (selectedProjectId) {
                await seedDummyVideo(selectedProjectId);
              }
            }}>
              <button type="submit" className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium flex items-center gap-2 transition-colors">
                <Plus size={18} /> Add Dummy Asset
              </button>
            </form>
          </div>
        </header>

        <div className="flex-1 flex gap-8">
          {/* Bins Sidebar */}
          <div className="w-64 flex-shrink-0 flex flex-col gap-2">
            <h3 className="text-sm font-bold text-zinc-500 uppercase tracking-wider mb-2">Media Bins</h3>
            <Link href={`/media?projectId=${selectedProjectId}`} className="flex items-center gap-2 px-3 py-2 bg-zinc-100 dark:bg-zinc-800 rounded-lg text-zinc-900 dark:text-zinc-100 font-medium">
              <Film size={18} /> All Footage
            </Link>
            {bins.map(bin => (
              <Link key={bin.id} href={`/media?projectId=${selectedProjectId}&binId=${bin.id}`} className="flex items-center gap-2 px-3 py-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg text-zinc-600 dark:text-zinc-400 font-medium transition-colors">
                <Folder size={18} /> {bin.name}
              </Link>
            ))}
          </div>

          {/* Asset Grid */}
          <div className="flex-1">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {assets.map(asset => (
                <Link key={asset.id} href={`/media/${asset.id}`} className="group block bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden shadow-sm hover:shadow-md hover:border-indigo-500 transition-all">
                  <div className="aspect-video bg-zinc-900 relative">
                    {asset.thumbnailUrl ? (
                      <img src={asset.thumbnailUrl} alt={asset.filename} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-zinc-600"><Film size={32} /></div>
                    )}
                    {asset.duration && (
                      <div className="absolute bottom-2 right-2 px-1.5 py-0.5 bg-black/70 text-white text-xs font-mono rounded">
                        {Math.floor(asset.duration / 60)}:{(asset.duration % 60).toString().padStart(2, '0')}
                      </div>
                    )}
                  </div>
                  <div className="p-4">
                    <h4 className="font-semibold text-zinc-900 dark:text-zinc-100 truncate mb-1" title={asset.filename}>{asset.filename}</h4>
                    <div className="flex items-center justify-between text-xs text-zinc-500">
                      <span>{asset.resolution || 'Unknown'} • {asset.fps || '--'}fps</span>
                      <span className="font-medium px-2 py-0.5 bg-zinc-100 dark:bg-zinc-800 rounded">{asset.clips.length} Clips</span>
                    </div>
                  </div>
                </Link>
              ))}
              
              {assets.length === 0 && (
                <div className="col-span-full py-20 text-center border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-2xl">
                  <Film size={48} className="mx-auto mb-4 opacity-20" />
                  <h3 className="text-xl font-medium text-zinc-500">No media found</h3>
                  <p className="text-zinc-400 mt-2">Click "Add Dummy Asset" to get started.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </SidebarLayout>
  );
}
