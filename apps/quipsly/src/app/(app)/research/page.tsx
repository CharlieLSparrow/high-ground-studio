"use client";

import { useState } from "react";
import { Search, BrainCircuit, BookOpen, ChevronRight, Hash, Database, Sparkles } from "lucide-react";
import {
  getSourceIngestStatusDescription,
  getSourceIngestStatusLabel,
  getSourceReviewStatusLabel,
  type SourceAwareResearchPacket,
  type SourceIngestStatus,
} from "@high-ground/quipsly-domain/source-aware";

type ResearchPacketCard = {
  id: number;
  title: string;
  concept: string;
  source: string;
  ingestStatus: SourceIngestStatus;
  reviewStatus: SourceAwareResearchPacket["humanReviewStatus"];
};

export default function ResearchPage() {
  const [searchQuery, setSearchQuery] = useState("");

  const savedNodes: ResearchPacketCard[] = [
    { id: 1, title: "Wednesday Rule source packet", concept: "Leadership", source: "High Ground Odyssey manuscript", ingestStatus: "indexed", reviewStatus: "approved" },
    { id: 2, title: "Systems anxiety examples", concept: "Product Philosophy", source: "Quipsly essay draft", ingestStatus: "needs-review", reviewStatus: "needs-review" },
    { id: 3, title: "One living document pattern", concept: "Writing Workflow", source: "Quipsly starter document", ingestStatus: "chunked", reviewStatus: "draft" },
  ];

  const activeAssistants = [
    { id: 1, name: "Source Finder", status: "Reviewing", target: "Current Nest sources", progress: 65 },
    { id: 2, name: "Citation Clerk", status: "Ready", target: "Awaiting selected block", progress: 0 },
  ];

  return (
    <div className="w-full h-full flex flex-col bg-transparent overflow-y-auto">
      <header className="p-8 pb-4">
        <p className="text-sm font-bold text-[#8c6b4a] uppercase tracking-widest mb-1">Research & Knowledge</p>
        <h1 className="text-4xl font-black text-[#3d3122]">Research Library</h1>
        <p className="text-[#8c6b4a] mt-2">
          Ask Quipslys to find examples, compare sources, prepare packets, and bring receipts. They organize the evidence; you do the writing.
        </p>
      </header>

      <div className="p-8 pt-4 grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Left Column (Knowledge Nodes) */}
        <div className="col-span-1 lg:col-span-2 flex flex-col gap-6">

          {/* Global Search Bar */}
          <div className="w-full relative">
             <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
               <Search className="text-[#8c6b4a]" size={20} />
             </div>
             <input
               type="text"
                 className="w-full bg-white border-2 border-[#e8dcc4] rounded-2xl pl-12 pr-4 py-4 text-lg font-medium text-[#3d3122] focus:outline-none focus:border-amber-500 shadow-sm transition-all placeholder:text-[#d4c1a0]"
               placeholder="Search source text, quote overlays, transcripts, notes, and concepts..."
               value={searchQuery}
               onChange={(e) => setSearchQuery(e.target.value)}
             />
             <div className="absolute inset-y-0 right-2 flex items-center">
               <button className="bg-[#8c6b4a] text-white px-4 py-1.5 rounded-xl font-bold text-sm hover:bg-[#5e4b33] transition-colors shadow-sm">
                 Source Search
               </button>
             </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            {[
              ["Source stays intact", "Imported books, pages, transcripts, and course material should remain traceable as source evidence."],
              ["Overlays stay editable", "Highlights, tags, quotes, questions, and notes can evolve without corrupting the source."],
              ["Packets need approval", "Research packets can prepare examples and citations, but public use stays review-first."],
            ].map(([title, body]) => (
              <div key={title} className="rounded-2xl border border-[#e8dcc4] bg-white p-4 shadow-sm">
                <p className="font-serif text-lg font-black text-[#3d3122]">{title}</p>
                <p className="mt-2 text-xs leading-5 text-[#8c6b4a]">{body}</p>
              </div>
            ))}
          </div>

          <div className="bg-white border border-[#e8dcc4] rounded-2xl p-6 shadow-sm">
             <div className="flex justify-between items-center mb-6">
               <h3 className="text-lg font-bold text-[#3d3122] flex items-center gap-2">
                 <Database className="text-[#8c6b4a]" size={20} />
                 Source-Aware Packets
               </h3>
               <button className="text-xs font-bold text-amber-600 hover:text-amber-700">View All</button>
             </div>

             <div className="flex flex-col gap-3">
               {savedNodes.map(node => (
                 <div key={node.id} className="p-4 bg-[#fdfaf6] border border-[#e8dcc4] rounded-xl hover:border-[#d4c1a0] transition-colors group cursor-pointer flex justify-between items-center">
                   <div className="flex flex-col gap-1.5">
                     <span className="font-bold text-[#3d3122]">{node.title}</span>
                     <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold uppercase tracking-wider bg-white text-[#8c6b4a] border border-[#e8dcc4] px-2 py-0.5 rounded-full flex items-center gap-1">
                          <Hash size={10} /> {node.concept}
                        </span>
                        <span
                          className="text-[10px] font-bold uppercase tracking-wider bg-white text-[#8c6b4a] border border-[#e8dcc4] px-2 py-0.5 rounded-full"
                          title={getSourceIngestStatusDescription(node.ingestStatus)}
                        >
                          {getSourceIngestStatusLabel(node.ingestStatus)}
                        </span>
                        <span className="text-[10px] font-bold uppercase tracking-wider bg-amber-50 text-amber-800 border border-amber-200 px-2 py-0.5 rounded-full">
                          {getSourceReviewStatusLabel(node.reviewStatus)}
                        </span>
                     </div>
                   </div>
                   <div className="flex items-center gap-4">
                     <span className="text-xs text-[#8c6b4a] flex items-center gap-1"><BookOpen size={12} /> {node.source}</span>
                     <ChevronRight size={16} className="text-[#d4c1a0] group-hover:text-amber-500 transition-colors" />
                   </div>
                 </div>
               ))}
             </div>
          </div>

        </div>

        {/* Right Column (Agents) */}
        <div className="col-span-1 flex flex-col gap-6">
          <div className="bg-[#f8f3e6] border border-[#e8dcc4] rounded-2xl p-6 shadow-sm flex-1">
             <div className="flex justify-between items-center mb-6">
               <h3 className="text-lg font-bold text-[#3d3122] flex items-center gap-2">
                 <BrainCircuit className="text-[#8c6b4a]" size={20} />
                 Quipsly Assistants
               </h3>
             </div>

             <div className="flex flex-col gap-4">
               {activeAssistants.map(assistant => (
                 <div key={assistant.id} className="p-4 bg-white border border-[#e8dcc4] rounded-xl shadow-sm">
                   <div className="flex justify-between items-start mb-2">
                     <div className="flex flex-col">
                       <span className="font-bold text-sm text-[#3d3122]">{assistant.name}</span>
                       <span className="text-[10px] text-[#8c6b4a] font-mono mt-0.5">Target: {assistant.target}</span>
                     </div>
                     <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${assistant.status === 'Reviewing' ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' : 'bg-[#fdfaf6] text-[#8c6b4a] border border-[#e8dcc4]'}`}>
                       {assistant.status}
                     </span>
                   </div>
                   {assistant.status === 'Reviewing' && (
                     <div className="w-full h-1.5 bg-[#f8f3e6] rounded-full mt-3 overflow-hidden">
                        <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${assistant.progress}%` }}></div>
                     </div>
                   )}
                 </div>
               ))}

               <button className="w-full py-3 mt-2 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl shadow-sm transition-colors text-sm flex justify-center items-center gap-2">
                 <Sparkles size={16} /> Prepare Research Packet
               </button>
             </div>
          </div>
        </div>

      </div>
    </div>
  );
}
