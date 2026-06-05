import React from 'react';
import { WakeLockManager } from './WakeLockManager';
import { RecorderBottomBar } from './RecorderBottomBar';
import { ReadModeManuscript, StudioDocumentBlock as UIStudioDocumentBlock } from './ReadModeManuscript';
import { notFound } from 'next/navigation';
import { getPrismaClient } from '@/lib/prisma';

async function fetchEpisodeContext(projectSlug: string, episodeSlug: string) {
  if (!projectSlug || !episodeSlug) return null;

  let prisma;
  try {
    prisma = getPrismaClient();
  } catch (err) {
    console.error("Failed to initialize Prisma:", err);
    return null;
  }

  const episode = await prisma.studioEpisodeProduction.findFirst({
    where: {
      slug: episodeSlug,
      project: {
        slug: projectSlug
      }
    },
    include: {
      project: true,
      document: {
        include: {
          blocks: {
            orderBy: {
              order: 'asc'
            }
          }
        }
      }
    }
  });

  if (!episode || !episode.document) {
    return null;
  }

  // Map to UI representation
  const uiBlocks: UIStudioDocumentBlock[] = episode.document.blocks.map(b => ({
    id: b.stableId,
    type: b.title ? 'heading' : 'paragraph',
    content: b.title || b.body,
  }));

  // Append a placeholder for bucket media just for the beta to demonstrate
  // the inline clip capability since we aren't querying the timeline internals yet.
  uiBlocks.push({
    id: 'placeholder-inline-clip',
    type: 'inline_clip',
    content: '',
    metadataJson: {
      source: 'bucket',
      title: 'Upload Media Placeholder',
      url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4'
    }
  });

  return {
    projectTitle: episode.project.name,
    episodeTitle: episode.title,
    blocks: uiBlocks
  };
}

export default async function ReadModePage({
  searchParams,
}: {
  searchParams: { projectSlug?: string; episodeSlug?: string };
}) {
  const { projectSlug, episodeSlug } = searchParams;
  
  if (!projectSlug || !episodeSlug) {
    notFound();
  }

  const context = await fetchEpisodeContext(projectSlug, episodeSlug);
  
  if (!context) {
    notFound();
  }

  return (
    <div className="min-h-screen bg-black selection:bg-red-500/30">
      <WakeLockManager />
      
      {/* Header Context */}
      <header className="sticky top-0 z-40 bg-zinc-900/80 backdrop-blur-md border-b border-zinc-800 px-6 py-4">
        <div className="max-w-prose mx-auto">
          <h3 className="text-zinc-400 text-xs font-bold uppercase tracking-widest mb-1">
            {context.projectTitle}
          </h3>
          <h1 className="text-zinc-100 font-sans font-semibold text-lg line-clamp-1">
            {context.episodeTitle}
          </h1>
        </div>
      </header>

      {/* Main Manuscript Content */}
      <main>
        <ReadModeManuscript blocks={context.blocks} />
      </main>

      {/* Persistent Homer Control Deck */}
      <RecorderBottomBar projectSlug={projectSlug} episodeSlug={episodeSlug} />
    </div>
  );
}
