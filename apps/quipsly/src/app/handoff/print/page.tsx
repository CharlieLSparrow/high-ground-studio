import { getPrismaClient } from '@/lib/prisma';
import { notFound } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function HandoffPrintView({ searchParams }: { searchParams: { studioProjectId: string, projectId: string } }) {
  if (!searchParams.studioProjectId || !searchParams.projectId) {
    return notFound();
  }

  const prisma = getPrismaClient();

  // Fetch Breakdown Data
  const studioProject = await prisma.studioProject.findUnique({
    where: { id: searchParams.studioProjectId },
    include: {
      tags: {
        where: { category: 'production_breakdown' },
        include: {
          knowledgeNodes: {
            include: {
              document: true
            }
          }
        }
      }
    }
  });

  // Fetch Storyboard Data
  const project = await prisma.project.findUnique({
    where: { id: searchParams.projectId },
    include: {
      scenes: {
        orderBy: { sortOrder: 'asc' },
        include: {
          shots: {
            orderBy: { sortOrder: 'asc' }
          }
        }
      }
    }
  });

  if (!studioProject || !project) {
    return notFound();
  }

  return (
    <div className="bg-white min-h-screen print:bg-white text-black font-sans pb-20">
      <style dangerouslySetInnerHTML={{__html: `
        @media print {
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; background: white !important; }
          @page { margin: 0.5in; }
          .print-break-inside-avoid { break-inside: avoid; }
          .print-page-break-before { page-break-before: always; }
        }
      `}} />

      {/* Cover Page */}
      <div className="flex flex-col items-center justify-center min-h-[80vh] print:min-h-[90vh]">
        <h1 className="text-5xl font-black mb-4 uppercase tracking-wider">{project.title}</h1>
        <h2 className="text-2xl text-gray-500 mb-12">Production Handoff Packet</h2>
        <div className="w-24 h-1 bg-black mb-12" />
        <p className="text-lg font-medium">Breakdown: {studioProject.name}</p>
        <p className="text-sm text-gray-400 mt-4">{new Date().toLocaleDateString()}</p>
      </div>

      {/* Breakdowns Section */}
      <div className="print-page-break-before px-10 print:px-0">
        <h2 className="text-3xl font-bold mb-8 pb-2 border-b-2 border-black">Script Breakdown</h2>
        {studioProject.tags.length === 0 && (
          <p className="text-gray-500 italic">No production breakdowns found in this project.</p>
        )}
        {studioProject.tags.map(tag => (
          <div key={tag.id} className="mb-8 print-break-inside-avoid">
            <h3 className="text-xl font-bold mb-4 bg-gray-100 p-2 inline-block uppercase text-sm tracking-wider">{tag.label}</h3>
            {tag.knowledgeNodes.length === 0 ? (
              <p className="text-sm text-gray-500 italic pl-4">No elements tagged.</p>
            ) : (
              <ul className="list-disc pl-8 space-y-2">
                {tag.knowledgeNodes.map(node => (
                  <li key={node.id} className="text-sm">
                    <span className="font-medium">"{node.title}"</span> 
                    {node.body && <span className="text-gray-600"> - {node.body}</span>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>

      {/* Storyboards Section */}
      <div className="print-page-break-before px-10 print:px-0 mt-20 print:mt-0">
        <h2 className="text-3xl font-bold mb-8 pb-2 border-b-2 border-black">Storyboards</h2>
        {project.scenes.length === 0 && (
          <p className="text-gray-500 italic">No storyboard scenes found in this project.</p>
        )}
        {project.scenes.map(scene => (
          <div key={scene.id} className="mb-12">
            <div className="bg-black text-white p-3 mb-6 print-break-inside-avoid flex justify-between items-center rounded">
              <h3 className="text-xl font-bold">SCENE {scene.sceneNumber}: {scene.title || 'Untitled'}</h3>
              <span className="text-sm uppercase tracking-wide text-gray-300">{scene.location} {scene.timeOfDay ? `• ${scene.timeOfDay}` : ''}</span>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {scene.shots.map(shot => (
                <div key={shot.id} className="border-2 border-gray-200 rounded-lg overflow-hidden print-break-inside-avoid bg-white">
                  <div className="aspect-video bg-gray-100 relative border-b-2 border-gray-200">
                    {shot.imageUrl ? (
                      <img src={shot.imageUrl} alt={shot.action || 'Storyboard frame'} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-400 text-sm italic">No Image</div>
                    )}
                  </div>
                  <div className="p-3">
                    <div className="font-bold text-lg mb-2">Shot {shot.shotNumber}</div>
                    {shot.cameraInfo && <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Camera: {shot.cameraInfo}</div>}
                    <div className="text-sm leading-snug">{shot.action || 'No action notes.'}</div>
                    {shot.dialogue && (
                      <div className="mt-2 text-xs italic text-gray-600 border-l-2 border-gray-300 pl-2">"{shot.dialogue}"</div>
                    )}
                    {shot.vfxNotes && (
                      <div className="mt-2 text-xs font-medium text-amber-600">VFX: {shot.vfxNotes}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
