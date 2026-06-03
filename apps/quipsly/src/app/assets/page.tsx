"use client";

import { useState } from "react";
import { Search, Filter, Image as ImageIcon, Video, Mic, FileText, Download, Trash2, MoreVertical } from "lucide-react";

export default function AssetsPage() {
  const [activeTab, setActiveTab] = useState("all");

  const assets = [
    { id: 1, name: "Studio_Tour_A_Roll.mp4", type: "video", size: "4.2 GB", date: "May 30, 2026", tags: ["A-Roll", "Studio"] },
    { id: 2, name: "Keyboard_Typing_B_Roll.mp4", type: "video", size: "1.1 GB", date: "May 29, 2026", tags: ["B-Roll"] },
    { id: 3, name: "Podcast_Ep42_Audio.wav", type: "audio", size: "850 MB", date: "May 28, 2026", tags: ["Podcast", "Raw"] },
    { id: 4, name: "Thumbnail_Draft_1.psd", type: "image", size: "45 MB", date: "May 28, 2026", tags: ["Design"] },
    { id: 5, name: "Script_Draft_Final.md", type: "document", size: "12 KB", date: "May 27, 2026", tags: ["Script"] },
    { id: 6, name: "Insta360_Room_Scan.insv", type: "video", size: "8.4 GB", date: "May 25, 2026", tags: ["360", "Raw"] },
  ];

  const getIcon = (type: string) => {
    switch(type) {
      case 'video': return <Video size={24} className="text-blue-500" />;
      case 'audio': return <Mic size={24} className="text-amber-500" />;
      case 'image': return <ImageIcon size={24} className="text-emerald-500" />;
      default: return <FileText size={24} className="text-gray-500" />;
    }
  };

  return (
    <div className="w-full h-full flex flex-col bg-transparent overflow-hidden">
      <header className="p-8 pb-4 shrink-0">
        <p className="text-sm font-bold text-[#8c6b4a] uppercase tracking-widest mb-1">Global Media Pool</p>
        <div className="flex justify-between items-end">
          <div>
            <h1 className="text-4xl font-black text-[#3d3122]">The Vault</h1>
            <p className="text-[#8c6b4a] mt-2">Browse, tag, and manage all your raw assets across Google Cloud Storage.</p>
          </div>
          <div className="flex gap-3">
             <div className="relative">
               <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8c6b4a]" size={16} />
               <input type="text" placeholder="Search assets..." className="pl-9 pr-4 py-2 bg-white border border-[#e8dcc4] rounded-xl text-sm focus:outline-none focus:border-amber-500 shadow-sm w-64" />
             </div>
             <button className="flex items-center gap-2 px-4 py-2 bg-white border border-[#e8dcc4] text-[#8c6b4a] rounded-xl font-bold text-sm shadow-sm hover:text-[#3d3122] transition-colors">
               <Filter size={16} /> Filter
             </button>
             <button className="px-6 py-2 bg-[#8c6b4a] text-white rounded-xl font-bold text-sm shadow-sm hover:bg-[#7a5d40] transition-colors">
               Upload
             </button>
          </div>
        </div>
      </header>

      <div className="px-8 mb-4 shrink-0 border-b border-[#e8dcc4]">
        <div className="flex gap-6">
          {["all", "video", "audio", "image", "document"].map(tab => (
            <button 
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`pb-3 text-sm font-bold capitalize transition-colors relative ${activeTab === tab ? 'text-amber-600' : 'text-[#8c6b4a] hover:text-[#3d3122]'}`}
            >
              {tab}
              {activeTab === tab && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-amber-600 rounded-t-full"></div>}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-8 pt-0">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {assets.filter(a => activeTab === 'all' || a.type === activeTab).map(asset => (
            <div key={asset.id} className="bg-white border border-[#e8dcc4] rounded-2xl overflow-hidden shadow-sm group hover:border-amber-400 hover:shadow-md transition-all flex flex-col cursor-pointer">
               <div className="aspect-video bg-[#fdfaf6] border-b border-[#e8dcc4] flex items-center justify-center relative overflow-hidden group-hover:bg-[#f8f3e6] transition-colors">
                  {getIcon(asset.type)}
                  {/* Hover overlay actions */}
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3 backdrop-blur-[2px]">
                     <button className="w-10 h-10 rounded-full bg-white text-[#3d3122] flex items-center justify-center hover:bg-amber-500 hover:text-white transition-colors shadow-lg">
                       <Download size={18} />
                     </button>
                     <button className="w-10 h-10 rounded-full bg-white text-red-500 flex items-center justify-center hover:bg-red-500 hover:text-white transition-colors shadow-lg">
                       <Trash2 size={18} />
                     </button>
                  </div>
               </div>
               
               <div className="p-4 flex flex-col flex-1">
                 <div className="flex justify-between items-start gap-2">
                   <h3 className="font-bold text-[#3d3122] text-sm truncate" title={asset.name}>{asset.name}</h3>
                   <button className="text-[#8c6b4a] hover:text-[#3d3122]"><MoreVertical size={16} /></button>
                 </div>
                 
                 <div className="flex items-center gap-2 mt-1 text-[10px] text-[#8c6b4a] font-mono">
                   <span>{asset.size}</span>
                   <span>•</span>
                   <span>{asset.date}</span>
                 </div>
                 
                 <div className="flex flex-wrap gap-1.5 mt-auto pt-4">
                   {asset.tags.map(tag => (
                     <span key={tag} className="text-[9px] font-bold uppercase tracking-wider bg-[#f8f3e6] text-[#8c6b4a] px-2 py-0.5 rounded border border-[#e8dcc4]">
                       {tag}
                     </span>
                   ))}
                   <button className="text-[9px] font-bold uppercase tracking-wider bg-white text-[#d4c1a0] hover:text-amber-600 hover:border-amber-400 px-2 py-0.5 rounded border border-dashed border-[#d4c1a0] transition-colors">
                     + Tag
                   </button>
                 </div>
               </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
