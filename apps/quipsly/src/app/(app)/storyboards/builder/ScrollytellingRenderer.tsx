import React, { useState } from 'react';
import Image from 'next/image';
import { Film, Image as ImageIcon, Settings, LayoutList } from 'lucide-react';
import { updateScrollSectionTitle } from '../scroll-actions';

export function ScrollytellingRenderer({ experience }: { experience: any }) {
  const [editingSection, setEditingSection] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");

  if (!experience) {
    return (
      <div className="p-8 text-center bg-zinc-900 rounded-3xl border border-zinc-800">
        <h3 className="text-xl font-bold text-white mb-2">No Scroll Experience Built</h3>
        <p className="text-zinc-400">Click "Build Scroll" to generate the data model from this storyboard's frames.</p>
      </div>
    );
  }

  const handleSaveTitle = async (sectionId: string) => {
    await updateScrollSectionTitle(sectionId, editingTitle);
    setEditingSection(null);
  };

  return (
    <div className="flex gap-6 h-[800px]">
      {/* Sidebar Section Editor */}
      <div className="w-80 bg-zinc-900 rounded-3xl p-4 border border-zinc-800 overflow-y-auto flex flex-col gap-4 shadow-xl">
        <div className="flex items-center gap-2 text-indigo-400 border-b border-zinc-800 pb-3">
          <LayoutList className="w-5 h-5" />
          <h3 className="font-bold">Sections Editor</h3>
        </div>
        
        {experience.sections?.map((section: any) => (
          <div key={section.id} className="bg-zinc-950 p-3 rounded-xl border border-zinc-800">
            {editingSection === section.id ? (
              <div className="flex flex-col gap-2">
                <input 
                  autoFocus
                  className="bg-zinc-900 text-white border border-zinc-700 rounded px-2 py-1 text-sm outline-none focus:border-indigo-500" 
                  value={editingTitle} 
                  onChange={e => setEditingTitle(e.target.value)} 
                />
                <div className="flex gap-2">
                  <button onClick={() => handleSaveTitle(section.id)} className="text-xs bg-indigo-600 text-white px-2 py-1 rounded hover:bg-indigo-700">Save</button>
                  <button onClick={() => setEditingSection(null)} className="text-xs bg-zinc-800 text-zinc-300 px-2 py-1 rounded hover:bg-zinc-700">Cancel</button>
                </div>
              </div>
            ) : (
              <div className="flex justify-between items-center group">
                <h4 className="font-bold text-zinc-200 text-sm">{section.title || "Untitled Section"}</h4>
                <button onClick={() => { setEditingSection(section.id); setEditingTitle(section.title || ""); }} className="opacity-0 group-hover:opacity-100 p-1 hover:bg-zinc-800 rounded">
                  <Settings className="w-3.5 h-3.5 text-zinc-400" />
                </button>
              </div>
            )}
            
            <p className="text-xs text-zinc-500 mt-1">{section.panelRefs?.length || 0} panels</p>
          </div>
        ))}
        
      </div>

      {/* Main Viewer */}
      <div className="flex-1 max-w-md mx-auto bg-black rounded-3xl overflow-hidden border-[8px] border-zinc-900 shadow-2xl relative overflow-y-auto snap-y snap-mandatory scroll-smooth pb-[50vh]">
        {experience.sections?.map((section: any) => (
          <React.Fragment key={section.id}>
            {/* Section Divider visible in scroll */}
            {section.title && (
              <div className="w-full h-screen snap-start flex items-center justify-center p-8 bg-zinc-950">
                <h2 className="text-3xl font-black text-white text-center tracking-widest uppercase opacity-80 border-b-2 border-indigo-600 pb-4">{section.title}</h2>
              </div>
            )}
            
            {section.panelRefs?.map((ref: any) => {
              const frame = ref.frame;
              if (!frame) return null;
              return (
                <div key={ref.id} className="w-full h-full snap-start relative flex flex-col justify-center items-center p-4">
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
              );
            })}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}
