import React from 'react';
import { WakeLockManager } from './WakeLockManager';
import { RecorderBottomBar } from './RecorderBottomBar';
import { ReadModeManuscript, StudioDocumentBlock } from './ReadModeManuscript';
import { notFound } from 'next/navigation';

// In a real implementation, we would import db/prisma here and fetch actual data.
// For this passion run, we'll mock the data fetching to demonstrate the architecture 
// cleanly without needing to seed a complex database state locally.
async function fetchEpisodeContext(projectSlug: string, episodeSlug: string) {
  // Mocking the database fetch delay
  await new Promise(resolve => setTimeout(resolve, 500));
  
  if (!projectSlug || !episodeSlug) return null;
  
  return {
    projectTitle: projectSlug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
    episodeTitle: episodeSlug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
    blocks: [
      { id: 'b1', type: 'heading', content: 'Act 1: The Inciting Incident' },
      { id: 'b2', type: 'paragraph', content: 'The scene opens on a bustling city street. The sounds of traffic and distant sirens set a tense atmosphere. Our protagonist is unaware of what is about to happen.' },
      { id: 'b3', type: 'paragraph', content: 'We need to emphasize the sheer scale of the environment here. It is critical for the audience to feel small.' },
      { 
        id: 'b4', 
        type: 'inline_clip', 
        content: '', 
        metadataJson: { 
          source: 'youtube', 
          title: 'Blade Runner 2049 Cityscape Reference', 
          url: 'https://www.youtube.com/embed/gCcx85zbxz4' 
        } 
      },
      { id: 'b5', type: 'heading', content: 'Act 2: The Confrontation' },
      { id: 'b6', type: 'paragraph', content: 'The tension breaks. A sudden realization forces a change in direction. The pacing here must be rapid and relentless.' },
      { 
        id: 'b7', 
        type: 'inline_clip', 
        content: '', 
        metadataJson: { 
          source: 'bucket', 
          title: 'Raw Take 3 - Foley Walk', 
          url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4' 
        } 
      },
      { id: 'b8', type: 'paragraph', content: 'The echo of footsteps fades into the distance as the chapter closes.' }
    ] as StudioDocumentBlock[]
  };
}

export default async function ReadModePage({
  searchParams,
}: {
  searchParams: { projectSlug?: string; episodeSlug?: string };
}) {
  const { projectSlug, episodeSlug } = searchParams;
  
  if (!projectSlug || !episodeSlug) {
    // If no context is provided, return a simple error or 404
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
      <RecorderBottomBar />
    </div>
  );
}
