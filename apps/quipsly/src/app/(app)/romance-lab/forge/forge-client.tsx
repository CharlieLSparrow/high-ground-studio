"use client";

import { useState } from "react";
import { StudioNav } from "../../studio-nav";
import { Search, Plus, Merge, Filter, ChevronDown, UserSquare2, Shield, Wand2, X } from "lucide-react";
import { cn, panelClassName, labelClassName, StudioChip } from "../../studio-ui";
import { addCharacter } from "./actions";

export function ForgeClient({ initialCharacters, initialFactions }: { initialCharacters: any[], initialFactions: any[] }) {
  const [searchQuery, setSearchQuery] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newFactionId, setNewFactionId] = useState("");
  const [newArchetype, setNewArchetype] = useState("");

  const handleAdd = async () => {
    if (!newName.trim()) return;
    await addCharacter({ name: newName, factionId: newFactionId || undefined, archetype: newArchetype });
    setNewName("");
    setNewFactionId("");
    setNewArchetype("");
    setIsAdding(false);
  };

  return (
    <div className="w-full h-full flex flex-col bg-[#fdfaf6] overflow-y-auto min-h-screen p-3.5 md:p-6 gap-[18px]">
      
      {/* Header */}
      <header
        className={cn(
          panelClassName,
          "flex min-h-[72px] flex-col items-stretch justify-between gap-[18px] px-[18px] py-4 lg:flex-row lg:items-center",
        )}
      >
        <div className="flex min-w-0 flex-col items-stretch gap-3.5 sm:flex-row sm:items-center">
          <div className="w-12 h-12 bg-[#8c6b4a]/10 rounded-xl flex items-center justify-center border border-[#8c6b4a]/30">
            <UserSquare2 className="text-[#8c6b4a]" size={24} />
          </div>
          <div>
            <h1 className="m-0 text-[1.75rem] leading-[1.08] tracking-normal text-[#3d3122] max-sm:text-[1.45rem]">
              Entity Forge
            </h1>
            <p className="mt-1.5 mb-0 max-w-[760px] text-[0.94rem] leading-relaxed text-[#8c6b4a]">
              Manage characters, factions, and relationships. Merge duplicates automatically.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap justify-start gap-2 lg:justify-end items-center">
          <StudioNav />
          <StudioChip tone="source">Romance Lab</StudioChip>
        </div>
      </header>

      {/* Toolbar */}
      <section className={cn(panelClassName, "flex flex-wrap items-center justify-between gap-4 px-4 py-3")}>
        <div className="flex items-center gap-4 flex-1">
          <div className="relative max-w-md w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8c6b4a]" size={16} />
            <input 
              type="text" 
              placeholder="Search entities..." 
              className="w-full bg-white border border-[#e8dcc4] rounded-lg pl-9 pr-4 py-1.5 text-sm text-[#3d3122] focus:outline-none focus:border-[#8c6b4a]"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <button className="flex items-center gap-2 rounded-lg bg-white border border-[#e8dcc4] px-3 py-1.5 text-sm font-bold text-[#3d3122] hover:bg-[#f8f3e6] transition-colors">
            <Filter size={16} /> Filter <ChevronDown size={14} />
          </button>
        </div>

        <div className="flex items-center gap-3">
          <button className="flex items-center gap-2 rounded-lg bg-white border border-[#e8dcc4] px-3 py-1.5 text-sm font-bold text-[#3d3122] hover:bg-[#f8f3e6] transition-colors">
            <Merge size={16} /> Resolve Duplicates
          </button>
          <button 
            onClick={() => setIsAdding(true)}
            className="flex items-center gap-2 rounded-lg bg-[#8c6b4a] border border-[#5e4b33] px-4 py-1.5 text-sm font-bold text-white hover:bg-[#7a5d40] transition-colors"
          >
            <Plus size={16} /> New Entity
          </button>
        </div>
      </section>

      {/* Add Entity Modal (Simple Overlay) */}
      {isAdding && (
        <div className="fixed inset-0 bg-[#030404]/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className={cn(panelClassName, "max-w-md w-full p-6 flex flex-col gap-4 shadow-xl border-[#8c6b4a]/30")}>
            <div className="flex justify-between items-center mb-2">
              <h2 className="text-xl font-bold text-[#3d3122]">Add Character</h2>
              <button onClick={() => setIsAdding(false)} className="text-[#8c6b4a] hover:text-[#3d3122]"><X size={20} /></button>
            </div>
            
            <div className="flex flex-col gap-1">
              <label className={labelClassName}>Name</label>
              <input type="text" value={newName} onChange={e => setNewName(e.target.value)} className="bg-white border border-[#e8dcc4] rounded-lg px-3 py-2 text-sm text-[#3d3122] focus:outline-none focus:border-[#8c6b4a]" placeholder="Character Name" />
            </div>

            <div className="flex flex-col gap-1">
              <label className={labelClassName}>Faction</label>
              <select value={newFactionId} onChange={e => setNewFactionId(e.target.value)} className="bg-white border border-[#e8dcc4] rounded-lg px-3 py-2 text-sm text-[#3d3122] focus:outline-none focus:border-[#8c6b4a]">
                <option value="">No Faction</option>
                {initialFactions.map((f: any) => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label className={labelClassName}>Archetype / Role</label>
              <input type="text" value={newArchetype} onChange={e => setNewArchetype(e.target.value)} className="bg-white border border-[#e8dcc4] rounded-lg px-3 py-2 text-sm text-[#3d3122] focus:outline-none focus:border-[#8c6b4a]" placeholder="e.g. Brooding Vampire" />
            </div>

            <div className="flex justify-end gap-3 mt-4">
              <button onClick={() => setIsAdding(false)} className="px-4 py-2 text-sm font-bold text-[#8c6b4a] hover:text-[#3d3122]">Cancel</button>
              <button onClick={handleAdd} className="px-4 py-2 rounded-lg bg-[#8c6b4a] text-white text-sm font-bold hover:bg-[#7a5d40]">Save Character</button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-4 gap-[18px]">
        
        {/* Sidebar Filters */}
        <aside className={cn(panelClassName, "hidden lg:flex flex-col p-4 col-span-1")}>
          <h3 className={cn(labelClassName, "mb-4")}>Factions</h3>
          <ul className="space-y-2">
            <li className="flex justify-between items-center text-sm font-bold text-[#3d3122] p-2 bg-[#f8f3e6] rounded-md border border-[#e8dcc4]">
              <span>All Entities</span>
              <span className="bg-white px-2 py-0.5 rounded-full text-xs text-[#8c6b4a] border border-[#e8dcc4]">{initialCharacters.length}</span>
            </li>
            {initialFactions.map((f: any) => (
              <li key={f.id} className="flex justify-between items-center text-sm font-medium text-[#8c6b4a] p-2 hover:bg-[#f8f3e6] rounded-md transition-colors cursor-pointer">
                <span>{f.name}</span>
              </li>
            ))}
          </ul>

          <div className="mt-8 border-t border-[#e8dcc4] pt-4">
            <h3 className={cn(labelClassName, "mb-4")}>AI Assistant</h3>
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
              <div className="flex items-center gap-2 font-bold text-amber-800 text-sm mb-2">
                <Wand2 size={16} /> Profiler Active
              </div>
              <p className="text-xs text-amber-700">The Forge is scanning new manuscript drafts for unrecognized names.</p>
            </div>
          </div>
        </aside>

        {/* Entity List */}
        <main className={cn(panelClassName, "col-span-1 lg:col-span-3 overflow-hidden flex flex-col")}>
          <div className="border-b border-[#e8dcc4] px-4 py-3 bg-[#f8f3e6] flex items-center justify-between">
            <span className={labelClassName}>Characters ({initialCharacters.length})</span>
          </div>
          
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {initialCharacters.filter(c => c.name.toLowerCase().includes(searchQuery.toLowerCase())).map((char: any) => (
              <div key={char.id} className="group border border-[#e8dcc4] bg-white rounded-xl p-4 flex items-center justify-between hover:border-[#8c6b4a] hover:shadow-md transition-all cursor-pointer">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-[#fdfaf6] border border-[#e8dcc4] flex items-center justify-center font-bold text-[#8c6b4a]">
                    {char.name.charAt(0)}
                  </div>
                  <div>
                    <h4 className="font-bold text-[#3d3122] text-lg">{char.name}</h4>
                    <div className="flex items-center gap-2 mt-1">
                      {char.faction && (
                        <>
                          <span className="text-xs font-medium text-[#8c6b4a] flex items-center gap-1">
                            <Shield size={12} /> {char.faction.name}
                          </span>
                          <span className="text-xs text-gray-400">•</span>
                        </>
                      )}
                      <span className="text-xs text-[#8c6b4a]">{char.archetype || "Unknown Role"}</span>
                    </div>
                  </div>
                </div>
                
                <div className="flex flex-col items-end gap-2">
                  <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                     <button className="text-xs font-bold text-[#8c6b4a] hover:text-[#3d3122]">Edit</button>
                     <button className="text-xs font-bold text-[#8c6b4a] hover:text-[#3d3122]">View Lore</button>
                  </div>
                  <StudioChip tone="source">
                    Verified Entity
                  </StudioChip>
                </div>
              </div>
            ))}
          </div>
        </main>

      </div>
    </div>
  );
}
