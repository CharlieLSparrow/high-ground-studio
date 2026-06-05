import React, { useState } from "react";
import { Image as ImageIcon, Grid, List as ListIcon, Maximize2, Download, CheckCircle, XCircle } from "lucide-react";
import { Block } from "../../Tagger";

export default function ImageGalleryCard({ block }: { block: Block }) {
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [selectedPhotos, setSelectedPhotos] = useState<Set<number>>(new Set([1, 4]));

  const toggleSelection = (id: number) => {
    const next = new Set(selectedPhotos);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedPhotos(next);
  };

  return (
    <div className="my-8 rounded-2xl border border-zinc-200 bg-white overflow-hidden shadow-sm">
      <div className="bg-zinc-950 p-4 flex items-center justify-between text-white">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-zinc-800 flex items-center justify-center border border-zinc-700">
            <ImageIcon size={20} className="text-zinc-300" />
          </div>
          <div>
            <h3 className="font-bold text-lg leading-tight">Lookbook Selections</h3>
            <div className="text-xs text-zinc-400 font-medium">{selectedPhotos.size} of 6 approved • Client Gallery</div>
          </div>
        </div>
        
        <div className="flex items-center gap-2 bg-zinc-900 rounded-lg p-1 border border-zinc-800">
          <button 
            onClick={() => setViewMode("grid")}
            className={`p-1.5 rounded-md transition-colors ${viewMode === 'grid' ? 'bg-zinc-700 text-white' : 'text-zinc-400 hover:text-zinc-200'}`}
          >
            <Grid size={16} />
          </button>
          <button 
            onClick={() => setViewMode("list")}
            className={`p-1.5 rounded-md transition-colors ${viewMode === 'list' ? 'bg-zinc-700 text-white' : 'text-zinc-400 hover:text-zinc-200'}`}
          >
            <ListIcon size={16} />
          </button>
        </div>
      </div>

      <div className={`p-4 ${viewMode === 'grid' ? 'grid grid-cols-2 md:grid-cols-3 gap-4' : 'flex flex-col gap-4'}`}>
        {[1, 2, 3, 4, 5, 6].map((id) => {
          const isSelected = selectedPhotos.has(id);
          return (
            <div 
              key={id} 
              className={`group relative rounded-xl overflow-hidden bg-zinc-100 ${viewMode === 'grid' ? 'aspect-square' : 'flex h-32'}`}
            >
              <div className={`relative ${viewMode === 'list' ? 'w-48 shrink-0' : 'w-full h-full'}`}>
                {/* Simulated Image Placeholder */}
                <div className="absolute inset-0 bg-gradient-to-br from-zinc-200 to-zinc-300 flex items-center justify-center">
                  <ImageIcon size={32} className="text-zinc-400 opacity-50" />
                </div>
                
                {/* Selection Overlay */}
                <div 
                  className={`absolute inset-0 transition-opacity duration-200 ${isSelected ? 'opacity-100 border-4 border-indigo-500 rounded-xl' : 'opacity-0 group-hover:opacity-100 bg-black/20'}`}
                  onClick={() => toggleSelection(id)}
                >
                  <div className="absolute top-3 left-3">
                    {isSelected ? (
                      <div className="bg-indigo-500 rounded-full text-white shadow-lg">
                        <CheckCircle size={24} />
                      </div>
                    ) : (
                      <div className="bg-white/50 backdrop-blur-sm rounded-full text-zinc-700">
                        <CheckCircle size={24} />
                      </div>
                    )}
                  </div>
                </div>
              </div>
              
              {viewMode === 'list' && (
                <div className="p-4 flex-1 flex flex-col justify-center">
                  <div className="flex items-center justify-between mb-2">
                    <div className="font-mono text-sm font-bold text-zinc-700">IMG_84{id}2.RAW</div>
                    <span className={`text-xs font-bold px-2 py-1 rounded-md ${isSelected ? 'bg-indigo-100 text-indigo-700' : 'bg-zinc-100 text-zinc-500'}`}>
                      {isSelected ? 'Approved' : 'Pending'}
                    </span>
                  </div>
                  <div className="text-xs text-zinc-500 mb-4">ISO 100 • 50mm • f/1.8 • 1/250s</div>
                  <div className="flex gap-2">
                    <button className="text-xs font-medium text-zinc-600 bg-zinc-100 hover:bg-zinc-200 px-3 py-1.5 rounded-lg flex items-center gap-1 transition-colors">
                      <Maximize2 size={14} /> Expand
                    </button>
                    <button className="text-xs font-medium text-zinc-600 bg-zinc-100 hover:bg-zinc-200 px-3 py-1.5 rounded-lg flex items-center gap-1 transition-colors">
                      <Download size={14} /> Original
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      
      <div className="bg-zinc-50 border-t border-zinc-200 p-4 flex items-center justify-between">
        <div className="text-sm font-medium text-zinc-600">
          <span className="font-bold text-zinc-900">{selectedPhotos.size}</span> assets approved for final render
        </div>
        <button className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold px-5 py-2 rounded-xl transition-colors shadow-sm">
          Export Selection
        </button>
      </div>
    </div>
  );
}
