import React from 'react';
import Image from 'next/image';
import { Film, Image as ImageIcon } from 'lucide-react';

export function ScrollytellingRenderer({ frames }: { frames: any[] }) {
  return (
    <div className="max-w-md mx-auto bg-black rounded-3xl overflow-hidden border-[8px] border-zinc-900 shadow-2xl relative h-[800px] overflow-y-auto snap-y snap-mandatory scroll-smooth pb-[50vh]">
      {frames?.map((frame: any) => (
        <div key={frame.id} className="w-full h-full snap-start relative flex flex-col justify-center items-center p-4">
          {frame.imageUrl ? (
            <Image src={frame.imageUrl} alt={`Frame ${frame.frameNumber}`} fill className="object-cover opacity-60" />
          ) : (
            <div className="absolute inset-0 bg-zinc-800 flex items-center justify-center">
              <ImageIcon className="w-12 h-12 text-zinc-700" aria-label="No image" />
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/30" />
          
          <div className="relative z-10 w-full mt-auto mb-12">
            {frame.dialogue && (
              <div className="bg-white/95 backdrop-blur text-zinc-900 p-4 rounded-2xl shadow-xl transform transition-all duration-500 hover:scale-105">
                <p className="font-serif text-lg leading-relaxed">{frame.dialogue}</p>
              </div>
            )}
            {frame.mediaClipId && (
              <div className="mt-4 bg-indigo-600/90 backdrop-blur p-3 rounded-xl shadow-lg flex items-center gap-3">
                <Film className="w-5 h-5 text-white" aria-label="Auto-playing video" />
                <div className="flex-1">
                  <p className="text-white text-xs font-bold uppercase tracking-wider">Auto-Playing Video</p>
                  <p className="text-indigo-200 text-[10px] font-mono truncate">{frame.mediaClipId}</p>
                </div>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
