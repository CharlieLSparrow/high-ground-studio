"use client";

import { useState } from "react";
import { Folder, Bookmark, Quote, Search, Plus, MoreVertical } from "lucide-react";

export default function CollectionsDashboard() {
  const [activeCollection, setActiveCollection] = useState<string>("all");

  return (
    <div className="flex h-screen bg-zinc-950 text-white overflow-hidden">
      
      {/* Sidebar: Collections */}
      <div className="w-64 border-r border-zinc-800 bg-zinc-900/50 flex flex-col">
        <div className="p-4 border-b border-zinc-800 flex justify-between items-center">
          <h2 className="font-black text-sm uppercase tracking-widest text-zinc-400">Collections</h2>
          <button className="text-zinc-500 hover:text-white transition-colors">
            <Plus className="w-4 h-4" />
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          <button 
            onClick={() => setActiveCollection("all")}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-bold transition-all ${activeCollection === "all" ? "bg-pink-600/20 text-pink-500" : "text-zinc-400 hover:bg-zinc-800 hover:text-white"}`}
          >
            <Bookmark className="w-4 h-4" />
            All Clippings
          </button>
          <button 
            onClick={() => setActiveCollection("leadership")}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-bold transition-all ${activeCollection === "leadership" ? "bg-pink-600/20 text-pink-500" : "text-zinc-400 hover:bg-zinc-800 hover:text-white"}`}
          >
            <Folder className="w-4 h-4" />
            Leadership Hub
          </button>
          <button 
            onClick={() => setActiveCollection("adhd")}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-bold transition-all ${activeCollection === "adhd" ? "bg-pink-600/20 text-pink-500" : "text-zinc-400 hover:bg-zinc-800 hover:text-white"}`}
          >
            <Folder className="w-4 h-4" />
            ADHD Systems
          </button>
        </div>
      </div>

      {/* Main Area: Masonry Grid of Snippets */}
      <div className="flex-1 flex flex-col">
        <header className="p-6 border-b border-zinc-800 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-black uppercase tracking-widest text-white">Inbox</h1>
            <p className="text-sm text-zinc-500">Unsorted clippings from the Web Clipper</p>
          </div>
          
          <div className="relative">
             <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
             <input 
               type="text" 
               placeholder="Search snippets..." 
               className="bg-zinc-900 border border-zinc-800 rounded-full pl-10 pr-4 py-2 text-sm text-white focus:outline-none focus:border-pink-500 transition-colors w-64"
             />
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-8 bg-zinc-950">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            
            {/* Snippet Card 1 */}
            <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-5 shadow-lg flex flex-col gap-4 hover:border-zinc-700 transition-all group cursor-pointer relative overflow-hidden">
              <div className="absolute top-0 left-0 w-1 h-full bg-pink-500"></div>
              <div className="flex justify-between items-start">
                <Quote className="w-5 h-5 text-zinc-600" />
                <button className="text-zinc-600 opacity-0 group-hover:opacity-100 transition-opacity hover:text-white">
                  <MoreVertical className="w-4 h-4" />
                </button>
              </div>
              <p className="text-sm leading-relaxed text-zinc-300 font-serif">
                "The most important thing in communication is hearing what isn't said."
              </p>
              <div className="pt-4 border-t border-zinc-800/50 mt-auto">
                <p className="text-xs font-bold text-zinc-500 truncate hover:text-pink-400">
                  Peter Drucker • Management
                </p>
              </div>
            </div>

            {/* Snippet Card 2 */}
            <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-5 shadow-lg flex flex-col gap-4 hover:border-zinc-700 transition-all group cursor-pointer relative overflow-hidden">
              <div className="absolute top-0 left-0 w-1 h-full bg-blue-500"></div>
              <div className="flex justify-between items-start">
                <Quote className="w-5 h-5 text-zinc-600" />
                <button className="text-zinc-600 opacity-0 group-hover:opacity-100 transition-opacity hover:text-white">
                  <MoreVertical className="w-4 h-4" />
                </button>
              </div>
              <p className="text-sm leading-relaxed text-zinc-300 font-serif">
                "We are kept from our goal not by obstacles but by a clear path to a lesser goal."
              </p>
              <div className="pt-4 border-t border-zinc-800/50 mt-auto">
                <p className="text-xs font-bold text-zinc-500 truncate hover:text-blue-400">
                  Robert Brault • Focus
                </p>
              </div>
            </div>

            {/* Snippet Card 3 */}
            <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-5 shadow-lg flex flex-col gap-4 hover:border-zinc-700 transition-all group cursor-pointer relative overflow-hidden">
              <div className="absolute top-0 left-0 w-1 h-full bg-emerald-500"></div>
              <div className="flex justify-between items-start">
                <Bookmark className="w-5 h-5 text-zinc-600" />
                <button className="text-zinc-600 opacity-0 group-hover:opacity-100 transition-opacity hover:text-white">
                  <MoreVertical className="w-4 h-4" />
                </button>
              </div>
              <p className="text-sm font-bold text-white mb-1">
                How to build a Second Brain
              </p>
              <p className="text-xs leading-relaxed text-zinc-400">
                A great methodology for capturing knowledge and organizing it in a way that is actionable...
              </p>
              <div className="pt-4 border-t border-zinc-800/50 mt-auto">
                <p className="text-xs font-bold text-zinc-500 truncate hover:text-emerald-400">
                  fortelabs.co
                </p>
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
