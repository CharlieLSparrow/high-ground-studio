"use client";

import { useState } from "react";
import { Search, BrainCircuit, BookOpen, ChevronRight, Hash, Database, Sparkles } from "lucide-react";

export default function ResearchPage() {
  const [searchQuery, setSearchQuery] = useState("");
  
  // Mock Data
  const savedNodes = [
    { id: 1, title: "The Gradient Descent Analogy", concept: "Machine Learning", source: "YouTube: AI Explained", difficulty: "Beginner" },
    { id: 2, title: "Next.js 14 Server Actions Setup", concept: "Web Dev", source: "Internal: Code Tutorial", difficulty: "Advanced" },
    { id: 3, title: "Building a unified SaaS", concept: "Product Strategy", source: "Article: SaaS Patterns", difficulty: "Intermediate" },
  ];

  const activeAgents = [
    { id: 1, name: "Web Scraper", status: "Running", target: "Reddit: /r/SaaS trends", progress: 65 },
    { id: 2, name: "YouTube Summarizer", status: "Idle", target: "None", progress: 0 },
  ];

  return (
    <div className="w-full h-full flex flex-col bg-transparent overflow-y-auto">
      <header className="p-8 pb-4">
        <p className="text-sm font-bold text-[#8c6b4a] uppercase tracking-widest mb-1">Research & Knowledge</p>
        <h1 className="text-4xl font-black text-[#3d3122]">The Foragers</h1>
        <p className="text-[#8c6b4a] mt-2">Manage your autonomous research agents and query your saved knowledge nodes.</p>
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
               placeholder="Search all knowledge nodes, transcripts, and concepts..."
               value={searchQuery}
               onChange={(e) => setSearchQuery(e.target.value)}
             />
             <div className="absolute inset-y-0 right-2 flex items-center">
               <button className="bg-[#8c6b4a] text-white px-4 py-1.5 rounded-xl font-bold text-sm hover:bg-[#5e4b33] transition-colors shadow-sm">
                 Semantic Search
               </button>
             </div>
          </div>

          <div className="bg-white border border-[#e8dcc4] rounded-2xl p-6 shadow-sm">
             <div className="flex justify-between items-center mb-6">
               <h3 className="text-lg font-bold text-[#3d3122] flex items-center gap-2">
                 <Database className="text-[#8c6b4a]" size={20} />
                 Saved Knowledge Nodes
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
                        <span className="text-[10px] font-bold uppercase tracking-wider bg-white text-[#8c6b4a] border border-[#e8dcc4] px-2 py-0.5 rounded-full">
                          {node.difficulty}
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
                 Autonomous Agents
               </h3>
             </div>

             <div className="flex flex-col gap-4">
               {activeAgents.map(agent => (
                 <div key={agent.id} className="p-4 bg-white border border-[#e8dcc4] rounded-xl shadow-sm">
                   <div className="flex justify-between items-start mb-2">
                     <div className="flex flex-col">
                       <span className="font-bold text-sm text-[#3d3122]">{agent.name}</span>
                       <span className="text-[10px] text-[#8c6b4a] font-mono mt-0.5">Target: {agent.target}</span>
                     </div>
                     <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${agent.status === 'Running' ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' : 'bg-[#fdfaf6] text-[#8c6b4a] border border-[#e8dcc4]'}`}>
                       {agent.status}
                     </span>
                   </div>
                   {agent.status === 'Running' && (
                     <div className="w-full h-1.5 bg-[#f8f3e6] rounded-full mt-3 overflow-hidden">
                        <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${agent.progress}%` }}></div>
                     </div>
                   )}
                 </div>
               ))}

               <button className="w-full py-3 mt-2 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl shadow-sm transition-colors text-sm flex justify-center items-center gap-2">
                 <Sparkles size={16} /> Dispatch New Agent
               </button>
             </div>
          </div>
        </div>

      </div>
    </div>
  );
}
