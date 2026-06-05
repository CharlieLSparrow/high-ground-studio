import React from 'react';

// Normally this would be defined in a shared types file from Prisma, 
// but we define it here for the scope of this passion run.
export interface StudioDocumentBlock {
  id: string;
  type: string; // 'paragraph', 'heading', 'inline_clip'
  content: string;
  metadataJson?: any;
}

interface ReadModeManuscriptProps {
  blocks: StudioDocumentBlock[];
}

export function ReadModeManuscript({ blocks }: ReadModeManuscriptProps) {
  return (
    <div className="max-w-prose mx-auto px-6 py-8 pb-48 text-zinc-100 font-serif leading-relaxed text-xl sm:text-2xl">
      {blocks.map((block) => (
        <BlockRenderer key={block.id} block={block} />
      ))}
    </div>
  );
}

function BlockRenderer({ block }: { block: StudioDocumentBlock }) {
  switch (block.type) {
    case 'heading':
      return <h2 className="text-3xl sm:text-4xl font-bold font-sans mt-12 mb-6 text-white tracking-tight leading-tight">{block.content}</h2>;
      
    case 'paragraph':
      return <p className="mb-6 tracking-wide opacity-90">{block.content}</p>;
      
    case 'inline_clip':
      // Extract media details from metadataJson
      const { source, title, url } = block.metadataJson || {};
      
      return (
        <div className="my-10 bg-zinc-800 rounded-xl overflow-hidden shadow-xl border border-zinc-700/50">
          <div className="bg-zinc-900/50 px-4 py-2 border-b border-zinc-700 flex justify-between items-center">
            <span className="text-xs font-mono text-zinc-400 font-medium uppercase tracking-wider">
              {source === 'youtube' ? 'YouTube Loop' : 'Bucket Media'}
            </span>
            <span className="text-xs text-zinc-300 font-sans font-medium line-clamp-1 max-w-[200px]">
              {title || 'Media Clip'}
            </span>
          </div>
          
          <div className="aspect-video bg-black relative flex items-center justify-center">
            {source === 'youtube' && url ? (
              <iframe 
                src={`${url}?autoplay=1&loop=1&playlist=${url.split('v=')[1] || url.split('/').pop()}&controls=0&mute=1`}
                className="w-full h-full border-0"
                allow="autoplay; encrypted-media"
                title={title}
              />
            ) : source === 'bucket' && url ? (
              <video 
                src={url} 
                className="w-full h-full object-contain"
                autoPlay 
                loop 
                muted 
                playsInline
              />
            ) : (
              <div className="text-zinc-600 flex flex-col items-center gap-2">
                <div className="w-12 h-12 rounded-full bg-zinc-800 animate-pulse" />
                <span className="text-sm font-sans">Media Placeholder</span>
              </div>
            )}
          </div>
        </div>
      );
      
    default:
      return null;
  }
}
