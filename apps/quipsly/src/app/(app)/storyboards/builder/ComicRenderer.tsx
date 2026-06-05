import React from 'react';
import Image from 'next/image';

export function ComicRenderer({ frames }: { frames: any[] }) {
  return (
    <div className="max-w-4xl mx-auto bg-white p-8 sm:p-12 shadow-2xl">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2 sm:gap-4 auto-rows-[250px]">
        {frames?.map((frame: any) => (
          <div key={frame.id} className="relative border-4 border-zinc-900 bg-zinc-100 overflow-hidden group">
            {frame.imageUrl ? (
              <Image src={frame.imageUrl} alt={`Comic Panel ${frame.frameNumber}`} fill className="object-cover grayscale hover:grayscale-0 transition-all duration-700" />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <span className="text-zinc-300 font-bold uppercase rotate-[-20deg]">Sketch</span>
              </div>
            )}
            {frame.dialogue && (
              <div className="absolute top-2 left-2 right-2 bg-white border-2 border-zinc-900 rounded-2xl rounded-bl-sm p-2 shadow-[2px_2px_0px_rgba(0,0,0,1)] z-10 opacity-90 group-hover:opacity-100 transition-opacity">
                <p className="text-xs font-bold leading-tight uppercase font-sans">{frame.dialogue}</p>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
