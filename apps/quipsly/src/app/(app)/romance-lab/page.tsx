"use client";

import { Users, BookOpen, Scroll, ChevronRight, Network } from "lucide-react";
import Link from "next/link";
import { StudioNav } from "../studio-nav";

export default function RomanceLabDashboard() {
  const tools = [
    {
      id: "forge",
      name: "Entity Forge",
      description: "Manage characters, factions, and relationships. Merge duplicates.",
      icon: <Users size={24} className="text-[#8c6b4a]" />,
      href: "/romance-lab/forge",
    },
    {
      id: "series",
      name: "Series Bible",
      description: "Track series arcs, tropes, and book metadata.",
      icon: <BookOpen size={24} className="text-[#8c6b4a]" />,
      href: "/romance-lab/series",
    },
    {
      id: "manuscript",
      name: "Smart Manuscript",
      description: "Write with automatic entity tagging and lore context.",
      icon: <Scroll size={24} className="text-[#8c6b4a]" />,
      href: "/romance-lab/manuscript",
    },
    {
      id: "lorelink",
      name: "LoreLink Visualizer",
      description: "Interactive relationship mapping for characters, factions, and documents in the Kernel. The ultimate Discworld-style breakdown.",
      icon: <Network size={24} className="text-[#8c6b4a]" />,
      href: "/romance-lab/lorelink",
    },
  ];

  return (
    <div className="w-full h-full flex flex-col bg-[#fdfaf6] overflow-y-auto">
      <header className="p-8 pb-4 flex justify-between items-start">
        <div>
          <p className="text-sm font-bold text-[#8c6b4a] uppercase tracking-widest mb-1">Private Workspace</p>
          <h1 className="text-4xl font-black text-[#3d3122]">Romance Lab</h1>
          <p className="text-[#8c6b4a] mt-2">Your private sandbox for the Thornfield Files.</p>
        </div>
        <StudioNav />
      </header>

      <div className="p-8 pt-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {tools.map(tool => (
          <Link href={tool.href} key={tool.id}>
            <div className="bg-white border border-[#e8dcc4] rounded-2xl p-6 shadow-sm flex flex-col h-full hover:border-[#8c6b4a] hover:shadow-md transition-all group cursor-pointer">
              <div className="w-12 h-12 rounded-xl bg-[#f8f3e6] flex items-center justify-center mb-4 border border-[#e8dcc4]">
                {tool.icon}
              </div>
              <h3 className="text-xl font-bold text-[#3d3122] mb-2">{tool.name}</h3>
              <p className="text-[#8c6b4a] text-sm flex-grow">{tool.description}</p>
              <div className="mt-4 flex justify-end">
                <ChevronRight size={20} className="text-[#d4c1a0] group-hover:text-amber-600 transition-colors" />
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
